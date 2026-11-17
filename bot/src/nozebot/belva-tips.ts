import {ChannelType,EmbedBuilder,type Client,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';

// Suite d'un !tips tapé dans le chat de Belva : MP au joueur et note pour le staff (le tip lui-même se fait sur le casino).
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
export function tipDm(by:string,amount:number|null){
  return {embeds:[new EmbedBuilder().setColor(0x2FBF71).setTitle('💸 Un tip arrive !')
    .setDescription(`**${by}** vient d’annoncer un tip${amount?` de **${amount} €**`:''} pour toi pendant le live de Belva. Il arrive sur ton compte casino vérifié.\n\n-# Merci pour ton call et ta présence. 🔞 18+ · Joue de façon responsable.`)]};
}

async function tick(client:Client,pool:Pool){
  const rows=(await pool.query(`SELECT * FROM belva_tips WHERE notified=false ORDER BY id LIMIT 20`).catch(()=>({rows:[]}))).rows;
  if(!rows.length)return;
  const guild=await client.guilds.fetch(GUILD_ID());
  const list=(await guild.channels.fetch()).find(c=>c?.type===ChannelType.GuildText&&c.name==='📋︱liste-remboursements') as TextChannel|undefined;
  const dmOn=await isApproved(pool,'tips');
  for(const t of rows){
    const done=(await pool.query(`UPDATE belva_tips SET notified=true WHERE id=$1 AND notified=false RETURNING 1`,[t.id])).rowCount;if(!done)continue;
    const amount=t.amount===null?null:Number(t.amount);
    await list?.send({content:`💸 Tip annoncé par **${t.by_name}** pour **${t.rumble_name}**${amount?` · ${amount} €`:''}${t.discord_id?` · <@${t.discord_id}>`:' · compte non relié'}`,allowedMentions:{parse:[]}});
    if(dmOn&&t.discord_id){const u=await client.users.fetch(t.discord_id).catch(()=>null);await u?.send(tipDm(t.by_name,amount)).catch(()=>undefined);}
  }
}

export function startBelvaTips(client:Client,pool?:Pool){
  if(!pool)return;let busy=false;
  setInterval(()=>{if(busy)return;busy=true;void tick(client,pool).catch(e=>console.error('[nozebot] tips Belva',e)).finally(()=>{busy=false;});},30_000).unref();
}
