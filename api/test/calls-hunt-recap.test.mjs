import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {manualHuntRecap,manualHuntFarmRecap,manualHuntFinalRecap} from '../src/hunt2/recap.ts';
import {expectedAmount,onceSchema} from '../src/hunt2/amount.ts';
import {shopReplyChunks} from '../src/automod-shop/rules.ts';
function fixture(mode='open'){
 const routes=new Map(),messages=[];
 const items=[{id:'a',slotName:'High pay',username:'Alice',betEur:10,payEur:null,isBonus:mode==='open'},{id:'b',slotName:'High multi',username:'Bob',betEur:mode==='open'?1:null,payEur:null,isBonus:mode==='open'}];
 if(mode==='farm')items[0].betEur=null;
 const pool={query:async(sql,args)=>{
   const it=items.find(it=>it.id===args[1]);
   if(sql.includes('SET bet=$3')){
     assert.match(sql,/COALESCE\(is_bonus,FALSE\)=FALSE/);
     if(!it||it.isBonus)return {rowCount:0};it.betEur=args[2];it.isBonus=true;return {rowCount:1};
   }
   if(sql.includes('SET pay=$3')){
     if(!it||(sql.includes('pay IS NULL')&&it.payEur!==null)||(args[3]&&it.payEur!==args[4]))return {rowCount:0};
     it.payEur=args[2];return {rowCount:1};
   }
   throw Error('Unexpected SQL');
 }};
 const router={use(){},get(){},patch(){},delete(){},post(path,...h){routes.set(path,h.at(-1));}};
 const source=fs.readFileSync(new URL('../src/routes/calls_hunt.ts',import.meta.url),'utf8').replace(/^import\b[\s\S]*?;\r?\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/\bexport /g,'');
 vm.runInNewContext(code+`;getStreamerBySlug=async()=>({id:77,ownerUserId:4});canControlStreamer=async()=>true;getSession=async()=>({mode:fixtureMode,start:100,betDefault:1});loadQueue=async()=>fixtureItems;`,{
   console,express:{Router:()=>router,json:()=>()=>{}},pool,requireAuth(){},onceSchema:()=>async()=>{},expectedAmount,manualHuntRecap,manualHuntFarmRecap,manualHuntFinalRecap,shopReplyChunks,
   fixtureMode:mode,fixtureItems:items,sendBotChat:async(_pool,_io,target,text)=>{assert.equal(target.streamerId,77);assert.equal(target.slug,'lecasinoze');messages.push(text);}
 });
 async function request(action,body={}){const response={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await routes.get('/:slug/hunt/'+action)({params:{slug:'lecasinoze'},user:{id:4},body,app:{locals:{io:{}}}},response);return response;}
 return {request,items,messages};
}
test('bot menu farm records bonus once and announces updated count and BE',async()=>{
 const f=fixture('farm');assert.equal((await f.request('bonus')).body.bonusId,'a');assert.deepEqual(f.messages,['Bonus 1 · BE actuel ×100,0']);
 await f.request('bonus');assert.match(f.messages[1],/Bonus 2 · BE actuel ×50,0/);await f.request('bonus');assert.equal(f.messages.length,2);
});
test('bot menu opening and final messages include caller ranking by multiplier',async()=>{
 const f=fixture();await f.request('pay',{payEur:200});assert.match(f.messages[0],/Ouverture 1\/2.*High pay : 200,00 € \(×20,0\)/);
 await f.request('pay',{payEur:50});const text=f.messages.join(' ');assert.match(text,/Ouverture 2\/2/);assert.match(text,/GG ! Gain 150,00 €/);assert.match(text,/Meilleur : High multi par @Bob \(×50,0\)/);assert.match(text,/Pire : High pay par @Alice \(×20,0\)/);
 const n=f.messages.length;assert.equal((await f.request('pay',{payEur:50})).body.paid,false);assert.equal(f.messages.length,n);
});
test('failed or stale guarded save never announces a different bonus',async()=>{
 const f=fixture();await f.request('pay',{id:'a',payEur:0,expected:null});const n=f.messages.length;
 assert.equal((await f.request('pay',{id:'a',payEur:50,expected:null})).statusCode,409);assert.equal(f.messages.length,n);assert.equal(f.items[1].payEur,null);
});
