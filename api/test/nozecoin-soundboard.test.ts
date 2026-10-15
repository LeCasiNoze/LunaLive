import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {coinAction} from '../src/nozecoins/wallet.js';
import {DEFAULT_SOUND_CATALOGUE} from '../src/nozecoins/sound-catalogue.js';
import {validateSoundCatalogue,soundboardSchema,controlSoundboard,heartbeatSoundboard,enqueueSound,takeNextSound,settleSound,sweepSoundboard} from '../src/nozecoins/soundboard.js';

// Isolated SQL fixtures, no real Discord member, media download, or production points.
const db=new PGlite();let tail=Promise.resolve();
async function connect(){let unlock!:()=>void;const prior=tail;tail=new Promise<void>(r=>{unlock=r;});await prior;
 return {query:async(sql:string,params?:unknown[])=>{
  if(!params&&sql.includes(';')){const rows=await db.exec(sql);return {rows:rows.at(-1)?.rows??[],rowCount:rows.at(-1)?.affectedRows??0};}
  const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};
 },release:unlock};}
const pool={connect,query:async(sql:string,params?:unknown[])=>{const c=await connect();try{return await c.query(sql,params);}finally{c.release();}}} as unknown as Pool;
const consumer='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const sound={id:'test-tone',label:'SQL test fixture',audioUrl:'https://www.myinstants.com/media/sounds/test-tone.mp3',cost:25,durationMs:2000,volume:0.5};
const user='284177799';
before(async()=>{
 await db.exec(`CREATE TABLE streamers(id bigint PRIMARY KEY);INSERT INTO streamers VALUES(1);
 CREATE TABLE automod_control(streamer_id bigint,desired_enabled boolean,runtime_status jsonb);
 INSERT INTO automod_control VALUES(1,FALSE,'{"publisherActive":false}');
 CREATE TABLE streamer_rumble_info(streamer_id bigint,is_live boolean,live_video_id_numeric text,updated_at timestamptz);
 INSERT INTO streamer_rumble_info VALUES(1,TRUE,'77',NOW());`);
 await soundboardSchema(pool);
});
beforeEach(async()=>{
 await db.exec(`DELETE FROM nozecoin_soundboard_requests;DELETE FROM nozecoin_ledger;DELETE FROM nozecoin_accounts;DELETE FROM nozecoin_soundboard_state;
 UPDATE automod_control SET desired_enabled=FALSE,runtime_status='{"publisherActive":false}';
 UPDATE streamer_rumble_info SET is_live=TRUE,live_video_id_numeric='77',updated_at=NOW();`);
 await coinAction(pool,1,user,'Fixture','claim','seed');
});
after(async()=>{await db.close();});
async function ready(){await controlSoundboard(pool,1,true);await heartbeatSoundboard(pool,1,consumer);}
async function buy(receipt='interaction-one',uid=user){return enqueueSound(pool,{streamerId:1,rumbleId:uid,username:'Fixture',receipt,sound});}
async function balance(){return Number((await pool.query('SELECT balance FROM nozecoin_accounts WHERE streamer_id=1 AND rumble_user_id=$1',[user])).rows[0].balance);}

