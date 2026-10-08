import type {AutomodRuntime} from '../lib/api_automod';
type Call={id:string;slotName:string;provider:string|null;username:string;imageUrl?:string|null};
export default function AutomodChallengePanel({event,calls,now}:{event:NonNullable<AutomodRuntime['providerChallenge']>;calls:Call[];now:number}){
 const remaining=event.closesAt?Math.max(0,Math.ceil((Date.parse(event.closesAt)-now)/1000)):0;
 return <section className="amd-panel amd-challenge" aria-label="Défi providers">
  <div className="amd-panel-heading"><div><span className="amd-kicker">DÉFI PROVIDERS</span><h2>Deux camps. Une session.</h2></div>
   <span className="amd-badge">{event.status==='preparing'?`Paris · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'Blocs de 3 machines'}</span></div>
  <p className="amd-heading-note">Deux heures minimum, puis fin du cycle équilibré. Les gains nets, bonus naturels et gros multiplicateurs font le score.</p>
  <div className="amd-camps">{(['pragmatic','hacksaw'] as const).map(provider=>{
   const queue=calls.filter(c=>(c.provider??'').toLowerCase().includes(provider));const value=event.scores[provider];
   return <div key={provider} className={`amd-camp ${provider} ${event.nextProvider===provider?'next':''}`}>
    <div className="amd-camp-name"><strong>{provider==='pragmatic'?'Pragmatic':'Hacksaw'}</strong><small>{event.nextProvider===provider?'Prochain bloc':'En attente'}</small></div>
    <div className="amd-camp-score">{value>0?'+':''}{value.toLocaleString('fr-FR',{maximumFractionDigits:2})}<span> pts</span></div>
    <p>{event.counts[provider]} machines terminées</p><div className="amd-camp-command">!camp {provider==='pragmatic'?'pragma':'hacksaw'}</div>
    <h3>Calls en attente <span>{queue.length}</span></h3>
    {queue.length?queue.slice(0,8).map(call=><div className="amd-camp-call" key={call.id}>{call.imageUrl&&<img src={call.imageUrl} alt="" loading="lazy"/>}<div><strong>{call.slotName}</strong><small>{call.username||'Automod'}</small></div></div>):<p className="amd-camp-empty">La sélection automatique prend le relais.</p>}
   </div>;
  })}</div>
 </section>;
}
