import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeOverlayMessage,mergeOverlayMessages,recoverOverlayHistory} from '../src/components/chat/overlayMessages';
for(const type of ['raid','follow','combo','sub','don','boss','level','rain','wheel','predict','chest','sys','recap'])test(`${type}: empty body retains event data and native ID`,()=>{
 const data={round:'uuid-123',html:'Test',who:'Alice'};
 const m=normalizeOverlayMessage({msg:{id:23,userId:0,username:'LunaLive',body:'',type,data}},'test');
 assert.equal(m?.type,type);assert.deepEqual(m?.data,data);assert.equal(m?.body,'');assert.equal(m?.data?.round,'uuid-123');
});
test('reconnect history retains arriving events and cannot resurrect deleted messages',()=>{
 const message=(id:number,second:number)=>normalizeOverlayMessage({id,username:'Alice',body:'ok',createdAt:`2026-10-17T10:00:0${second}Z`},'test')!;
 const result=recoverOverlayHistory([message(1,1),message(2,2)],[message(2,2),message(3,3)],new Set(['1']),8);
 assert.deepEqual(result.map(row=>row.id),[2,3]);
});
test('socket aliases and replayed history do not duplicate messages; channel isolation and string deletion IDs are preserved',()=>{
 const m=normalizeOverlayMessage({id:42,username:'Alice',body:'Salut'},'test')!;
 assert.equal(mergeOverlayMessages([m],[{...m,id:'42'}],8).length,1);
 assert.equal(normalizeOverlayMessage({slug:'other',msg:m},'test'),null);
 assert.equal(normalizeOverlayMessage({message:'Salut',username:'Alice'},'test')?.body,'Salut');
 assert.equal(mergeOverlayMessages([],Array.from({length:12},(_,id)=>({...m,id})),8).length,8);
});
