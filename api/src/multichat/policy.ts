import {createHash,timingSafeEqual} from 'node:crypto';

export type ChatPlatform='kick'|'twitch';
// Public broadcaster IDs resolved during the official OAuth setup.
const CHANNELS:Record<ChatPlatform,string>={kick:'24912362',twitch:'535777475'};
export type ExternalChatEvent={platform:ChatPlatform;channelId:string;messageId:string;userId:string;username:string;text:string;streamerSlug:'lecasinoze'};
export function authenticatedBotKey(candidate:unknown,keys:unknown[]):boolean {
  if(typeof candidate!=='string'||!candidate)return false;
  const digest=(value:string)=>createHash('sha256').update(value).digest();
  return keys.some(key=>typeof key==='string'&&key.length>0&&timingSafeEqual(digest(candidate),digest(key)));
}
export function externalChatEvent(value:unknown):ExternalChatEvent {
  if(!value||typeof value!=='object')throw Error('invalid_event');
  const v=value as Record<string,unknown>;
  if(v.streamerSlug!=='lecasinoze'||!['kick','twitch'].includes(String(v.platform)))throw Error('channel_not_allowed');
  if(v.channelId!==CHANNELS[v.platform as ChatPlatform])throw Error('channel_not_allowed');
  for(const field of ['channelId','messageId','userId'])if(typeof v[field]!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v[field] as string))throw Error('invalid_identity');
  if(typeof v.text!=='string'||!v.text.trim()||v.text.length>2000)throw Error('invalid_text');
  if(typeof v.username!=='string'||!v.username.trim()||v.username.length>100)throw Error('invalid_username');
  return {platform:v.platform as ChatPlatform,channelId:v.channelId as string,messageId:v.messageId as string,userId:v.userId as string,streamerSlug:'lecasinoze',username:v.username.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,50),text:v.text.replace(/[\u0000-\u001f\u007f]/g,' ').trim()};
}
export function eventKey(event:ExternalChatEvent):string {return createHash('sha256').update(JSON.stringify([event.platform,event.channelId,event.messageId])).digest('hex');}
export function command(event:ExternalChatEvent):{name:'call'|'discord'|'ping';arg:string}|null {
  const match=event.text.match(/^!(call|discord|ping)(?:\s+(.*))?$/i);
  return match?{name:match[1].toLowerCase() as 'call'|'discord'|'ping',arg:match[2]?.trim()||''}:null;
}
