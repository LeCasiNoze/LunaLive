import type {Pool} from 'pg';
import {validRumbleIdentity} from './rules.js';
import {parisEventDay} from './event-rules.js';
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

export function greetingText(username:string,mode:string,newViewer:boolean){
 const name=mode==='provider-challenge'?'Battle providers':mode==='session-buy'?'session achat'
  :mode==='auto-hunt'||mode==='bonus-hunt'?'AutoHunt':'Automod';
 const camp='Choisis ton camp : !camp pragma ou !camp hacksaw.';
 if(newViewer)return `Bienvenue sur la chaîne @${username} ! On est en ${name}. ${mode==='provider-challenge'?camp:'Propose une slot : !call + nom complet.'} N’hésite pas à lâcher le follow !`;
 return `Salut @${username}, j’espère que tu vas bien ! On est en ${name}${mode==='provider-challenge'?`. ${camp}`:' !'}`;
}

/** Native identity and Paris day, so a rename/reconnect cannot repeat the welcome. */
export async function dailyViewerGreeting(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date},now=new Date()){
 if(!validRumbleIdentity(m.userId)||Math.abs(now.getTime()-m.createdAt.getTime())>120000)return null;
 const control=(await pool.query('SELECT desired_enabled,runtime_status,runtime_seen_at FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
 const age=now.getTime()-new Date(control?.runtime_seen_at).getTime();
 if(!control?.desired_enabled||control.runtime_status?.publisherActive!==true||!Number.isFinite(age)||age< -30000||age>60000)return null;
 await greetingSchema(pool);
 const day=parisEventDay(now);
 return inTransaction(pool,async c=>{
  const inserted=await c.query(`INSERT INTO automod_daily_greetings(streamer_id,day,rumble_user_id)
   VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING rumble_user_id`,[m.streamerId,day.key,m.userId]);
  if(!inserted.rowCount)return null;
  const known=(await c.query(`SELECT EXISTS(
   SELECT 1 FROM automod_daily_greetings WHERE streamer_id=$1 AND rumble_user_id=$2 AND day<>$3::date
   UNION ALL SELECT 1 FROM rumble_chat_messages WHERE streamer_id=$1 AND rumble_user_id=$2 AND created_at<$4
  ) AS known`,[m.streamerId,m.userId,day.key,m.createdAt])).rows[0].known===true;
  return greetingText(m.username,String(control.runtime_status.mode??control.runtime_status.config?.mode??'automod'),!known);
 });
}
