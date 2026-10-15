import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {generateHuntCalls,validateGeneration,randomHuntProvider} from './random-hunt.js';
import {viewerCallPosition} from './generated-order.js';
import {mig147_random_hunt_calls} from '../db/migrations/mig147_random_hunt_calls.js';

test('supported providers and bounded request validation',()=>{
 for(const p of ['pragmatic-play','backseat','hacksaw gaming','no-limit-city','avatarux','bgaming','elk','ELK Studios'])assert.ok(randomHuntProvider(p),p);
 for(const p of ['Evolution','NetEnt','unknown'])assert.equal(randomHuntProvider(p),null);
 for(const count of [0,-1,31,1.5,'10',NaN])assert.throws(()=>validateGeneration(count,'00000000-0000-4000-8000-000000000001'));
 assert.throws(()=>validateGeneration(10,'bad'));
});

test('generation, retries, bans, viewer FIFO and hunt preservation on a real SQL engine',async()=>{
 const db=new PGlite();
 const c={query:(sql:string,args?:any[])=>db.query(sql,args),release:()=>{}};
 const pool:any={...c,connect:async()=>c};
 try{
 await db.exec(`CREATE TABLE streamers(id bigint PRIMARY KEY); INSERT INTO streamers VALUES(1),(2);
 CREATE TABLE calls_queue(id bigserial PRIMARY KEY,streamer_id bigint,slot_name text,slot_key text,provider text,user_id bigint,username text,pos bigint,is_bonus boolean DEFAULT false,bet numeric,pay numeric,UNIQUE(streamer_id,slot_key));
 CREATE TABLE calls_settings(streamer_id bigint,enabled boolean);
 CREATE TABLE calls_hunt_sessions(streamer_id bigint,mode text,opened boolean);
 INSERT INTO calls_hunt_sessions VALUES(1,'farm',false);
 CREATE TABLE automod_control(streamer_id bigint,desired_enabled boolean);
 CREATE TABLE calls_bans(streamer_id bigint,kind text,ban_key text);
 CREATE TABLE calls_provider_policy(streamer_id bigint,mode text);
 CREATE TABLE calls_allowed_providers(streamer_id bigint,provider_norm text);
 CREATE TABLE slots_catalog(name text,name_key text,provider text);
 INSERT INTO slots_catalog VALUES('A','a','Pragmatic Play'),('B','b','backseat'),('C','c','Nolimit City'),('D','d','AvatarUX'),('E','e','BGaming'),('F','f','ELK Studios'),('Roulette','roulette','Pragmatic Play'),('Banned','banned','Pragmatic Play'),('Wrong','wrong','NetEnt');
 INSERT INTO calls_bans VALUES(1,'slot','banned');`);
 await mig147_random_hunt_calls(pool);await mig147_random_hunt_calls(pool);
 const req='00000000-0000-4000-8000-000000000001';
 const result=await generateHuntCalls(pool,1,'lecasinoze',3,req);assert.equal(result.added,3);
 assert.equal((await generateHuntCalls(pool,1,'lecasinoze',3,req)).replayed,true);
 const more=await generateHuntCalls(pool,1,'lecasinoze',10,req.replace(/1$/,'2'));assert.equal(more.added,3);
 const generated=await db.query<any>('SELECT * FROM calls_queue ORDER BY pos');assert.equal(generated.rows.length,6);
 assert.ok(generated.rows.every(x=>x.hunt_generated&&x.user_id==='0'||x.hunt_generated&&Number(x.user_id)===0));
 const current=generated.rows[0].id;
 const addViewer=async(name:string)=>{
  await db.exec('BEGIN');const pos=await viewerCallPosition(c as any,1);
  await db.query(`INSERT INTO calls_queue(streamer_id,slot_name,slot_key,user_id,username,pos) VALUES(1,$1,$1,5,'Viewer',$2)`,[name,pos]);await db.exec('COMMIT');
 };
 await addViewer('viewer1');await addViewer('viewer2');
 let ordered=(await db.query<any>('SELECT * FROM calls_queue ORDER BY pos')).rows;
 assert.equal(ordered[0].id,current);assert.deepEqual(ordered.slice(1,3).map(x=>x.slot_name),['viewer1','viewer2']);
 assert.equal(ordered.filter(x=>x.hunt_generated).length,6);
 // Banked bonuses cannot be mistaken for the machine currently being farmed.
 await db.query('UPDATE calls_queue SET is_bonus=true,bet=0.2 WHERE id=$1',[current]);
 await addViewer('viewer3');ordered=(await db.query<any>('SELECT * FROM calls_queue WHERE is_bonus=false ORDER BY pos')).rows;
 assert.deepEqual(ordered.slice(0,3).map(x=>x.slot_name),['viewer1','viewer2','viewer3']);
 assert.equal((await db.query('SELECT * FROM calls_queue WHERE is_bonus=true')).rows.length,1);
 await db.exec(`INSERT INTO calls_provider_policy VALUES(2,'allow_only');INSERT INTO calls_allowed_providers VALUES(2,'elk');`);
 assert.equal((await generateHuntCalls(pool,2,'other',10,req)).added,1);
 assert.equal((await db.query<any>('SELECT provider FROM calls_queue WHERE streamer_id=2')).rows[0].provider,'elk');
 await db.exec(`UPDATE calls_hunt_sessions SET mode='open',opened=true WHERE streamer_id=1`);
 await assert.rejects(generateHuntCalls(pool,1,'lecasinoze',10,req.replace(/1$/,'3')),/hunt_not_farming/);
 await db.exec(`UPDATE calls_hunt_sessions SET mode='farm',opened=false;INSERT INTO automod_control VALUES(1,true)`);
 await assert.rejects(generateHuntCalls(pool,1,'lecasinoze',10,req.replace(/1$/,'4')),/automod_active/);
 await db.exec(`UPDATE automod_control SET desired_enabled=false;INSERT INTO calls_settings VALUES(1,false)`);
 await assert.rejects(generateHuntCalls(pool,1,'lecasinoze',10,req.replace(/1$/,'5')),/calls_disabled/);
 await db.exec(`UPDATE calls_settings SET enabled=true;INSERT INTO calls_bans VALUES(2,'provider','ELK Studios');DELETE FROM calls_queue WHERE streamer_id=2`);
 await assert.rejects(generateHuntCalls(pool,2,'other',10,req.replace(/1$/,'6')),/no_eligible_slots/);
 await db.exec(`INSERT INTO calls_queue(streamer_id,slot_name,slot_key,pos,is_bonus) SELECT 2,'q'||g,'q'||g,g,false FROM generate_series(1,500) g`);
 await assert.rejects(generateHuntCalls(pool,2,'other',10,req.replace(/1$/,'7')),/queue_full/);
 assert.equal((await generateHuntCalls(pool,1,'lecasinoze',3,req)).replayed,true);
 }finally{await db.close();}
});
