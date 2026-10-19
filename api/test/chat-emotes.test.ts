import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { pool } from "../src/db.js";
import { publicChatEmotesRouter, emotesRouter } from "../src/emotes/emotes.router.js";

test("OBS gets active channel/global emotes without login; favorites stay private",async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    CREATE TABLE streamers(id INT,slug TEXT);
    CREATE TABLE emotes(id INT,kind TEXT,scope TEXT,streamer_id INT,name TEXT,label TEXT,url TEXT,mime TEXT,size_bytes INT,status TEXT);
    CREATE TABLE emote_favorites(user_id INT,emote_id INT,created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO streamers VALUES(12,'lecasinoze');
    INSERT INTO emotes(id,kind,scope,streamer_id,name,url,status) VALUES
      (1,'emoji','global',NULL,'wave','/wave.png','active'),
      (2,'emoji','channel',12,'luna','/luna.png','active'),
      (3,'emoji','channel',13,'private','/other.png','active'),
      (4,'emoji','channel',12,'disabled','/disabled.png','disabled'),
      (5,'gif','native',NULL,'dance','/dance.gif','active'),
      (6,'emoji','global',NULL,'heart','/heart.png','active');
    INSERT INTO emote_favorites(user_id,emote_id) VALUES(7,1),(8,6);
  `);
  t.mock.method(pool,"query",(sql:string,args?:any[])=>db.query(sql,args));
  const secret=process.env.JWT_SECRET;process.env.JWT_SECRET='local-emotes-test-secret';
  t.after(()=>{if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;});
  const handler=(publicChatEmotesRouter as any).stack.find((x:any)=>x.route?.path==='/chat/:slug/emotes').route.stack[0].handle;
  async function read(token?:string) {
    const headers:Record<string,string>={};
    const result=await new Promise<any>((resolve,reject)=>handler({params:{slug:'lecasinoze'},headers:token?{authorization:`Bearer ${token}`}:{},query:{}},
      {set(k:string,v:string){headers[k]=v;return this;},status(){return this;},json:resolve},reject));
    assert.equal(headers['Cache-Control'],'private, no-store');
    return result;
  }
  const guest=await read();assert.equal(guest.ok,true);assert.deepEqual(guest.favorites,[]);
  assert.deepEqual(guest.channel.map((e:any)=>e.id),[2]);
  assert.deepEqual(guest.global.map((e:any)=>e.id).sort(),[1,6]);
  assert.deepEqual(guest.native.map((e:any)=>e.id),[5]);
  for(const [id,favorite] of [[7,1],[8,6]]) {
    const own=await read(jwt.sign({id,username:`viewer${id}`,role:'viewer'},process.env.JWT_SECRET!));
    assert.deepEqual(own.favorites.map((e:any)=>e.id),[favorite]);
  }
  assert.deepEqual((await read('invalid-token')).favorites,[]);
});

test("making the catalogue public does not expose favorite mutations",async()=>{
  for(const method of ['post','delete']) {
    const route=(emotesRouter as any).stack.find((x:any)=>x.route?.path==='/me/emotes/favorites/:id'&&x.route.methods[method]).route;
    let status=0,continued=false;
    await route.stack[0].handle({headers:{},query:{}},{status(code:number){status=code;return this;},json(){}},()=>{continued=true;});
    assert.equal(status,401);assert.equal(continued,false);
  }
});