test('catalogue accepts only bounded explicitly supplied entries and HTTPS media hosts',()=>{
 assert.equal(validateSoundCatalogue(DEFAULT_SOUND_CATALOGUE).length,7);
 assert.equal(DEFAULT_SOUND_CATALOGUE.find(s=>s.id==='here-comes-the-money')?.durationMs,9091);
 assert.deepEqual(validateSoundCatalogue([]),[]);assert.equal(validateSoundCatalogue([sound])[0]?.cost,25);
 for(const change of [{cost:-1},{cost:1.5},{durationMs:12001},{volume:2},{id:'../private'},{audioUrl:'http://127.0.0.1/a.mp3'},
  {audioUrl:'https://www.myinstants.com.evil.test/media/sounds/a.mp3'},{audioUrl:'https://www.myinstants.com/media/sounds/a.mp3?token=secret'},
  {audioUrl:'https://user:secret@myinstants.com/media/sounds/a.mp3'}])assert.throws(()=>validateSoundCatalogue([{...sound,...change}]));
 assert.throws(()=>validateSoundCatalogue([sound,sound]),/invalid_sound_id/);
});
test('disabled or missing OBS never spends points',async()=>{
 await assert.rejects(buy(),/soundboard_unavailable/);
 await controlSoundboard(pool,1,true);await assert.rejects(buy(),/soundboard_unavailable/);
 assert.equal(await balance(),100);
});
test('receipt retries charge once and cannot switch the chosen sound',async()=>{
 await ready();const first=await buy();const again=await buy();assert.equal(again.requestId,first.requestId);assert.equal(again.replayed,true);assert.equal(await balance(),75);
 await assert.rejects(enqueueSound(pool,{streamerId:1,rumbleId:user,username:'Fixture',receipt:'interaction-one',sound:{...sound,id:'different'}}),/receipt_conflict/);
});
test('one consumer, one in-flight sound, successful playback debits exactly once',async()=>{
 await ready();await assert.rejects(heartbeatSoundboard(pool,1,other),/consumer_in_use/);
 const bought=await buy();const next=await takeNextSound(pool,1,consumer);assert.equal(next?.requestId,bought.requestId);
 assert.equal(await takeNextSound(pool,1,consumer),null);assert.equal(await takeNextSound(pool,1,other),null);
 await assert.rejects(settleSound(pool,1,other,bought.requestId,true),/receipt_forbidden/);
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,true)).state,'played');
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,true)).replayed,true);assert.equal(await balance(),75);
});
test('failed playback refunds once, including duplicate and late acknowledgements',async()=>{
 await ready();const bought=await buy();await takeNextSound(pool,1,consumer);
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,false)).state,'refunded');
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,false)).replayed,true);
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,true)).state,'refunded');assert.equal(await balance(),100);
 assert.equal((await pool.query("SELECT COUNT(*)::integer AS n FROM nozecoin_ledger WHERE reason='sound_refund'")).rows[0].n,1);
});
test('lost OBS lease refunds without replaying the sound',async()=>{
 await ready();const bought=await buy();await takeNextSound(pool,1,consumer);
 await pool.query("UPDATE nozecoin_soundboard_requests SET claimed_at=NOW()-INTERVAL '31 seconds'");
 await sweepSoundboard(pool,1);await sweepSoundboard(pool,1);assert.equal(await balance(),100);
 assert.equal(await takeNextSound(pool,1,consumer),null);
 assert.equal((await settleSound(pool,1,consumer,bought.requestId,true)).state,'refunded');
});
test('stop control and stream session changes refund pending requests',async()=>{
 await ready();await buy();await controlSoundboard(pool,1,false);assert.equal(await balance(),100);
 await ready();await buy('second');await pool.query("UPDATE streamer_rumble_info SET live_video_id_numeric='78'");
  await sweepSoundboard(pool,1);assert.equal(await balance(),100);
  assert.equal((await heartbeatSoundboard(pool,1,consumer)).ready,false);
  await assert.rejects(buy('new-session-before-enable'),/soundboard_unavailable/);
  await controlSoundboard(pool,1,true);assert.equal((await heartbeatSoundboard(pool,1,consumer)).ready,true);
});
test('Automod and stale personal live data prevent purchases and clear the queue',async()=>{
 await ready();await buy();await pool.query('UPDATE automod_control SET desired_enabled=TRUE');
 await sweepSoundboard(pool,1);assert.equal(await balance(),100);
 await assert.rejects(buy('automod'),/soundboard_unavailable/);
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE');
 await pool.query("UPDATE streamer_rumble_info SET updated_at=NOW()-INTERVAL '3 minutes'");
 await assert.rejects(buy('stale'),/soundboard_unavailable/);assert.equal(await balance(),100);
});
test('queue is bounded and a viewer cannot stack purchases during cooldown',async()=>{
 await ready();await buy();await assert.rejects(buy('again'),/soundboard_cooldown/);
 for(let i=0;i<4;i++){const uid=String(284177800+i);await coinAction(pool,1,uid,'Other','claim',`seed:${i}`);await buy(`queue:${i}`,uid);}
 await coinAction(pool,1,'284177899','Overflow','claim','seed:overflow');
 await assert.rejects(buy('overflow','284177899'),/soundboard_queue_full/);assert.equal(await balance(),75);
});
test('insufficient balance and expired OBS heartbeat cannot create paid requests',async()=>{
 await ready();await pool.query('UPDATE nozecoin_accounts SET balance=10 WHERE rumble_user_id=$1',[user]);
 await assert.rejects(buy(),/insufficient_coins/);
 assert.equal((await pool.query('SELECT COUNT(*)::integer AS n FROM nozecoin_soundboard_requests')).rows[0].n,0);
 await pool.query("UPDATE nozecoin_soundboard_state SET consumer_seen_at=NOW()-INTERVAL '16 seconds'");
 await assert.rejects(buy('offline'),/soundboard_unavailable/);assert.equal(await balance(),10);
});
