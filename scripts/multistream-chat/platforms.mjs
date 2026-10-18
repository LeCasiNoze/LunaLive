import {readFile, writeFile, rename, mkdir, chmod, stat, chown} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {normalizeTwitchEvent, twitchReconnectUrl, twitchReplyAllowed} from './security.mjs';

export const SCOPES = {
  kick:['user:read','channel:read','chat:write','events:subscribe'],
  twitch:['user:read:chat','user:write:chat']
};
export const TITLE_SCOPES={kick:'channel:write',twitch:'channel:manage:broadcast'};
const SPECS = {
  kick:{authorize:'https://id.kick.com/oauth/authorize',token:'https://id.kick.com/oauth/token',api:'https://api.kick.com/public/v1'},
  twitch:{authorize:'https://id.twitch.tv/oauth2/authorize',token:'https://id.twitch.tv/oauth2/token',api:'https://api.twitch.tv/helix'}
};

export class ApiError extends Error {
  constructor(code,status=0,retryAfter=30_000) { super(code); this.status=status; this.retryAfter=retryAfter; }
}

export class Vault {
  constructor(directory) { this.directory=directory; }
  async get(platform) {
    if (!Object.hasOwn(SPECS,platform)) throw Error('unsupported_platform');
    try{return JSON.parse(await readFile(join(this.directory,platform+'.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}
  }
  async save(platform,value) {
    if (!Object.hasOwn(SPECS,platform)) throw Error('unsupported_platform');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const path=join(this.directory,platform+'.json'),tmp=path+'.tmp';
    const owner=await stat(path).catch(error=>{if(error.code==='ENOENT')return stat(this.directory);throw error;});
    await writeFile(tmp,JSON.stringify(value),{mode:0o600}); await chmod(tmp,0o600);
    if(process.getuid?.()===0)await chown(tmp,owner.uid,owner.gid);
    await rename(tmp,path);
  }
}

export class PlatformApi {
  constructor(platform,vault,{origin,fetchImpl=fetch}={}) {
    if (!Object.hasOwn(SPECS,platform)) throw Error('unsupported_platform');
    this.platform=platform; this.vault=vault; this.origin=origin; this.fetch=fetchImpl; this.refreshing=null;
  }
  redirect() {return this.origin+'/multichat/oauth/'+this.platform+'/callback';}
  async authorization(state,verifier,{titles=false,manageTitles=false}={}) {
    titles ||= manageTitles;
    const credential=await this.vault.get(this.platform);
    if(!credential.clientId||!credential.clientSecret)throw Error('application_not_configured');
    const url=new URL(SPECS[this.platform].authorize);
    const params={client_id:credential.clientId,redirect_uri:this.redirect(),response_type:'code',scope:[...SCOPES[this.platform],...(titles?[TITLE_SCOPES[this.platform]]:[])].join(' '),state};
    if(this.platform==='kick')Object.assign(params,{code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    else params.force_verify='true';
    for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    return url.href;
  }
  async tokenRequest(credential,params) {
    let r;
    try{r=await this.fetch(SPECS[this.platform].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credential.clientId,client_secret:credential.clientSecret,...params}),signal:AbortSignal.timeout(15_000)});}
    catch{throw new ApiError('token_network_error');}
    if(!r.ok)throw new ApiError('token_http_'+r.status,r.status);
    let body;try{body=await r.json();}catch{throw new ApiError('invalid_token_response');}
    if(!body.access_token||!Number.isFinite(Number(body.expires_in)))throw new ApiError('invalid_token_response');
    const scopes=Array.isArray(body.scope)?body.scope:String(body.scope||credential.scopes?.join(' ')||'').split(' ');
    if(SCOPES[this.platform].some(scope=>!scopes.includes(scope)))throw new ApiError('missing_required_scopes');
    return {...credential,accessToken:body.access_token,refreshToken:body.refresh_token||credential.refreshToken,expiresAt:Date.now()+Number(body.expires_in)*1000,scopes,refreshedAt:new Date().toISOString(),lastError:null};
  }
  async exchange(code,verifier,{titles=false}={}) {
    const old=await this.vault.get(this.platform);
    const credential=await this.tokenRequest(old,{grant_type:'authorization_code',code,redirect_uri:this.redirect(),...(this.platform==='kick'?{code_verifier:verifier}:{})});
    const headers=this.headers(credential);
    const identity=await this.requestRaw('/users',{headers});
    const user=identity.data?.[0];
    const login=String(this.platform==='twitch'?user?.login:user?.name||'').toLowerCase();
    if(!user||!['lecasinoze','lunalive_bot'].includes(login))throw new ApiError('wrong_account_expected_lecasinoze_or_lunalive_bot');
    const userId=String(this.platform==='twitch'?user.id:user.user_id);
    const result=await this.requestRaw(this.platform==='twitch'?'/users?login=lecasinoze':'/channels?slug=lecasinoze',{headers});
    const channel=result.data?.[0];
    const channelId=String(this.platform==='twitch'?channel?.id:channel?.broadcaster_user_id||'');
    if(!channelId||String(this.platform==='twitch'?channel?.login:channel?.slug).toLowerCase()!=='lecasinoze')throw new ApiError('wrong_broadcaster');
    if(titles&&(!credential.scopes.includes(TITLE_SCOPES[this.platform])||userId!==channelId||login!=='lecasinoze'))throw new ApiError('title_broadcaster_permission_required',403);
    Object.assign(credential,{login,userId,channelId,connectedAt:new Date().toISOString()});
    await this.vault.save(this.platform,credential);return credential;
  }
  headers(credential) {return {Authorization:'Bearer '+credential.accessToken,...(this.platform==='twitch'?{'Client-Id':credential.clientId}:{})};}
  async refresh() {
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      const credential=await this.vault.get(this.platform);
      if(!credential.refreshToken)throw new ApiError('authorization_required',401);
      try{
        const updated=await this.tokenRequest(credential,{grant_type:'refresh_token',refresh_token:credential.refreshToken});
        await this.vault.save(this.platform,updated);return updated;
      }catch(error){await this.vault.save(this.platform,{...credential,lastError:error.message});throw error;}
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async credential() {
    const value=await this.vault.get(this.platform);
    if(!value.accessToken)throw new ApiError('authorization_required',401);
    return value.expiresAt<Date.now()+120_000?this.refresh():value;
  }
  async requestRaw(path,{headers,...options}={}) {
    let r;
    try{r=await this.fetch(SPECS[this.platform].api+path,{...options,headers:{'Content-Type':'application/json',...headers},signal:AbortSignal.timeout(15_000)});}
    catch{throw new ApiError('api_network_outcome_unknown');}
    if(!r.ok)throw new ApiError(this.platform+'_http_'+r.status,r.status,Math.min(300_000,Math.max(3000,Number(r.headers.get('retry-after')||30)*1000)));
    if(r.status===204)return {};
    try{return await r.json();}catch{throw new ApiError('api_response_outcome_unknown');}
  }
  async request(path,options={}) {
    let credential=await this.credential();
    try{return await this.requestRaw(path,{...options,headers:this.headers(credential)});}
    catch(error){
      if(error.status!==401)throw error;
      credential=await this.refresh();
      return this.requestRaw(path,{...options,headers:this.headers(credential)});
    }
  }
  async validate() {
    const credential=await this.credential();
    if(this.platform==='twitch') {
      const r=await this.fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+credential.accessToken},signal:AbortSignal.timeout(15_000)});
      if(r.status===401){await this.refresh();return;}
      if(!r.ok)throw new ApiError('twitch_validate_http_'+r.status,r.status);
      const data=await r.json();
      if(String(data.user_id)!==credential.userId||data.client_id!==credential.clientId||SCOPES.twitch.some(scope=>!data.scopes?.includes(scope)))throw new ApiError('twitch_identity_or_scope_changed',403);
    } else await this.request('/users');
  }
  async subscribeKick() {
    const credential=await this.credential(), existing=await this.request('/events/subscriptions');
    if(existing.data?.some(item=>String(item.broadcaster_user_id)===credential.channelId&&item.event==='chat.message.sent'&&Number(item.version)===1))return;
    await this.request('/events/subscriptions',{method:'POST',body:JSON.stringify({broadcaster_user_id:Number(credential.channelId),events:[{name:'chat.message.sent',version:1}],method:'webhook'})});
    // Kick's create response differs from its list representation. Confirm the
    // durable subscription through GET instead of reporting a false failure.
    const confirmed=await this.request('/events/subscriptions');
    if(!confirmed.data?.some(item=>String(item.broadcaster_user_id)===credential.channelId&&item.event==='chat.message.sent'&&Number(item.version)===1))throw new ApiError('kick_subscription_not_confirmed');
  }
  async send(text) {
    const credential=await this.credential();
    if(this.platform==='twitch'&&!twitchReplyAllowed(text))throw new ApiError('twitch_external_promotion_blocked',403);
    const body=this.platform==='kick'?{broadcaster_user_id:Number(credential.channelId),content:text,type:'user'}:{broadcaster_id:credential.channelId,sender_id:credential.userId,message:text};
    const r=await this.request(this.platform==='kick'?'/chat':'/chat/messages',{method:'POST',body:JSON.stringify(body)});
    const sent=this.platform==='kick'?r.data:r.data?.[0];
    if(!sent?.is_sent||!sent.message_id)throw new ApiError('chat_send_rejected',422);
    return String(sent.message_id);
  }
  async channelTitle(){
    const c=await this.credential();
    const body=await this.request(this.platform==='kick'?'/channels?broadcaster_user_id='+encodeURIComponent(c.channelId):'/channels?broadcaster_id='+encodeURIComponent(c.channelId));
    const row=body.data?.[0];
    if(!row||String(this.platform==='kick'?row.broadcaster_user_id:row.broadcaster_id)!==c.channelId)throw new ApiError('title_channel_mismatch',403);
    const title=this.platform==='kick'?row.stream_title:row.title;
    return typeof title==='string'&&title.trim()?title:null;
  }
  async setTitle(title,{stillAllowed=async()=>true}={}){
    if(typeof title!=='string'||!title.trim()||title.length>140||/[\r\n\x00-\x1f]/.test(title))throw new ApiError('invalid_stream_title',400);
    const c=await this.credential();
    if(c.login!=='lecasinoze'||c.userId!==c.channelId||!c.scopes?.includes(TITLE_SCOPES[this.platform]))throw new ApiError('title_authorization_required',403);
    if(await this.channelTitle()===title)return {status:'confirmed',title,changed:false};
    // Re-read ownership immediately before an external write, after network reads.
    if(!await stillAllowed())throw new ApiError('title_context_changed',409);
    await this.request(this.platform==='kick'?'/channels':'/channels?broadcaster_id='+encodeURIComponent(c.channelId),{
      method:'PATCH',body:JSON.stringify(this.platform==='kick'?{stream_title:title}:{title})});
    const observed=await this.channelTitle();
    return {status:observed===title?'confirmed':'verification_pending',title,observed,changed:true};
  }
  async title(title,options={}){return this.setTitle(title,options);}
}

export class TwitchReceiver {
  constructor(api,{onEvent,onStatus,WebSocketImpl=WebSocket}) {this.api=api;this.onEvent=onEvent;this.onStatus=onStatus;this.WS=WebSocketImpl;this.stopped=true;this.generation=0;this.retries=0;}
  start() {if(!this.stopped)return;this.stopped=false;this.connect('wss://eventsub.wss.twitch.tv/ws',false);}
  stop() {this.stopped=true;this.generation++;clearTimeout(this.timer);clearTimeout(this.watchdog);this.socket?.close();}
  connect(url,reconnecting) {
    if(this.stopped)return;
    const generation=++this.generation,oldSocket=this.socket;
    const socket=new this.WS(twitchReconnectUrl(url));this.socket=socket;
    const current=()=>!this.stopped&&generation===this.generation;
    this.onStatus('connecting');
    let welcome=false,chain=Promise.resolve(),keepalive=20_000;
    const heartbeat=()=>{clearTimeout(this.watchdog);this.watchdog=setTimeout(()=>{if(current()){socket.close();this.schedule();}},keepalive);};
    heartbeat();
    socket.addEventListener('message',message=>{
      chain=chain.then(async()=>{
        if(!current())return;
        const data=JSON.parse(String(message.data));heartbeat();
        switch(data.metadata?.message_type){
          case 'session_welcome':{
            welcome=true;keepalive=(Number(data.payload.session.keepalive_timeout_seconds||10)+5)*1000;heartbeat();
            if(!reconnecting){const credential=await this.api.credential();await this.api.request('/eventsub/subscriptions',{method:'POST',body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:credential.channelId,user_id:credential.userId},transport:{method:'websocket',session_id:data.payload.session.id}})});}
            oldSocket?.close();this.retries=0;this.onStatus('connected');break;
          }
          case 'notification':
            if(data.payload?.subscription?.type==='channel.chat.message')await this.onEvent(normalizeTwitchEvent(data.payload.event));
            break;
          case 'session_reconnect':this.connect(data.payload.session.reconnect_url,true);break;
          case 'revocation':this.onStatus('authorization_revoked');this.stop();break;
        }
      }).catch(()=>{if(current()){this.onStatus('receiver_error');socket.close();this.schedule();}});
    });
    socket.addEventListener('close',()=>{if(current())this.schedule();});
    socket.addEventListener('error',()=>{if(current()){this.onStatus(welcome?'connection_lost':'connect_failed');socket.close();this.schedule();}});
  }
  schedule() {
    if(this.stopped||this.timer)return;
    this.generation++;clearTimeout(this.watchdog);
    this.onStatus('reconnecting');
    this.timer=setTimeout(()=>{this.timer=null;this.connect('wss://eventsub.wss.twitch.tv/ws',false);},Math.min(60_000,1000*2**Math.min(6,this.retries++)));
  }
}
