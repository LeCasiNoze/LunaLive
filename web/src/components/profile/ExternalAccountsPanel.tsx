import * as React from 'react';
const apiBase=()=>import.meta.env.VITE_API_BASE||'https://lunalive-api.onrender.com';
export default function ExternalAccountsPanel({token,onAfterChange}:{token:string;onAfterChange:()=>void}){
 const [state,setState]=React.useState<any>(null),[command,setCommand]=React.useState(''),[busy,setBusy]=React.useState(false),[hint,setHint]=React.useState('');
 const [syncUsername,setSyncUsername]=React.useState(false);
 const request=React.useCallback(async(path='',body?:unknown)=>{
  const response=await fetch(`${apiBase()}/me/external-accounts${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.error);return result;
 },[token]);
 const reload=React.useCallback(async()=>{try{const next=await request();setState(next);if(next.rumble?.linked){setCommand('');setHint('');}}catch{setHint('Connexion indisponible. Réessaie.');}},[request]);
 React.useEffect(()=>{void reload();const focus=()=>void reload();window.addEventListener('focus',focus);window.addEventListener('community:connections_changed',focus);return()=>{window.removeEventListener('focus',focus);window.removeEventListener('community:connections_changed',focus);};},[reload]);
 React.useEffect(()=>{if(window.location.hash==='#connections')document.getElementById('connections')?.scrollIntoView({block:'start'});},[]);
 async function action(path:string,body:unknown){setBusy(true);setHint('');try{
   const next=await request(path,body);if(next.command){setCommand(next.command);setHint('Colle cette commande dans le chat Rumble du live. Valable 10 minutes.');}
   else{await reload();onAfterChange();setHint('Synchronisation activée. Un pseudo déjà pris reste inchangé.');}
  }catch(e){setHint((e as Error).message==='link_cooldown'?'Attends une minute avant de recréer un code.':(e as Error).message==='identity_conflict'?'Ces comptes ont des liaisons différentes. Vérifie-les avant de continuer.':'Action indisponible. Réessaie.');}finally{setBusy(false);}}
 return <section id="connections" style={{display:'grid',gap:12,padding:16,color:'#eee',fontSize:13}} aria-label="Comptes liés">
  <strong style={{fontSize:16}}>▶ Rumble & LunaLive</strong>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span>LunaLive ✅</span><span>Discord {state?state.discordLinked?'✅':'à lier':'…'}</span><span>Rumble {state?state.rumble?.linked?'✅':'à lier':'…'}</span></div>
  {state?.rumble?.linked?<>
   <p style={{margin:0}}>Rumble : <b>@{state.rumble.username}</b>{state.rumble.via==='discord'?' · reconnu via Discord':''}</p>
   {state.rumble.syncUsername?<span>{state.lunaUsername&&state.lunaUsername!==state.rumble.username?`Pseudo Rumble indisponible sur LunaLive : ${state.lunaUsername} est conservé.`:'Synchronisation du pseudo activée. Le surnom Discord dépend des permissions du serveur.'}</span>:<button className="btnGhost" disabled={busy} onClick={()=>void action('/rumble/sync',{})}>Utiliser mon pseudo Rumble sur LunaLive et Discord</button>}
  </>:<>
   <p style={{margin:0}}>Lie Rumble pour participer aux rains de rubis depuis son chat. Discord est facultatif.</p>
   <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={syncUsername} onChange={e=>setSyncUsername(e.target.checked)}/>Utiliser mon pseudo Rumble sur LunaLive et le serveur Discord</label>
   {state?.rumble?.conflict&&<p role="alert" style={{margin:0}}>Ces comptes ont des liaisons différentes. Vérifie la liaison Discord avant de continuer.</p>}
   <button className="btnPrimary" disabled={busy||state?.rumble?.conflict} onClick={()=>void action('/rumble/code',{syncUsername})}>{command?'Recréer la commande':'Lier mon Rumble'}</button>
   {command&&<><code style={{padding:10,background:'rgba(124,92,252,.15)',borderRadius:8,overflowWrap:'anywhere'}}>{command}</code><button className="btnGhost" onClick={()=>void navigator.clipboard.writeText(command).catch(()=>setHint('Sélectionne et copie la commande.'))}>Copier</button><button className="btnGhost" disabled={busy} onClick={()=>void reload()}>Vérifier ma liaison</button></>}
  </>}
  <span role="status">{hint}</span>
 </section>;
}
