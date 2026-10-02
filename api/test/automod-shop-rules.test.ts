import test from "node:test";
import assert from "node:assert/strict";
import { bonusPointPrice,bonusRebatePoints,performancePoints,parseShopCommand,floorStake,validateOffers,validRumbleIdentity } from "../src/automod-shop/rules.js";
import { walletFromRow,walletSummary,readWallet } from "../src/automod-shop/wallet.js";
import {effectiveShopStake} from '../src/automod-shop/effective-stake.js';

test("displayed balance excludes reserved points and supports a new Rumble account",async()=>{
 const w=walletFromRow({balance:'20000',reserved:'3500'});
 assert.deepEqual(w,{balance:20000,reserved:3500,available:16500});
 assert.equal(walletSummary(w),'Solde : 16500 points disponibles, 3500 réservés.');
 assert.equal(walletSummary(walletFromRow({balance:'0',reserved:'0'})),'Solde : 0 points disponibles.');
 assert.throws(()=>walletFromRow({balance:'200',reserved:'300'}));
 const empty={query:async()=>({rows:[]})} as unknown as Parameters<typeof readWallet>[0];
 assert.deepEqual(await readWallet(empty,1,'284177710'),{balance:0,reserved:0,available:0});
 assert.deepEqual(parseShopCommand('!points'),{kind:'balance'});
});
test("wallet identity is the native numeric Rumble user id, never a username/message",()=>{
 assert.equal(validRumbleIdentity('284177710'),true);assert.equal(validRumbleIdentity('LeCasiNoze'),false);assert.equal(validRumbleIdentity(''),false);
});
test("bonus purchase price and rebate tiers preserve exact cent boundaries",()=>{
 assert.equal(bonusPointPrice(10000),3500);assert.equal(bonusPointPrice(2001),701);
 for(const [gain,points] of [[3999,0],[4000,350],[8000,840],[12000,1540],[20000,2100],[40000,2800]]) assert.equal(bonusRebatePoints(1400,gain!,4000),points);
});
test("performance rewards use one highest tier and exclude bought/inherited bonuses",()=>{
 assert.equal(performancePoints(50000,10,'natural'),5000);assert.equal(performancePoints(10000,10,'natural'),250);
 assert.equal(performancePoints(10000,10,'purchase'),0);assert.equal(performancePoints(10000,10,'inherited'),0);
});
test("known variants preserve their semantic ids; unknown variants prompt after inspection",()=>{
 assert.deepEqual(parseShopCommand('!achat B:freespins_duel Wanted Dead or a Wild'),{kind:'buy',slotName:'Wanted Dead or a Wild',offerId:'freespins_duel'});
 assert.deepEqual(parseShopCommand('!achat Wanted Dead or a Wild'),{kind:'buy',slotName:'Wanted Dead or a Wild',offerId:null});
 assert.equal(parseShopCommand('2'),null);assert.deepEqual(parseShopCommand('2',true),{kind:'choose',choice:2});
 assert.deepEqual(parseShopCommand('!call +3 Wanted Dead or a Wild'),{kind:'stake',slotName:'Wanted Dead or a Wild',tier:3});
});
test("stake floors never overspend; bonus menu cannot contain ambiguous ids/prices",()=>{
 assert.equal(floorStake(30,[10,20,40]),20);assert.equal(floorStake(10,[20,40]),null);
 const offer={id:'duel',label:'Duel',costCents:4000,baseStakeCents:20};
 assert.equal(validateOffers([offer]).length,1);assert.throws(()=>validateOffers([offer,offer]));assert.throws(()=>validateOffers([{...offer,costCents:null}]));
});
test('global boost command is explicit and catalogue stake uses the highest active factor',async()=>{
 assert.deepEqual(parseShopCommand('!mise 1h'),{kind:'globalstake'});
 assert.equal(parseShopCommand('!mise 2h'),null);
 const queries:unknown[][]=[];
 const c={async query(sql:string,args:unknown[]){queries.push(args);return sql.includes("kind='globalstake'")?{rowCount:1,rows:[{}]}:{rowCount:1,rows:[{tier:2}]};}} as unknown as Parameters<typeof effectiveShopStake>[0];
 assert.equal(await effectiveShopStake(c,7,20),60);
 assert.equal(await effectiveShopStake(c,7,20,'284177710','wanted'),120);
 assert.deepEqual(queries.at(-1),[7,'284177710','wanted']);
 await assert.rejects(effectiveShopStake(c,7,0),/invalid_session_stake/);
});
