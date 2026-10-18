import {createHash} from 'node:crypto';
export const CHANNELS={kick:'24912362',twitch:'535777475'} as const;
export type Platform=keyof typeof CHANNELS;
function identity(v:any){
 if(!v||v.streamerSlug!=='lecasinoze'||!Object.hasOwn(CHANNELS,v.platform)||v.channelId!==CHANNELS[v.platform as Platform])throw Error('invalid_channel');
 return v.platform as Platform;
}
export function followEvent(v:any,now=Date.now()){
 const platform=identity(v);
 for(const key of ['eventId','userId'])if(typeof v[key]!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v[key]))throw Error('invalid_identity');
 if(typeof v.username!=='string'||!v.username.trim()||v.username.length>100||/[\x00-\x1f\x7f]/.test(v.username))throw Error('invalid_username');
 const at=Date.parse(v.occurredAt);if(!Number.isFinite(at)||Math.abs(now-at)>600000)throw Error('stale_follow');
 return {platform,channelId:v.channelId as string,eventId:v.eventId as string,userId:v.userId as string,username:v.username as string,occurredAt:new Date(at).toISOString(),
  key:createHash('sha256').update(JSON.stringify(['follow',platform,v.channelId,v.eventId])).digest('hex')};
}
export function audienceEvent(v:any,now=Date.now()){
 const platform=identity(v),at=Date.parse(v.observedAt);
 if(!Number.isFinite(at)||Math.abs(now-at)>90000)throw Error('stale_audience');
 if(v.live!==null&&typeof v.live!=='boolean')throw Error('invalid_live');
 if(v.viewers!==null&&(!Number.isSafeInteger(v.viewers)||v.viewers<0))throw Error('invalid_viewers');
 if(v.live===false&&v.viewers!==0||v.live===null&&v.viewers!==null)throw Error('invalid_audience');
 return {platform,channelId:v.channelId,live:v.live,viewers:v.viewers,observedAt:new Date(at).toISOString(),error:typeof v.error==='string'&&/^[a-z0-9_]{1,80}$/.test(v.error)?v.error:null};
}
export function publicAudience(rows:any[],now=Date.now()){
 return Object.fromEntries(Object.keys(CHANNELS).map(platform=>{
  const r=rows.find(r=>r.platform===platform&&r.channel_id===CHANNELS[platform as Platform]);
  const age=r?now-new Date(r.observed_at).getTime():Infinity,stale=age>90000||age<0;
  return [platform,{live:stale?null:r.is_live,viewers:stale?null:r.viewers,stale,observedAt:r?new Date(r.observed_at).toISOString():null,error:stale?'stale':r.error}];
 }));
}
