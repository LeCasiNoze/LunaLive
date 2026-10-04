import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, ExternalLink, Headphones, ListRestart, MonitorPlay, Play, Radio, RefreshCw, Settings2, ShieldCheck, SkipForward, Sparkles, Square, Zap } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { canAccessFsbBoard } from "../lib/fsb_access";
import { getAutomodCaptchaAccess, getAutomodDashboard, saveAutomodDashboardSettings, sendAutomodCommand, setAutomodControl, setAutomodAudioMode,
  type AutomodDashboard, type AutomodDashboardSettings, type AutomodProvider } from "../lib/api_automod";
import "./AutomodDashboardPage.css";
import AutomodStats from "./AutomodStats";

const PROVIDERS: Array<{key:AutomodProvider;name:string;short:string;accent:string}>=[
  {key:"hacksaw",name:"Hacksaw Gaming",short:"H",accent:"mint"},
  {key:"pragmatic",name:"Pragmatic Play",short:"P",accent:"violet"},
  {key:"nolimit",name:"Nolimit City",short:"N",accent:"orange"},
];
const DEFAULT_SETTINGS:AutomodDashboardSettings={allowedProviders:["hacksaw","pragmatic","nolimit"],stakeCents:20,slotDurationMs:7*60_000,goldenEnabled:true};
const HUNT_DEFAULT={jail:false,jailSpinLimit:1000,openingCondition:'count' as const,targetBonuses:20,balanceFloorCents:0,voteFromBonuses:10,voteEveryBonuses:5};
const euro=(cents:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(cents/100);
const clock=(ms:number)=>{const seconds=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(seconds/60).toString().padStart(2,"0")}:${(seconds%60).toString().padStart(2,"0")}`;};
const formatTime=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?"—":date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});};

export default function AutomodDashboardPage(){
  const {user}=useAuth();
  const [tab,setTab]=React.useState<'control'|'stats'>('control');
  const [dashboard,setDashboard]=React.useState<AutomodDashboard|null>(null);
  const [draft,setDraft]=React.useState<AutomodDashboardSettings>(DEFAULT_SETTINGS);
  const [stakeText,setStakeText]=React.useState("0,20");
  const [minutesText,setMinutesText]=React.useState("7");
  const [draftDirty,setDraftDirty]=React.useState(false);
  const [busy,setBusy]=React.useState<string|null>(null);
  const [notice,setNotice]=React.useState<{text:string;error:boolean}|null>(null);
  const [loading,setLoading]=React.useState(true);
  const [now,setNow]=React.useState(Date.now());
  const refresh=React.useCallback(async()=>{
    try{const result=await getAutomodDashboard();setDashboard(result);setNotice(previous=>previous?.error?null:previous);
      if(!draftDirty){const settings=result.settings??result.runtime?.config??DEFAULT_SETTINGS;setDraft(settings);
        setStakeText((settings.stakeCents/100).toFixed(2).replace(".",","));setMinutesText(String(Math.round(settings.slotDurationMs/60000)));}}
    catch(error){setNotice({text:error instanceof Error?error.message:"Tableau de bord indisponible.",error:true});}
    finally{setLoading(false);}
  },[draftDirty]);
  React.useEffect(()=>{void refresh();const poll=window.setInterval(()=>void refresh(),5000);const ticker=window.setInterval(()=>setNow(Date.now()),1000);return()=>{window.clearInterval(poll);window.clearInterval(ticker);};},[refresh]);
  const perform=async(name:string,action:()=>Promise<unknown>,success:string)=>{setBusy(name);setNotice(null);try{await action();setNotice({text:success,error:false});await refresh();}catch(error){setNotice({text:error instanceof Error?error.message:"Commande impossible.",error:true});}finally{setBusy(null);}};
  const toggle=()=>void perform("toggle",()=>setAutomodControl(!dashboard?.enabled),dashboard?.enabled?"Arrêt demandé : diffusion coupée, puis fin du round en cours.":"Démarrage demandé : Automod puis diffusion Rumble.");
  const command=(kind:"restart_chrome"|"skip_call")=>{
    if(kind==="skip_call"&&!window.confirm("Retirer la slot en cours et passer au call suivant après la fin du round ou bonus ?"))return;
    void perform(kind,()=>sendAutomodCommand(kind),kind==="skip_call"?"Passage au call suivant demandé.":"Relance de Chrome demandée. Le call courant sera repris.");
  };
  const openRemote=()=>{const popup=window.open("about:blank","_blank");if(popup)popup.opener=null;setBusy("remote");setNotice(null);
    void getAutomodCaptchaAccess().then(result=>{if(popup)popup.location.href=result.url;else window.location.href=result.url;}).catch(error=>{popup?.close();setNotice({text:error instanceof Error?error.message:"Accès VPS indisponible.",error:true});}).finally(()=>setBusy(null));};
  const save=()=>{const stakeCents=Math.round(Number(stakeText.replace(",","."))*100);const slotDurationMs=Math.round(Number(minutesText)*60000);
    if(!Number.isSafeInteger(stakeCents)||stakeCents<1||stakeCents>10000||!Number.isSafeInteger(slotDurationMs)||slotDurationMs<60000||slotDurationMs>120*60000){setNotice({text:"Vérifie la mise (0,01 à 100 €) et la durée (1 à 120 minutes).",error:true});return;}
    const settings={...draft,stakeCents,slotDurationMs};void perform("save",async()=>{await saveAutomodDashboardSettings(settings);setDraft(settings);setDraftDirty(false);},"Paramètres enregistrés. Ils s’appliquent au prochain démarrage de l’Automod.");};
  const setValue=(patch:Partial<AutomodDashboardSettings>)=>{setDraft(current=>({...current,...patch}));setDraftDirty(true);};
  const toggleProvider=(provider:AutomodProvider)=>{const next=draft.allowedProviders.includes(provider)?draft.allowedProviders.filter(p=>p!==provider):[...draft.allowedProviders,provider];if(next.length===0){setNotice({text:"Garde au moins un provider actif.",error:true});return;}setValue({allowedProviders:next});};
  if(!user)return <main className="amd-access"><h1>Automod</h1><p>Connecte-toi à LunaLive pour accéder au contrôle.</p><Link to="/FSB_Board">Retour au FSB Board</Link></main>;
  if(!canAccessFsbBoard(user))return <main className="amd-access"><h1>Accès réservé</h1><Link to="/FSB_Board">Retour au FSB Board</Link></main>;
  const runtime=dashboard?.runtime;
  const fresh=!!dashboard?.runtimeSeenAt&&now-new Date(dashboard.runtimeSeenAt).getTime()<20_000;
  const phase=!fresh?"Hors connexion":runtime?.phase==="running"?"En rotation":runtime?.phase==="starting"?"Démarrage":runtime?.phase==="stopping"?"Arrêt en cours":runtime?.phase==="error"?"Erreur":"À l’arrêt";
  const live=fresh&&runtime?.publisherActive===true;
  const playing=fresh&&runtime?.phase==="running";
  const remaining=runtime?.slotDeadlineAt?runtime.slotDeadlineAt-(runtime.recoveryPausedAt??now):null;
  const timer=runtime?.mode==='bonus-hunt'&&runtime.slotPhase==='opening'?'Ouverture du hunt':runtime?.config?.mode==='auto-hunt'&&runtime.config.hunt?.jail?'Jail Hunt · 1 000 max':remaining===null?"En attente du premier spin":remaining<=0&&runtime?.bonusActive?"En attente du bonus":`${runtime?.recoveryPausedAt?"Pause · ":""}${clock(remaining)}`;
  const latestCommand=dashboard?.commands[0];
  const hunt={...HUNT_DEFAULT,...draft.hunt};
  const setHunt=(patch:Partial<NonNullable<AutomodDashboardSettings['hunt']>>)=>setValue({hunt:{...hunt,...patch}});
  const activeImage=runtime?.slot?.imageUrl??dashboard?.calls?.find(c=>c.id===runtime?.slot?.callId)?.imageUrl;
  const waitingCalls=dashboard?.calls?.filter(c=>c.id!==runtime?.slot?.callId)??[];

  return <main className="amd-page">
    <div className="amd-wrap">
      <header className="amd-header">
        <Link className="amd-back" to="/FSB_Board"><ArrowLeft size={17}/> FSB Board</Link>
        <span className="amd-eyebrow"><span className="amd-eyebrow-dot"/> CONTRÔLE DU DIRECT</span>
        <button className="amd-icon-button" onClick={()=>void refresh()} aria-label="Actualiser"><RefreshCw size={18}/></button>
      </header>

      <section className="amd-hero">
        <div className="amd-hero-glow"/>
        <div className="amd-hero-copy"><div className="amd-hero-mark"><Zap size={18}/> AUTOMOD STUDIO <span>01 / LIVE CONTROL</span></div>
          <h1>Le direct, <em>sous contrôle.</em></h1>
          <p>Slots, diffusion et interventions depuis une seule page. Chaque action remonte avec son état réel sur le VPS.</p>
          <div className="amd-hero-badges"><span className={`amd-badge ${live?"on":"off"}`}><Radio size={14}/>{live?"RUMBLE EN DIRECT":"RUMBLE À L’ARRÊT"}</span><span className={`amd-badge ${playing?"on":"off"}`}><span className="amd-pulse"/>{phase.toUpperCase()}</span></div>
        </div>
        <div className="amd-hero-orb"><div className="amd-hero-orb-inner"><MonitorPlay size={42}/><span>LIVE OPS</span></div></div>
      </section>

      {notice&&<div role="status" className={`amd-notice ${notice.error?"error":"success"}`}>{notice.error?<AlertTriangle size={18}/>:<Check size={18}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="Fermer">×</button></div>}
      {loading&&<div className="amd-loading">Connexion au contrôle Automod…</div>}

      <nav className="amd-section-tabs" aria-label="Automod"><button aria-pressed={tab==='control'} onClick={()=>setTab('control')}>Contrôle du direct</button><button aria-pressed={tab==='stats'} onClick={()=>setTab('stats')}>Audience & statistiques</button></nav>
      {tab==='stats'?<AutomodStats/>:<div className="amd-grid">
        <div className="amd-main-column">
          <section className="amd-panel amd-mode-panel"><div className="amd-panel-heading"><div><span className="amd-kicker">COMMENT JOUER</span><h2>Choisir la session</h2></div><Sparkles size={22}/></div>
            <div className="amd-mode-grid">{(['automod','auto-hunt'] as const).map(mode=><button type="button" key={mode} className={`amd-mode ${(draft.mode??'automod')===mode?'selected':''}`} aria-pressed={(draft.mode??'automod')===mode} onClick={()=>setValue({mode})}><span>{mode==='automod'?'01':'02'}</span><strong>{mode==='automod'?'Automod':'Auto Hunt'}</strong><small>{mode==='automod'?'Une session sur chaque call, bonus joués immédiatement.':'Capture les bonus, puis ouvre toute la collection.'}</small></button>)}</div>
            <label className="amd-option"><input type="checkbox" checked={draft.fastSpins===true} onChange={e=>setValue({fastSpins:e.target.checked})}/><span><strong>Parties rapides</strong><small>Accélère le jeu de base, garde les suspenses et la vitesse normale des bonus.</small></span></label>
            {draft.mode==='auto-hunt'&&<div className="amd-hunt-settings"><label className="amd-option"><input type="checkbox" checked={hunt.jail} onChange={e=>setHunt({jail:e.target.checked})}/><span><strong>Jail Hunt</strong><small>Reste jusqu’au bonus, dans la limite de {hunt.jailSpinLimit.toLocaleString('fr-FR')} spins. Le chrono est désactivé.</small></span></label>
              <div className="amd-settings-grid"><label className="amd-field"><span>Ouvrir le hunt quand…</span><select value={hunt.openingCondition} onChange={e=>setHunt({openingCondition:e.target.value as typeof hunt.openingCondition})}><option value="count">Le nombre de bonus est atteint</option><option value="balance">Le solde atteint le seuil</option><option value="vote">Les viewers votent pour ouvrir</option></select></label>
              {hunt.openingCondition==='count'&&<label className="amd-field"><span>Objectif de bonus</span><input type="number" min="1" max="1000" value={hunt.targetBonuses} onChange={e=>setHunt({targetBonuses:Number(e.target.value)})}/></label>}
              {hunt.openingCondition==='balance'&&<label className="amd-field"><span>Seuil de solde (€)</span><input type="number" min="0" step="0.01" value={hunt.balanceFloorCents/100} onChange={e=>setHunt({balanceFloorCents:Math.round(Number(e.target.value)*100)})}/></label>}
              {hunt.openingCondition==='vote'&&<><label className="amd-field"><span>Premier vote à</span><input type="number" min="1" value={hunt.voteFromBonuses} onChange={e=>setHunt({voteFromBonuses:Number(e.target.value)})}/><small>bonus capturés</small></label><label className="amd-field"><span>Puis tous les</span><input type="number" min="1" value={hunt.voteEveryBonuses} onChange={e=>setHunt({voteEveryBonuses:Number(e.target.value)})}/><small>nouveaux bonus</small></label></>}
              </div><p className="amd-heading-note">Enregistre les réglages avant de démarrer. Les bonus et leurs mises restent sauvegardés en cas d’interruption.</p>
            </div>}
          </section>

          <section className="amd-panel amd-now-panel">
            <div className="amd-panel-heading"><div><span className="amd-kicker">SESSION EN COURS</span><h2>Vue en temps réel</h2></div><span className={`amd-live-indicator ${fresh?"fresh":"stale"}`}><span/>{fresh?"VPS connecté":"VPS sans nouvelles"}</span></div>
            <div className="amd-now-grid">
              <div className="amd-slot-card"><div className="amd-slot-icon">{activeImage?<img src={activeImage} alt=""/>:<Sparkles size={25}/>}</div><div><span>Machine actuelle</span><strong>{runtime?.slot?.name||"Aucune machine"}</strong><small>{runtime?.slot?`${runtime.slot.provider} · ${runtime.slot.requestedBy||"Automod"}`:"Prête pour la prochaine session"}</small></div></div>
              <div className="amd-metric"><span><Clock3 size={16}/> CHANGEMENT DANS</span><strong className="amd-timer">{playing?timer:"—"}</strong><small>Le chrono démarre au premier spin terminé.</small></div>
              <div className="amd-metric"><span><ListRestart size={16}/> ROUNDS TERMINÉS</span><strong>{playing?runtime?.roundsPlayed??0:"—"}</strong><small>Rounds confirmés sur cette machine.</small></div>
            </div>
            {runtime?.lastError&&<div className="amd-inline-alert"><AlertTriangle size={16}/><span>{runtime.lastError}</span></div>}
            {!fresh&&<div className="amd-inline-alert"><CircleHelp size={16}/><span>Le VPS n’a pas envoyé d’état récent. Les commandes restent enregistrées, mais leur exécution doit être vérifiée.</span></div>}
            {fresh&&runtime?.queueWritable===false&&<div className="amd-inline-alert"><AlertTriangle size={16}/><span>File LunaLive en lecture seule : le jeton de gestion manque sur le VPS. Ouvre « Accéder au VPS », puis le panneau Automod local pour reconnecter la file avant de démarrer.</span></div>}
          </section>

          <section className="amd-panel"><div className="amd-panel-heading"><div><span className="amd-kicker">INTERVENTIONS</span><h2>Actions rapides</h2></div><span className="amd-heading-note">Sécurisées et journalisées</span></div>
            <div className="amd-action-grid">
              <button className="amd-action" disabled={!playing||!!busy} onClick={()=>command("restart_chrome")}><span className="amd-action-icon violet"><RefreshCw size={22}/></span><strong>Relancer Chrome</strong><small>Redémarre le navigateur et reprend le call courant.</small><ArrowRight className="amd-action-arrow" size={17}/></button>
              <button className="amd-action" disabled={!playing||runtime?.queueWritable!==true||!!busy} onClick={()=>command("skip_call")}><span className="amd-action-icon orange"><SkipForward size={23}/></span><strong>Passer ce call</strong><small>Termine le round ou bonus, retire la slot et charge la suivante.</small><ArrowRight className="amd-action-arrow" size={17}/></button>
              <button className="amd-action" disabled={!dashboard?.captchaAvailable||!!busy} onClick={openRemote}><span className="amd-action-icon mint"><ExternalLink size={22}/></span><strong>Accéder au VPS</strong><small>Valide un CAPTCHA ou débloque l’écran depuis ton appareil.</small><ArrowRight className="amd-action-arrow" size={17}/></button>
            </div>
            {dashboard?.captchaActive&&<div className="amd-captcha-banner"><ShieldCheck size={20}/><div><strong>CAPTCHA à valider</strong><span>L’Automod attend sur la page actuelle. Ouvre le bureau distant pour intervenir.</span></div><button onClick={openRemote}>Ouvrir</button></div>}
          </section>

          <section className="amd-panel"><div className="amd-panel-heading"><div><span className="amd-kicker">AUDIO</span><h2>Source du son</h2></div><Headphones size={21}/></div>
            <div className="amd-provider-grid">{(["spotify","game"] as const).map(mode=><button key={mode} className={`amd-provider mint ${(dashboard?.settings?.audioMode??runtime?.config?.audioMode??"spotify")===mode?"selected":""}`} disabled={!!busy} aria-pressed={(dashboard?.settings?.audioMode??runtime?.config?.audioMode??"spotify")===mode} onClick={()=>void perform("audio",()=>setAutomodAudioMode(mode),"Changement audio demandé au VPS.")}><strong>{mode==="spotify"?"Spotify":"Son des slots"}</strong></button>)}</div>
            <p className="amd-heading-note">Le son des slots libère ton compte Spotify. Le choix reste enregistré pour les prochaines sessions.</p>
            <p className="amd-heading-note">Source confirmée par le VPS : {fresh?(runtime?.config?.audioMode==="game"?"slots":"Spotify"):"en attente"}.</p>
          </section>

          <section className="amd-panel"><div className="amd-panel-heading"><div><span className="amd-kicker">PARAMÈTRES DE SESSION</span><h2>Règles de rotation</h2></div><Settings2 size={21}/></div>
            <div className="amd-section-title"><span>Providers autorisés</span><small>Un provider décoché reste en file et sera repris s’il est réactivé.</small></div>
            <div className="amd-provider-grid">{PROVIDERS.map(provider=><button key={provider.key} type="button" aria-pressed={draft.allowedProviders.includes(provider.key)} className={`amd-provider ${provider.accent} ${draft.allowedProviders.includes(provider.key)?"selected":""}`} onClick={()=>toggleProvider(provider.key)}><span className="amd-provider-monogram">{provider.short}</span><strong>{provider.name}</strong><span className="amd-provider-check">{draft.allowedProviders.includes(provider.key)&&<Check size={15}/>}</span></button>)}</div>
            <div className="amd-settings-grid">
              <label className="amd-field"><span>Mise de base</span><div className="amd-input-wrap"><input type="text" inputMode="decimal" value={stakeText} onChange={event=>{setStakeText(event.target.value);setDraftDirty(true);}}/><span>€ / spin</span></div><small>La mise est vérifiée dans le jeu avant autoplay.</small></label>
              <label className="amd-field"><span>Temps par slot</span><div className="amd-input-wrap"><input type="text" inputMode="numeric" disabled={draft.mode==='auto-hunt'&&hunt.jail} value={minutesText} onChange={event=>{setMinutesText(event.target.value);setDraftDirty(true);}}/><span>minutes</span></div><small>{draft.mode==='auto-hunt'&&hunt.jail?'Désactivé en Jail Hunt.':'Le chrono actif reste inchangé.'}</small></label>
              <label className="amd-golden"><span className="amd-golden-icon"><Zap size={21}/></span><span><strong>Golden Bet</strong><small>Activé seulement si la machine propose cette option.</small></span><input type="checkbox" checked={draft.goldenEnabled} onChange={event=>setValue({goldenEnabled:event.target.checked})}/><span className="amd-switch"/></label>
            </div>
            <div className="amd-save-row"><span>{draftDirty?"Modifications non enregistrées":dashboard&&dashboard.appliedSettingsRevision<dashboard.settingsRevision?"Application en cours sur le VPS":`Configuration actuelle : ${euro(draft.stakeCents)} · ${Math.round(draft.slotDurationMs/60000)} min`}</span><button className="amd-save" disabled={!draftDirty||!!busy} onClick={save}>{busy==="save"?"Enregistrement…":"Enregistrer les réglages"}</button></div>
          </section>
        </div>

        <aside className="amd-side-column">
          <section className="amd-panel amd-power-panel"><span className="amd-kicker">DIFFUSION</span><h2>Commandes du direct</h2><p>Le bouton pilote ensemble la rotation Automod et la diffusion Rumble.</p><div className="amd-power-state"><span className={live?"on":"off"}/><div><strong>{live?"Flux en direct":"Flux arrêté"}</strong><small>{dashboard?.enabled?"Démarrage demandé":"Automod désactivé"}</small></div></div>
            <button className={`amd-power-button ${dashboard?.enabled?"stop":"start"}`} disabled={!dashboard||!!busy||(!dashboard.enabled&&(!fresh||runtime?.queueWritable!==true))} onClick={toggle}>{dashboard?.enabled?<><Square size={17} fill="currentColor"/> Arrêter Automod + stream</>:<><Play size={17} fill="currentColor"/> Démarrer Automod + stream</>}</button>
            <small className="amd-power-foot">À l’arrêt, le direct est coupé avant la fin propre du spin.</small>
          </section>
          <section className="amd-panel amd-activity"><div className="amd-panel-heading"><div><span className="amd-kicker">JOURNAL</span><h2>Activité récente</h2></div></div>
            {latestCommand&&<div className="amd-command"><strong>{latestCommand.kind==="skip_call"?"Passage du call":latestCommand.kind==="open_hunt"?"Ouverture du hunt":"Relance Chrome"}</strong><span>{latestCommand.status==="pending"?"En attente":latestCommand.status==="claimed"?"En cours":latestCommand.status==="done"?"Terminé":"Échec"} · {formatTime(latestCommand.createdAt)}</span>{latestCommand.result&&<small>{latestCommand.result}</small>}</div>}
            <div className="amd-log-list">{runtime?.logs?.length?runtime.logs.slice(-6).reverse().map((entry,index)=><div className="amd-log" key={`${entry.at}-${index}`}><span>{formatTime(entry.at)}</span><p>{entry.message}</p></div>):<div className="amd-empty">Aucun événement récent.</div>}</div>
          </section>
          <section className="amd-panel amd-queue"><div className="amd-panel-heading"><div><span className="amd-kicker">LES PROCHAINS CALLS</span><h2>File d’attente <em>{waitingCalls.length}</em></h2></div></div><div className="amd-queue-list">{waitingCalls.length?waitingCalls.map((call,index)=><div className="amd-queue-card" key={call.id}><span>{index+1}</span>{call.imageUrl?<img src={call.imageUrl} alt="" loading="lazy"/>:<div className="amd-queue-placeholder"><Sparkles size={20}/></div>}<div><strong>{call.slotName}</strong><small>{call.username||'Automod'} · {call.provider}</small></div></div>):<div className="amd-empty">La file est vide. Le prochain call aléatoire y sera ajouté par le bot.</div>}</div></section>
          {runtime?.mode==='bonus-hunt'&&<section className="amd-panel"><span className="amd-kicker">COLLECTION DU HUNT</span><h2>Bonus capturés</h2><button className="amd-save" disabled={!playing||!!busy||!runtime.huntEntries?.some(e=>e.status!=='opened')} onClick={()=>void perform('open_hunt',()=>sendAutomodCommand('open_hunt'),'Ouverture du hunt demandée après le dernier round.')}>Ouvrir maintenant</button><div className="amd-queue-list">{runtime.huntEntries?.map(entry=><div className="amd-queue-card" key={entry.id}>{entry.imageUrl&&<img src={entry.imageUrl} alt=""/>}<div><strong>{entry.slotName}</strong><small>{euro(entry.baseStakeCents)} · {entry.gainCents===null?'À ouvrir':euro(entry.gainCents)}</small></div><span>{entry.status==='failed'?'À vérifier':entry.status==='opening'?'En ouverture':entry.status==='opened'?'Ouvert':'Capturé'}</span></div>)}</div></section>}

        </aside>
      </div>}
    </div>
    <div className="amd-mobile-dock"><span><span className={live?"on":"off"}/>{live?"EN DIRECT":phase.toUpperCase()}</span><button disabled={!dashboard||!!busy||(!dashboard.enabled&&(!fresh||runtime?.queueWritable!==true))} onClick={toggle}>{dashboard?.enabled?"Arrêter":"Démarrer"}</button></div>
  </main>;
}
