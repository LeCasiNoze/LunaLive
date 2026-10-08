import type {Pool} from 'pg';
import {resolveSlot} from '../calls/catalog.js';
import {keyText} from '../calls/normalize.js';
import {automodProviderAllowed} from '../calls/automod_provider_policy.js';
import {getCallsSettings,isUserBannedFromCalls,isSlotBanned,isProviderBanned,isProviderAllowedByPolicy} from '../calls/queue.js';
import {normalizeProvider} from '../calls/provider_aliases.js';
import {requestWeeklyPurchase,weeklyEventSchema} from './weekly-event.js';
import {parisEventDay} from './event-rules.js';
import {validRumbleIdentity} from './rules.js';

export async function handleWeeklyChat(pool:Pool,m:{streamerId:number;userId:string;username:string;text:string;createdAt:Date}){
 if(!/^!offert(?:\s|$)/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 const name=m.text.trim().replace(/^!offert\s*/i,'');
 if(!name)return `@${m.username} — Meilleur Achat : !offert + nom complet de la slot. Un bonus offert aux followers le mardi et vendredi.`;
 const slot=await resolveSlot(pool,name);
 if(!slot||keyText(slot.name)!==keyText(name))return `@${m.username} — Machine non reconnue. Choisis son nom complet sur !shop, puis !offert + nom.`;
 const provider=String(normalizeProvider(slot.provider)??'').toLowerCase();
 const family=automodProviderAllowed(provider,['hacksaw'])?'hacksaw':automodProviderAllowed(provider,['pragmatic'])?'pragmatic':null;
 const control=(await pool.query('SELECT dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
 if(!Array.isArray(control?.runtime_status?.supportedFeatures)||!control.runtime_status.supportedFeatures.includes('weekly-purchase'))return `@${m.username} — Les achats offerts ne sont pas encore disponibles sur cette session.`;
 const allowed=control.dashboard_settings?.allowedProviders??control.runtime_status?.config?.allowedProviders??['hacksaw','pragmatic'];
 const settings=await getCallsSettings(pool,m.streamerId);
 if(!family||!settings.enabled||!automodProviderAllowed(provider,allowed)||await isUserBannedFromCalls(pool,m.streamerId,0,m.username)||await isSlotBanned(pool,m.streamerId,keyText(slot.name))||await isProviderBanned(pool,m.streamerId,provider)||!await isProviderAllowedByPolicy(pool,m.streamerId,provider))return `@${m.username} — Cette machine n’est pas autorisée pour l’événement.`;
 try{
  const result=await requestWeeklyPurchase(pool,m.streamerId,{userId:m.userId,username:m.username},{name:slot.name,key:keyText(slot.name),provider:family});
  return result.created?`@${m.username} — ${slot.name} : achat offert enregistré ! Il passera entre deux calls en Automod classique.`:`@${m.username} — Ton achat offert du jour est déjà enregistré : ${result.entry.slot_name}.`;
 }catch(e){
  const reason=e instanceof Error?e.message:'';
  if(reason==='weekly_follow_required')return `@${m.username} — Follow la chaîne pour ton achat offert, puis réessaie !offert ${slot.name}.`;
  if(reason==='weekly_not_today')return `@${m.username} — Meilleur Achat a lieu mardi et vendredi, de minuit à minuit (heure de Paris).`;
  if(reason==='weekly_not_live')return `@${m.username} — Les inscriptions sont ouvertes pendant le live Automod.`;
  if(reason==='weekly_hunt_bonus_pending')return `@${m.username} — Cette machine a un bonus de hunt en attente. Choisis une autre slot.`;
  if(reason==='weekly_provider_disabled')return `@${m.username} — Ce provider vient d’être désactivé. Choisis une autre slot.`;
  throw e;
 }
}

export async function weeklyGreeting(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date},now=new Date()){
 const day=parisEventDay(now);
 if(!day.active||!validRumbleIdentity(m.userId)||Math.abs(now.getTime()-m.createdAt.getTime())>120000)return null;
 const control=(await pool.query('SELECT desired_enabled,runtime_status,runtime_seen_at FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
 const age=now.getTime()-new Date(control?.runtime_seen_at).getTime();
 if(!control?.desired_enabled||control.runtime_status?.publisherActive!==true||!Number.isFinite(age)||age< -30000||age>60000||!Array.isArray(control.runtime_status?.supportedFeatures)||!control.runtime_status.supportedFeatures.includes('weekly-purchase'))return null;
 await weeklyEventSchema(pool);
 const inserted=await pool.query(`INSERT INTO automod_weekly_greetings(streamer_id,day,rumble_user_id)
 SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM automod_weekly_entries q JOIN automod_weekly_events e ON e.id=q.event_id WHERE e.streamer_id=$1 AND e.day=$2 AND q.rumble_user_id=$3)
 ON CONFLICT DO NOTHING RETURNING rumble_user_id`,[m.streamerId,day.key,m.userId]);
 if(!inserted.rowCount)return null;
 const follows=(await pool.query("SELECT 1 FROM automod_follow_events WHERE streamer_id=$1 AND rumble_user_id=$2 AND last_confirmed_at>$3::timestamptz-INTERVAL '2 minutes' LIMIT 1",[m.streamerId,m.userId,now])).rowCount;
 return `Bonjour @${m.username} ! Meilleur Achat aujourd’hui : ${follows?'ton bonus offert t’attend':'follow la chaîne pour ton bonus offert'}. Le meilleur multi gagne des points d’événement ! https://lecasinoze.onrender.com/automod-shop/?event=meilleur-achat`;
}
