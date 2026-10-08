import type {PoolClient} from 'pg';
import {validRumbleIdentity} from './rules.js';

export const PROFILE_RULES={callXp:20,bonusXp:40,rainXp:5,eventXp:25,maxPerformanceXp:100,maxDiscountPercent:10} as const;
export function levelForXp(xp:number){
 if(!Number.isSafeInteger(xp)||xp<0)throw Error('invalid_xp');
 const step=Math.min(10,Math.floor(Math.sqrt(xp/500)));
 return {level:step+1,discountPercent:step,nextLevelXp:step<10?500*(step+1)**2:null};
}
export function discountedPoints(points:number,percent:number){
 if(!Number.isSafeInteger(points)||points<0||!Number.isInteger(percent)||percent<0||percent>10)throw Error('invalid_discount');
 return Math.ceil(points*(100-percent)/100);
}
/** Project immutable, deduplicated facts; never infer identity from a display name.
 * Historical calls count immediately. Gifts, refunds, bets and referral credits do
 * not generate XP. No timer/chat-spam XP and no additional polling per viewer. */
export async function readProfile(c:Pick<PoolClient,'query'>,sid:number,uid:string){
 if(!validRumbleIdentity(uid))throw Error('rumble_identity_required');
 const r=await c.query(`WITH earnings AS (
  SELECT COALESCE(SUM(CASE
   WHEN reason IN ('first-spin-settled','call-played') THEN 20 WHEN reason='bonus-started' THEN 40
   WHEN reason='rain' THEN 5 WHEN reason='event-participation' THEN 25
   WHEN reason IN ('bonus-ended','round') THEN LEAST(delta,100) ELSE 0 END),0)::bigint AS xp
  FROM automod_points_ledger WHERE streamer_id=$1 AND rumble_user_id=$2 AND delta>0
 ), facts AS (
  SELECT COUNT(*) FILTER(WHERE kind IN ('first-spin-settled','call-played'))::int AS calls,
   COUNT(*) FILTER(WHERE kind='bonus-started' AND COALESCE(payload#>>'{data,inheritedBonus}','false')<>'true'
    AND payload#>>'{data,purchaseOrderId}' IS NULL)::int AS bonuses,
   COALESCE(MAX(CASE WHEN kind IN ('round','bonus-ended')
    AND COALESCE(payload#>>'{data,inheritedBonus}','false')<>'true'
    AND payload#>>'{data,purchaseOrderId}' IS NULL
    AND COALESCE(payload#>>'{data,baseStakeCents}','') ~ '^[1-9][0-9]{0,8}$'
    AND COALESCE(payload#>>'{data,bonus,gainCents}',payload#>>'{data,gainCents}','') ~ '^[0-9]{1,9}$'
    THEN COALESCE(payload#>>'{data,bonus,gainCents}',payload#>>'{data,gainCents}')::numeric
     / (payload#>>'{data,baseStakeCents}')::numeric ELSE 0 END),0) AS best_multi
  FROM automod_points_events WHERE streamer_id=$1 AND payload#>>'{item,requestedByRumbleId}'=$2
 ), monthly AS (
  SELECT COALESCE(SUM(points),0)::bigint AS points FROM automod_event_scores
  WHERE streamer_id=$1 AND rumble_user_id=$2 AND month=to_char(NOW() AT TIME ZONE 'Europe/Paris','YYYY-MM')
 ) SELECT earnings.xp,facts.*,monthly.points AS event_points,
  COALESCE(a.balance-a.reserved,0) AS available,COALESCE(a.reserved,0) AS reserved
 FROM earnings CROSS JOIN facts CROSS JOIN monthly
 LEFT JOIN automod_points_accounts a ON a.streamer_id=$1 AND a.rumble_user_id=$2`,[sid,uid]);
 const row=r.rows[0];
 const xp=Number(row.xp);
 return {xp,...levelForXp(xp),callsPlayed:Number(row.calls),naturalBonuses:Number(row.bonuses),
  bestMultiplier:Number(row.best_multi),available:Number(row.available),reserved:Number(row.reserved),monthlyEventPoints:Number(row.event_points)};
}
export function profileMessage(name:string,p:Awaited<ReturnType<typeof readProfile>>){
 return `@${name} — Niv. ${p.level} · ${p.xp} XP · ${p.callsPlayed} calls joués · ${p.naturalBonuses} bonus · record ×${Math.floor(p.bestMultiplier)}. Solde : ${p.available} pts · Évent/mois : ${p.monthlyEventPoints} · Shop −${p.discountPercent} %.`;
}
