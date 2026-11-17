import {randomInt} from 'node:crypto';
import type {Pool} from 'pg';
import {inTransaction} from './automod-shop/wallet.js';

// Tombola du dimanche de Belva : un code annoncé dans le chat Rumble toutes les 40 min de live,
// à taper avec /code sur le Discord (le bot NozeBot compte les tickets et fait le tirage).
export const TOMBOLA_CODE_EVERY_MS=40*60_000;
export const TOMBOLA_CODE_TTL_MIN=10;
const ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const tombolaCode=()=>Array.from({length:4},()=>ALPHABET[randomInt(ALPHABET.length)]).join('');
const startsAt=()=>new Date(process.env.BELVA_TOMBOLA_START?.trim()||'2026-12-01T00:00:00+01:00').getTime();

let ready:Promise<unknown>|null=null;
export function tombolaSchema(pool:Pool){
 ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_tombola_codes(code text PRIMARY KEY,session_id text NOT NULL,bucket int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT NOW(),created_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,announced_at timestamptz,
  UNIQUE(session_id,bucket))`).catch(e=>{ready=null;throw e;});
 return ready;
}

export async function tickBelvaTombola(pool:Pool,videoId:string,announce:(text:string)=>Promise<{sent:boolean}>,now=Date.now()){
 if(process.env.BELVA_TOMBOLA_ENABLED==='false'||now<startsAt())return;
 await tombolaSchema(pool);
 // Le message d'annonce doit d'abord être validé par le staff dans le salon validation-design du Discord.
 const approved=(await pool.query(`SELECT 1 FROM belva_design_reviews WHERE key='tombola' AND status='approved'`).catch(()=>({rows:[]}))).rows.length;
 if(!approved)return;
 const code=await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[8244171]);
  // bucket 0 marque seulement le début du live : le premier code tombe après 40 min.
  await c.query(`INSERT INTO belva_tombola_codes(code,session_id,bucket,expires_at,announced_at) VALUES($1,$2,0,NOW(),NOW()) ON CONFLICT DO NOTHING`,[`start:${videoId}`,videoId]);
  const started=(await c.query(`SELECT started_at FROM belva_tombola_codes WHERE session_id=$1 AND bucket=0`,[videoId])).rows[0].started_at as Date;
  const bucket=Math.floor((now-new Date(started).getTime())/TOMBOLA_CODE_EVERY_MS);if(bucket<1)return null;
  await c.query(`INSERT INTO belva_tombola_codes(code,session_id,bucket,expires_at) VALUES($1,$2,$3,NOW()+make_interval(mins=>$4)) ON CONFLICT DO NOTHING`,[tombolaCode(),videoId,bucket,TOMBOLA_CODE_TTL_MIN]);
  return (await c.query(`UPDATE belva_tombola_codes SET announced_at=NOW() WHERE session_id=$1 AND bucket=$2 AND announced_at IS NULL AND expires_at>NOW() RETURNING code`,[videoId,bucket])).rows[0]?.code as string|undefined??null;
 });
 if(!code)return;
 const sent=await announce(`🎟️ Code tombola : ${code} — tape /code ${code} sur le Discord de Belva dans les ${TOMBOLA_CODE_TTL_MIN} min = 1 ticket pour le tirage du dimanche (2 × 15 €). Discord : !discord · 18+`);
 if(!sent.sent)await pool.query(`UPDATE belva_tombola_codes SET announced_at=NULL WHERE code=$1`,[code]);
}
