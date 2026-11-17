import type {Pool} from 'pg';
import {addCall} from './calls/queue.js';

// Hunt des viewers (mercredi) : les calls viennent du Discord de Belva (/hunt), ils entrent dans la file de calls
// de LeCasiNoze, qui les farme le matin dans son outil Hunt ; Belva ouvre le soir avec !open puis !bonus <gain>.
// Un seul hunt « courant » par streamer : calls_hunt_sessions + calls_queue (l'outil Hunt de LunaLive).
const HUNT_SLUG=()=>(process.env.BELVA_HUNT_STREAMER||'lecasinoze').toLowerCase();

let ready:Promise<unknown>|null=null;
export function huntSchema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_hunts(id serial PRIMARY KEY,status text NOT NULL DEFAULT 'farm',started_by text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT NOW(),opened_at timestamptz,finished_at timestamptz,version int NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS belva_hunt_calls(hunt_id int NOT NULL REFERENCES belva_hunts(id) ON DELETE CASCADE,discord_id text NOT NULL,
    call_id text NOT NULL,slot_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(hunt_id,call_id),UNIQUE(hunt_id,slot_key));
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE constraint_name='belva_hunt_calls_pkey' AND column_name='discord_id') THEN
        ALTER TABLE belva_hunt_calls DROP CONSTRAINT belva_hunt_calls_pkey; ALTER TABLE belva_hunt_calls ADD PRIMARY KEY(hunt_id,call_id);
      END IF;
    END $$`).catch(e=>{ready=null;throw e;});
  return ready;
}
const approved=async(pool:Pool)=>(await pool.query(`SELECT 1 FROM belva_design_reviews WHERE key='hunt' AND status='approved'`).catch(()=>({rows:[]}))).rows.length>0;
const streamer=async(pool:Pool)=>(await pool.query(`SELECT id,user_id AS owner FROM streamers WHERE lower(slug)=$1`,[HUNT_SLUG()])).rows[0] as {id:number;owner:number}|undefined;
export const current=async(pool:Pool)=>(await pool.query(`SELECT * FROM belva_hunts WHERE status IN ('farm','open') ORDER BY id DESC LIMIT 1`)).rows[0] as {id:number;status:string}|undefined;

type Item={id:string;slot:string;caller:string|null;bet:number|null;pay:number|null;bonus:boolean;pos:number};
async function items(pool:Pool,sid:number):Promise<Item[]>{
  return (await pool.query(`SELECT id::text,slot_name,username,bet,pay,(is_bonus OR COALESCE(bet,0)>0) AS bonus,pos FROM calls_queue WHERE streamer_id=$1 ORDER BY pos`,[sid])).rows
    .map(r=>({id:r.id,slot:r.slot_name,caller:r.username,bet:r.bet===null?null:Number(r.bet),pay:r.pay===null?null:Number(r.pay),bonus:!!r.bonus,pos:Number(r.pos)}));
}
export const huntStats=(list:Item[],start:number)=>{
  const bonus=list.filter(i=>i.bonus),paid=bonus.filter(i=>i.pay!==null),todo=bonus.filter(i=>i.pay===null);
  const totalBet=bonus.reduce((s,i)=>s+(i.bet??0),0),totalPay=paid.reduce((s,i)=>s+(i.pay??0),0);
  const left=Math.max(0,start-totalPay),remainingBet=todo.reduce((s,i)=>s+(i.bet??0),0);
  return {count:bonus.length,left:todo.length,totalBet,totalPay,beStart:totalBet?start/totalBet:0,beNow:remainingBet?left/remainingBet:0,next:todo[0]??null};
};
const eur=(n:number)=>n.toLocaleString('fr-FR',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})+' €';
const x=(n:number)=>'x'+n.toLocaleString('fr-FR',{maximumFractionDigits:n<10?2:0});
const nextText=(i:Item|null)=>i?`${i.slot}${i.caller?` (${i.caller})`:''} bet ${eur(i.bet??0)}`:'—';

// « /hunt » tapé par LeCasiNoze dans son chat LunaLive : archive l'ancien hunt, vide la file, ouvre le hunt des viewers.
export async function startViewersHunt(pool:Pool,actor:{id:number;role:string}){
  await huntSchema(pool);
  if(!await approved(pool))return 'Le hunt des viewers n’est pas encore validé dans le salon staff.';
  const s=await streamer(pool);if(!s)return null;
  if(actor.role!=='admin'&&actor.id!==s.owner)return null;
  const old=await items(pool,s.id);
  if(old.some(i=>i.bonus)){
    const sess=(await pool.query(`SELECT start FROM calls_hunt_sessions WHERE streamer_id=$1`,[s.id])).rows[0];
    await pool.query(`INSERT INTO hunt_archives(user_id,title,start,total_pay,items_count,snapshot) VALUES($1,$2,$3,$4,$5,$6)`,
      [s.owner,'Hunt archivé avant le hunt des viewers',sess?.start??null,old.reduce((t,i)=>t+(i.pay??0),0),old.filter(i=>i.bonus).length,
        JSON.stringify({phase:'edit',opened:false,start:sess?.start??null,items:old.filter(i=>i.bonus).map(i=>({id:i.id,name:i.slot,bet:i.bet,pay:i.pay,caller:i.caller}))})]).catch(()=>undefined);
  }
  await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`,[s.id]);
  await pool.query(`INSERT INTO calls_hunt_sessions(streamer_id,mode,opened,start,bet_default,archive_id) VALUES($1,'farm',FALSE,NULL,NULL,NULL)
    ON CONFLICT(streamer_id) DO UPDATE SET mode='farm',opened=FALSE,start=NULL,bet_default=NULL,archive_id=NULL,updated_at=NOW()`,[s.id]);
  await pool.query(`UPDATE belva_hunts SET status='done',finished_at=NOW() WHERE status IN ('farm','open')`);
  await pool.query(`INSERT INTO belva_hunts(started_by) VALUES($1)`,[String(actor.id)]);
  return '🎯 Hunt des viewers lancé : la file est vide, les calls arrivent du Discord de Belva (/hunt).';
}

