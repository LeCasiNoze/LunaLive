import {randomInt,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction} from '../automod-shop/wallet.js';
import {canSplit,currentHand,doDouble,doHit,doSplit,doStand,handTotal,isBlackjack,nextHandOrEnd,playDealerToEnd,settle,startGame,type BJFinish,type BJGame} from '../discord/games_blackjack.js';
import {coinsSchema,InsufficientCoins} from './wallet.js';

// Blackjack en points de chaîne (NozeCoins / BCoins) : même moteur que le blackjack Rubis, portefeuille nozecoin_accounts.
export const COIN_BJ_BET=20;
export type CoinBjAction='hit'|'stand'|'double'|'split';
const rng=()=>randomInt(1_000_000_000)/1_000_000_000;
const ready=new WeakMap<Pool,Promise<void>>();
async function schema(pool:Pool){
 let task=ready.get(pool);if(!task){task=coinsSchema(pool).then(()=>pool.query(`CREATE TABLE IF NOT EXISTS nozecoin_blackjack_sessions(
  id uuid PRIMARY KEY,streamer_id bigint NOT NULL,rumble_user_id text NOT NULL,discord_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',game jsonb NOT NULL,result jsonb,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW());
  CREATE INDEX IF NOT EXISTS nozecoin_bj_active ON nozecoin_blackjack_sessions(streamer_id,discord_user_id) WHERE status='active'`)).then(()=>undefined)
  .catch(e=>{ready.delete(pool);throw e;});ready.set(pool,task);}await task;
}

