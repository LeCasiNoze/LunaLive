import {useEffect,useState} from 'react';
import {getAutomodAnalytics,type AutomodAnalytics} from '../lib/api_automod';
export default function AutomodStats(){
 const [days,setDays]=useState(7),[data,setData]=useState<AutomodAnalytics|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');getAutomodAnalytics(days).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[days]);
 const peak=Math.max(0,...(data?.audience.map(d=>d.peak_viewers)??[]));
 const samples=data?.audience.reduce((s,d)=>s+d.samples,0)??0;
 const average=samples?(data!.audience.reduce((s,d)=>s+d.average_viewers*d.samples,0)/samples).toFixed(1):'—';
 const max=Math.max(1,...(data?.hours.map(h=>h.messages)??[]));
 return <section className="amd-panel amd-stats"><div className="amd-panel-heading"><div><span className="amd-kicker">LA VIE DU DIRECT</span><h2>Audience & activité</h2></div><select aria-label="Période des statistiques" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>24 heures</option><option value={7}>7 jours</option><option value={30}>30 jours</option></select></div>
 {error?<p role="alert">{error}</p>:!data?<p>Chargement des mesures…</p>:<>
 <div className="amd-stats-cards"><div><small>Participants au chat</small><strong>{data.summary.speakers}</strong><span>Identités distinctes sur la période</span></div><div><small>Messages</small><strong>{data.summary.messages}</strong><span>Messages Rumble reçus en Automod</span></div><div><small>Pic de spectateurs</small><strong>{samples?peak:'—'}</strong><span>Spectateurs simultanés</span></div><div><small>Audience moyenne</small><strong>{average}</strong><span>Moyenne des relevés disponibles</span></div></div>
 <p className="amd-heading-note">Follows Rumble : <b>{data.followers.total??'—'}</b> · évolution mesurée : <b>{data.followers.growth===null?'—':(data.followers.growth>=0?'+':'')+data.followers.growth}</b>{data.followers.since?' depuis '+new Date(data.followers.since).toLocaleString('fr-FR'):''}. Le premier relevé constitue la référence.</p>
 <h3>Les heures les plus actives</h3><p className="amd-heading-note">Heure de Paris · activité cumulée du chat. Les heures sans direct ne sont pas des mesures d’audience à zéro.</p>
 <div className="amd-stats-hours">{Array.from({length:24},(_,hour)=>{const row=data.hours.find(r=>r.hour===hour);return <div key={hour} title={`${hour} h : ${row?.messages??0} messages · ${row?.speakers??0} participants`}><span>{hour}h</span><div><i style={{width:`${100*(row?.messages??0)/max}%`}}/></div><b>{row?.messages??0}</b></div>;})}</div>
 <h3>Jour après jour</h3><div className="amd-stats-table"><table><thead><tr><th>Jour</th><th>Participants</th><th>Messages</th><th>Audience moy.</th><th>Pic</th></tr></thead><tbody>{[...new Set([...data.daily.map(d=>d.day),...data.audience.map(d=>d.day)])].sort().reverse().map(day=>{const chat=data.daily.find(d=>d.day===day),audience=data.audience.find(d=>d.day===day);return <tr key={day}><td>{new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</td><td>{chat?.speakers??0}</td><td>{chat?.messages??0}</td><td>{audience?.average_viewers??'—'}</td><td>{audience?.peak_viewers??'—'}</td></tr>;})}</tbody></table></div>
 <p className="amd-heading-note">Collecte depuis {data.collectionStartedAt?new Date(data.collectionStartedAt).toLocaleString('fr-FR'):'le prochain direct'}. Aucun historique antérieur n’est inventé. « Participants » mesure le chat, pas les visiteurs silencieux. Les moyennes portent sur les relevés effectivement reçus.</p>
 </>}
 </section>;
}
