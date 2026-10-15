import {createHash,randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {inTransaction} from '../automod-shop/wallet.js';
const ready=new WeakMap<Pool,Promise<void>>();
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const challengeFor=(s:string)=>createHash('sha256').update(s).digest('base64url');
export const validChallenge=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
export async function communitySessionSchema(pool:Pool){
 let task=ready.get(pool);if(!task){task=inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(8244152)');
  await c.query(`CREATE TABLE IF NOT EXISTS community_login_codes(code_hash text PRIMARY KEY,discord_id text NOT NULL,challenge text NOT NULL,expires_at timestamptz NOT NULL);
   CREATE TABLE IF NOT EXISTS community_sessions(token_hash text PRIMARY KEY,discord_id text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW());`);
 }).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,task);}await task;
}
export async function issueCommunityCode(pool:Pool,discordId:string,challenge:string){
 if(!/^\d{17,20}$/.test(discordId)||!validChallenge(challenge))throw Error('invalid_identity');
 await communitySessionSchema(pool);const code=randomBytes(32).toString('base64url');
 await pool.query(`INSERT INTO community_login_codes VALUES($1,$2,$3,NOW()+INTERVAL '1 minute')`,[digest(code),discordId,challenge]);return code;
}
export async function exchangeCommunityCode(pool:Pool,code:string,verifier:string){
 if(!validChallenge(code)||!validChallenge(verifier))throw Error('invalid_code');
 await communitySessionSchema(pool);
 return inTransaction(pool,async c=>{
  const row=(await c.query(`DELETE FROM community_login_codes WHERE code_hash=$1 AND challenge=$2 AND expires_at>NOW() RETURNING discord_id`,[digest(code),challengeFor(verifier)])).rows[0];
  if(!row)throw Error('invalid_code');
  const token=randomBytes(32).toString('base64url');
  await c.query(`INSERT INTO community_sessions(token_hash,discord_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')`,[digest(token),row.discord_id]);
  await c.query('DELETE FROM community_login_codes WHERE expires_at<NOW()');
  await c.query('DELETE FROM community_sessions WHERE expires_at<NOW()');
  return token;
 });
}
export async function communityIdentity(pool:Pool,token:string){
 if(!validChallenge(token))return null;await communitySessionSchema(pool);
 return (await pool.query('SELECT discord_id FROM community_sessions WHERE token_hash=$1 AND expires_at>NOW()',[digest(token)])).rows[0]?.discord_id??null;
}
export async function revokeCommunitySession(pool:Pool,token:string){
 if(validChallenge(token)){await communitySessionSchema(pool);await pool.query('DELETE FROM community_sessions WHERE token_hash=$1',[digest(token)]);}
}