// Chaque mouvement a une clé de ledger unique : un rejeu ne peut ni débiter ni créditer deux fois.
async function move(c:PoolClient,sid:number,uid:string,delta:number,key:string,reason:string){
 const done=(await c.query('SELECT 1 FROM nozecoin_ledger WHERE streamer_id=$1 AND rumble_user_id=$2 AND event_key=$3',[sid,uid,key])).rows[0];
 if(done||delta===0)return;
 const row=(await c.query(`UPDATE nozecoin_accounts SET balance=balance+$3 WHERE streamer_id=$1 AND rumble_user_id=$2 AND balance+$3>=0 RETURNING balance`,[sid,uid,delta])).rows[0];
 if(!row){const b=(await c.query('SELECT balance FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,uid])).rows[0];throw new InsufficientCoins(Number(b?.balance??0),-delta);}
 await c.query(`INSERT INTO nozecoin_ledger(streamer_id,rumble_user_id,event_key,delta,reason,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[sid,uid,key,delta,reason,JSON.stringify({delta,balance:Number(row.balance)})]);
}
const balanceOf=async(c:PoolClient,sid:number,uid:string)=>Number((await c.query('SELECT balance FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,uid])).rows[0]?.balance??0);

type Row={id:string;status:string;game:BJGame;result:(BJFinish&{xpGained:number;balance:number})|null};
function view(row:Row,balance:number){
 const g=row.game,active=row.status==='active'&&!g.finished,hand=g.hands[g.active];
 return {sessionId:row.id,status:active?'active' as const:'finished' as const,mode:'classic' as const,
  dealer:{cards:active?[g.dealer[0],null]:g.dealer,total:active?null:handTotal(g.dealer)},
  hands:g.hands.map((h,i)=>({cards:h.cards,total:handTotal(h.cards),bet:h.bet,doubled:h.doubled,finished:h.finished,active:active&&i===g.active})),
  sideBetLines:[],actions:{hit:Boolean(active&&hand&&!hand.finished),stand:Boolean(active&&hand&&!hand.finished),
   double:Boolean(active&&hand&&!hand.finished&&hand.cards.length===2&&!hand.doubled),split:Boolean(active&&canSplit(g))},
  balance,cooldownEndsAt:new Date(0).toISOString(),result:row.result};
}

async function finish(c:PoolClient,sid:number,uid:string,row:Row,g:BJGame):Promise<Row>{
 g.finished=true;
 if(!g.hands.every(h=>handTotal(h.cards)>21)&&!isBlackjack(g.hands[0]?.cards||[]))playDealerToEnd(g);
 const s=settle(g);
 for(const h of s.perHand){
  const credit=s.isNaturalBlackjack&&h.i===1&&h.kind==='win'?Math.floor(h.bet*2.5):h.kind==='win'?h.bet*2:h.kind==='push'?h.bet:0;
  await move(c,sid,uid,credit,`bj:${row.id}:pay:${h.i}`,'blackjack');
 }
 const result={...s,xpGained:0,balance:await balanceOf(c,sid,uid)};
 await c.query(`UPDATE nozecoin_blackjack_sessions SET status='finished',game=$2::jsonb,result=$3::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(g),JSON.stringify(result)]);
 return {...row,status:'finished',game:g,result};
}

export class BlackjackCooldown extends Error{constructor(public nextAt:string){super('cooldown');}}
// cooldownMs : délai minimum entre deux parties (BCoins de Belva) ; 0 = aucun.
export async function startCoinBlackjack(pool:Pool,sid:number,uid:string,name:string,discordId:string,cooldownMs=0){
 await schema(pool);
 return inTransaction(pool,async c=>{
  await c.query(`INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username) VALUES($1,$2,$3) ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET username=EXCLUDED.username`,[sid,uid,name.slice(0,80)]);
  await c.query('SELECT 1 FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE',[sid,uid]);
  const open=(await c.query(`SELECT * FROM nozecoin_blackjack_sessions WHERE streamer_id=$1 AND discord_user_id=$2 AND status='active' FOR UPDATE`,[sid,discordId])).rows[0] as Row|undefined;
  if(open)return view(open,await balanceOf(c,sid,uid));
  if(cooldownMs){
   const last=(await c.query(`SELECT created_at FROM nozecoin_blackjack_sessions WHERE streamer_id=$1 AND discord_user_id=$2 ORDER BY created_at DESC LIMIT 1`,[sid,discordId])).rows[0]?.created_at as Date|undefined;
   if(last&&Date.now()-new Date(last).getTime()<cooldownMs)throw new BlackjackCooldown(new Date(new Date(last).getTime()+cooldownMs).toISOString());
  }
  const id=randomUUID();
  await move(c,sid,uid,-COIN_BJ_BET,`bj:${id}:bet`,'blackjack');
  const game=startGame({mainBet:COIN_BJ_BET,pairsBet:0,plus3Bet:0},rng);
  let row:Row={id,status:'active',game,result:null};
  await c.query(`INSERT INTO nozecoin_blackjack_sessions(id,streamer_id,rumble_user_id,discord_user_id,game) VALUES($1,$2,$3,$4,$5::jsonb)`,[id,sid,uid,discordId,JSON.stringify(game)]);
  if(isBlackjack(game.hands[0]!.cards))row=await finish(c,sid,uid,row,game);
  return view(row,await balanceOf(c,sid,uid));
 });
}

export async function actCoinBlackjack(pool:Pool,sid:number,uid:string,discordId:string,sessionId:string,action:CoinBjAction){
 await schema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT 1 FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE',[sid,uid]);
  let row=(await c.query(`SELECT * FROM nozecoin_blackjack_sessions WHERE id=$1 FOR UPDATE`,[sessionId])).rows[0] as (Row&{streamer_id:string;discord_user_id:string})|undefined;
  if(!row)throw Error('session_not_found');
  if(Number(row.streamer_id)!==sid||row.discord_user_id!==discordId)throw Error('session_forbidden');
  if(row.status!=='active')return view(row,await balanceOf(c,sid,uid));
  const g=row.game,hand=currentHand(g);if(!hand||hand.finished)throw Error('invalid_action');
  let result:Row=row;
  if(action==='hit'){const {bust}=doHit(g);if(bust||handTotal(hand.cards)===21){if(!bust)doStand(g);if(nextHandOrEnd(g)==='finish')result=await finish(c,sid,uid,row,g);}}
  else if(action==='stand'){doStand(g);if(nextHandOrEnd(g)==='finish')result=await finish(c,sid,uid,row,g);}
  else if(action==='double'){
   if(hand.cards.length!==2||hand.doubled)throw Error('invalid_action');
   await move(c,sid,uid,-hand.bet,`bj:${row.id}:double:${g.active}`,'blackjack');doDouble(g);
   if(nextHandOrEnd(g)==='finish')result=await finish(c,sid,uid,row,g);
  }else if(action==='split'){
   if(!canSplit(g))throw Error('invalid_action');
   await move(c,sid,uid,-COIN_BJ_BET,`bj:${row.id}:split`,'blackjack');doSplit(g);
  }
  if(result.status==='active'){await c.query(`UPDATE nozecoin_blackjack_sessions SET game=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(g)]);result={...row,game:g};}
  return view(result,await balanceOf(c,sid,uid));
 });
}
