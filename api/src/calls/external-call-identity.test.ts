import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {mig151_call_external_identity} from '../db/migrations/mig151_call_external_identity.js';
import {countUserCallsByExternalKey} from './queue.js';
import {handleCallsCommand} from './commands.js';

test('migration restores verified display names while keeping stable quotas, positions and other providers',async()=>{
  const db=new PGlite();const pool={query:(sql:string,params?:any[])=>params ? db.query(sql,params) : db.exec(sql)} as unknown as Pool;
  try{
    await db.exec(`CREATE TABLE calls_queue(id int PRIMARY KEY,streamer_id int,user_id int,username text,pos int,is_bonus boolean DEFAULT false,bet numeric);
      CREATE TABLE multichat_bridge_events(streamer_id int,platform text,user_id text,message_id text);
      CREATE TABLE chat_messages(id int,streamer_id int,external_source text,external_msg_id text,username text,created_at timestamptz);
      INSERT INTO calls_queue(id,streamer_id,user_id,username,pos) VALUES
        (1,7,0,'kick:42',1),(2,7,0,'twitch:42',2),(3,7,0,'RumbleViewer',3),(4,7,9,'kick:42',4);
      INSERT INTO multichat_bridge_events VALUES(7,'kick','42','old'),(7,'kick','42','new'),(7,'twitch','42','tw');
      INSERT INTO chat_messages VALUES
        (1,7,'kick','old','OldName','2026-10-17'),(2,7,'kick','new','LeCasiNoze','2026-10-18'),(3,7,'twitch','tw','LeCasiNoze','2026-10-18');`);
    await mig151_call_external_identity(pool);await mig151_call_external_identity(pool);
    const rows=(await db.query<any>('SELECT id,username,external_actor_key,pos FROM calls_queue ORDER BY id')).rows;
    assert.deepEqual(rows,[
      {id:1,username:'LeCasiNoze',external_actor_key:'kick:42',pos:1},
      {id:2,username:'LeCasiNoze',external_actor_key:'twitch:42',pos:2},
      {id:3,username:'RumbleViewer',external_actor_key:null,pos:3},
      {id:4,username:'kick:42',external_actor_key:null,pos:4},
    ]);
    await db.exec(`INSERT INTO calls_queue(id,streamer_id,user_id,username,pos,external_actor_key,is_bonus,bet) VALUES
      (5,7,0,'RenamedAgain',5,'kick:42',false,NULL),
      (6,7,0,'RenamedAgain',6,'kick:42',true,NULL),
      (7,7,0,'RenamedAgain',7,'kick:42',false,0.2),
      (8,8,0,'RenamedAgain',1,'kick:42',false,NULL);`);
    assert.equal(await countUserCallsByExternalKey(pool,7,'kick:42'),2);
    assert.equal(await countUserCallsByExternalKey(pool,7,'twitch:42'),1);
    assert.equal(await countUserCallsByExternalKey(pool,7,'kick:999'),0);
  }finally{await db.close();}
});

test('external identity cannot be attached to a local privileged account or use an arbitrary key',async()=>{
  const base:any={pool:{query(){throw Error('Must fail before any query');}},io:{},slug:'lecasinoze',streamerId:7,streamerOwnerUserId:null,actorUsername:'Alice',actorRole:'viewer',canMod:false,cmd:'call',arg:'',externalActorKey:'kick:42'};
  await assert.rejects(handleCallsCommand({...base,actorUserId:12}),/invalid_external_call_identity/);
  await assert.rejects(handleCallsCommand({...base,actorUserId:0,externalActorKey:'lunalive:1'}),/invalid_external_call_identity/);
});
