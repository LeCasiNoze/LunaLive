import {createHash} from 'node:crypto';
import type {Pool} from 'pg';

export const PUBLICATION_GUILD='1188913226990235800';
export const PUBLICATION_CHANNEL='1544429390723682396';
export const YOUTUBE_CHANNEL='UCedNU_3c49ey6Tt8wzNTKWw';
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
 if(e.platform==='instagram')return e.account.toLowerCase()==='lecasinoze_off'&&/^\d+$/.test(e.mediaId)&&/^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/$/.test(e.url);
 return e.platform==='youtube'&&e.account===YOUTUBE_CHANNEL&&Number.isFinite(e.durationSeconds)&&((e.kind==='vod'&&e.isShort===false&&e.durationSeconds!>180)||(e.kind==='short'&&e.isShort===true&&e.durationSeconds!>0&&e.durationSeconds!<=180))&&/^[A-Za-z0-9_-]{11}$/.test(e.mediaId)&&e.url===`https://www.youtube.com/watch?v=${e.mediaId}`;
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
  ...(e.platform==='youtube'?{durationSeconds:e.durationSeconds,isShort:e.isShort,kind:e.kind}:{})};
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
// Carte Components V2, même style que les alertes de live : titre, miniature, extrait, bouton. Le marqueur
// « LeCasiNoze · plateforme:id » en bas sert à retrouver le message (réconciliation sans renvoi en double).
export const publicationMarker=(e:Pick<PublicationEvent,'platform'|'mediaId'>)=>`LeCasiNoze · ${e.platform}:${e.mediaId}`;
export function publicationMessage(event:PublicationEvent,notificationRoleId?:string){
 const e=sanitizedEvent(event),ig=e.platform==='instagram',short=!ig&&(e.isShort||e.kind==='short');
 const role=notificationRoleId&&PUBLICATION_NOTIFICATION_ROLE_IDS.includes(notificationRoleId)?notificationRoleId:undefined;
 const head=ig?'📸 Nouveau Reel':short?'⚡ Nouveau Short':'▶️ Nouvelle vidéo';
 const T=(content:string)=>({type:10,content});
 const desc=(e.description||'').split('\n').filter(Boolean).slice(0,3).join('\n').slice(0,300);
 return {flags:1<<15,nonce:publicationNonce(e),enforceNonce:true,
  allowedMentions:{parse:[] as never[],...(role?{roles:[role]}:{})},
  components:[...(role?[T(`<@&${role}>`)]:[]),{type:17,accent_color:ig?0xe4405f:0xff0033,components:[
   T(`# ${head}`),T(`**${e.title}**`),
   ...(e.thumbnail?[{type:12,items:[{media:{url:e.thumbnail},description:e.title.slice(0,250)}]}]:[]),
   ...(desc?[T(desc)]:[]),
   {type:14,divider:true,spacing:2},
   {type:1,components:[{type:2,style:5,label:ig?'Voir le Reel':'Voir la vidéo',emoji:{name:ig?'📸':'▶️'},url:e.url},
     {type:2,style:5,label:ig?'Instagram':'La chaîne YouTube',emoji:{name:ig?'📸':'🔔'},url:ig?'https://instagram.com/lecasinoze':'https://www.youtube.com/@LeCasiNoze'}]},
   T(`-# ${publicationMarker(e)}`),
  ]}]};
}
