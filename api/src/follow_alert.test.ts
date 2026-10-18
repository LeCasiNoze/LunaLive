import test from 'node:test';
import assert from 'node:assert/strict';
import {emitFollowOverlayAlert} from './follow_alert.js';
test('provider follows reuse configured OBS media, text, volume, duration and public stream rooms',async()=>{
 const rooms:string[]=[],emissions:any[]=[];
 const io={to(room:string){rooms.push(room);return this;},emit(event:string,payload:any){emissions.push({event,payload});}};
 const db:any={async query(_sql:string,params:any[]){assert.deepEqual(params,[2]);return {rows:[{config:{alerts:{follow_tpl:'Merci @{user}',follow_img:'https://fixture/image.png',follow_sound:'https://fixture/sound.mp3',sound_vol:0.4,follow_duration_ms:5000}}}]};}};
 await emitFollowOverlayAlert(db,io,{slug:'lecasinoze',ownerUserId:2},'Alice');
 assert.deepEqual(rooms,['stream:lecasinoze','obsview:lecasinoze']);assert.equal(emissions.length,1);assert.equal(emissions[0].event,'obs:alert');
 assert.equal(emissions[0].payload.text,'Merci @Alice');assert.equal(emissions[0].payload.soundUrl,'https://fixture/sound.mp3');assert.equal(emissions[0].payload.volume,0.4);assert.equal(emissions[0].payload.durationMs,5000);
});
