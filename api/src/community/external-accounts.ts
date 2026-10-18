import {randomBytes,createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {discordProfileSchema} from '../automod-shop/discord-profile.js';
export type ExternalProvider='rumble'|'kick'|'twitch';
export const CONNECTIONS_URL='https://lunalive.win/profile?tab=settings#connections';
export const hashExternalCode=(code:string)=>createHash('sha256').update(code.toUpperCase()).digest('hex');
const schemas=new WeakMap<Pool,Promise<void>>();
export async function externalAccountsSchema(db:Pool){
 let promise=schemas.get(db);if(!promise){promise=(async()=>{
  await discordProfileSchema(db);
  await db.query(`CREATE TABLE IF NOT EXISTS external_account_links(
   provider text NOT NULL CHECK(provider IN ('rumble','kick','twitch')),external_id text NOT NULL,
   user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,username text NOT NULL,
   sync_username boolean NOT NULL DEFAULT false,observed_at timestamptz NOT NULL DEFAULT NOW(),
   PRIMARY KEY(provider,external_id),UNIQUE(provider,user_id));
  CREATE TABLE IF NOT EXISTS external_account_codes(
   user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider text NOT NULL,
   code_hash text NOT NULL UNIQUE,sync_username boolean NOT NULL DEFAULT false,
   created_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,
   PRIMARY KEY(user_id,provider));`);
 })().catch(error=>{schemas.delete(db);throw error;});schemas.set(db,promise);}await promise;
}
type Queryable=Pick<PoolClient,'query'>;
// Each edge is proved by OAuth or a native-chat code, never by a matching name.
export const discordIdentityBindingsSql=`
 SELECT discord_user_id,user_id FROM discord_links
 UNION SELECT provider_user_id,user_id FROM user_oauth_identities WHERE provider='discord'
 UNION SELECT r.discord_user_id,e.user_id FROM automod_discord_links r
 JOIN external_account_links e ON e.provider='rumble' AND e.external_id=r.rumble_user_id`;
export async function communityDiscordIds(db:Queryable,userId:number){
 const {rows}=await db.query(`SELECT DISTINCT discord_user_id FROM (${discordIdentityBindingsSql}) bindings WHERE user_id=$1`,[userId]);
 return rows.map(row=>String(row.discord_user_id));
}
export async function resolveExternalUser(db:Queryable,provider:ExternalProvider,externalId:string,_streamerId:number){
 const {rows}=await db.query(`SELECT DISTINCT user_id FROM (
  SELECT user_id FROM external_account_links WHERE provider=$1 AND external_id=$2
  UNION ALL
  SELECT d.user_id FROM automod_discord_links r JOIN (${discordIdentityBindingsSql}) d ON d.discord_user_id=r.discord_user_id
  WHERE $1='rumble' AND r.rumble_user_id=$2
 ) linked`,[provider,externalId]);
 const ids=[...new Set(rows.map(row=>Number(row.user_id)))].filter(id=>Number.isSafeInteger(id)&&id>0);
 if(ids.length>1)throw Error('identity_conflict');
 return ids[0]??null;
}
export async function issueExternalCode(db:Pool,userId:number,syncUsername=false){
 await externalAccountsSchema(db);
 const code='LL-'+randomBytes(16).toString('hex').toUpperCase();
 const result=await db.query(`INSERT INTO external_account_codes(user_id,provider,code_hash,sync_username,expires_at)
 VALUES($1,'rumble',$2,$3,NOW()+INTERVAL '10 minutes') ON CONFLICT(user_id,provider)
 DO UPDATE SET code_hash=EXCLUDED.code_hash,sync_username=EXCLUDED.sync_username,created_at=NOW(),expires_at=EXCLUDED.expires_at
 WHERE external_account_codes.created_at<NOW()-INTERVAL '1 minute' RETURNING expires_at`,[userId,hashExternalCode(code),syncUsername]);
 if(!result.rows[0])throw Error('link_cooldown');
 return {command:'!lier '+code,expiresAt:result.rows[0].expires_at};
}
export async function consumeExternalCode(db:Pool,input:{code:string;externalId:string;username:string;streamerId:number}){
 await externalAccountsSchema(db);
 const c=await db.connect();
 try{
  await c.query('BEGIN');
  const row=(await c.query(`SELECT user_id,sync_username FROM external_account_codes WHERE provider='rumble' AND code_hash=$1 AND expires_at>NOW() FOR UPDATE`,[hashExternalCode(input.code)])).rows[0];
  if(!row)throw Error('invalid_code');
  // Serialize both sides of the binding; a code never transfers an existing account.
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['external:rumble:'+input.externalId]);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['external:user:'+row.user_id]);
  const existing=await resolveExternalUser(c,'rumble',input.externalId,input.streamerId);
  if(existing&&existing!==Number(row.user_id))throw Error('identity_conflict');
  const current=(await c.query(`SELECT external_id FROM external_account_links WHERE provider='rumble' AND user_id=$1`,[row.user_id])).rows[0];
  if(current&&current.external_id!==input.externalId)throw Error('identity_conflict');
  const bound=await c.query(`INSERT INTO external_account_links(provider,external_id,user_id,username,sync_username) VALUES('rumble',$1,$2,$3,$4)
   ON CONFLICT(provider,external_id) DO UPDATE SET username=EXCLUDED.username,sync_username=EXCLUDED.sync_username,observed_at=NOW()
   WHERE external_account_links.user_id=EXCLUDED.user_id RETURNING user_id`,[input.externalId,row.user_id,input.username,row.sync_username]);
  if(!bound.rowCount)throw Error('identity_conflict');
  await c.query(`DELETE FROM external_account_codes WHERE user_id=$1 AND provider='rumble'`,[row.user_id]);
  await c.query('COMMIT');return Number(row.user_id);
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}

