import test from 'node:test';import assert from 'node:assert/strict';import type {Pool} from 'pg';
import {eligiblePublication,sanitizedEvent,publicationMessage,enqueuePublication,YOUTUBE_CHANNEL,resolvePublicationNotificationRoles,type PublicationEvent} from './publication-outbox.js';
import {deliverAnnouncement,failurePolicy,type OutboxRow} from './publication-announcements.js';
const ig:PublicationEvent={platform:'instagram',mediaId:'123456789',account:'lecasinoze_off',visibility:'public',title:'Un vrai titre',description:'Extrait du direct',url:'https://www.instagram.com/reel/ABC_123/',publishedAt:'2026-10-18T15:00:00Z'};
const yt:PublicationEvent={...ig,platform:'youtube',mediaId:'12345678_Ab',account:YOUTUBE_CHANNEL,url:'https://www.youtube.com/watch?v=12345678_Ab',durationSeconds:181,isShort:false,kind:'vod'};
// YouTube IDs have exactly eleven characters.
yt.mediaId='123456789Ab';yt.url=`https://www.youtube.com/watch?v=${yt.mediaId}`;
test('only the official personal Instagram account',()=>{assert(eligiblePublication(ig));for(const account of ['lecasinoze','lunalive','lunalive_tv','another'])assert(!eligiblePublication({...ig,account}));});
test('YouTube 180 excluded, 181 included',()=>{assert(!eligiblePublication({...yt,durationSeconds:180}));assert(eligiblePublication(yt));});
test('Shorts and unknown formats excluded even above 180',()=>{assert(!eligiblePublication({...yt,isShort:true}));assert(!eligiblePublication({...yt,isShort:undefined}));assert(!eligiblePublication({...yt,kind:'short'}));});
test('private, unlisted, scheduled and wrong channels excluded',()=>{for(const visibility of ['private','unlisted','scheduled']){assert(!eligiblePublication({...yt,visibility}));assert(!eligiblePublication({...ig,visibility}));}assert(!eligiblePublication({...yt,account:'another'}));});
test('canonical links, media IDs and dates required',()=>{assert(!eligiblePublication({...ig,url:'https://evil.test/secret'}));assert(!eligiblePublication({...ig,publishedAt:'invalid'}));assert(!eligiblePublication({...yt,url:'https://youtu.be/'+yt.mediaId}));});
test('thumbnail absent has a clean fallback and a real link button',()=>{const m=publicationMessage(ig);assert(!('image' in m.embeds[0]));assert.equal(m.components[0].components[0].label,'Voir le Reel');assert.equal(m.components[0].components[0].url,ig.url);assert.equal(publicationMessage(yt).components[0].components[0].label,'Voir la vidéo');});
test('verified public thumbnail used, signed and internal URLs omitted',()=>{const thumbnail='https://i.ytimg.com/vi/123456789Ab/hqdefault.jpg';assert.equal(publicationMessage({...yt,thumbnail}).embeds[0].image?.url,thumbnail);for(const thumbnail of ['http://127.0.0.1/x','https://private.test/x','https://i.ytimg.com/x?token=secret'])assert(!sanitizedEvent({...yt,thumbnail}).thumbnail);});
test('no pings, secrets, wallet balances or caption URLs',()=>{const m=publicationMessage({...ig,description:'@everyone <@123>\nSolde : 3000\ntoken=secret\nhttps://internal.test?key=secret\nDu vrai contenu'});assert.deepEqual(m.allowedMentions,{parse:[]});assert(!/3000|secret|internal|<@|@everyone/.test(JSON.stringify(m)));assert(m.embeds[0].description.includes('Du vrai contenu'));});
test('resolve only the existing opt-in roles, including decorated Unicode names',()=>{
 const roles=[{id:'1188926088852799578',name:'▶・𝗬𝗼𝘂𝗧𝘂𝗯𝗲',mentionable:true},{id:'1217875557631393923',name:'📷 Instagram',mentionable:true},{id:'999',name:'YouTube',mentionable:true},{id:'1188926242519523328',name:'Live',mentionable:true}];
 assert.deepEqual(resolvePublicationNotificationRoles(roles,false),{instagram:'1217875557631393923',youtube:'1188926088852799578'});
});
test('ambiguous or unmentionable roles do not broaden permissions or mentions',()=>{
 const role={id:'1188926088852799578',name:'YouTube',mentionable:false};
 assert.deepEqual(resolvePublicationNotificationRoles([role],false),{});
 assert.deepEqual(resolvePublicationNotificationRoles([role],true),{youtube:role.id});
 assert.deepEqual(resolvePublicationNotificationRoles([role,{id:'1188926393946484783',name:'YouTube',mentionable:true}],true),{});
});
test('only an explicit trusted notification role can ping; caption mentions stay inert',()=>{
 const id='1188926088852799578';const m=publicationMessage({...yt,description:'@everyone <@123> <@&999> Un vrai extrait'},id);
 assert.equal(m.content,`<@&${id}>`);assert.deepEqual(m.allowedMentions,{parse:[],roles:[id]});
 assert(!m.embeds[0].description.includes('<@'));assert(!m.embeds[0].description.includes('@everyone'));
 for(const bad of ['999','@everyone','1188926088852799578><@&999']){const other=publicationMessage(yt,bad);assert(!('content' in other));assert.deepEqual(other.allowedMentions,{parse:[]});}
});
test('stable nonce with enforceNonce protects short reconnect windows',()=>{assert.equal(publicationMessage(ig).nonce,publicationMessage(ig).nonce);assert(publicationMessage(ig).enforceNonce);assert.notEqual(publicationMessage(ig).nonce,publicationMessage({...ig,mediaId:'999'}).nonce);});
test('enqueue uses activation watermark and unique media/channel key',async()=>{let calls=0;const pool={query:async(sql:string)=>{assert.match(sql,/activated_at/);assert.match(sql,/ON CONFLICT\(platform,media_id,channel_id\) DO NOTHING/);return {rowCount:++calls===1?1:0};}};assert(await enqueuePublication(pool as never,ig));assert(!await enqueuePublication(pool as never,ig));});
test('invalid event does not touch database',async()=>{await enqueuePublication({query:()=>{throw Error('unexpected');}} as never,{...ig,account:'lunalive'});});
test('429 retries use server delay, definitive permissions errors block',()=>{assert.deepEqual(failurePolicy({status:429,retry_after:500},1),{state:'queued',delay:500,code:'discord_429'});assert.equal(failurePolicy({status:429,rawError:{retry_after:900}},1).delay,900);assert.equal(failurePolicy({status:403},1).state,'blocked');assert.equal(failurePolicy(new Error('timeout'),1).state,'uncertain');});
function harness(state='queued'){
 const row:OutboxRow={id:'1',state,payload:ig,send_started_at:state==='queued'?null:new Date(ig.publishedAt),attempts:0};let messageId:string|undefined;
 const pool={connect:async()=>({release(){},async query(sql:string,args?:unknown[]){
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.startsWith('SELECT *'))return {rows:row.state==='sent'?[]:[{...row}]};
  if(sql.includes("SET state='sending'")){row.state='sending';row.send_started_at??=new Date();row.attempts++;}
  if(sql.includes("SET state='sent'")){row.state='sent';messageId=String(args?.[1]);}
  if(sql.includes('SET state=$2'))row.state=String(args?.[1]);
  return {rows:[]};
 }})} as unknown as Pool;
 return {row,pool,get messageId(){return messageId;}};
}
test('successful delivery persists message ID and never sends twice',async()=>{const h=harness();let sends=0;const t={reconcile:async()=>null,send:async()=>{sends++;assert.equal(h.row.state,'sending');return 'discord-message';}};await deliverAnnouncement(h.pool,t);await deliverAnnouncement(h.pool,t);assert.equal(sends,1);assert.equal(h.messageId,'discord-message');});
test('accepted send with lost response is reconciled after restart',async()=>{const h=harness();let sends=0;await deliverAnnouncement(h.pool,{reconcile:async()=>null,send:async()=>{sends++;throw Error('timeout');}});assert.equal(h.row.state,'uncertain');await deliverAnnouncement(h.pool,{reconcile:async()=> 'accepted-before-crash',send:async()=>{throw Error('duplicate');}});assert.equal(sends,1);assert.equal(h.messageId,'accepted-before-crash');});
test('crash in sending state reconciles before retry',async()=>{const h=harness('sending');await deliverAnnouncement(h.pool,{reconcile:async()=> 'found',send:async()=>{throw Error('duplicate');}});assert.equal(h.row.state,'sent');});
test('confirmed missing send retries after complete reconciliation',async()=>{const h=harness('uncertain');let checked=false;await deliverAnnouncement(h.pool,{reconcile:async()=>{checked=true;return null;},send:async()=>{assert(checked);return 'new-message';}});assert.equal(h.row.state,'sent');});
test('incomplete reconciliation never resends',async()=>{const h=harness('uncertain');await deliverAnnouncement(h.pool,{reconcile:async()=>{throw Error('history_unavailable');},send:async()=>{throw Error('should_never_send');}});assert.equal(h.row.state,'uncertain');});
test('network failure before acceptance recovers after restart',async()=>{const h=harness();await deliverAnnouncement(h.pool,{reconcile:async()=>null,send:async()=>{throw Error('network');}});assert.equal(h.row.state,'uncertain');await deliverAnnouncement(h.pool,{reconcile:async()=>null,send:async()=> 'recovered'});assert.equal(h.messageId,'recovered');});

test('new-channel Shorts are eligible only with explicit short identity and valid duration',()=>{const s={...yt,kind:'short',isShort:true,durationSeconds:58.433};assert(eligiblePublication(s));assert.equal(sanitizedEvent(s).isShort,true);assert.equal(sanitizedEvent(s).kind,'short');for(const durationSeconds of [0,181,NaN])assert(!eligiblePublication({...s,durationSeconds}));assert(!eligiblePublication({...s,account:'UCbBVUwBBf4Mu3yZxe-Xrmyw'}));});
