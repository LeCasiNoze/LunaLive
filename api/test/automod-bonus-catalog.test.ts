import test from 'node:test';
import assert from 'node:assert/strict';
import { observeBonusCatalog } from '../src/automod-shop/catalog.js';
const offers=[{id:'classic',label:'Bonus',costCents:1000,baseStakeCents:10}];
test('catalog persists verified normal stake, scoped to authenticated streamer',async()=>{
 let args:any[]=[];
 const pool={query:async(...a:any[])=>{args=a;return {rows:[]};}} as any;
 assert.deepEqual(await observeBonusCatalog(pool,7,{slotName:' Le Bandit ',provider:'hacksaw',offers}),{ok:true,baseStakeCents:10,offerCount:1});
 assert.deepEqual(args[1],[7,'le bandit','Le Bandit','hacksaw',10,JSON.stringify(offers)]);
 assert.match(args[0],/ON CONFLICT/);
});
test('invalid/empty/mixed-stake menus never overwrite known offers',async()=>{
 let writes=0;const pool={query:async()=>{writes++;}} as any;
 for(const input of [{slotName:'x',provider:'other',offers},{slotName:'x',provider:'hacksaw',offers:[]},
 {slotName:'x',provider:'hacksaw',offers:[...offers,{...offers[0],id:'other',baseStakeCents:20}]}])await assert.rejects(()=>observeBonusCatalog(pool,7,input));
 assert.equal(writes,0);
});