// Call d'un viewer depuis le Discord (/hunt) : une machine par personne, jamais deux fois la même machine.
export async function addViewerCall(pool:Pool,c:{discordId:string;name:string;slot:string;provider:string|null}){
  await huntSchema(pool);
  const h=await current(pool);if(!h||h.status!=='farm')return {ok:false as const,error:'no_hunt'};
  const s=await streamer(pool);if(!s)return {ok:false as const,error:'no_streamer'};
  const key=c.slot.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const taken=(await pool.query(`SELECT discord_id FROM belva_hunt_calls WHERE hunt_id=$1 AND slot_key=$2`,[h.id,key])).rows[0]?.discord_id;
  if(taken&&taken!==c.discordId)return {ok:false as const,error:'slot_taken'};
  // Avantage de grade : 2 calls à partir de Saphir, 1 sinon.
  const grade=(await pool.query(`SELECT grade FROM belva_xp_levels WHERE discord_id=$1`,[c.discordId]).catch(()=>({rows:[]}))).rows[0]?.grade as string|undefined;
  const limit=['saphir','diamant','obsidienne'].includes(grade??'')?2:1;
  const mine=Number((await pool.query(`SELECT count(*)::int n FROM belva_hunt_calls WHERE hunt_id=$1 AND discord_id=$2`,[h.id,c.discordId])).rows[0]?.n??0);
  if(mine>=limit)return {ok:false as const,error:'already_called',limit};
  const r=await addCall(pool,s.id,0,c.name.slice(0,40),c.slot,c.provider,{bypassLimit:true});
  if(!r.ok)return {ok:false as const,error:r.error};
  await pool.query(`INSERT INTO belva_hunt_calls(hunt_id,discord_id,call_id,slot_key) VALUES($1,$2,$3,$4)`,[h.id,c.discordId,r.item.id,key]);
  await pool.query(`UPDATE belva_hunts SET version=version+1 WHERE id=$1`,[h.id]);
  return {ok:true as const,position:r.position};
}

