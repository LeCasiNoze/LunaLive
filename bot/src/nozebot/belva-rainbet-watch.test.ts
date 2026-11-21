import test from 'node:test';
import assert from 'node:assert/strict';
import {endedSession} from './belva-rainbet-watch.js';

const H=3_600_000,now=Date.parse('2026-11-21T10:00:00Z');
const s=(id:number,wagered:number,hoursAgo:number)=>({id:String(id),wagered,at:new Date(now-hoursAgo*H)});

test('NicoCara du 20/11 : une hausse isolée puis plus rien = session de 76 $',()=>{
  const r=endedSession([s(41,1445.87,11),s(37,1369.855,32)],0,now)!;
  assert.deepEqual(r.run.map(x=>x.id),['41']);assert.equal(Math.round(r.wager),76);
});
test('relevés horaires consécutifs = une seule session, base = relevé d’avant',()=>{
  const r=endedSession([s(9,300,1),s(8,200,2),s(7,150,3),s(5,100,20)],0,now)!;
  assert.deepEqual(r.run.map(x=>x.id),['9','8','7']);assert.equal(r.wager,200);
});
test('dernier relevé trop récent (mise en cours) : pas de récap',()=>{
  assert.equal(endedSession([{id:'9',wagered:300,at:new Date(now-10*60_000)},s(8,200,1)],0,now),null);
});
test('déjà notifié : rien',()=>{assert.equal(endedSession([s(9,300,2),s(8,200,3)],9,now),null);});
test('la session s’arrête au dernier relevé notifié, qui sert de base',()=>{
  const r=endedSession([s(10,400,1),s(9,300,2),s(8,200,3)],9,now)!;
  assert.deepEqual(r.run.map(x=>x.id),['10']);assert.equal(r.wager,100);
});
test('premier relevé du compte : aucune mise attribuée ; vieille session : ignorée',()=>{
  assert.equal(endedSession([s(3,500,2)],0,now)!.wager,0);
  assert.equal(endedSession([s(9,300,30),s(8,100,31)],0,now)!.wager,0);
});
