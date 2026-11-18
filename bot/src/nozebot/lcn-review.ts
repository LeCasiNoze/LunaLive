import {createHash} from 'node:crypto';
import {ChannelType,MessageFlags,PermissionFlagsBits,type Client,type Guild,type Interaction,type MessageCreateOptions,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {forgetApproval,isApproved,reviewSchema} from './belva-approval.js';
import {LCN_GUILD,findChannel,lcnName} from './belva-guilds.js';
import {LINK_CARDS,ensureLcnCards,lcnCards} from './lcn-cards.js';
import {belvaRaceCard} from './belva-race.js';
import {vipGuideCard} from './belva-vip-guide.js';
import {lcnRole} from './lcn-role-spec.js';
import * as L from './belva-layout.js';

// Salon de validation du Discord LeCasiNoze : chaque nouvelle carte y est d'abord postée avec Valider / À revoir
// (même table que chez Belva, clés « lcn-… »). Les designs identiques à ceux de Belva sont déjà validés là-bas.
const P='lcn:rv:';
type Design={key:string;title:string;where:string;previews:(client:Client)=>Promise<MessageCreateOptions[]>};
const v2=(p:object)=>({...p,allowedMentions:{parse:[]}}) as MessageCreateOptions;
const ADMIN='1188940226358415443',MODO='1188939890344329379';

export async function lcnGuideChannel(guild:Guild){
  return await findChannel(guild,'guide-vip')??await guild.channels.create({name:lcnName('📖','guide-vip'),type:ChannelType.GuildText,
    parent:guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&/communaut/i.test(c.name.normalize('NFKD').replace(/[^a-z]/gi,'')))?.id,
    topic:'Comment gagner de l’XP, les grades et ce qu’ils débloquent.'});
}
export async function lcnGuideCard(client:Client){
  const g=await client.guilds.fetch(LCN_GUILD());
  return vipGuideCard({offers:(await findChannel(g,'rainbet'))?.id,hunt:(await findChannel(g,'hunt'))?.id,tournament:(await findChannel(g,'tournoi'))?.id,guild:LCN_GUILD()},k=>lcnRole(k).name);
}

async function designs(client:Client):Promise<Design[]>{
  const cards=(await lcnCards(client)).map(c=>({key:c.key,title:c.title,where:c.key==='lcn-links'?'Salons RUMBLE, LUNALIVE, INSTAGRAM, YOUTUBE':`<#${c.channel}>`,
    previews:async()=>c.key==='lcn-links'?Object.values(LINK_CARDS).map(b=>v2(b())):[v2(c.build())]}));
  return [...cards,
    {key:'lcn-race',title:'Wager race Rainbet',where:'WAGER-RACE · ⚠️ Valider vide le salon et n’y laisse que cette carte',
      previews:async()=>[v2(await belvaRaceCard([{username:'Gotaz',wagered:1598},{username:'NicoCara',wagered:1366},{username:'Nicozap7339',wagered:4270}],[],new Date(Date.UTC(2026,10,20,12)),'LECASINOZE'))]},
    {key:'lcn-vip-guide',title:'Guide VIP (tes noms de grades)',where:'Nouveau salon GUIDE-VIP dans COMMUNAUTÉ',previews:async c=>[v2(await lcnGuideCard(c))]},
  ];
}

async function reviewChannel(guild:Guild){
  const found=await findChannel(guild,'validation-design');if(found)return found;
  const cat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&/moderation/i.test(c.name.normalize('NFKD').replace(/[^a-z]/gi,'')));
  return guild.channels.create({name:lcnName('🎨','validation-design'),type:ChannelType.GuildText,parent:cat?.id,
    topic:'Aperçus des cartes du bot à valider avant qu’elles passent en public.',
    permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:ADMIN,allow:[PermissionFlagsBits.ViewChannel]},{id:MODO,allow:[PermissionFlagsBits.ViewChannel]},
      {id:guild.client.user!.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles]}]}) as Promise<TextChannel>;
}

const verdict=(d:Design,row:{status:string;decided_by?:string|null})=>({flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,
  accent_color:row.status==='approved'?0x2FBF71:row.status==='rejected'?0xE8475F:0xF3C14B,components:[
  L.T(row.status==='approved'?`**✅ Validé** par <@${row.decided_by}> · « ${d.title} »`:row.status==='rejected'?`**🔁 À revoir** (<@${row.decided_by}>) · « ${d.title} »`:`**⏳ En attente de ta validation** · « ${d.title} »`),
  {type:1,components:[L.btn('Valider','✅',3,`${P}ok:${d.key}`),L.btn('À revoir','🔁',2,`${P}no:${d.key}`)]}]}] as never[]});

