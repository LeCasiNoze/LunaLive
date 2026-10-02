import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatPointsReader} from './dist/automod-shop/chat-points.js';

test('native message join, eight-message bound, cache refresh and immutable ordinary payload',async()=>{
 let calls=0,time=0,value=750;
 const reader=createChatPointsReader({async query(sql,args){calls++;assert.match(sql,/a\.rumble_user_id=rm\.rumble_user_id/);assert.doesNotMatch(sql,/lower\(.*username/);assert.equal(args[0],12);assert.ok(args[1].length<=8);return {rows:[{id:9,points:value},{id:10,points:0}]};}},()=>time);
 const messages=Array.from({length:10},(_,i)=>({id:i+1,rumble:true,username:'name'}));
 const enriched=await reader(12,messages);
 assert.equal(enriched.length,8);assert.equal(enriched[6].automodPoints,750);assert.equal(enriched[7].automodPoints,0);assert.equal(messages[8].automodPoints,undefined);
 await reader(12,[messages[8]]);assert.equal(calls,1);
 time=10001;value=700;assert.equal((await reader(12,[messages[8]]))[0].automodPoints,700);assert.equal(calls,2);
 assert.equal((await reader(12,[{id:9,rumble:false}]))[0].automodPoints,undefined);
});
test('missing native archive or wallet outage hides the balance without hiding chat',async()=>{
 const message={id:1,rumble:true,body:'hello'};
 const missing=createChatPointsReader({async query(){return {rows:[]};}});
 assert.deepEqual(await missing(12,[message]),[message]);
 const failed=createChatPointsReader({async query(){throw Error('offline');}});
 assert.deepEqual(await failed(12,[message]),[message]);
});
