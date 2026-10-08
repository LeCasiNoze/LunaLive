import {randomBytes} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {validRumbleIdentity} from './rules.js';
import {EVENT_RULES,parisEventDay} from './event-rules.js';

export function referralEligibility(ageMs:number,callsPlayed:number){
 return Number.isFinite(ageMs)&&ageMs>=0&&ageMs<EVENT_RULES.referralEligibilityMs&&Number.isSafeInteger(callsPlayed)&&callsPlayed<2&&callsPlayed>=0;
}
async function calls(c:PoolClient,sid:number,uid:string){
 return Number((await c.query(`SELECT COUNT(*) AS n FROM automod_points_events
 WHERE streamer_id=$1 AND kind IN ('first-spin-settled','call-played') AND payload#>>'{item,requestedByRumbleId}'=$2`,[sid,uid])).rows[0].n);
}
/** Caller holds the streamer transaction lock. Never grants a reward from a nickname. */
export async function settleReferral(c:PoolClient,sid:number,uid:string){
 const referral=(await c.query(`SELECT * FROM automod_referrals WHERE streamer_id=$1 AND child_id=$2 AND status='pending' FOR UPDATE`,[sid,uid])).rows[0];
 if(!referral||await calls(c,sid,uid)<2)return false;
 const following=(await c.query(`SELECT COUNT(DISTINCT rumble_user_id) AS n FROM automod_follow_events
 WHERE streamer_id=$1 AND rumble_user_id=ANY($2::text[]) AND last_confirmed_at>NOW()-INTERVAL '2 minutes'`,[sid,[uid,referral.parent_id]])).rows[0];
 if(Number(following.n)!==2)return false;
 const month=parisEventDay(new Date()).month;
 const count=(await c.query(`SELECT COUNT(*) AS n FROM automod_referrals WHERE streamer_id=$1 AND parent_id=$2 AND status='rewarded' AND rewarded_month=$3`,[sid,referral.parent_id,month])).rows[0];
 if(Number(count.n)>=EVENT_RULES.referralMonthlyLimit){
  await c.query("UPDATE automod_referrals SET status='limit-reached' WHERE streamer_id=$1 AND child_id=$2",[sid,uid]);return false;
 }
 const users=[{id:uid,name:referral.child_name},{id:referral.parent_id,name:referral.parent_name}].sort((a,b)=>a.id.localeCompare(b.id));
 for(const u of users){
  await lockWallet(c,sid,u.id,u.name);
  await walletEntry(c,sid,u.id,`referral:${uid}:${u.id}`,EVENT_RULES.referralPoints,0,'referral',{childId:uid,month});
 }
 await c.query("UPDATE automod_referrals SET status='rewarded',rewarded_month=$3,rewarded_at=NOW() WHERE streamer_id=$1 AND child_id=$2",[sid,uid,month]);
 return true;
}
export async function handleReferral(pool:Pool,m:{streamerId:number;userId:string;username:string;text:string;createdAt:Date}):Promise<string|null>{
 const text=m.text.trim();if(!/^!parrain(?:er)?(?:\s|$)/i.test(text))return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[m.streamerId]);
  if(!(await c.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0]?.desired_enabled)return `@${m.username} — Le parrainage est disponible pendant l’Automod.`;
  await c.query(`INSERT INTO automod_viewer_first_seen(streamer_id,rumble_user_id,first_seen_at) VALUES($1,$2,$3)
   ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET first_seen_at=LEAST(automod_viewer_first_seen.first_seen_at,EXCLUDED.first_seen_at)`,[m.streamerId,m.userId,m.createdAt]);
  if(/^!parrainer$/i.test(text)){
   let row=(await c.query('SELECT code FROM automod_referral_codes WHERE streamer_id=$1 AND rumble_user_id=$2',[m.streamerId,m.userId])).rows[0];
   for(let attempt=0;!row&&attempt<5;attempt++)row=(await c.query(`INSERT INTO automod_referral_codes(streamer_id,rumble_user_id,username,code)
    VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING code`,[m.streamerId,m.userId,m.username.slice(0,80),randomBytes(4).toString('hex').toUpperCase()])).rows[0];
   if(!row)throw Error('referral_code_unavailable');
   return `@${m.username} — Ton filleul tape !parrain ${row.code}. Après ses 2 calls joués et vos follows vérifiés : +500 pts chacun (5 filleuls récompensés/mois).`;
  }
  const match=/^!parrain\s+([A-F0-9]{8})$/i.exec(text);
  if(!match)return `@${m.username} — Tape !parrain CODE reçu de ton parrain, ou !parrainer pour obtenir ton code.`;
  const old=(await c.query('SELECT * FROM automod_referrals WHERE streamer_id=$1 AND child_id=$2',[m.streamerId,m.userId])).rows[0];
  if(old){const rewarded=old.status==='rewarded'||await settleReferral(c,m.streamerId,m.userId);
   return `@${m.username} — ${rewarded?'Parrainage validé : 500 points crédités à chacun.':old.status==='limit-reached'?'Plafond mensuel du parrain atteint : ce parrainage ne donne pas de points.':'Parrainage déjà enregistré. Il faut 2 calls joués et vos follows vérifiés.'}`;
  }
  const parent=(await c.query('SELECT rumble_user_id,username FROM automod_referral_codes WHERE streamer_id=$1 AND code=$2',[m.streamerId,match[1]!.toUpperCase()])).rows[0];
  if(!parent||parent.rumble_user_id===m.userId)return `@${m.username} — Code invalide ou personnel : utilise celui de ton parrain.`;
  const cycle=await c.query(`WITH RECURSIVE ancestors(id) AS (
   SELECT $2::text UNION SELECT r.parent_id FROM automod_referrals r JOIN ancestors a ON r.child_id=a.id WHERE r.streamer_id=$1
  ) SELECT 1 FROM ancestors WHERE id=$3`,[m.streamerId,parent.rumble_user_id,m.userId]);
  if(cycle.rowCount)return `@${m.username} — Un parrainage réciproque n’est pas possible.`;
  const first=(await c.query('SELECT first_seen_at AS first FROM automod_viewer_first_seen WHERE streamer_id=$1 AND rumble_user_id=$2',[m.streamerId,m.userId])).rows[0]?.first;
  // Missing history is not evidence of a new viewer.
  if(!first||!referralEligibility(Date.now()-new Date(first).getTime(),await calls(c,m.streamerId,m.userId)))return `@${m.username} — Parrainage réservé aux nouveaux : moins de 7 jours et moins de 2 calls joués.`;
  await c.query(`INSERT INTO automod_referrals(streamer_id,child_id,parent_id,child_name,parent_name,status)
   VALUES($1,$2,$3,$4,$5,'pending')`,[m.streamerId,m.userId,parent.rumble_user_id,m.username.slice(0,80),parent.username]);
  return `@${m.username} — Parrainage enregistré ! Joue 2 calls ; avec vos follows vérifiés, vous recevrez 500 pts chacun.`;
 });
}
