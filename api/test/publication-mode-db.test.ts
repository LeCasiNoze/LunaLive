import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mig153_rumble_raids_publication} from '../src/db/migrations/mig153_rumble_raids_publication.js';
import {recordPublicationMode} from '../src/automod-shop/publication-mode.js';
test('publication owner survives heartbeats and rejects stale or contradictory revisions',async()=>{
 const db=new PGlite();
 const pool:any={query:async(sql:string,p?:any[])=>{
  if(!p&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}
  const result=await db.query(sql,p);return {rows:result.rows,rowCount:result.affectedRows};
 }};
 try{
  await db.exec('CREATE TABLE streamers(id BIGINT PRIMARY KEY);INSERT INTO streamers VALUES(12);');
  await mig153_rumble_raids_publication(pool);await mig153_rumble_raids_publication(pool);
  await db.exec('INSERT INTO automod_control(streamer_id,desired_enabled) VALUES(12,TRUE);');
  await recordPublicationMode(pool,12,'manual',23);
  let row=(await db.query('SELECT * FROM automod_control')).rows[0] as any;
  assert.equal(row.desired_enabled,false);assert.equal(row.publication_owner,'manual');
  await assert.rejects(recordPublicationMode(pool,12,'automod',22),/conflict/);
  await assert.rejects(recordPublicationMode(pool,12,'automod',23),/conflict/);
  await recordPublicationMode(pool,12,'automod',24);
  row=(await db.query('SELECT * FROM automod_control')).rows[0] as any;
  assert.equal(row.publication_owner,'automod');assert.equal(row.desired_enabled,false,'handoff never enables the game');
  await assert.rejects(recordPublicationMode(pool,12,'unknown',25),/invalid/);
 }finally{await db.close();}
});
