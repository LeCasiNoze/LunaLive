import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

for(const file of ['calls/commands.ts','calls/queue.ts','automod-shop/commands.ts','automod-shop/purchase-upgrades.ts']) {
 test(`${file}: dropping bonuses frees Rumble call capacity without deleting hunt entries`,async()=>{
  const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
  const sql=source.match(/SELECT COUNT\(\*\)(?:::int)? AS n FROM calls_queue WHERE streamer_id=\$1 AND rumble_user_id=\$2[^'`\n]*/)?.[0];
  assert.ok(sql,'exercise the actual admission query');
  const db=new PGlite();
  try {
   await db.exec(`CREATE TABLE calls_queue(id int,streamer_id int,rumble_user_id text,is_bonus boolean,bet numeric);
    INSERT INTO calls_queue VALUES (1,1,'kilam',false,null),(2,1,'kilam',null,0),(3,1,'other',false,null),(4,2,'kilam',false,null);`);
   const count=async()=>Number((await db.query<{n:number}>(sql,[1,'kilam'])).rows[0].n);
   assert.equal(await count(),2);
   await db.exec('UPDATE calls_queue SET is_bonus=true,bet=0.2 WHERE id=1');
   assert.equal(await count(),1);
   await db.exec('UPDATE calls_queue SET is_bonus=true,bet=0.2 WHERE id=2');
   assert.equal(await count(),0);
   assert.equal((await db.query('SELECT * FROM calls_queue WHERE streamer_id=1 AND is_bonus=true')).rows.length,2);
   // Legacy bet-only bonuses and explicit flags both remain outside pending capacity.
   await db.exec(`INSERT INTO calls_queue VALUES (5,1,'kilam',null,0.2),(6,1,'kilam',true,null),(7,1,'kilam',false,null)`);
   assert.equal(await count(),1);
  }finally{await db.close();}
 });
}
