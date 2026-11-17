import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {coinsSchema,coinsProfile,coinAction,linkedCoins,observeCoinName,weeklyCnz} from '../src/nozecoins/wallet.js';
import {handleCoinsChat} from '../src/nozecoins/chat.js';
import {tickBelvaTombola} from '../src/belva_tombola.js';
import {drawDue,publicState,recordGain,setMatchLegs,tournamentState} from '../src/belva_bracket.js';
import {linkByComment,finishPendingLink} from '../src/belva_link_comment.js';
import {requestAutomodDiscordLink} from '../src/automod-shop/discord-profile.js';

// Real PostgreSQL WASM engine, isolated in memory. A single serialized connection
// validates SQL, transactions, constraints and receipts; not a multiprocess load test.
const db=new PGlite();let tail=Promise.resolve();
async function connect(){let unlock!:()=>void;const previous=tail;tail=new Promise<void>(r=>{unlock=r;});await previous;
 return {query:async(sql:string,params?:unknown[])=>{
  if(!params&&sql.includes(';')){const r=await db.exec(sql);return {rows:r.at(-1)?.rows??[],rowCount:r.at(-1)?.affectedRows??0};}
  const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};
 },release:unlock};
}
const pool={connect,query:async(sql:string,params?:unknown[])=>{const c=await connect();try{return await c.query(sql,params);}finally{c.release();}}} as unknown as Pool;
before(async()=>{
 await db.exec(`CREATE TABLE streamers(id bigint PRIMARY KEY);INSERT INTO streamers VALUES(1);
 CREATE TABLE automod_points_accounts(streamer_id bigint,rumble_user_id text,username text,balance bigint,reserved bigint);
 CREATE TABLE automod_control(streamer_id bigint,desired_enabled boolean,runtime_status jsonb);
 INSERT INTO automod_control VALUES(1,FALSE,'{"publisherActive":false}');
 CREATE TABLE streamer_rumble_info(streamer_id bigint,is_live boolean,live_video_id_numeric text,updated_at timestamptz);
 INSERT INTO streamer_rumble_info VALUES(1,TRUE,'77',NOW());
 CREATE TABLE users(id bigint,rubis bigint);INSERT INTO users VALUES(1,1234);`);
 await coinsSchema(pool);await coinsSchema(pool);
 process.env.NOZECOINS_ENABLED='true';
});
after(async()=>{delete process.env.NOZECOINS_ENABLED;await db.close();});
test('claim credits 100 once, receipt replays, second request waits 24h',async()=>{
 const uid='284177710';const first=await coinAction(pool,1,uid,'Viewer','claim','claim:1');
 assert.equal(first.balance,100);assert.equal(first.delta,100);
 assert.equal((await coinAction(pool,1,uid,'Viewer','claim','claim:1')).replayed,true);
 assert.equal((await coinAction(pool,1,uid,'Viewer','claim','claim:2')).error,'cooldown');
 assert.equal((await coinsProfile(pool,1,uid,'Viewer')).balance,100);
});

