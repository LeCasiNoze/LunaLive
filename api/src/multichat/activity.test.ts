import test from 'node:test';
import assert from 'node:assert/strict';
import {followEvent,audienceEvent,publicAudience} from './activity.js';
const base={streamerSlug:'lecasinoze',platform:'kick',channelId:'24912362'};
test('only the authorized broadcaster and fresh named follows are accepted',()=>{
 const event={...base,eventId:'follow-1',userId:'12',username:'Alice',occurredAt:new Date().toISOString()};
 assert.equal(followEvent(event).username,'Alice');assert.equal(followEvent(event).key,followEvent(event).key);
 for(const bad of [{channelId:'99'},{streamerSlug:'other'},{occurredAt:'2020-01-01'},{username:'x\n!call'},{platform:'rumble'}])assert.throws(()=>followEvent({...event,...bad}));
});
test('unknown and stale metrics do not turn into zero viewers',()=>{
 const now=Date.now(),sample={...base,live:true,viewers:null,observedAt:new Date(now).toISOString()};
 assert.equal(audienceEvent(sample,now).viewers,null);
 assert.throws(()=>audienceEvent({...sample,viewers:-1},now));
 assert.throws(()=>audienceEvent({...sample,live:false,viewers:null},now));
 const r={platform:'kick',channel_id:'24912362',is_live:true,viewers:29,observed_at:new Date(now)};
 assert.equal(publicAudience([r],now).kick.viewers,29);assert.equal(publicAudience([r],now+91000).kick.viewers,null);
 assert.equal(publicAudience([],now).twitch.viewers,null);
});
