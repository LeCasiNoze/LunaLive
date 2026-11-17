import {ChannelType,Events,MessageFlags,OverwriteType,PermissionFlagsBits,type Client,type Guild,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {brands,refreshBrands} from './belva-roles.js';
import {ensureTables} from './belva-tickets.js';
import {referredUsers} from './rainbet.js';

// Salon staff « stats du mois » : un message par mois (heure de Paris), réécrit toutes les 5 minutes.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PATRON_ROLE='1482854912059511006';
const VIDEUR_ROLE='1483165106140352632';
const STAFF_CATEGORY='1483112145154474005';
const CHANNEL_NAME='📊︱stats-du-mois';
const RUMBLE_SLUG='belvaa';
const MONTH_START=`date_trunc('month',now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`;

async function ensureStatsTables(pool:Pool){
  await ensureTables(pool);
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_member_events (id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, discord_id TEXT NOT NULL,
    kind TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS belva_stats_months (guild_id TEXT NOT NULL, month TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
    followers_start INT, members_start INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (guild_id,month))`);
}

let rainbetCache:{at:number;count:number|null}={at:0,count:null};
async function rainbetSignups(since:Date){
  if(Date.now()-rainbetCache.at<30*60_000)return rainbetCache.count;
  const count=await referredUsers().then(u=>u.filter(x=>x.signed_up_at&&new Date(x.signed_up_at)>=since).length).catch(()=>null);
  rainbetCache={at:Date.now(),count};return count;
}

// Postbacks Betportal reçus par NivoraNet (lien partenaire partagé avec LeCasiNoze : tous les joueurs du lien).
let betportalCache:{at:number;since:number;v:{reg:number;ftd:number}|null}={at:0,since:0,v:null};
async function betportalPostbacks(since:Date){
  if(Date.now()-betportalCache.at<10*60_000&&betportalCache.since===since.getTime())return betportalCache.v;
  const url=process.env.NIVORA_SUPABASE_URL,key=process.env.NIVORA_SUPABASE_KEY;
  let v:{reg:number;ftd:number}|null=null;
  if(url&&key){
    const r=await fetch(`${url}/rest/v1/betportal_deliveries?select=event&event=in.(registration,ftd)&received_at=gte.${encodeURIComponent(since.toISOString())}`,
      {headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15_000)}).catch(()=>null);
    const rows=r?.ok?await r.json().catch(()=>null) as {event:string}[]|null:null;
    if(Array.isArray(rows))v={reg:rows.filter(x=>x.event==='registration').length,ftd:rows.filter(x=>x.event==='ftd').length};
  }
  betportalCache={at:Date.now(),since:since.getTime(),v};return v;
}

async function statsChannel(guild:Guild):Promise<TextChannel>{
  const all=await guild.channels.fetch();
  const found=all.find(ch=>ch?.type===ChannelType.GuildText&&ch.name===CHANNEL_NAME);
  if(found)return found as TextChannel;
  const view=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];
  return guild.channels.create({name:CHANNEL_NAME,type:ChannelType.GuildText,parent:STAFF_CATEGORY,
    topic:'Stats du mois en cours, mises à jour toutes les 5 minutes. Un nouveau message chaque mois.',
    permissionOverwrites:[{id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
      {id:PATRON_ROLE,type:OverwriteType.Role,allow:view},{id:VIDEUR_ROLE,type:OverwriteType.Role,allow:view},
      {id:guild.client.user.id,type:OverwriteType.Member,allow:[...view,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]}],
    reason:'Stats mensuelles Belva'});
}

type Row={casino:string;n:string;eur:string};
const byCasino=(rows:Row[])=>new Map(rows.map(r=>[r.casino,{n:Number(r.n),eur:Number(r.eur)}]));

export async function buildStats(pool:Pool,guild:Guild,month:{followers_start:number|null;members_start:number|null}){
  const q=async(sql:string)=>(await pool.query(sql,[GUILD_ID()])).rows as Row[];
  // FTD connus : dépôt remboursé validé, dépôt offert envoyé, ou remboursement envoyé sur un nouveau compte.
  const ftd=byCasino(await q(`SELECT casino,count(*) n,COALESCE(sum(eur),0) eur FROM (
    SELECT casino,deposit_eur eur FROM belva_refunds WHERE guild_id=$1 AND kind='refund' AND status IN ('approved','wallet_received','paid') AND approved_at>=${MONTH_START}
    UNION ALL SELECT casino,amount_eur FROM belva_refunds WHERE guild_id=$1 AND kind='offer' AND status='paid' AND paid_at>=${MONTH_START}
    UNION ALL SELECT dest_casino,amount_eur FROM belva_refunds WHERE guild_id=$1 AND kind='refund' AND status='paid' AND dest_casino IS NOT NULL AND dest_casino<>casino AND paid_at>=${MONTH_START}
  ) x GROUP BY casino`));
  const verified=byCasino(await q(`SELECT casino,count(*) n,0 eur FROM belva_casino_accounts WHERE guild_id=$1 AND verified_at>=${MONTH_START} GROUP BY casino`));
  const paid=byCasino(await q(`SELECT casino,count(*) n,sum(amount_eur) eur FROM belva_refunds WHERE guild_id=$1 AND status='paid' AND paid_at>=${MONTH_START} GROUP BY casino`));
  const offers=byCasino(await q(`SELECT casino,count(*) n,sum(amount_eur) eur FROM belva_refunds WHERE guild_id=$1 AND kind='offer' AND status='paid' AND paid_at>=${MONTH_START} GROUP BY casino`));
  const pending=(await pool.query(`SELECT count(*) n,COALESCE(sum(amount_eur),0) eur FROM belva_refunds WHERE guild_id=$1 AND status IN ('pending','approved','wallet_received')`,[GUILD_ID()])).rows[0];
  const members=(await pool.query(`SELECT count(*) FILTER (WHERE kind='join') joins,count(*) FILTER (WHERE kind='leave') leaves FROM belva_member_events WHERE guild_id=$1 AND at>=${MONTH_START}`,[GUILD_ID()])).rows[0];
  const followers=(await pool.query(`SELECT i.followers_count FROM streamer_rumble_info i JOIN streamers s ON s.id=i.streamer_id WHERE lower(s.slug)=$1`,[RUMBLE_SLUG]).catch(()=>({rows:[]}))).rows[0]?.followers_count as number|null|undefined;
  const since=new Date((await pool.query(`SELECT ${MONTH_START} t`)).rows[0].t);
  const rainbet=await rainbetSignups(since);
  const bp=await betportalPostbacks(since);
  const sum=(m:Map<string,{n:number;eur:number}>)=>[...m.values()].reduce((a,v)=>({n:a.n+v.n,eur:a.eur+v.eur}),{n:0,eur:0});
  const lines=brands().map(b=>{
    if(b.api)return `${b.emoji} **${b.name}** · inscrits ce mois : **${rainbet??'?'}** · comptes vérifiés : **${verified.get(b.id)?.n??0}**`;
    const f=ftd.get(b.id),p=paid.get(b.id),o=offers.get(b.id);
    const pb=b.id==='betportal'&&bp?`\n-# Postbacks Betportal (lien partagé avec LeCasiNoze) : **${bp.reg}** inscrits · **${bp.ftd}** FTD`:'';
    return `${b.emoji} **${b.name}** · FTD : **${f?.n??0}** · dépôts : **${f?.eur??0} €** · vérifiés : **${verified.get(b.id)?.n??0}** · offerts : **${o?.n??0}** · versé : **${p?.eur??0} €**${pb}`;
  });
  const t=sum(ftd),out=sum(paid);
  const label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date());
  const net=Number(members.joins)-Number(members.leaves);
  const followerLine=followers==null?'Rumble : followers pas encore suivis'
    :`Rumble : **${followers}** followers${month.followers_start!=null?` (${followers-month.followers_start>=0?'+':''}${followers-month.followers_start} ce mois)`:''}`;
  const T=(content:string)=>({type:10,content});
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x19d3d3,components:[
    T(`# 📊 Stats de ${label}`),
    T(`-# Mis à jour <t:${Math.floor(Date.now()/1000)}:R> · toutes les 5 minutes`),
    {type:14,divider:true,spacing:2},
    T(`### 💰 Conversion\nFTD connus : **${t.n}** · dépôts connus : **${t.eur} €**\nArgent versé ce mois : **${out.eur} €** (${out.n} paiements) · en attente : **${pending.n}** (${pending.eur} €)`),
    T(`### 🎰 Par casino\n${lines.join('\n')}`),
    {type:14,divider:true,spacing:2},
    T(`### 👥 Audience\nDiscord : **${guild.memberCount}** membres · **+${members.joins}** arrivées · **−${members.leaves}** départs · net **${net>=0?'+':''}${net}**\n${followerLine}`),
    T('-# FTD connus = dépôts passés par nos tickets (remboursements validés, dépôts offerts et remboursements versés sur un nouveau compte). Les chiffres complets restent ceux des dashboards affiliés.'),
  ]}] as never[]};
}