test('journal derives completion from real receipts and never grants extra points',async()=>{
 const uid='284177799';
 const before=await coinsProfile(pool,1,uid,'Journal');
 assert.equal(before.journal.filter(step=>step.complete).length,0);
 await coinAction(pool,1,uid,'Journal','claim','journal:claim');
 const after=await coinsProfile(pool,1,uid,'Journal');
 assert.equal(after.balance,100);
 assert.equal(after.journal.find(step=>step.id==='claim')?.complete,true);
 assert.equal(after.journal.find(step=>step.id==='slot')?.complete,false);
 assert.equal(after.journal.find(step=>step.id==='link')?.complete,false);
 assert.equal((await coinsProfile(pool,1,uid,'Journal')).balance,100);
});
test('retrying many claims never credits more than once',async()=>{
 const results=await Promise.all(Array.from({length:10},(_,i)=>coinAction(pool,1,'284177711','Two','claim',`race:${i}`)));
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal((await coinsProfile(pool,1,'284177711','Two')).balance,100);
});
test('slot insufficient funds rolls back; replay does not reroll or charge',async()=>{
 await assert.rejects(coinAction(pool,1,'284177712','Empty','slot','slot:empty'),/insufficient_coins/);
 await coinAction(pool,1,'284177712','Empty','claim','seed');
 const first=await coinAction(pool,1,'284177712','Empty','slot','slot:one');
 const again=await coinAction(pool,1,'284177712','Empty','slot','slot:one');
 assert.equal(again.art,first.art);assert.equal(again.balance,first.balance);assert.equal(again.replayed,true);
 assert.equal((await coinAction(pool,1,'284177712','Empty','slot','slot:two')).error,'cooldown');
 const wait=await coinAction(pool,1,'284177712','Empty','slot','slot:three');
 assert.ok(new Date(String(wait.nextAt)).getTime()-Date.now()>29*60000);
});
test('shop insufficient funds and stale menu never debit or grant tiers',async()=>{
 await coinAction(pool,1,'284177713','Buyer','claim','seed');
 await assert.rejects(coinAction(pool,1,'284177713','Buyer','upgrade','buy:1','claim',0),/insufficient_coins/);
 let p=await coinsProfile(pool,1,'284177713','Buyer');assert.equal(p.tiers.claim,0);assert.equal(p.balance,100);
 await pool.query('UPDATE nozecoin_accounts SET balance=1000 WHERE rumble_user_id=$1',['284177713']);
 const bought=await coinAction(pool,1,'284177713','Buyer','upgrade','buy:2','claim',0);assert.equal(bought.balance,700);
 await assert.rejects(coinAction(pool,1,'284177713','Buyer','upgrade','buy:3','claim',0),/stale_shop/);
 p=await coinsProfile(pool,1,'284177713','Buyer');assert.equal(p.tiers.claim,1);assert.equal(p.balance,700);
});
test('rain gives a single credit per native account and stops in Automod',async()=>{
 await pool.query(`INSERT INTO nozecoin_rains(streamer_id,session_id,bucket,closes_at,announced_at) VALUES(1,'77',1,NOW()+INTERVAL '2 minutes',NOW())`);
 const first=await coinAction(pool,1,'284177714','Rain','rain','message:1');assert.equal(first.balance,25);
 const again=await coinAction(pool,1,'284177714','Rain','rain','message:2');assert.equal(again.replayed,true);assert.equal(again.balance,25);
 await pool.query('UPDATE automod_control SET desired_enabled=TRUE');
 await assert.rejects(coinAction(pool,1,'284177715','Automod','rain','message:3'),/no_rain/);
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE');
});
test('balances stay separate and linked identity shares the native account',async()=>{
 await pool.query(`INSERT INTO automod_points_accounts VALUES(1,'284177710','Viewer',777,7)`);
 // Ensure link tables using the existing schema via linkedCoins.
 await assert.rejects(linkedCoins(pool,1,'1188913226990235800'),/rumble_not_linked/);
 await pool.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'1188913226990235800','284177710','Renamed')`);
 const link=await linkedCoins(pool,1,'1188913226990235800');assert.equal(link.username,'Renamed');
 const p=await coinsProfile(pool,1,link.rumble_user_id,link.username);assert.equal(p.balance,100);assert.equal(p.automod,770);
 assert.equal((await pool.query('SELECT rubis FROM users')).rows[0].rubis,1234);
 assert.equal((await pool.query('SELECT balance FROM automod_points_accounts')).rows[0].balance,777);
});
test('stale and future chat messages cannot credit; rain stays Rumble-only',async()=>{
 const m={streamerId:1,userId:'284177716',username:'Old',messageId:'old',text:'!claim',createdAt:new Date(Date.now()-180000)};
 assert.equal(await handleCoinsChat(pool,m),null);
 assert.equal(await handleCoinsChat(pool,{...m,createdAt:new Date(Date.now()+60000)}),null);
 assert.equal((await coinsProfile(pool,1,m.userId,m.username)).balance,0);
});
test('a channel without Automod answers in its own coin',async()=>{
 const m={streamerId:1,userId:'284177720',username:'Belvafan',messageId:'bc1',text:'!claim',createdAt:new Date()};
 const o={coin:'BCoins',automod:false};
 assert.match(String(await handleCoinsChat(pool,m,o)),/\+100 BCoins · solde 100/);
 assert.match(String(await handleCoinsChat(pool,{...m,messageId:'bc2',text:'!bcoins'},o)),/100 BCoins\. Claim/);
 assert.match(String(await handleCoinsChat(pool,{...m,messageId:'bc3',text:'!rain'},o)),/rain BCoins en cours|\+25 BCoins/);
});
test('nickname observations follow native IDs and ignore older events',async()=>{
 const now=new Date();await observeCoinName(pool,1,'284177710','Newest',now);
 await observeCoinName(pool,1,'284177710','Older',new Date(now.getTime()-1000));
 assert.equal((await linkedCoins(pool,1,'1188913226990235800')).username,'Newest');
 await observeCoinName(pool,1,'284177710','Stale',new Date(now.getTime()-180000));
 assert.equal((await linkedCoins(pool,1,'1188913226990235800')).username,'Newest');
});
test('weekly CNZ rewards require a fresh tagged native identity and cannot duplicate',async()=>{
 await pool.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'100000000000000003','284177718','CNZ Old')`);
 await observeCoinName(pool,1,'284177710','CNZ Viewer',new Date());
 const before=(await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance;
 const pending=await weeklyCnz(pool,1);assert.equal(pending.length,1);
 assert.equal(pending[0].amount,200);
 assert.equal((await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance,before+200);
 await weeklyCnz(pool,1);assert.equal((await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance,before+200);
 await pool.query('UPDATE nozecoin_cnz_announcements SET announced_at=NOW()');
 assert.equal((await weeklyCnz(pool,1)).length,0);
});
test('Belva tombola announces one code per 40 min of live, retried if the chat send fails',async()=>{
 await pool.query(`CREATE TABLE IF NOT EXISTS belva_design_reviews(key text PRIMARY KEY,version text,status text)`);
 const said0:string[]=[];await tickBelvaTombola(pool,'899',async t=>{said0.push(t);return {sent:true};},Date.now()+3_600_000);assert.equal(said0.length,0);
 await pool.query(`INSERT INTO belva_design_reviews VALUES('tombola','v','approved')`);
 process.env.BELVA_TOMBOLA_START='2020-01-01T00:00:00Z';const said:string[]=[];let up=false;
 const say=async(t:string)=>{said.push(t);return {sent:up};};
 await tickBelvaTombola(pool,'900',say);assert.equal(said.length,0);
 const later=Date.now()+41*60_000;
 await tickBelvaTombola(pool,'900',say,later);assert.equal(said.length,1);
 up=true;await tickBelvaTombola(pool,'900',say,later);await tickBelvaTombola(pool,'900',say,later);assert.equal(said.length,2);
 assert.match(said[1],/^🎟️ Code tombola : [A-Z2-9]{4} — tape \/code /);
 const live=(await pool.query(`SELECT count(*)::int n FROM belva_tombola_codes WHERE bucket>0 AND announced_at IS NOT NULL AND expires_at>NOW()`)).rows[0].n;assert.equal(live,1);
 delete process.env.BELVA_TOMBOLA_START;
});
test('Belva link by Rumble comment: known chatter links at once, newcomer links at first chat message',async()=>{
 await pool.query(`CREATE TABLE IF NOT EXISTS rumble_chat_messages(streamer_id bigint,rumble_user_id text,username text,created_at timestamptz DEFAULT NOW())`);
 await pool.query(`INSERT INTO rumble_chat_messages(streamer_id,rumble_user_id,username) VALUES(1,'285749146','wznnn')`);
 const item=(u:string,t:string)=>`<li class="comment-item" data-comment-id="1" data-username="${u}" data-entity-type="user"><a>${u}</a><p class="comment-text">${t}</p></li>`;
 const a=await requestAutomodDiscordLink(pool,1,'111111111111111111');const codeA=a.command!.split(' ')[1];
 assert.deepEqual(await linkByComment(pool,1,'111111111111111111',async()=>item('someone','hello')),{status:'not_found'});
 assert.deepEqual(await linkByComment(pool,1,'111111111111111111',async()=>item('someone','x')+item('WZNNN',`mon code ${codeA.toLowerCase()}`)),{status:'linked',username:'WZNNN'});
 assert.equal((await pool.query(`SELECT rumble_user_id FROM automod_discord_links WHERE discord_user_id='111111111111111111'`)).rows[0].rumble_user_id,'285749146');
 assert.deepEqual(await linkByComment(pool,1,'111111111111111111',async()=>''),{status:'no_code'});
 const b=await requestAutomodDiscordLink(pool,1,'222222222222222222');
 assert.deepEqual(await linkByComment(pool,1,'222222222222222222',async()=>item('Newbie',b.command!.split(' ')[1])),{status:'pending',username:'Newbie'});
 assert.equal(await finishPendingLink(pool,1,'287000001','someoneelse'),null);
 assert.match(String(await finishPendingLink(pool,1,'287000001','newbie')),/relié/);
 assert.equal((await pool.query(`SELECT rumble_user_id FROM automod_discord_links WHERE discord_user_id='222222222222222222'`)).rows[0].rumble_user_id,'287000001');
});
test('Belva bracket: Saturday draw, gains typed in chat, winner and places saved',async()=>{
 await pool.query(`INSERT INTO belva_design_reviews VALUES('bracket','v','approved') ON CONFLICT DO NOTHING`);
 await tournamentState(pool);
 const t=(await pool.query(`INSERT INTO belva_tournaments(title,buy_cents,created_by,draw_at) VALUES('T',12000,'x',NOW()-interval '1 minute') RETURNING id`)).rows[0].id;
 for(const [id,slot] of [['111','Wanted'],['222','Fruit Party']])await pool.query(`INSERT INTO belva_tournament_entries(tournament_id,discord_id,display_name,slot_key,slot_name,bonus_id,bonus_label,cost_cents) VALUES($1,$2,$2,$3,$3,'b','Bonus',12000)`,[t,id,slot]);
 const said:string[]=[];await drawDue(pool,async x=>{said.push(x);});
 assert.match(said[0]!,/bracket du tournoi est tiré : 2 joueurs/);
 assert.equal((await tournamentState(pool))!.tournament.status,'live');
 // Finale directe en BO3 : 100/50 puis 30/40 puis 20/10 -> le premier tiré gagne 2-1
 const first=(await tournamentState(pool))!.bracket!.current!.player;
 for(const g of [100,50,30,40])assert.doesNotMatch((await recordGain(pool,g*100)).join(' '),/Champion/);
 await recordGain(pool,2000);const last=(await recordGain(pool,1000)).join(' ');assert.match(last,/^\w+ \([\w ]+\) vs \w+ \([\w ]+\) \[20 € - 10 €\] \[Champion : \w+ \([\w ]+\) \+25 pts\] \[Perdant : \w+ \+20 pts\]$/);
 const st=(await tournamentState(pool))!;assert.equal(st.tournament.status,'done');assert.equal(st.tournament.champion,first);
 const places=(await pool.query(`SELECT discord_id,place FROM belva_tournament_entries WHERE tournament_id=$1 ORDER BY place`,[t])).rows.map(r=>[r.discord_id,r.place]);
 assert.deepEqual(places.map(p=>p[1]),[1,2]);assert.equal(places[0]![0],first);
 assert.deepEqual(await recordGain(pool,100),['Aucun tournoi en cours.']);
});
test('Belva bracket: a staff correction that changes a winner resets the next duels; stale edits are refused; public state hides Discord ids',async()=>{
 const t=(await pool.query(`INSERT INTO belva_tournaments(title,buy_cents,created_by,draw_at) VALUES('T2',12000,'x',NOW()-interval '1 minute') RETURNING id`)).rows[0].id;
 for(const id of ['901','902','903','904'])await pool.query(`INSERT INTO belva_tournament_entries(tournament_id,discord_id,display_name,slot_key,slot_name,bonus_id,bonus_label,cost_cents) VALUES($1,$2,$2,$2,$2,'b','Bonus',12000)`,[t,id]);
 await drawDue(pool,async()=>{});
 for(const g of [100,50,30,40,70,10])await recordGain(pool,g*100);
 let st=(await tournamentState(pool))!;const final=st.bracket!.matches.find(m=>m.key==='2-0')!;
 assert.equal(final.legs.length,1);const winner=st.bracket!.matches.find(m=>m.key==='1-0')!.winner;
 await assert.rejects(setMatchLegs(pool,'1-0',[{a:1,b:500}],st.tournament.version-1),/stale/);
 await setMatchLegs(pool,'1-0',[{a:1,b:500}],st.tournament.version);
 st=(await tournamentState(pool))!;
 assert.notEqual(st.bracket!.matches.find(m=>m.key==='1-0')!.winner,winner);
 assert.equal(st.bracket!.matches.find(m=>m.key==='2-0')!.legs.length,0);
 const pub=publicState(st)!;assert.ok(Object.keys(pub.players).every(k=>/^p\d+$/.test(k)));assert.ok(Object.values(pub.players).every(p=>/^p\d+$/.test(p.discordId)));assert.ok(pub.bracket!.matches.every(m=>[m.a,m.b].every(x=>x===null||/^p\d+$/.test(x))));
 await assert.rejects(setMatchLegs(pool,'1-0',[{a:'abc' as never,b:1}]),/bad_legs/);
});
