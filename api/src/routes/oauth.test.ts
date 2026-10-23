import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET='oauth-test-only-secret';
process.env.DISCORD_OAUTH_CLIENT_ID='fixture-discord-client';
process.env.DISCORD_OAUTH_CLIENT_SECRET='fixture-discord-secret';
process.env.PUBLIC_WEB_BASE='https://lunalive.win';
const {oauthRouter}=await import('./oauth.js');
const {pool}=await import('../db.js');

async function fixture(run:(base:string)=>Promise<void>){
 const app=express();app.use(oauthRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 try{await run(`http://127.0.0.1:${address.port}`);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
const redirect=async(url:string)=>{
 const response=await fetch(url,{redirect:'manual'});assert.equal(response.status,302);
 return new URL(response.headers.get('location')!);
};

test('Discord reuses prior consent and preserves the onrender origin in signed state',()=>fixture(async base=>{
 const destination=await redirect(base+'/auth/oauth/discord/start?returnOrigin=https%3A%2F%2Flunalive.onrender.com');
 assert.equal(destination.origin,'https://discord.com');assert.equal(destination.searchParams.get('prompt'),'none');
 const state=jwt.verify(destination.searchParams.get('state')!,process.env.JWT_SECRET!) as any;
 assert.equal(state.returnOrigin,'https://lunalive.onrender.com');
}));

test('a first authorization gets a single consent fallback; user cancellation is respected',()=>fixture(async base=>{
 const first=await redirect(base+'/auth/oauth/discord/start?returnOrigin=https%3A%2F%2Flunalive.onrender.com');
 const state=first.searchParams.get('state')!;
 const fallback=await redirect(base+'/auth/oauth/discord/callback?error=consent_required&state='+encodeURIComponent(state));
 assert.equal(fallback.origin,'https://discord.com');assert.equal(fallback.searchParams.get('prompt'),'consent');
 const exhausted=await redirect(base+'/auth/oauth/discord/callback?error=consent_required&state='+encodeURIComponent(fallback.searchParams.get('state')!));
 assert.equal(exhausted.origin,'https://lunalive.onrender.com');assert.equal(exhausted.hash,'#error=oauth_failed');
 const cancelled=await redirect(base+'/auth/oauth/discord/callback?error=access_denied&state='+encodeURIComponent(state));
 assert.equal(cancelled.origin,'https://lunalive.onrender.com');
}));

test('Discord reconnects the existing renamed streamer account without registering another user',context=>fixture(async base=>{
 const realFetch=globalThis.fetch;
 const queries:string[]=[];
 context.mock.method(pool,'query',async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('FROM user_oauth_identities'))return {rows:[{id:179,username:'Belvaa',role:'streamer'}]};
  if(sql.startsWith('UPDATE users SET last_login_at'))return {rows:[]};
  throw Error('Unexpected account mutation');
 });
 context.mock.method(globalThis,'fetch',async(input:any,init:any)=>{
  const url=String(input);
  if(url.startsWith(base))return realFetch(input,init);
  if(url==='https://discord.com/api/oauth2/token')return new Response(JSON.stringify({access_token:'fixture-provider-token'}),{status:200});
  if(url==='https://discord.com/api/users/@me')return new Response(JSON.stringify({id:'fixture-discord-id',username:'old_discord_name',verified:true,email:'fixture@example.invalid'}),{status:200});
  throw Error('Unexpected network destination');
 });
 const auth=await redirect(base+'/auth/oauth/discord/start?returnOrigin=https%3A%2F%2Flunalive.onrender.com');
 const destination=await redirect(base+'/auth/oauth/discord/callback?code=fixture-code&state='+encodeURIComponent(auth.searchParams.get('state')!));
 assert.equal(destination.origin,'https://lunalive.onrender.com');
 const token=new URLSearchParams(destination.hash.slice(1)).get('token');assert.ok(token);
 const user=jwt.verify(token,process.env.JWT_SECRET!) as any;
 assert.equal(user.id,179);assert.equal(user.username,'Belvaa');assert.equal(user.role,'streamer');
 assert.ok(queries.every(sql=>!sql.includes('INSERT')));
}));
