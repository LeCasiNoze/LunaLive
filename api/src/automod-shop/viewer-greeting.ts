import type {Pool} from 'pg';
import {validRumbleIdentity} from './rules.js';
import {parisEventDay} from './event-rules.js';
import {followSchema} from './follows.js';
import {inTransaction} from './wallet.js';
const ready=new WeakMap<Pool,Promise<void>>();
async function greetingSchema(pool:Pool){
 let pending=ready.get(pool);if(!pending){pending=inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(8244147)');
  await c.query(`CREATE TABLE IF NOT EXISTS automod_daily_greetings (
   streamer_id bigint NOT NULL REFERENCES streamers(id),day date NOT NULL,rumble_user_id text NOT NULL,
   created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,day,rumble_user_id))`);
 }).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,pending);}await pending;
}

export function greetingText(username:string,mode:string,followConfirmed:boolean,freePurchaseAvailable:boolean){
 const explanation=mode==='provider-challenge'?'Pragmatic ou Hacksaw ? !camp pour choisir ton équipe, puis !call + slot.'
  :mode==='session-buy'?'3 achats par machine : !call + nom complet de la slot.'
  :mode==='auto-hunt'||mode==='bonus-hunt'?'On collecte les bonus, puis on les ouvre : !call + nom complet de la slot.'
  :'Tu choisis les machines : !call + nom complet de la slot.';
 return `Bonjour @${username} ! ${explanation} ${followConfirmed?'':'Follow pour retrouver la session ! '}${freePurchaseAvailable?'Meilleur Achat aujourd’hui : ton bonus offert sur !shop. ':'!shop pour les options, !points pour ton solde.'}`.trim();
}

/** Native identity and Paris day, so a rename/reconnect cannot repeat the welcome. */
export async function dailyViewerGreeting(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date},now=new Date()){
 if(!validRumbleIdentity(m.userId)||Math.abs(now.getTime()-m.createdAt.getTime())>120000)return null;
 const control=(await pool.query('SELECT desired_enabled,runtime_status,runtime_seen_at FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
 const age=now.getTime()-new Date(control?.runtime_seen_at).getTime();
 if(!control?.desired_enabled||control.runtime_status?.publisherActive!==true||!Number.isFinite(age)||age< -30000||age>60000)return null;
 await followSchema(pool);
 await greetingSchema(pool);
 const day=parisEventDay(now);
 const inserted=await pool.query(`INSERT INTO automod_daily_greetings(streamer_id,day,rumble_user_id)
 VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING rumble_user_id`,[m.streamerId,day.key,m.userId]);
 if(!inserted.rowCount)return null;
 const follows=Boolean((await pool.query(`SELECT 1 FROM automod_follow_events WHERE streamer_id=$1
 AND rumble_user_id=$2 AND last_confirmed_at>$3::timestamptz-INTERVAL '2 minutes' LIMIT 1`,[m.streamerId,m.userId,now])).rowCount);
 const free=day.active&&control.runtime_status.supportedFeatures?.includes('weekly-purchase')===true;
 return greetingText(m.username,String(control.runtime_status.mode??control.runtime_status.config?.mode??'automod'),follows,free);
}
