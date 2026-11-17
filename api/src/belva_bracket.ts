import {randomInt} from 'node:crypto';
import type {Pool} from 'pg';
import {applyGain,computeBracket,roundName,type Bracket,type Leg} from './belva_bracket_engine.js';

// Tournoi du samedi de Belva, côté serveur : tirage automatique, saisie des gains (!tournoi ou page staff),
// fin de tournoi. Les inscriptions et les messages Discord sont gérés par NozeBot sur les mêmes tables.
export const BRACKET_URL='https://lunalive.win/belva/tournoi';

let ready:Promise<unknown>|null=null;
export function bracketSchema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_tournaments(id serial PRIMARY KEY,title text NOT NULL,status text NOT NULL DEFAULT 'open',
    buy_cents int NOT NULL,channel_id text,message_id text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),finished_at timestamptz);
    CREATE TABLE IF NOT EXISTS belva_tournament_entries(tournament_id int NOT NULL REFERENCES belva_tournaments(id) ON DELETE CASCADE,discord_id text NOT NULL,
    display_name text NOT NULL,slot_key text NOT NULL,slot_name text NOT NULL,provider text,image_url text,bonus_id text NOT NULL,bonus_label text NOT NULL,
    multiplier numeric,bet_cents int,cost_cents int NOT NULL,place int,created_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY(tournament_id,discord_id),UNIQUE(tournament_id,slot_key));
    ALTER TABLE belva_tournaments ADD COLUMN IF NOT EXISTS draw jsonb,ADD COLUMN IF NOT EXISTS legs jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS draw_at timestamptz,ADD COLUMN IF NOT EXISTS drawn_at timestamptz,ADD COLUMN IF NOT EXISTS champion text,
      ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;
    ALTER TABLE belva_tournament_entries ADD COLUMN IF NOT EXISTS wins int;
    CREATE UNIQUE INDEX IF NOT EXISTS belva_one_active_tournament ON belva_tournaments((1)) WHERE status IN ('open','live','closed')`).catch(e=>{ready=null;throw e;});
  return ready;
}
// Le tournoi (tirage, annonces) ne tourne qu'une fois son design validé dans le salon staff du Discord.
const approved=async(pool:Pool)=>(await pool.query(`SELECT 1 FROM belva_design_reviews WHERE key='bracket' AND status='approved'`).catch(()=>({rows:[]}))).rows.length>0;

type Row={id:number;title:string;status:string;buy_cents:number;draw:string[]|null;legs:Record<string,Leg[]>;draw_at:Date|null;drawn_at:Date|null;champion:string|null;version:number;finished_at:Date|null};
export type Player={discordId:string;name:string;rumble:string|null;slot:string;image:string|null;bonus:string;multiplier:number|null;betCents:number|null};

async function players(pool:Pool,id:number){
  const rows=(await pool.query(`SELECT * FROM belva_tournament_entries WHERE tournament_id=$1 ORDER BY created_at`,[id])).rows;
  // Pseudo Rumble lié (affiché dans le chat) ; s'il manque, le pseudo du serveur Discord.
  const rumble=new Map<string,string>((await pool.query(`SELECT l.discord_user_id,l.username FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id
    WHERE lower(s.slug)='belvaa' AND l.discord_user_id=ANY($1::text[])`,[rows.map(r=>String(r.discord_id))]).catch(()=>({rows:[]}))).rows.map(r=>[String(r.discord_user_id),String(r.username)]));
  return new Map<string,Player>(rows.map(r=>[r.discord_id,{discordId:r.discord_id,name:r.display_name,rumble:rumble.get(String(r.discord_id))??null,slot:r.slot_name,image:r.image_url,
    bonus:r.bonus_label,multiplier:r.multiplier===null?null:Number(r.multiplier),betCents:r.bet_cents}]));
}

// Tournoi affiché : celui en cours (inscriptions ou bracket), sinon le dernier terminé.
export async function tournamentState(pool:Pool){
  await bracketSchema(pool);
  const t=(await pool.query(`SELECT * FROM belva_tournaments ORDER BY (status IN ('open','live','closed')) DESC,id DESC LIMIT 1`)).rows[0] as Row|undefined;
  if(!t)return null;
  const ps=await players(pool,t.id);
  const bracket=t.draw?computeBracket(t.draw,t.legs??{}):null;
  return {tournament:{id:t.id,title:t.title,status:t.status,buyCents:t.buy_cents,drawAt:t.draw_at,drawnAt:t.drawn_at,champion:t.champion,version:t.version},
    players:Object.fromEntries(ps),bracket};
}

const shuffle=<T>(a:T[])=>{const r=[...a];for(let i=r.length-1;i>0;i--){const j=randomInt(i+1);[r[i],r[j]]=[r[j]!,r[i]!];}return r;};
// Prochain samedi 18 h (heure de Paris) après une date : heure du tirage.
const NEXT_SATURDAY=(col:string)=>`((date_trunc('week',${col} AT TIME ZONE 'Europe/Paris')+interval '5 days 18 hours')
  +CASE WHEN (${col} AT TIME ZONE 'Europe/Paris')>=date_trunc('week',${col} AT TIME ZONE 'Europe/Paris')+interval '5 days 18 hours' THEN interval '7 days' ELSE interval '0' END) AT TIME ZONE 'Europe/Paris'`;

export async function drawDue(pool:Pool,announce:(text:string)=>Promise<unknown>){
  await bracketSchema(pool);
  if(!await approved(pool))return;
  await pool.query(`UPDATE belva_tournaments SET draw_at=${NEXT_SATURDAY('created_at')} WHERE status='open' AND draw_at IS NULL`);
  const due=(await pool.query(`SELECT * FROM belva_tournaments WHERE status='open' AND draw_at<=NOW() ORDER BY id LIMIT 1`)).rows[0] as Row|undefined;
  if(!due)return;
  const ids=(await pool.query(`SELECT discord_id FROM belva_tournament_entries WHERE tournament_id=$1`,[due.id])).rows.map(r=>String(r.discord_id));
  if(ids.length<2){await pool.query(`UPDATE belva_tournaments SET draw_at=draw_at+interval '7 days' WHERE id=$1`,[due.id]);return;}
  const draw=shuffle(ids);
  const done=(await pool.query(`UPDATE belva_tournaments SET status='live',draw=$2::jsonb,legs='{}',drawn_at=NOW(),version=version+1 WHERE id=$1 AND status='open' RETURNING id`,[due.id,JSON.stringify(draw)])).rowCount;
  if(!done)return;
  const st=await tournamentState(pool);const cur=st?.bracket?.current;
  if(cur&&st)await announce(`⚔️ Le bracket du tournoi est tiré : ${ids.length} joueurs ! Premier duel : ${duelText(st.players,cur.player,cur.opponent)}. Bracket : ${BRACKET_URL}`);
}

const nm=(ps:Record<string,Player>,id:string)=>ps[id]?.rumble??ps[id]?.name??'?';
const slotOf=(ps:Record<string,Player>,id:string)=>ps[id]?.slot??'?';
const duelText=(ps:Record<string,Player>,a:string,b:string)=>`${nm(ps,a)} (${slotOf(ps,a)}) vs ${nm(ps,b)} (${slotOf(ps,b)})`;
const eur=(c:number)=>(c/100).toLocaleString('fr-FR',{maximumFractionDigits:2})+' €';
export const parseGain=(s:string)=>{const m=/^(\d{1,7})(?:[.,](\d{1,2}))?\s*€?$/.exec(s.trim());return m?Number(m[1])*100+Number((m[2]??'0').padEnd(2,'0')):null;};

async function finish(pool:Pool,t:Row,b:Bracket){
  // Duels gagnés (un passage d'office n'en est pas un) : sert à l'XP du tournoi.
  for(const [id,place] of Object.entries(b.places))await pool.query(`UPDATE belva_tournament_entries SET place=$3,wins=$4 WHERE tournament_id=$1 AND discord_id=$2`,[t.id,id,place,b.wins[id]??0]);
  await pool.query(`UPDATE belva_tournaments SET status='done',champion=$2,finished_at=COALESCE(finished_at,NOW()) WHERE id=$1`,[t.id,b.champion]);
}

// Saisie d'un gain (chat ou page staff) : renvoie le message à annoncer dans le chat.
// Points de saison gagnés sur ce tournoi : 10 de présence + bonus de place (1er 15, 2e 10, 3e 7, 4e-5e 4).
export const seasonPoints=(place:number)=>10+([15,10,7,4,4][place-1]??0);

// Saisie d'un gain (chat ou page staff) : renvoie les messages courts à poster dans le chat Rumble (pas de mise en page).
export async function recordGain(pool:Pool,cents:number):Promise<string[]>{
  await bracketSchema(pool);
  const t=(await pool.query(`SELECT * FROM belva_tournaments WHERE status='live' ORDER BY id DESC LIMIT 1`)).rows[0] as Row|undefined;
  if(!t?.draw)return ['Aucun tournoi en cours.'];
  const r=applyGain(t.draw,t.legs??{},cents);if(!r)return ['Le tournoi est déjà terminé.'];
  const upd=(await pool.query(`UPDATE belva_tournaments SET legs=$2::jsonb,version=version+1 WHERE id=$1 AND version=$3 RETURNING id`,[t.id,JSON.stringify(r.legs),t.version])).rowCount;
  if(!upd)return ['Saisie simultanée : renvoie le gain.'];
  const ps=Object.fromEntries(await players(pool,t.id));
  const b=computeBracket(t.draw,r.legs),m=b.matches.find(x=>x.key===r.played.key)!;
  const leg=m.legs[r.played.leg]!;
  const who=(id:string)=>`${nm(ps,id)} (${slotOf(ps,id)})`;
  if(leg.a===null||leg.b===null)return [`${who(r.played.player)} : ${eur(cents)} · au tour de ${who(r.played.opponent)}`];
  const duel=`${who(m.a!)} vs ${who(m.b!)} [${eur(leg.a)} - ${eur(leg.b)}]`;
  const next=b.current?[`Suivant : ${who(b.current.player)} vs ${who(b.current.opponent)}`]:[];
  if(leg.a===leg.b)return [`${duel} [Égalité : on rachète]`,...next];
  if(!m.winner)return [`${duel} [${roundName(m.round,b.rounds)} ${m.winsA}-${m.winsB}]`,...next];
  const lost=`[Perdant : ${nm(ps,m.loser!)} +${seasonPoints(b.places[m.loser!]!)} pts]`;
  if(b.champion){await finish(pool,t,b);return [`${duel} [Champion : ${who(b.champion)} +${seasonPoints(1)} pts] ${lost}`];}
  return [`${duel} [Gagnant : ${who(m.winner)}] ${lost}`,...next];
}

// Correction depuis la page staff : remplace les gains d'un duel, le reste du bracket se recalcule.
export async function setMatchLegs(pool:Pool,key:string,legs:Leg[],version?:number){
  await bracketSchema(pool);
  if(!/^\d+-\d+$/.test(key)||!Array.isArray(legs)||legs.length>12)throw Error('bad_legs');
  const num=(v:unknown)=>v===null?null:Number.isFinite(Number(v))?Math.max(0,Math.round(Number(v))):NaN;
  const clean=legs.map(l=>({a:num(l?.a),b:num(l?.b)}));
  if(clean.some(l=>Number.isNaN(l.a)||Number.isNaN(l.b)))throw Error('bad_legs');
  const t=(await pool.query(`SELECT * FROM belva_tournaments WHERE draw IS NOT NULL ORDER BY id DESC LIMIT 1`)).rows[0] as Row|undefined;
  if(!t?.draw)throw Error('no_tournament');
  // La page staff renvoie la version qu'elle affichait : une saisie du chat arrivée entre-temps n'est jamais écrasée.
  if(version!==undefined&&version!==t.version)throw Error('stale');
  const all:Record<string,Leg[]>={...(t.legs??{}),[key]:clean};
  // Si le vainqueur du duel change, les duels suivants sur son chemin repartent de zéro (leurs gains étaient ceux de l'ancien vainqueur).
  const before=computeBracket(t.draw,t.legs??{}).matches.find(m=>m.key===key)?.winner??null;
  const after=computeBracket(t.draw,all);
  if(before!==(after.matches.find(m=>m.key===key)?.winner??null)){
    let [r,i]=key.split('-').map(Number) as [number,number];
    while(r<after.rounds){r++;i=Math.floor(i/2);delete all[`${r}-${i}`];}
  }
  const b=computeBracket(t.draw,all);
  const ok=(await pool.query(`UPDATE belva_tournaments SET legs=$2::jsonb,version=version+1,status=$3,champion=$4,finished_at=CASE WHEN $4::text IS NULL THEN NULL ELSE finished_at END WHERE id=$1 AND version=$5 RETURNING id`,
    [t.id,JSON.stringify(all),b.champion?'done':'live',b.champion,t.version])).rowCount;
  if(!ok)throw Error('stale');
  await pool.query(`UPDATE belva_tournament_entries SET place=NULL WHERE tournament_id=$1`,[t.id]);
  if(b.champion)await finish(pool,{...t,legs:all},b);
  return b;
}

// Version publique (page web) : les identifiants Discord sont remplacés par des clés neutres.
export function publicState(st:Awaited<ReturnType<typeof tournamentState>>){
  if(!st)return st;
  const ids=[...new Set([...(Object.keys(st.players)),...(st.bracket?.matches.flatMap(m=>[m.a,m.b]).filter((x):x is string=>!!x)??[])])];
  const map=new Map(ids.map((id,k)=>[id,`p${k}`]));const r=(id:string|null)=>id===null?null:map.get(id)??id;
  const players=Object.fromEntries(Object.entries(st.players).map(([id,p])=>[r(id)!,{...p,discordId:r(id)!}]));
  const b=st.bracket&&{...st.bracket,champion:r(st.bracket.champion),places:Object.fromEntries(Object.entries(st.bracket.places).map(([id,v])=>[r(id)!,v])),
    wins:Object.fromEntries(Object.entries(st.bracket.wins).map(([id,v])=>[r(id)!,v])),
    current:st.bracket.current&&{...st.bracket.current,player:r(st.bracket.current.player)!,opponent:r(st.bracket.current.opponent)!},
    matches:st.bracket.matches.map(m=>({...m,a:r(m.a),b:r(m.b),winner:r(m.winner),loser:r(m.loser)}))};
  return {...st,tournament:{...st.tournament,champion:r(st.tournament.champion)},players,bracket:b};
}
