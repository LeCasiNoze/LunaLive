import test from 'node:test';
import assert from 'node:assert/strict';
import {manualHuntRecap} from '../src/hunt2/recap.ts';
import {shopReplyChunks} from '../src/automod-shop/rules.ts';

const state={phase:'open',start:100,items:[
 {id:'a',name:'Slot A',bet:1,pay:30},
 {id:'b',name:'Slot B',bet:2,pay:20},
 {id:'c',name:'Slot C',bet:2,pay:null},
 {id:'farm',name:'Not a bonus',bet:null,pay:null},
]};
test('recap counts only bonuses and computes arithmetic mean and remaining BE',()=>{
 const text=manualHuntRecap(state,'b');
 assert.match(text,/Slot B : 20,00 € \(×10,0\)/);
 assert.match(text,/Ouverture 2\/3 · 1 bonus restants · Moy\. ×20,0/);
 assert.match(text,/BE restant 50,00 € \(×25,0\)/);
});
test('zero payout is opened, last bonus still gets recap and unattained BE is explicit',()=>{
 const text=manualHuntRecap({...state,items:[{id:'a',name:'Zero',bet:1,pay:0}]},'a');
 assert.match(text,/Ouverture 1\/1 · 0 bonus restants/);
 assert.match(text,/Moy\. ×0,0 · BE restant 100,00 € \(non atteint\)/);
});
test('BE is zero after recovering start; no recap during farm or for missing item',()=>{
 assert.match(manualHuntRecap({...state,start:20},'b'),/BE restant 0,00 € \(×0,0\)/);
 assert.equal(manualHuntRecap({...state,phase:'edit'},'b'),null);
 assert.equal(manualHuntRecap(state,'farm'),null);
 assert.equal(manualHuntRecap(state,'missing'),null);
});
test('long recap preserves all fields within Rumble message limits',()=>{
 const text=manualHuntRecap({...state,items:state.items.map(it=>({...it,name:'Long name '.repeat(20)}))},'b');
 const chunks=shopReplyChunks(text);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(x=>x.length<=190));
 assert.equal(chunks.join(' '),text.replace(/\s+/g,' ').trim());
});
