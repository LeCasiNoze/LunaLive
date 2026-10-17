import {twitchReplyAllowed} from './security.mjs';
import {planChatEvent} from './relay-policy.mjs';

export class RelayWorker {
  constructor({store,apis,pool,apiBase,botKey,fetchImpl=fetch,onStatus=()=>{}}) {
    Object.assign(this,{store,apis,pool,apiBase,botKey,fetch:fetchImpl,onStatus});
    this.busy=false;this.lastSent=0;this.credentials={};
  }
  async configuration() {
    const config={streamerSlug:'lecasinoze',channels:{},botUserIds:{},sharedSenderIds:{},mirrorTargets:{}};
    for(const platform of ['kick','twitch']) {
      const c=await this.apis[platform].vault.get(platform);this.credentials[platform]=c;
      if(!c.accessToken||!c.channelId||!c.userId)continue;
      config.channels[platform]=c.channelId;config.botUserIds[platform]=[c.userId];
      if(c.login==='lecasinoze')config.sharedSenderIds[platform]=c.userId;
    }
    return config;
  }
  async receive(event) {
    const config=await this.configuration();
    if(String(event.userId)===String(this.credentials[event.platform]?.userId)&&this.store.own(event.platform,event.messageId,event.text))event={...event,origin:'relay'};
    const plan=planChatEvent(event,config);
    if(plan.ignored)return {accepted:false,reason:plan.reason};
    // Persist before acknowledging a Kick delivery / processing a WS event.
    const inserted=this.store.receive(plan.eventKey,event);
    this.onStatus({lastReceivedAt:new Date().toISOString(),lastSource:event.platform});
    return {accepted:true,duplicate:!inserted};
  }
  async checkBridge() {
    try{
      const r=await this.fetch(this.apiBase+'/internal/bot/multichat/status',{headers:{'x-bot-key':this.botKey},signal:AbortSignal.timeout(10_000)});
      if(!r.ok)throw Error('lunalive_http_'+r.status);
      const body=await r.json();if(body.ok!==true||body.streamerSlug!=='lecasinoze')throw Error('invalid_bridge_status');
      this.botUserId=Number(body.botUserId||0);this.bridgeReady=true;
      this.store.db.prepare("UPDATE inbox SET status='pending',error=NULL WHERE status='blocked'").run();
      this.onStatus({bridgeReady:true,bridgeError:null});return true;
    }catch(error){this.bridgeReady=false;this.onStatus({bridgeReady:false,bridgeError:/^[a-z0-9_]+$/.test(error.message)?error.message:'bridge_unavailable'});return false;}
  }
  async processInbox() {
    const item=this.store.nextInbox();if(!item)return;
    if(Date.now()-item.created>10*60_000){this.store.finishInbox(item.id,'expired','event_older_than_10_minutes');return;}
    // This endpoint reuses the API's calls handler and shared chat. A stable ID
    // makes HTTP retries harmless; no personal JWT is ever used here.
    let r;
    try{r=await this.fetch(this.apiBase+'/internal/bot/multichat/event',{method:'POST',headers:{'Content-Type':'application/json','x-bot-key':this.botKey},body:JSON.stringify({...item.event,streamerSlug:'lecasinoze'}),signal:AbortSignal.timeout(15_000)});}
    catch{this.store.finishInbox(item.id,'pending','lunalive_network_error');return;}
    if(!r.ok){
      const status=[404,401,403].includes(r.status)?'blocked':r.status===409?'uncertain':'pending';
      this.store.finishInbox(item.id,status,'lunalive_http_'+r.status);
      this.onStatus({bridgeError:'lunalive_http_'+r.status});return;
    }
    let result;try{result=await r.json();}catch{this.store.finishInbox(item.id,'pending','invalid_bridge_response');return;}
    if(result.ok!==true){this.store.finishInbox(item.id,'blocked','bridge_not_confirmed');return;}
    // Twitch receives only replies to commands actually entered on Twitch.
    // Kick receives shared chat from the common DB tail, not a second path.
    if(item.event.platform==='twitch')for(const reply of result.replies||[]){
      if(reply.id&&reply.body&&twitchReplyAllowed(reply.body))this.store.enqueue('db:'+reply.id+':twitch','twitch',String(reply.body).slice(0,500));
    }
    this.store.finishInbox(item.id);this.onStatus({bridgeError:null,lastSyncedAt:new Date().toISOString()});
  }
  async tail() {
    if(!this.pool)return;
    if(!this.streamerId){
      const r=await this.pool.query("SELECT id FROM streamers WHERE slug='lecasinoze'");
      if(r.rows.length!==1)throw Error('lecasinoze_streamer_missing');this.streamerId=Number(r.rows[0].id);
      const rumble=await this.pool.query('SELECT username FROM rumble_bot_session WHERE id=1');
      this.rumbleBotName=String(rumble.rows[0]?.username||'').toLowerCase();
    }
    let cursor=this.store.get('chatCursor');
    if(cursor===null){
      const r=await this.pool.query('SELECT COALESCE(MAX(id),0)::text AS id FROM chat_messages WHERE streamer_id=$1',[this.streamerId]);
      cursor=String(r.rows[0].id);this.store.set('chatCursor',cursor);return;
    }
    const rows=await this.pool.query('SELECT id::text,user_id,username,body,external_source,external_msg_id,created_at FROM chat_messages WHERE streamer_id=$1 AND id>$2 AND deleted_at IS NULL ORDER BY id LIMIT 100',[this.streamerId,cursor]);
    const kick=this.credentials.kick;
    for(const row of rows.rows){
      // Do not replay old chat after long downtime or echo Kick into itself.
      const rumbleEcho=row.external_source==='rumble'&&this.rumbleBotName&&String(row.username).toLowerCase()===this.rumbleBotName;
      if(kick?.channelId&&row.external_source!=='kick'&&!rumbleEcho&&Date.now()-new Date(row.created_at).getTime()<10*60_000){
        const source=row.external_source==='twitch'?'Twitch':row.external_source==='rumble'?'Rumble':'LunaLive';
        const text=row.user_id>0?`[${source}] ${row.username} : ${row.body}`:row.body;
        this.store.enqueue('db:'+row.id+':kick','kick',Array.from(text).slice(0,500).join(''));
      }
      // A neutral shared Discord invitation is a bot response, not merged
      // external viewer activity. Keep ordinary foreign messages out of Twitch.
      const discordReply=this.botUserId>0&&Number(row.user_id)===this.botUserId&&/https?:\/\/(?:www\.)?(?:discord\.gg\/|discord\.com\/invite\/)/i.test(row.body);
      if(discordReply&&this.credentials.twitch?.channelId&&twitchReplyAllowed(row.body)&&Date.now()-new Date(row.created_at).getTime()<10*60_000)this.store.enqueue('db:'+row.id+':twitch','twitch',Array.from(row.body).slice(0,500).join(''));
      this.store.set('chatCursor',row.id);
    }
  }
  async send() {
    if(Date.now()-this.lastSent<3100)return;
    const row=this.store.nextOutbox();if(!row)return;
    const api=this.apis[row.platform];
    if(!api){this.store.failed(row,'unsupported_platform');return;}
    this.store.rememberOwn(row.platform,'pending:'+row.id,row.text);
    this.lastSent=Date.now();
    try{const id=await api.send(row.text);this.store.sent(row,id);this.onStatus({lastSentAt:new Date().toISOString(),lastDestination:row.platform});}
    catch(error){
      const retry=error.status===429||error.status===401;
      this.store.failed(row,error.message,{retry,delay:error.retryAfter,uncertain:!error.status});
      this.onStatus({sendError:error.message});
    }
  }
  async tick() {
    if(this.busy)return;this.busy=true;
    try{
      if(!this.store.get('enabled',false))return;
      await this.configuration();await this.processInbox();await this.tail();await this.send();
    }finally{this.busy=false;}
  }
}
