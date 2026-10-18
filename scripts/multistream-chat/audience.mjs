export function normalizeAudience(platform,body){
 const row=body?.data?.[0];
 if(!Array.isArray(body?.data))throw Error('invalid_audience_response');
 if(platform==='twitch'&&!row)return {live:false,viewers:0};
 if(!row||String(platform==='kick'?row.broadcaster_user_id:row.user_id)!==(platform==='kick'?'24912362':'535777475'))throw Error('audience_channel_mismatch');
 const live=platform==='kick'?row.stream?.is_live:row.type==='live';
 if(typeof live!=='boolean')throw Error('invalid_live_state');
 const viewers=platform==='kick'?row.stream?.viewer_count:row.viewer_count;
 return {live,viewers:!live?0:Number.isSafeInteger(viewers)&&viewers>=0?viewers:null};
}
export class AudienceMonitor{
 constructor({apis,store,apiBase,botKey,fetchImpl=fetch}){Object.assign(this,{apis,store,apiBase,botKey,fetch:fetchImpl});this.busy=false;}
 async tick(){
  if(this.busy)return;this.busy=true;
  try{for(const platform of ['kick','twitch']){
   let value;try{value=normalizeAudience(platform,await this.apis[platform].request(platform==='kick'?'/channels?broadcaster_user_id=24912362':'/streams?user_id=535777475'));}
   catch(e){value={live:null,viewers:null,error:/^[a-z0-9_]{1,80}$/.test(e.message)?e.message:'audience_unavailable'};}
   const sample={...value,platform,channelId:platform==='kick'?'24912362':'535777475',streamerSlug:'lecasinoze',observedAt:new Date().toISOString()};
   this.store.set('audience:'+platform,sample);
   try{const response=await this.fetch(this.apiBase+'/internal/bot/multichat/audience',{method:'POST',headers:{'Content-Type':'application/json','x-bot-key':this.botKey},body:JSON.stringify(sample),signal:AbortSignal.timeout(10000)});this.store.set('audienceDelivery:'+platform,{ok:response.ok,status:response.status,at:sample.observedAt});}
   catch{this.store.set('audienceDelivery:'+platform,{ok:false,status:null,at:sample.observedAt});}
  }}finally{this.busy=false;}
 }
}
