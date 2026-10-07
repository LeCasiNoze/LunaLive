import test from 'node:test';
import assert from 'node:assert/strict';
import { isSlotBanned } from './queue.js';
test('permanent exclusions apply to LeCasiNoze including newly catalogued variants',async()=>{
  const pool:any={query:async(sql:string)=>({rows:sql.includes('FROM streamers')?[{id:1}]:[]})};
  for(const name of ['stormforged boosted','live roulette','black jack vip'])assert.equal(await isSlotBanned(pool,1,name),true);
  assert.equal(await isSlotBanned(pool,1,'stormforged'),false);
});
test('other channels retain their own bans policy',async()=>{
  const pool:any={query:async()=>({rows:[]})};
  assert.equal(await isSlotBanned(pool,2,'stormforged boosted'),false);
});
