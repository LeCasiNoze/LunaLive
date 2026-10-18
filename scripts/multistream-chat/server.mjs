import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createConnection} from 'node:net';
import {Store} from './store.mjs';
import {Vault,PlatformApi,TwitchReceiver} from './platforms.mjs';
import {RelayWorker} from './worker.mjs';
import {syncTitles,titlesForMode} from './mode-title-sync.mjs';
import {dashboardSessionValid,verifyKickWebhook,normalizeKickEvent} from './security.mjs';

process.umask(0o077);
const origin=process.env.MULTICHAT_ORIGIN||'https://vps-92b153fc.vps.ovh.net';
const root=process.env.MULTICHAT_DATA||join(process.cwd(),'data');
const secret=process.env.MULTICHAT_DASHBOARD_SECRET;
if(!secret)throw Error('dashboard_secret_required');
const store=new Store(join(root,'relay.sqlite')),vault=new Vault(join(root,'credentials'));
const apis={kick:new PlatformApi('kick',vault,{origin}),twitch:new PlatformApi('twitch',vault,{origin})};
const runtime={startedAt:new Date().toISOString(),twitch:'not_connected',kick:'not_connected'},recentEvents=[];
runtime.videoHealth=store.get('videoHealth');
const require=createRequire(import.meta.url),{Pool}=require('pg');
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15_000,idleTimeoutMillis:30_000,application_name:'lunalive-multichat'}):null;
pool?.on('error',()=>{runtime.database='connection_interrupted';});
const worker=new RelayWorker({store,apis,pool,apiBase:process.env.BOT_API_BASE||'https://lunalive-api.onrender.com',botKey:process.env.BOT_INTERNAL_KEY||process.env.INTERNAL_BOT_KEY||'',onStatus:value=>Object.assign(runtime,value)});
const receive=async event=>{
  const result=await worker.receive(event);
  if(result.accepted&&!result.duplicate){recentEvents.unshift({platform:event.platform,username:event.username,text:event.text.slice(0,500)});if(recentEvents.length>50)recentEvents.pop();}
  return result;
};
const twitch=new TwitchReceiver(apis.twitch,{onEvent:receive,onStatus:value=>{runtime.twitch=value;}});
let kickKey='',kickKeyFetched=0,lastKeyRetry=0,maintenanceBusy=false;
async function publicKey(force=false){
  if(!force&&kickKey&&Date.now()-kickKeyFetched<3600_000)return kickKey;
  const r=await fetch('https://api.kick.com/public/v1/public-key',{signal:AbortSignal.timeout(10_000)});
  if(!r.ok)throw Error('kick_public_key_unavailable');
  const body=await r.json();if(typeof body.data?.public_key!=='string')throw Error('invalid_kick_public_key');
  kickKey=body.data.public_key;kickKeyFetched=Date.now();return kickKey;
}
async function maintain(){
  if(maintenanceBusy)return;maintenanceBusy=true;
  try{
    await worker.checkBridge();
    for(const platform of ['kick','twitch']){
      const c=await vault.get(platform);if(!c.accessToken)continue;
      try{await apis[platform].validate();if(store.get('enabled',false)){if(platform==='kick'){await apis.kick.subscribeKick();runtime.kick='subscribed';}else twitch.start();}runtime[platform+'Auth']='valid';}
      catch(error){runtime[platform+'Auth']=error.message;}
    }
    store.prune();
  }finally{maintenanceBusy=false;}
}
function reply(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
  res.end(typeof body==='string'?body:JSON.stringify(body));
}
async function rawBody(req,limit=64*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('body_too_large');chunks.push(chunk);}return Buffer.concat(chunks);}
async function streamAdmin(action,body){
  if(!['status','configure','control','start','stop'].includes(action))throw Error('invalid_stream_action');
  return new Promise((resolve,reject)=>{
    const socket=createConnection('/run/lunalive-multistream/admin.sock');
    let output='',finished=false;
    const timeout=setTimeout(()=>{socket.destroy();if(!finished){finished=true;reject(Error('stream_helper_timeout'));}},25_000);
    socket.on('data',chunk=>{output+=chunk.toString();if(output.length>32_000)socket.destroy();});
    socket.on('error',()=>{clearTimeout(timeout);if(!finished){finished=true;reject(Error('stream_helper_unavailable'));}});
    socket.on('end',()=>{clearTimeout(timeout);if(finished)return;finished=true;try{const value=JSON.parse(output);if(value.ok!==true){reject(Error(value.error==='publication_busy'?'publication_busy':'stream_helper_failed'));return;}resolve(value);}catch{reject(Error('stream_helper_failed'));}});
    socket.on('connect',()=>socket.end(JSON.stringify({...body,action})+'\n'));
  });
}
let videoCheckBusy=false;
async function checkVideo(){
  if(videoCheckBusy)return;videoCheckBusy=true;
  try{
    const output=await streamAdmin('status');
    const expected=output.runtime?.lastPacketAt>Date.now()/1000-20;
    const health={checkedAt:new Date().toISOString(),mode:output.publicationOwner,sourceActive:expected,platforms:{}};
    for(const p of ['kick','twitch']){
      if(!expected||!output.targets[p]?.enabled){health.platforms[p]={expected:false};continue;}
      try{
        const result=await apis[p].request(p==='kick'?'/channels?broadcaster_user_id=24912362':'/streams?user_id=535777475');
        const item=result.data?.[0];health.platforms[p]={expected:true,live:p==='kick'?Boolean(item?.stream?.is_live):item?.type==='live'};
      }catch(error){health.platforms[p]={expected:true,error:/^[a-z0-9_]+$/.test(error.message)?error.message:'video_status_unavailable'};}
    }
    if(JSON.stringify(runtime.videoHealth?.platforms)!==JSON.stringify(health.platforms))console.log(JSON.stringify({event:'multistream_health',mode:health.mode,platforms:health.platforms}));
    runtime.videoHealth=health;store.set('videoHealth',health);
    if(expected&&output.publicationOwner==='automod'){
      try{
        const r=await fetch('http://127.0.0.1:4317/api/status',{signal:AbortSignal.timeout(5000)});
        if(r.ok){
          const status=await r.json(),planned=titlesForMode(status,output.publicationOwner);
          const stillAllowed=async()=>{
            const latest=await streamAdmin('status');
            if(latest.publicationOwner!=='automod'||!planned)return false;
            const response=await fetch('http://127.0.0.1:4317/api/status',{signal:AbortSignal.timeout(5000)});
            return response.ok&&titlesForMode(await response.json(),latest.publicationOwner)?.mode===planned.mode;
          };
          runtime.titleSync=await syncTitles({status,owner:output.publicationOwner,apis,store,stillAllowed});
        }
      }catch{runtime.titleSync={state:'status_unavailable'};}
    }else runtime.titleSync=await syncTitles({status:null,owner:output.publicationOwner,apis,store});
  }finally{videoCheckBusy=false;}
}
const auth=req=>dashboardSessionValid(req.headers.cookie,secret);
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),path=url.pathname,platform=path.split('/')[3];
  if(req.method==='POST'&&path==='/multichat/webhooks/kick'){
    const raw=await rawBody(req),key=await publicKey();
    let valid=verifyKickWebhook(req.headers,raw,key);
    if(!valid&&Date.now()-lastKeyRetry>60_000){lastKeyRetry=Date.now();valid=verifyKickWebhook(req.headers,raw,await publicKey(true));}
    if(!valid)return reply(res,403,{ok:false,error:'invalid_signature'});
    const event=normalizeKickEvent(JSON.parse(raw));const result=await receive(event);
    return reply(res,200,{ok:true,...result});
  }
  if(req.method==='GET'&&/^\/multichat\/oauth\/(kick|twitch)\/callback$/.test(path)){
    const pending=store.consumeOauth(String(url.searchParams.get('state')||''),platform);
    if(url.searchParams.get('error'))return reply(res,400,{ok:false,error:'authorization_declined'});
    const code=url.searchParams.get('code');if(!code)return reply(res,400,{ok:false,error:'authorization_code_missing'});
    await apis[platform].exchange(code,pending.verifier);
    void maintain();
    // The existing dashboard cookie is SameSite=Strict. Finish on this origin
    // before following an internal link, instead of showing a false login error.
    return reply(res,200,'<!doctype html><html lang="fr"><meta charset="utf-8"><title>Compte connecté</title><body style="background:#101323;color:white;font:18px system-ui;padding:40px"><h1>Compte connecté</h1><p>La connexion du chat est enregistrée sur le VPS.</p><a style="color:#b4baff" href="/multichat/">Revenir à la régie multistream</a></body></html>','text/html; charset=utf-8');
  }
  if(!auth(req)){
    if(req.method==='GET'&&!path.startsWith('/multichat/api/'))return reply(res,401,'<!doctype html><html lang="fr"><meta charset="utf-8"><title>Connexion requise</title><body style="background:#101323;color:white;font:18px system-ui;padding:40px"><h1>Connecte-toi à LunaClip</h1><p><a style="color:#b4baff" href="/login">Ouvrir la connexion LunaClip</a>, puis reviens sur <a style="color:#b4baff" href="/multichat/">la régie multistream</a>.</p></body></html>','text/html; charset=utf-8');
    return reply(res,401,{ok:false,error:'dashboard_login_required'});
  }
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return reply(res,403,{ok:false,error:'same_origin_required'});
  if(req.method==='GET'&&['/multichat','/multichat/'].includes(path))return reply(res,200,await readFile(new URL('./dashboard.html',import.meta.url),'utf8'),'text/html; charset=utf-8');
  if(req.method==='GET'&&path==='/multichat/dashboard.js')return reply(res,200,await readFile(new URL('./dashboard.js',import.meta.url),'utf8'),'text/javascript; charset=utf-8');
  if(req.method==='GET'&&path==='/multichat/api/stream')return reply(res,200,await streamAdmin('status'));
  if(req.method==='POST'&&path==='/multichat/api/stream'){
    const body=JSON.parse(await rawBody(req,8000));
    if(!['configure','control','start','stop'].includes(body.action))return reply(res,400,{ok:false,error:'invalid_stream_action'});
    return reply(res,200,await streamAdmin(body.action,body));
  }
  if(req.method==='GET'&&path==='/multichat/api/status'){
    const platforms={};for(const p of ['kick','twitch']){const c=await vault.get(p);platforms[p]={applicationConfigured:Boolean(c.clientId&&c.clientSecret),connected:Boolean(c.accessToken),login:c.login||null,channelId:c.channelId||null,expiresAt:c.expiresAt?new Date(c.expiresAt).toISOString():null,scopes:c.scopes||[],lastError:c.lastError||null};}
    return reply(res,200,{ok:true,enabled:store.get('enabled',false),platforms,runtime,queues:store.counts(),bridge:{mode:'shared_lunalive_api',endpoint:'/internal/bot/multichat/event',twitchExternalChat:false},recentEvents});
  }
  if(req.method==='POST'&&/^\/multichat\/api\/application\/(kick|twitch)$/.test(path)){
    const p=path.split('/')[4],body=JSON.parse(await rawBody(req));
    if(typeof body.clientId!=='string'||typeof body.clientSecret!=='string'||!/^[a-zA-Z0-9_-]{10,100}$/.test(body.clientId)||body.clientSecret.length<16||body.clientSecret.length>300)return reply(res,400,{ok:false,error:'invalid_application_credentials'});
    const old=await vault.get(p);
    if(old.accessToken&&body.clientId!==old.clientId)return reply(res,409,{ok:false,error:'disconnect_account_before_changing_application'});
    await vault.save(p,{...old,clientId:body.clientId,clientSecret:body.clientSecret});return reply(res,200,{ok:true});
  }
  if(req.method==='GET'&&/^\/multichat\/oauth\/(kick|twitch)\/start$/.test(path)){
    const pending=store.oauth(platform),location=await apis[platform].authorization(pending.state,pending.verifier,{manageTitles:url.searchParams.get('titles')==='1'});
    res.writeHead(303,{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();
  }
  if(req.method==='POST'&&path==='/multichat/api/control'){
    const body=JSON.parse(await rawBody(req));if(typeof body.enabled!=='boolean')return reply(res,400,{ok:false,error:'enabled_boolean_required'});
    store.set('enabled',body.enabled);if(!body.enabled)twitch.stop();else void maintain();return reply(res,200,{ok:true,enabled:body.enabled});
  }
  if(req.method==='POST'&&path==='/multichat/api/probe'){
    const results={};for(const p of ['kick','twitch']){try{await apis[p].validate();results[p]='valid';}catch(error){results[p]=error.message;}}
    results.lunalive=(await worker.checkBridge())?'ready':'not_ready';return reply(res,200,{ok:true,results});
  }
  if(req.method==='POST'&&/^\/multichat\/api\/test\/(kick|twitch)$/.test(path)){
    const p=path.split('/')[4];await apis[p].credential();if(!store.get('enabled',false))return reply(res,409,{ok:false,error:'enable_relays_first'});
    const text='Vérification technique LunaLive : connexion du chat opérationnelle.';
    store.enqueue('operator-test:'+p+':'+Math.floor(Date.now()/60_000),p,text);return reply(res,202,{ok:true});
  }
  reply(res,404,{ok:false,error:'not_found'});
}catch(error){
  // Never log upstream bodies, request URLs/codes, cookies, or credentials.
  const known=/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'request_failed';
  reply(res,400,{ok:false,error:known});
}});
server.requestTimeout=20_000;server.headersTimeout=10_000;
server.listen(Number(process.env.PORT||3140),'127.0.0.1',()=>console.log(JSON.stringify({event:'multichat_ready',port:Number(process.env.PORT||3140)})));
const tick=setInterval(()=>void worker.tick().catch(error=>{runtime.workerError=/^[A-Za-z0-9_]+$/.test(error.code||'')?error.code:'worker_tick_failed';}),1000);
const maintenance=setInterval(()=>void maintain().catch(()=>{runtime.maintenanceError='maintenance_failed';}),15*60_000);
const videoMonitor=setInterval(()=>void checkVideo().catch(()=>{runtime.videoCheckError='video_monitor_unavailable';}),60_000);
void maintain().catch(()=>{});
void checkVideo().catch(()=>{});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(tick);clearInterval(maintenance);clearInterval(videoMonitor);twitch.stop();server.close();void pool?.end();setTimeout(()=>process.exit(),1000).unref();});
