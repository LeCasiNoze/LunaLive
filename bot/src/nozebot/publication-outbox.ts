import {createHash} from 'node:crypto';
import type {Pool} from 'pg';

export const PUBLICATION_GUILD='1188913226990235800';
export const PUBLICATION_CHANNEL='1544429390723682396';
export const YOUTUBE_CHANNEL='UCbBVUwBBf4Mu3yZxe-Xrmyw';
// Existing opt-in notification roles from NozeBot's preference selector.
export const PUBLICATION_NOTIFICATION_ROLE_IDS:readonly string[]=[
 '1556031808603291689','1188926242519523328','1188926088852799578','1217875557631393923','1188926393946484783',
];
export interface PublicationRole {id:string;name:string;mentionable:boolean}
export function resolvePublicationNotificationRoles(roles:Iterable<PublicationRole>,canMentionRoles:boolean){
 const candidates=[...roles].filter(r=>PUBLICATION_NOTIFICATION_ROLE_IDS.includes(r.id));
 const result:Partial<Record<'instagram'|'youtube',string>>={};
 for(const platform of ['instagram','youtube'] as const){
  const expression=platform==='youtube'?/\b(?:youtube|yt)\b/:/\b(?:instagram|insta)\b/;
  const matches=candidates.filter(r=>expression.test(r.name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()));
  // Ambiguous labels or an unmentionable role must never ping a broader group.
  if(matches.length===1&&(matches[0].mentionable||canMentionRoles))result[platform]=matches[0].id;
 }
 return result;
}
export const PUBLICATION_SCHEMA=`
CREATE TABLE IF NOT EXISTS lunaclip_discord_config (
 channel_id text PRIMARY KEY, activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO lunaclip_discord_config(channel_id) VALUES ('${PUBLICATION_CHANNEL}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS lunaclip_discord_outbox (
 id bigserial PRIMARY KEY, platform text NOT NULL CHECK(platform IN ('instagram','youtube')),
 media_id text NOT NULL, channel_id text NOT NULL, payload jsonb NOT NULL,
 published_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','uncertain','sent','blocked')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 send_started_at timestamptz, message_id text, sent_at timestamptz, error_code text,
 UNIQUE(platform,media_id,channel_id)
);
CREATE INDEX IF NOT EXISTS lunaclip_discord_pending ON lunaclip_discord_outbox(next_attempt_at) WHERE state IN ('queued','sending','uncertain');`;

export interface PublicationEvent {
 platform:'instagram'|'youtube';mediaId:string;account:string;visibility:string;
 title:string;description?:string;url:string;thumbnail?:string;publishedAt:string;
 durationSeconds?:number;isShort?:boolean;kind?:string;
}
export function eligiblePublication(e:PublicationEvent) {
 if(!e||typeof e.account!=='string'||typeof e.mediaId!=='string'||typeof e.title!=='string'||typeof e.url!=='string'||typeof e.publishedAt!=='string')return false;
 if(e.visibility!=='public'||!e.title?.trim()||!Number.isFinite(Date.parse(e.publishedAt)))return false;
 if(e.platform==='instagram')return e.account.toLowerCase()==='lecasinoze'&&/^\d+$/.test(e.mediaId)&&/^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/$/.test(e.url);
 return e.platform==='youtube'&&e.account===YOUTUBE_CHANNEL&&Number.isFinite(e.durationSeconds)&&e.durationSeconds!>180
  &&e.isShort===false&&e.kind==='vod'&&/^[A-Za-z0-9_-]{11}$/.test(e.mediaId)&&e.url===`https://www.youtube.com/watch?v=${e.mediaId}`;
}
function publicThumbnail(value?:string){
 if(!value)return undefined;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash
  &&['i.ytimg.com','img.youtube.com','pub-e9fb428e39c240299cf843d1ea5f3801.r2.dev'].includes(u.hostname)?u.href:undefined;}catch{return undefined;}
}
function cleanText(value:string,max:number){
 // No copied caption URLs, wallet balances, credentials, Discord mentions or controls.
 return value.split(/\r?\n/).filter(line=>!/(?:solde|balance|portefeuille|wallet|token|secret|password|access[_ -]?key)/i.test(line))
  .join('\n').replace(/https?:\/\/\S+|<@[^>]*>|@(everyone|here)/gi,'').replace(/[\x00-\x08\x0b-\x1f]/g,'').trim().slice(0,max);
}
export function sanitizedEvent(e:PublicationEvent):PublicationEvent{
 return {platform:e.platform,mediaId:e.mediaId,account:e.account,visibility:'public',title:cleanText(e.title,250)||'Nouvelle publication LeCasiNoze',
  description:cleanText(e.description||'',450),url:e.url,thumbnail:publicThumbnail(e.thumbnail),publishedAt:new Date(e.publishedAt).toISOString(),
  ...(e.platform==='youtube'?{durationSeconds:e.durationSeconds,isShort:false,kind:'vod'}:{})};
}
export async function enqueuePublication(pool:Pick<Pool,'query'>,event:PublicationEvent){
 if(!eligiblePublication(event))return false;
 const e=sanitizedEvent(event);
 const result=await pool.query(`INSERT INTO lunaclip_discord_outbox(platform,media_id,channel_id,payload,published_at)
  SELECT $1,$2,channel_id,$3,$4 FROM lunaclip_discord_config WHERE channel_id=$5
   AND $4::timestamptz>=activated_at AND $4::timestamptz<=clock_timestamp()+INTERVAL '1 minute'
  ON CONFLICT(platform,media_id,channel_id) DO NOTHING RETURNING id`,[e.platform,e.mediaId,e,e.publishedAt,PUBLICATION_CHANNEL]);
 return !!result.rowCount;
}
export function publicationNonce(e:PublicationEvent){return createHash('sha256').update(`${e.platform}:${e.mediaId}:${PUBLICATION_CHANNEL}`).digest('hex').slice(0,24);}
export function publicationMessage(event:PublicationEvent,notificationRoleId?:string){
 const e=sanitizedEvent(event),ig=e.platform==='instagram';
 const role=notificationRoleId&&PUBLICATION_NOTIFICATION_ROLE_IDS.includes(notificationRoleId)?notificationRoleId:undefined;
 return {...(role?{content:`<@&${role}>`}:{}),
  allowedMentions:{parse:[] as never[],...(role?{roles:[role]}:{})},nonce:publicationNonce(e),enforceNonce:true,
  embeds:[{title:e.title,url:e.url,description:e.description||`Une nouvelle ${ig?'publication Instagram':'vidéo YouTube'} de LeCasiNoze est disponible.`,
   color:ig?0xe4405f:0xff0033,author:{name:`LeCasiNoze · ${ig?'Instagram':'YouTube'}`},timestamp:e.publishedAt,
   footer:{text:`LeCasiNoze · ${e.platform}:${e.mediaId}`},...(e.thumbnail?{image:{url:e.thumbnail}}:{})}],
  components:[{type:1 as const,components:[{type:2 as const,style:5 as const,label:ig?'Voir le Reel':'Voir la vidéo',url:e.url}]}]};
}
