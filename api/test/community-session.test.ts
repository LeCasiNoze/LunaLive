import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {communitySessionSchema,issueCommunityCode,exchangeCommunityCode,communityIdentity,revokeCommunitySession,challengeFor,digest} from '../src/nozecoins/community-session.js';
const db=new PGlite();
const query=async(sql:string,params?:unknown[])=>{if(!params&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const pool={query,connect:async()=>({query,release(){}})} as unknown as Pool;
const did='123456789012345678',verifier=randomBytes(32).toString('base64url');
before(()=>communitySessionSchema(pool));after(()=>db.close());
test('a browser-bound exchange yields only a scoped opaque session, stored hashed',async()=>{
 const code=await issueCommunityCode(pool,did,challengeFor(verifier));const token=await exchangeCommunityCode(pool,code,verifier);
 assert.equal(await communityIdentity(pool,token),did);assert.equal(token.length,43);assert.equal(token.includes('.'),false);
 const saved=(await query('SELECT token_hash FROM community_sessions WHERE token_hash=$1',[digest(token)])).rows[0] as any;assert.equal(saved.token_hash,digest(token));assert.notEqual(saved.token_hash,token);
});
test('wrong browser verifier cannot claim or consume the code',async()=>{
 const code=await issueCommunityCode(pool,did,challengeFor(verifier));await assert.rejects(exchangeCommunityCode(pool,code,randomBytes(32).toString('base64url')),/invalid_code/);
 assert.equal(await communityIdentity(pool,await exchangeCommunityCode(pool,code,verifier)),did);
});
test('codes are single use',async()=>{const code=await issueCommunityCode(pool,did,challengeFor(verifier));await exchangeCommunityCode(pool,code,verifier);await assert.rejects(exchangeCommunityCode(pool,code,verifier),/invalid_code/);});
test('expired code cannot mint a session',async()=>{const code=await issueCommunityCode(pool,did,challengeFor(verifier));await query("UPDATE community_login_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE code_hash=$1",[digest(code)]);await assert.rejects(exchangeCommunityCode(pool,code,verifier),/invalid_code/);});
test('logout revokes the current session without changing wallets',async()=>{const code=await issueCommunityCode(pool,did,challengeFor(verifier));const token=await exchangeCommunityCode(pool,code,verifier);await revokeCommunitySession(pool,token);assert.equal(await communityIdentity(pool,token),null);});
test('expired sessions and LunaLive-shaped JWTs are rejected',async()=>{const code=await issueCommunityCode(pool,did,challengeFor(verifier));const token=await exchangeCommunityCode(pool,code,verifier);await query("UPDATE community_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",[digest(token)]);assert.equal(await communityIdentity(pool,token),null);assert.equal(await communityIdentity(pool,'header.payload.signature'),null);});
test('invalid identities and challenges never create login codes',async()=>{await assert.rejects(issueCommunityCode(pool,'someone',challengeFor(verifier)),/invalid_identity/);await assert.rejects(issueCommunityCode(pool,did,'https://evil.test'),/invalid_identity/);});