// !open et !bonus <gain> dans le chat Rumble de Belva : messages courts (le chat Rumble n'a pas de mise en page).
export async function huntChat(pool:Pool,cmd:'open'|'bonus',gainEur:number|null):Promise<string|null>{
  await huntSchema(pool);
  if(!await approved(pool))return null;
  const h=await current(pool);const s=await streamer(pool);
  if(!h||!s)return 'Aucun hunt des viewers en cours.';
  const sess=(await pool.query(`SELECT start FROM calls_hunt_sessions WHERE streamer_id=$1`,[s.id])).rows[0];
  const start=Number(sess?.start??0);
  if(cmd==='open'){
    const st=huntStats(await items(pool,s.id),start);
    if(!st.count)return 'Le hunt n’a encore aucun bonus.';
    await pool.query(`UPDATE calls_hunt_sessions SET mode='open',opened=TRUE,updated_at=NOW() WHERE streamer_id=$1`,[s.id]);
    await pool.query(`UPDATE belva_hunts SET status='open',opened_at=COALESCE(opened_at,NOW()),version=version+1 WHERE id=$1`,[h.id]);
    return `🎯 Ouverture du hunt : ${st.count} bonus · start ${eur(start)} · BE ${x(st.beStart)} · 1er : ${nextText(st.next)}`;
  }
  if(gainEur===null)return 'Format : !bonus 245 (gain du bonus en euros).';
  const list=await items(pool,s.id);const target=huntStats(list,start).next;
  if(!target)return 'Tous les bonus sont déjà ouverts.';
  await pool.query(`UPDATE calls_queue SET pay=$2 WHERE id=$1::bigint AND streamer_id=$3`,[target.id,gainEur,s.id]);
  // XP du caller (1 XP par tranche de 5x, max 500), versée tout de suite : la file de calls peut être vidée ensuite.
  if(target.bet)await pool.query(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT discord_id,'hunt',call_id,LEAST(500,floor($2::numeric/$3::numeric/5))::int FROM belva_hunt_calls
    WHERE call_id=$1 AND NOW()>=$4::timestamptz AND floor($2::numeric/$3::numeric/5)>=1 ON CONFLICT DO NOTHING`,
    [target.id,gainEur,target.bet,process.env.BELVA_XP_START?.trim()||'2026-12-01T00:00:00+01:00']).catch(()=>undefined);
  await pool.query(`UPDATE belva_hunts SET version=version+1 WHERE id=$1`,[h.id]);
  const after=huntStats(list.map(i=>i.id===target.id?{...i,pay:gainEur}:i),start);
  const head=`${target.slot}${target.caller?` (${target.caller})`:''} : ${eur(gainEur)} (${x(target.bet?gainEur/target.bet:0)})`;
  if(after.next)return `${head} · BE ${x(after.beNow)} · ${after.left} restants · Suivant : ${nextText(after.next)}`;
  await pool.query(`UPDATE belva_hunts SET status='done',finished_at=NOW(),version=version+1 WHERE id=$1`,[h.id]);
  const best=list.map(i=>i.id===target.id?{...i,pay:gainEur}:i).filter(i=>i.bonus&&i.bet).sort((a,b)=>(b.pay!/b.bet!)-(a.pay!/a.bet!))[0];
  return `${head} · 🏁 Hunt terminé : ${eur(after.totalPay)} pour ${eur(start)} (${after.totalPay>=start?'+':''}${eur(after.totalPay-start)})${best?` · Meilleur call : ${best.slot} ${x(best.pay!/best.bet!)} (${best.caller})`:''}`;
}
