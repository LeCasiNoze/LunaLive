import test from 'node:test';
import assert from 'node:assert/strict';
import {findObservedBonusMenu} from '../src/automod-shop/catalog.js';

const offers=[{id:'pragmatic-legacy-0',label:'Bonus 1',costCents:2000,baseStakeCents:20}];
test('a discovered minimum-stake menu remains a verified quote for shop and chat',async()=>{
 let query='',parameters:unknown[]=[];
 const client={query:async(sql:string,args:unknown[])=>{query=sql;parameters=args;return{rows:[{slot_name:'Cleocatra',provider:'pragmatic',base_stake_cents:20,offers,observed_at:'2026-10-03T20:12:14Z'}]};}} as any;
 const result=await findObservedBonusMenu(client,4,'cleocatra',10);
 assert.deepEqual(parameters,[4,'cleocatra',10]);
 assert.match(query,/streamer_id=\$1 AND slot_key=\$2/);
 assert.match(query,/ORDER BY ABS\(base_stake_cents-\$3\)/);
 assert.equal(result?.base_stake_cents,20);
 assert.deepEqual(result?.offers,offers); // No invented 10-cent quote or price scaling.
});
test('no observation is not turned into a fabricated menu',async()=>{
 const client={query:async()=>({rows:[]})} as any;
 assert.equal(await findObservedBonusMenu(client,4,'unknown',10),null);
});
test('rejects an invalid requested stake before querying',async()=>{
 const client={query:async()=>{throw Error('must-not-query');}} as any;
 await assert.rejects(()=>findObservedBonusMenu(client,4,'cleocatra',0),/invalid_catalog_target/);
});
