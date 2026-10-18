import * as React from 'react';
import {getRumbleRaidTargets,startRumbleRaid} from '../../lib/api';
import {raidError,raidQueryUrl,type RaidTarget} from '../../lib/rumbleRaid';
import './rumbleRaid.css';

export function RumbleRaidPicker({slug,token,query,onClose,onSuccess}:{slug:string;token:string;query:string;onClose:()=>void;onSuccess:(name:string)=>void}){
 const [scope,setScope]=React.useState<'gambling'|'all'>('gambling');
 const [targets,setTargets]=React.useState<RaidTarget[]>([]),[page,setPage]=React.useState(1),[more,setMore]=React.useState(false);
 const [loading,setLoading]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const selecting=React.useRef(false),request=React.useRef(0);
 React.useEffect(()=>{
  const sequence=++request.current;setLoading(true);setError('');setTargets([]);setPage(1);
  getRumbleRaidTargets(token,slug,scope,1).then(r=>{if(sequence!==request.current)return;setTargets(r.targets);setMore(r.hasMore);})
   .catch(e=>{if(sequence===request.current)setError(raidError(e.message));}).finally(()=>{if(sequence===request.current)setLoading(false);});
  return ()=>{request.current++;};
 },[token,slug,scope]);
 async function next(){
  if(loading)return;const sequence=request.current;setLoading(true);
  try{const r=await getRumbleRaidTargets(token,slug,scope,page+1);if(sequence!==request.current)return;
   setTargets(prev=>[...prev,...r.targets.filter(t=>!prev.some(p=>p.url===t.url))]);setPage(page+1);setMore(r.hasMore);
  }catch(e){if(sequence===request.current)setError(raidError((e as Error).message));}
  finally{if(sequence===request.current)setLoading(false);}
 }
 async function choose(target:RaidTarget){
  if(selecting.current)return;selecting.current=true;setBusy(true);setError('');
  try{await startRumbleRaid(token,slug,target.url,crypto.randomUUID());onSuccess(target.channel);}
  catch(e){setError(raidError((e as Error).message));}
  finally{selecting.current=false;setBusy(false);}
 }
 const queryUrl=raidQueryUrl(query);
 const visible=targets.filter(t=>queryUrl?t.url===queryUrl:`${t.channel} ${t.title} ${t.url}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  .sort((a,b)=>(b.viewers??-1)-(a.viewers??-1)||a.channel.localeCompare(b.channel));
 return <section className="rumble-raid-picker" role="dialog" aria-label="Raider une chaîne Rumble" aria-busy={busy}>
  <header><strong>Raider une chaîne</strong><button type="button" aria-label="Fermer le sélecteur de raid" onClick={onClose} disabled={busy}>×</button></header>
  <div className="rumble-raid-toolbar"><select aria-label="Directs Rumble" value={scope} disabled={busy} onChange={e=>setScope(e.target.value as typeof scope)}>
   <option value="gambling">Gambling &amp; Slots</option><option value="all">Tous les directs Rumble</option></select><span>Spectateurs ↓</span></div>
  {error&&<p role="alert">{error}</p>}
  {queryUrl&&!visible.length&&<button className="rumble-raid-target" type="button" disabled={busy} onClick={()=>void choose({url:queryUrl,channel:'ce direct',title:'',viewers:null,videoId:''})}>Raider ce direct Rumble</button>}
  <div className="rumble-raid-list">{visible.map(t=><button className="rumble-raid-target" type="button" key={t.url} disabled={busy} onClick={()=>void choose(t)}
   aria-label={`Raider ${t.channel}, ${t.viewers??'nombre inconnu de'} spectateurs`}>
   <span><b>{t.channel}</b><small>{t.title}</small></span><span className="rumble-raid-count">◉ {t.viewers?.toLocaleString('fr-FR')??'—'}</span></button>)}
   {!loading&&!visible.length&&!error&&<p>Aucun direct trouvé.</p>}
   {loading&&<p role="status">Chargement des directs…</p>}
   {busy&&<p role="status">Lancement du raid…</p>}
  </div>
  {more&&<button className="rumble-raid-more" type="button" disabled={loading||busy} onClick={()=>void next()}>Voir plus de directs</button>}
 </section>;
}