const versionOf=(d:Design,p:MessageCreateOptions[])=>createHash('sha1').update(d.title+d.where+JSON.stringify(p,(_k,v)=>Buffer.isBuffer(v)||v instanceof Uint8Array?'bin':v)).digest('hex').slice(0,12);

export async function ensureLcnReviews(client:Client,pool?:Pool){
  if(!pool||process.env.LCN_REVIEWS==='false')return;
  await reviewSchema(pool);
  const guild=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);if(!guild)return;
  const channel=await reviewChannel(guild);
  for(const [i,d] of (await designs(client)).entries()){
    const previews=await d.previews(client);const version=versionOf(d,previews);
    const row=(await pool.query(`SELECT * FROM belva_design_reviews WHERE key=$1`,[d.key])).rows[0];
    if(row?.version===version)continue;
    for(const id of row?.message_ids??[])await channel.messages.delete(id).catch(()=>undefined);
    const ids:string[]=[(await channel.send({content:`## ${i+1} · ${d.title}\n📍 ${d.where}${row?'\n-# 🔁 Nouvelle version : à revalider.':''}`,allowedMentions:{parse:[]}})).id];
    for(const p of previews)ids.push((await channel.send(p)).id);
    ids.push((await channel.send(verdict(d,{status:'pending'}))).id);
    await pool.query(`INSERT INTO belva_design_reviews(key,version,status,message_ids) VALUES($1,$2,'pending',$3)
      ON CONFLICT(key) DO UPDATE SET version=$2,status='pending',note=NULL,decided_by=NULL,decided_at=NULL,message_ids=$3,updated_at=NOW()`,[d.key,version,ids]);
    forgetApproval(d.key);
  }
}

export async function ensureLcnGuide(client:Client,pool?:Pool){
  if(!await isApproved(pool,'lcn-vip-guide'))return;
  const guild=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);if(!guild)return;
  const channel=await lcnGuideChannel(guild);const card=await lcnGuideCard(client);
  const mine=(await channel.messages.fetch({limit:10})).find(m=>m.author.id===client.user!.id);
  const sig=createHash('sha1').update(JSON.stringify(card.components)).digest('hex').slice(0,12);
  if(!mine)await channel.send({...card,components:[...card.components,L.T(`-# ${sig}`)] as never[]});
  else if(!JSON.stringify(mine.components.map(c=>c.toJSON())).includes(sig))await mine.edit({...card,components:[...card.components,L.T(`-# ${sig}`)] as never[]});
}

export async function handleLcnReview(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!i.isButton()||!i.customId.startsWith(P)||i.guildId!==LCN_GUILD())return false;
  if(!pool||!i.inCachedGuild())return true;
  const m=i.member;
  if(!(m.roles.cache.has(ADMIN)||m.roles.cache.has(MODO)||m.permissions.has(PermissionFlagsBits.Administrator))){await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
  const [action,key]=i.customId.slice(P.length).split(':');
  const d=(await designs(i.client)).find(x=>x.key===key);if(!d)return true;
  const status=action==='ok'?'approved':'rejected';
  const row=(await pool.query(`UPDATE belva_design_reviews SET status=$2,decided_by=$3,decided_at=NOW(),updated_at=NOW() WHERE key=$1 RETURNING *`,[key,status,i.user.id])).rows[0];
  await pool.query(`INSERT INTO belva_design_review_log(key,version,status,note,decided_by) VALUES($1,$2,$3,NULL,$4)`,[key,row?.version??null,status,i.user.id]);
  forgetApproval(key!);
  await i.update(verdict(d,row??{status}));
  if(status==='approved'){
    if(key==='lcn-vip-guide')await ensureLcnGuide(i.client,pool).catch(e=>console.error('[nozebot] guide VIP LeCasiNoze',e));
    else await ensureLcnCards(i.client,pool).catch(e=>console.error('[nozebot] cartes LeCasiNoze',e));
  }
  return true;
}

export function startLcnReviews(client:Client,pool?:Pool){
  if(!pool)return;
  const run=()=>void ensureLcnReviews(client,pool).then(()=>ensureLcnCards(client,pool)).then(()=>ensureLcnGuide(client,pool))
    .catch(e=>console.error('[nozebot] validation LeCasiNoze',e));
  setTimeout(run,50_000).unref();setInterval(run,15*60_000).unref();
}