export async function externalAccountStatus(db:Pool,userId:number){
 await externalAccountsSchema(db);
 const direct=(await db.query(`SELECT provider,external_id,username,sync_username FROM external_account_links WHERE user_id=$1`,[userId])).rows;
 const discordIds=await communityDiscordIds(db,userId);
 const inherited=(await db.query(`SELECT DISTINCT ON(rumble_user_id) rumble_user_id,username FROM automod_discord_links WHERE discord_user_id=ANY($1::text[]) ORDER BY rumble_user_id,created_at DESC`,[discordIds])).rows;
 const rumble=direct.find(row=>row.provider==='rumble');
 const candidates=[];let conflict=false;
 if(rumble)try{await resolveExternalUser(db,'rumble',String(rumble.external_id),0);}catch{conflict=true;}
 for(const link of inherited){try{if(await resolveExternalUser(db,'rumble',link.rumble_user_id,0)===userId)candidates.push(link);}catch{conflict=true;}}
 const ids=[...new Set(candidates.map(link=>String(link.rumble_user_id)))];
 const lunaUsername=String((await db.query('SELECT username FROM users WHERE id=$1',[userId])).rows[0]?.username??'');
 return {discordLinked:discordIds.length>0,lunaUsername,rumble:rumble&&!conflict?{linked:true,id:rumble.external_id,username:rumble.username,syncUsername:rumble.sync_username,via:'direct'}
  :ids.length===1&&!conflict?{linked:true,id:ids[0],username:candidates[0].username,syncUsername:false,via:'discord'}:{linked:false,conflict:conflict||ids.length>1}};
}

export async function synchronizeExternalName(db:Pool,externalId:string,username:string,observedAt:Date){
 const row=(await db.query(`UPDATE external_account_links SET username=$2,observed_at=$3 WHERE provider='rumble' AND external_id=$1 AND observed_at<=$3 RETURNING user_id,sync_username`,[externalId,username,observedAt])).rows[0];
 if(!row?.sync_username)return null;
 // Preserve login handles when an external name is invalid or already owned.
 if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(username))return null;
 const changed=await db.query(`UPDATE users SET username=$2 WHERE id=$1 AND username<>$2
  AND NOT EXISTS(SELECT 1 FROM users other WHERE lower(other.username)=lower($2) AND other.id<>$1) RETURNING id`,[row.user_id,username]);
 return changed.rows[0]?Number(row.user_id):null;
}