async function tick(client:Client,pool:Pool){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await refreshBrands(guild).catch(()=>undefined);
  const key=(await pool.query(`SELECT to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM') m`)).rows[0].m as string;
  let month=(await pool.query(`SELECT * FROM belva_stats_months WHERE guild_id=$1 AND month=$2`,[GUILD_ID(),key])).rows[0];
  const channel=await statsChannel(guild);
  if(month){
    const msg=await channel.messages.fetch(month.message_id).catch(()=>null);
    if(msg){await msg.edit(await buildStats(pool,guild,month));return;}
  }
  const followers=(await pool.query(`SELECT i.followers_count FROM streamer_rumble_info i JOIN streamers s ON s.id=i.streamer_id WHERE lower(s.slug)=$1`,[RUMBLE_SLUG]).catch(()=>({rows:[]}))).rows[0]?.followers_count??null;
  month={followers_start:month?.followers_start??followers,members_start:month?.members_start??guild.memberCount};
  const msg=await channel.send(await buildStats(pool,guild,month));
  await pool.query(`INSERT INTO belva_stats_months (guild_id,month,channel_id,message_id,followers_start,members_start) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (guild_id,month) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id`,[GUILD_ID(),key,channel.id,msg.id,month.followers_start,month.members_start]);
}

export async function startBelvaStats(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_STATS_ENABLED==='false')return;
  await ensureStatsTables(pool);
  const log=(kind:'join'|'leave',guildId:string,userId:string)=>{if(guildId===GUILD_ID())void pool.query(`INSERT INTO belva_member_events (guild_id,discord_id,kind) VALUES ($1,$2,$3)`,[guildId,userId,kind]).catch(e=>console.error('[nozebot] stats Belva',e));};
  client.on(Events.GuildMemberAdd,m=>log('join',m.guild.id,m.id));
  client.on(Events.GuildMemberRemove,m=>log('leave',m.guild.id,m.id));
  let running=false;
  const run=()=>{if(running)return;running=true;void tick(client,pool).catch(e=>console.error('[nozebot] stats Belva',e)).finally(()=>{running=false;});};
  run();setInterval(run,5*60_000).unref();
}
