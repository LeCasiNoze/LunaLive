import type {Client} from 'discord.js';
import type {Pool} from 'pg';
import {BELVA_GUILD,LCN_GUILD,LINK_SLUGS} from './belva-guilds.js';
import {lcnRole} from './lcn-role-spec.js';

// Rôles du Discord LeCasiNoze tirés des mêmes données que chez Belva : compte casino vérifié (✅ Joueur Vérifié + rôle du casino),
// dépôt remboursé payé (🍾 Table VIP), Rumble relié (🌒 Habitué). Les grades sont gérés avec l'XP (belva-xp).
// Les rôles ne sont qu'ajoutés : un retrait reste une décision du staff.
const CASINOS=['rainbet','betportal','celsius'] as const;

// Les vérifications Rainbet faites sur le Discord LeCasiNoze (ancien système) comptent comme chez Belva : XP, wager, rôles.
async function importLcnRainbet(pool:Pool){
  await pool.query(`INSERT INTO belva_casino_accounts(guild_id,discord_id,discord_tag,casino,casino_username,casino_email,verified_by,verified_at)
    SELECT $1,r.discord_id,'',  'rainbet',r.rainbet_username,'','lecasinoze',r.verified_at FROM nozebot_rainbet_links r
    WHERE r.discord_id IS NOT NULL AND r.verified_at IS NOT NULL
    ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET verified_at=COALESCE(belva_casino_accounts.verified_at,EXCLUDED.verified_at),
      verified_by=COALESCE(belva_casino_accounts.verified_by,EXCLUDED.verified_by),casino_username=COALESCE(NULLIF(belva_casino_accounts.casino_username,''),EXCLUDED.casino_username)`,[BELVA_GUILD()]);
}

async function sync(client:Client,pool:Pool){
  await importLcnRainbet(pool).catch(e=>console.error('[nozebot] import Rainbet LeCasiNoze',e?.message||e));
  const guild=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);if(!guild)return;
  const roles=await guild.roles.fetch();const id=(key:string)=>roles.find(r=>r.name===lcnRole(key).name)?.id;
  const want=new Map<string,Set<string>>();
  const add=(discordId:string,key:string)=>{const r=id(key);if(!r)return;if(!want.has(discordId))want.set(discordId,new Set());want.get(discordId)!.add(r);};
  for(const a of (await pool.query(`SELECT DISTINCT discord_id,casino FROM belva_casino_accounts WHERE verified_at IS NOT NULL`)).rows){
    add(a.discord_id,'membre');if((CASINOS as readonly string[]).includes(a.casino))add(a.discord_id,a.casino);}
  for(const r of (await pool.query(`SELECT DISTINCT discord_id FROM belva_refunds WHERE status='paid'`).catch(()=>({rows:[]}))).rows)add(r.discord_id,'carreOr');
  // Comme chez Belva : un compte Rainbet vérifié qui a misé = a déposé.
  for(const r of (await pool.query(`SELECT DISTINCT a.discord_id FROM belva_casino_accounts a JOIN belva_rainbet_wager_snapshots s ON lower(s.username)=lower(a.casino_username) AND s.wagered>0 WHERE a.casino='rainbet' AND a.verified_at IS NOT NULL`).catch(()=>({rows:[]}))).rows)add(r.discord_id,'carreOr');
  for(const l of (await pool.query(`SELECT DISTINCT l.discord_user_id FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug) IN ${LINK_SLUGS}`)).rows)add(l.discord_user_id,'habitue');
  const ids=[...want.keys()];
  for(let k=0;k<ids.length;k+=100){
    const members=await guild.members.fetch({user:ids.slice(k,k+100)}).catch(()=>null);
    for(const [uid,m] of members??[]){
      const missing=[...want.get(uid)!].filter(r=>!m.roles.cache.has(r));
      if(missing.length)await m.roles.add(missing,'Synchro avec le Discord de Belva').catch(()=>undefined);
    }
  }
}

export function startLcnRolesSync(client:Client,pool?:Pool){
  if(!pool||process.env.LCN_ROLES_SYNC==='false')return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void sync(client,pool).catch(e=>console.error('[nozebot] rôles LeCasiNoze',e)).finally(()=>{busy=false;});};
  setTimeout(run,45_000).unref();setInterval(run,5*60_000).unref();
}
