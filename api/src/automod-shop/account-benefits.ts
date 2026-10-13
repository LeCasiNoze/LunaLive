import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {validRumbleIdentity} from './rules.js';

export const ACCOUNT_TIERS=[3000,5000,10000] as const;
export function hasCnzPrefix(name:string){return /^CNZ/i.test(name.trim());}
type Query=Pick<PoolClient,'query'>;
export async function accountBenefits(c:Query,sid:number,uid:string){
 const row=(await c.query(`SELECT b.cnz_active,b.calls_tier,b.music_tier,b.cnz_claimed_at FROM automod_points_accounts a
 LEFT JOIN automod_account_benefits b USING(streamer_id,rumble_user_id) WHERE a.streamer_id=$1 AND a.rumble_user_id=$2`,[sid,uid])).rows[0];
 const cnz=row?.cnz_active===true;
 return {cnz,cnzClaimed:!!row?.cnz_claimed_at,callsTier:Number(row?.calls_tier??0),musicTier:Number(row?.music_tier??0),
  maxPendingCalls:2+Number(row?.calls_tier??0)+(cnz?1:0),maxPendingMusic:1+Number(row?.music_tier??0)};
}
/** Fresh authenticated Rumble messages alone update membership; the native ID owns the permanent receipt. */
export async function observeCnz(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date}){
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 return inTransaction(pool,async c=>{
  await lockWallet(c,m.streamerId,m.userId,m.username);
  await c.query(`INSERT INTO automod_account_benefits(streamer_id,rumble_user_id,cnz_active,cnz_seen_at) VALUES($1,$2,$3,$4)
   ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET cnz_active=EXCLUDED.cnz_active,cnz_seen_at=EXCLUDED.cnz_seen_at
   WHERE automod_account_benefits.cnz_seen_at<=EXCLUDED.cnz_seen_at`,[m.streamerId,m.userId,hasCnzPrefix(m.username),m.createdAt]);
  if(!hasCnzPrefix(m.username))return null;
  const added=await walletEntry(c,m.streamerId,m.userId,`cnz-welcome:${m.userId}`,2000,0,'cnz-welcome');
  await c.query(`UPDATE automod_account_benefits SET cnz_claimed_at=COALESCE(cnz_claimed_at,NOW()) WHERE streamer_id=$1 AND rumble_user_id=$2`,[m.streamerId,m.userId]);
  return added?`💜 @${m.username} — +2 000 points pour CNZ ! Tu as aussi +1 call en attente tant que ton pseudo commence par CNZ. Prime unique par compte.`:null;
 });
}
export async function handleAccountUpgrade(pool:Pool,m:{streamerId:number;userId:string;username:string;messageId:string;text:string;createdAt:Date}){
 if(!/^!compte(?:\s|$)/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 const match=/^!compte\s+(calls|musique)\s+([123])\s*$/i.exec(m.text.trim());
 if(!match)return `@${m.username} — !compte calls 1 ou !compte musique 1 · +1 place · paliers : 3 000 / 5 000 / 10 000 pts.`;
 const kind=match[1]!.toLowerCase(),tier=Number(match[2]),column=kind==='calls'?'calls_tier':'music_tier',price=ACCOUNT_TIERS[tier-1]!;
 try{return await inTransaction(pool,async c=>{
  await lockWallet(c,m.streamerId,m.userId,m.username);
  await c.query(`INSERT INTO automod_account_benefits(streamer_id,rumble_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[m.streamerId,m.userId]);
  const current=Number((await c.query(`SELECT ${column} AS tier FROM automod_account_benefits WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE`,[m.streamerId,m.userId])).rows[0].tier);
  if(current>=tier)return `@${m.username} — Ce palier est déjà acquis.`;
  if(current!==tier-1)return `@${m.username} — Achète d’abord le palier ${current+1}.`;
  await walletEntry(c,m.streamerId,m.userId,`account:${kind}:${tier}:${m.userId}`,-price,0,'account-upgrade',{kind,tier});
  await c.query(`UPDATE automod_account_benefits SET ${column}=$3 WHERE streamer_id=$1 AND rumble_user_id=$2`,[m.streamerId,m.userId,tier]);
  return `✨ @${m.username} — ${kind==='calls'?'Calls':'Musique'} : palier ${tier} acquis pour ${price} points, +1 place en attente.`;
 });}catch(e){if((e as Error).message==='insufficient_points')return `@${m.username} — Il te faut ${price} points disponibles pour ce palier. !points pour ton solde.`;throw e;}
}
