import {ChannelType,type Client,type Guild,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';

// Discord de LeCasiNoze synchronisé avec celui de Belva : mêmes events (tournoi, hunt), même progression.
// Les cartes de Belva sont recopiées à l'identique dans un salon du Discord LeCasiNoze (« miroir »).
export const BELVA_GUILD=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
export const LCN_GUILD=()=>process.env.LECASINOZE_GUILD_ID?.trim()||'1188913226990235800';
export const EVENT_GUILDS=()=>[BELVA_GUILD(),LCN_GUILD()];
export const isEventGuild=(id:string|null|undefined)=>!!id&&EVENT_GUILDS().includes(id);
// Comptes Rumble reliés : une liaison sur la chaîne de Belva ou de LeCasiNoze vaut pour les deux.
export const LINK_SLUGS=`('belvaa','lecasinoze')`;

// Style des noms de salons de LeCasiNoze : 〈emoji〉┃𝗡𝗢𝗠 (lettres en gras sans empattement).
export function boldSans(s:string){
  return [...s.normalize('NFD')].map(ch=>{const c=ch.codePointAt(0)!;
    if(c>=65&&c<=90)return String.fromCodePoint(0x1D5D4+c-65);
    if(c>=97&&c<=122)return String.fromCodePoint(0x1D5EE+c-97);
    if(c>=48&&c<=57)return String.fromCodePoint(0x1D7EC+c-48);
    return ch;}).join('').normalize('NFC');
}
export const lcnName=(emoji:string,name:string)=>`〈${emoji}〉┃${boldSans(name.toUpperCase())}`;
// Même salon, quel que soit le style : on compare les noms sans gras ni accents.
const plain=(s:string)=>[...s.normalize('NFKD')].filter(c=>/[a-z0-9-]/i.test(c)).join('').toLowerCase();
export async function findChannel(guild:Guild,name:string){
  const all=await guild.channels.fetch();
  return all.find(c=>c?.type===ChannelType.GuildText&&plain(c.name).endsWith(plain(name))) as TextChannel|undefined;
}
const COMMUNITY_CATEGORY=(guild:Guild)=>guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&plain(c.name).includes('communaute'))?.id;

// Salon du Discord LeCasiNoze qui reçoit le miroir d'une carte (créé dans COMMUNAUTÉ s'il n'existe pas).
export async function lcnChannel(client:Client,emoji:string,name:string,topic:string){
  const guild=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);if(!guild)return null;
  const found=await findChannel(guild,name);if(found)return found;
  return guild.channels.create({name:lcnName(emoji,name),type:ChannelType.GuildText,parent:COMMUNITY_CATEGORY(guild),topic})
    .catch(e=>{console.error('[nozebot] salon LeCasiNoze',name,e?.message||e);return null;});
}

let ready:Promise<unknown>|null=null;
const schema=(pool:Pool)=>ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_mirror_messages(kind text NOT NULL,ref text NOT NULL,guild_id text NOT NULL,
  channel_id text NOT NULL,message_id text NOT NULL,PRIMARY KEY(kind,ref,guild_id))`).catch(e=>{ready=null;throw e;});

// Publie ou met à jour la copie d'une carte dans le Discord LeCasiNoze.
export async function mirror(client:Client,pool:Pool,kind:string,ref:string|number,channel:TextChannel|null,payload:object){
  if(!channel)return;
  await schema(pool);
  const row=(await pool.query(`SELECT channel_id,message_id FROM belva_mirror_messages WHERE kind=$1 AND ref=$2 AND guild_id=$3`,[kind,String(ref),channel.guildId])).rows[0];
  const msg=row?.channel_id===channel.id?await channel.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg){await msg.edit({...payload,attachments:[]} as never).catch(e=>console.error('[nozebot] miroir',kind,e?.message||e));return;}
  const sent=await channel.send(payload as never).catch(e=>{console.error('[nozebot] miroir',kind,e?.message||e);return null;});
  if(sent)await pool.query(`INSERT INTO belva_mirror_messages(kind,ref,guild_id,channel_id,message_id) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(kind,ref,guild_id) DO UPDATE SET channel_id=$4,message_id=$5`,[kind,String(ref),channel.guildId,channel.id,sent.id]);
}

// Les comptes reliés sur une chaîne le sont aussi sur l'autre (même compte Rumble) : pseudo et rôles suivent sur les deux Discord.
export async function mirrorLinks(pool:Pool){
  await pool.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username,rumble_username_seen_at,created_at)
    SELECT t.id,l.discord_user_id,l.rumble_user_id,l.username,l.rumble_username_seen_at,l.created_at
    FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id AND lower(s.slug) IN ${LINK_SLUGS}
    JOIN streamers t ON lower(t.slug) IN ${LINK_SLUGS} AND t.id<>s.id
    ON CONFLICT DO NOTHING`);
}
