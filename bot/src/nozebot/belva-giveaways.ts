import {randomInt} from 'node:crypto';
import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,LabelBuilder,ModalBuilder,PermissionFlagsBits,StringSelectMenuBuilder,
  TextInputBuilder,TextInputStyle,type Client,type Guild,type Interaction,type TextChannel,
} from 'discord.js';
import type {Pool} from 'pg';
import {BELVA_ROLES,CASINO_ROLES} from './belva-roles.js';

// Belva's server: giveaways launched by Patron/Videur from a staff panel, drawn automatically at the end.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PATRON_ROLE='1482854912059511006';
const VIDEUR_ROLE='1483165106140352632';
const GIVEAWAY_CHANNEL='1481938142905766008';
const PANEL_CHANNEL='1571169967054000139';
const P='belva:g:';
const ID={start:P+'start',modal:P+'modal',enter:P+'enter:',reroll:P+'reroll:'};

// Who may enter; the giveaway pings this role (or the giveaway-notification role when open to everyone).
export const ELIGIBILITY:Record<string,{label:string;emoji:string;role:string|null}>={
  all:{label:'Tout le serveur',emoji:'🌍',role:null},
  membre:{label:'Membres du Club (compte casino vérifié)',emoji:'🃏',role:BELVA_ROLES.membre},
  carre:{label:'Carré Or (a déjà déposé)',emoji:'🍾',role:BELVA_ROLES.carreOr},
  hazcasino:{label:'Vérifiés HazCasino',emoji:'💜',role:CASINO_ROLES.hazcasino},
  velobet:{label:'Vérifiés VeloBet',emoji:'💚',role:CASINO_ROLES.velobet},
  boo:{label:'Vérifiés Boo!',emoji:'🩵',role:CASINO_ROLES.boo},
  celsius:{label:'Vérifiés Celsius',emoji:'🧡',role:CASINO_ROLES.celsius},
  rainbet:{label:'Vérifiés Rainbet',emoji:'🌧️',role:CASINO_ROLES.rainbet},
};

export function parseDuration(text:string):number|null{
  const unit:Record<string,number>={j:86_400_000,d:86_400_000,h:3_600_000,m:60_000};
  const s=text.toLowerCase().replace(/\s+/g,'');
  if(!/^(\d+[jdhm])+$/.test(s))return null;
  let ms=0;for(const m of s.matchAll(/(\d+)([jdhm])/g))ms+=Number(m[1])*unit[m[2]];
  return ms>=60_000&&ms<=30*86_400_000?ms:null;
}

let ready=false;
async function ensureTables(pool:Pool){
  if(ready)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_giveaways (
    id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT, prize TEXT NOT NULL, details TEXT,
    winners INT NOT NULL, eligibility TEXT NOT NULL, ends_at TIMESTAMPTZ NOT NULL, created_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running', winner_ids TEXT[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_giveaway_entries (
    giveaway_id INT NOT NULL REFERENCES belva_giveaways(id) ON DELETE CASCADE, discord_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (giveaway_id,discord_id))`);
  ready=true;
}

type Giveaway={id:number;channel_id:string;message_id:string|null;prize:string;details:string|null;winners:number;eligibility:string;
  ends_at:Date;created_by:string;status:string;winner_ids:string[]};

export function staffPanel(){
  return {embeds:[new EmbedBuilder().setColor(0xf5d58a).setTitle('🎛️ Lancer un giveaway')
      .setDescription(['Clique sur le bouton, remplis le gain, le nombre de gagnants, la durée et qui peut participer.',
        `Le giveaway est posté dans <#${GIVEAWAY_CHANNEL}> avec un ping du bon rôle, et le tirage se fait tout seul à la fin.`,
        '','Durée : `30m`, `2h`, `1j`, `1j12h`… (max 30 jours).'].join('\n'))],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ID.start).setLabel('Nouveau giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success))]};
}

export function giveawayModal(){
  return new ModalBuilder().setCustomId(ID.modal).setTitle('Nouveau giveaway').addLabelComponents(
    new LabelBuilder().setLabel('Gain').setDescription('Ex. 50 € en crypto, 2x25 €…')
      .setTextInputComponent(new TextInputBuilder().setCustomId('prize').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(100).setRequired(true)),
    new LabelBuilder().setLabel('Nombre de gagnants')
      .setTextInputComponent(new TextInputBuilder().setCustomId('winners').setStyle(TextInputStyle.Short).setValue('1').setMinLength(1).setMaxLength(2).setRequired(true)),
    new LabelBuilder().setLabel('Durée').setDescription('30m, 2h, 1j, 1j12h…')
      .setTextInputComponent(new TextInputBuilder().setCustomId('duration').setStyle(TextInputStyle.Short).setValue('24h').setMinLength(2).setMaxLength(12).setRequired(true)),
    new LabelBuilder().setLabel('Qui peut participer ?')
      .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('eligibility').setMinValues(1).setMaxValues(1)
        .addOptions(Object.entries(ELIGIBILITY).map(([value,e])=>({value,label:e.label,emoji:e.emoji,default:value==='all'})))),
    new LabelBuilder().setLabel('Règles / détails (facultatif)')
      .setTextInputComponent(new TextInputBuilder().setCustomId('details').setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(false)),
  );
}

const ts=(d:Date)=>Math.floor(new Date(d).getTime()/1000);

function giveawayMessage(g:Giveaway,entries:number){
  const e=ELIGIBILITY[g.eligibility]??ELIGIBILITY.all;const ended=g.status==='ended';
  const embed=new EmbedBuilder().setColor(ended?0x94a3b8:0xff4f81).setTitle(`🎉 ${g.prize}`)
    .setDescription([
      ...(g.details?[g.details,'']:[]),
      `🏆 **${g.winners}** gagnant${g.winners>1?'s':''}`,
      `${e.emoji} **Participants :** ${e.role?`<@&${e.role}>`:'tout le serveur'}`,
      ended?`⏹️ Terminé <t:${ts(g.ends_at)}:R>`:`⏳ Fin <t:${ts(g.ends_at)}:R> (<t:${ts(g.ends_at)}:f>)`,
      `👥 **${entries}** participant${entries>1?'s':''}`,
      ...(ended?['',g.winner_ids.length?`🥳 **Gagnant${g.winner_ids.length>1?'s':''} :** ${g.winner_ids.map(id=>`<@${id}>`).join(', ')}`:'Aucun participant éligible.']:[]),
    ].join('\n'))
    .setFooter({text:`Giveaway n°${g.id} · 18+ · Joue de façon responsable`});
  return {embeds:[embed],components:ended?[]:[new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ID.enter+g.id).setLabel('Participer').setEmoji('🎉').setStyle(ButtonStyle.Primary))],allowedMentions:{parse:[] as never[]}};
}

const isStaff=async(guild:Guild,userId:string)=>{
  const m=await guild.members.fetch(userId);
  return m.roles.cache.has(PATRON_ROLE)||m.roles.cache.has(VIDEUR_ROLE)||m.permissions.has(PermissionFlagsBits.Administrator);
};
const count=async(pool:Pool,id:number)=>Number((await pool.query(`SELECT count(*) FROM belva_giveaway_entries WHERE giveaway_id=$1`,[id])).rows[0].count);
const get=async(pool:Pool,id:number)=>(await pool.query(`SELECT * FROM belva_giveaways WHERE id=$1 AND guild_id=$2`,[id,GUILD_ID()])).rows[0] as Giveaway|undefined;

async function draw(guild:Guild,pool:Pool,g:Giveaway,howMany:number,exclude:string[]){
  const role=ELIGIBILITY[g.eligibility]?.role??null;
  const pool_=(await pool.query(`SELECT discord_id FROM belva_giveaway_entries WHERE giveaway_id=$1`,[g.id])).rows.map(r=>r.discord_id as string).filter(id=>!exclude.includes(id));
  const out:string[]=[];
  while(pool_.length&&out.length<howMany){
    const [id]=pool_.splice(randomInt(pool_.length),1);
    const m=await guild.members.fetch(id).catch(()=>null);
    if(m&&(!role||m.roles.cache.has(role)))out.push(id);
  }
  return out;
}

async function finish(client:Client,pool:Pool,g:Giveaway){
  const guild=await client.guilds.fetch(GUILD_ID());
  const claimed=(await pool.query(`UPDATE belva_giveaways SET status='ended' WHERE id=$1 AND status='running' RETURNING id`,[g.id])).rowCount;
  if(!claimed)return;
  const winners=await draw(guild,pool,g,g.winners,[]);
  await pool.query(`UPDATE belva_giveaways SET winner_ids=$1 WHERE id=$2`,[winners,g.id]);
  const fresh=(await get(pool,g.id))!;
  const channel=await client.channels.fetch(g.channel_id).catch(()=>null) as TextChannel|null;
  if(!channel)return;
  const msg=g.message_id?await channel.messages.fetch(g.message_id).catch(()=>null):null;
  await msg?.edit(giveawayMessage(fresh,await count(pool,g.id))).catch(()=>undefined);
  await channel.send({content:winners.length?`🎉 Félicitations ${winners.map(id=>`<@${id}>`).join(', ')} ! Vous gagnez **${g.prize}**. Ouvrez un ticket pour récupérer votre gain.`
    :`Giveaway **${g.prize}** terminé : aucun participant éligible.`,allowedMentions:{users:winners},...(msg?{reply:{messageReference:msg.id,failIfNotExists:false}}:{})});
  const panel=await client.channels.fetch(PANEL_CHANNEL).catch(()=>null) as TextChannel|null;
  await panel?.send({content:`Giveaway n°${g.id} **${g.prize}** terminé · gagnant(s) : ${winners.map(id=>`<@${id}>`).join(', ')||'aucun'}`,allowedMentions:{parse:[]},
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(ID.reroll+g.id).setLabel('Retirer un gagnant au sort').setEmoji('🔁').setStyle(ButtonStyle.Secondary))]});
}

export async function handleBelvaGiveaways(i:Interaction,pool?:Pool):Promise<boolean>{
  const cid='customId' in i?String(i.customId):'';
  if(!cid.startsWith(P))return false;
  if(!i.guild||i.guildId!==GUILD_ID()||!i.isRepliable())return true;
  if(!pool){await i.reply({ephemeral:true,content:'Giveaways momentanément indisponibles.'});return true;}
  await ensureTables(pool);

  if(i.isButton()&&cid===ID.start){
    if(!await isStaff(i.guild,i.user.id)){await i.reply({ephemeral:true,content:'Réservé au Patron et aux Videurs.'});return true;}
    await i.showModal(giveawayModal());return true;
  }
  if(i.isModalSubmit()&&cid===ID.modal){
    await i.deferReply({ephemeral:true});
    if(!await isStaff(i.guild,i.user.id)){await i.editReply('Réservé au Patron et aux Videurs.');return true;}
    const prize=i.fields.getTextInputValue('prize').replace(/@/g,'').trim();
    const winners=Number(i.fields.getTextInputValue('winners').trim());
    const ms=parseDuration(i.fields.getTextInputValue('duration'));
    const eligibility=i.fields.getStringSelectValues('eligibility')[0]??'all';
    const details=i.fields.getTextInputValue('details')?.replace(/@(everyone|here)/g,'').trim()||null;
    if(!Number.isInteger(winners)||winners<1||winners>50){await i.editReply('Nombre de gagnants invalide (1 à 50).');return true;}
    if(!ms){await i.editReply('Durée invalide. Exemples : `30m`, `2h`, `1j`, `1j12h` (entre 1 minute et 30 jours).');return true;}
    if(!ELIGIBILITY[eligibility]){await i.editReply('Choix de participants invalide.');return true;}
    const channel=await i.guild.channels.fetch(GIVEAWAY_CHANNEL).catch(()=>null);
    if(channel?.type!==ChannelType.GuildText){await i.editReply('Salon giveaways introuvable.');return true;}
    const g=(await pool.query(`INSERT INTO belva_giveaways (guild_id,channel_id,prize,details,winners,eligibility,ends_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [GUILD_ID(),channel.id,prize,details,winners,eligibility,new Date(Date.now()+ms),i.user.id])).rows[0] as Giveaway;
    const ping=ELIGIBILITY[eligibility].role??BELVA_ROLES.notifGiveaways;
    const msg=await channel.send({content:`<@&${ping}> 🎉 **Nouveau giveaway !**`,...giveawayMessage(g,0),allowedMentions:{roles:[ping]}});
    await pool.query(`UPDATE belva_giveaways SET message_id=$1 WHERE id=$2`,[msg.id,g.id]);
    await i.editReply(`✅ Giveaway n°${g.id} lancé : ${msg.url}`);
    return true;
  }
  if(i.isButton()&&cid.startsWith(ID.enter)){
    const g=await get(pool,Number(cid.slice(ID.enter.length)));
    if(!g||g.status!=='running'||new Date(g.ends_at).getTime()<=Date.now()){await i.reply({ephemeral:true,content:'Ce giveaway est terminé.'});return true;}
    const role=ELIGIBILITY[g.eligibility]?.role;
    if(role){
      const m=await i.guild.members.fetch(i.user.id);
      if(!m.roles.cache.has(role)){await i.reply({ephemeral:true,content:`Ce giveaway est réservé au rôle <@&${role}>. Vérifie ton compte dans les salons d’offres pour l’obtenir.`});return true;}
    }
    const left=(await pool.query(`DELETE FROM belva_giveaway_entries WHERE giveaway_id=$1 AND discord_id=$2`,[g.id,i.user.id])).rowCount;
    if(!left)await pool.query(`INSERT INTO belva_giveaway_entries (giveaway_id,discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[g.id,i.user.id]);
    await i.update(giveawayMessage(g,await count(pool,g.id)));
    await i.followUp({ephemeral:true,content:left?'Tu ne participes plus à ce giveaway. Reclique pour revenir.':'✅ Tu participes ! Bonne chance 🍀 (reclique pour te retirer)'});
    return true;
  }
  if(i.isButton()&&cid.startsWith(ID.reroll)){
    if(!await isStaff(i.guild,i.user.id)){await i.reply({ephemeral:true,content:'Réservé au Patron et aux Videurs.'});return true;}
    const g=await get(pool,Number(cid.slice(ID.reroll.length)));
    if(!g||g.status!=='ended'){await i.reply({ephemeral:true,content:'Giveaway introuvable ou pas terminé.'});return true;}
    await i.deferReply({ephemeral:true});
    const [w]=await draw(i.guild,pool,g,1,g.winner_ids);
    if(!w){await i.editReply('Plus aucun participant éligible à tirer.');return true;}
    await pool.query(`UPDATE belva_giveaways SET winner_ids=array_append(winner_ids,$1) WHERE id=$2`,[w,g.id]);
    const channel=await i.guild.channels.fetch(g.channel_id).catch(()=>null) as TextChannel|null;
    await channel?.send({content:`🔁 Nouveau tirage pour **${g.prize}** : félicitations <@${w}> ! Ouvre un ticket pour récupérer ton gain.`,allowedMentions:{users:[w]}});
    await i.editReply(`Nouveau gagnant : <@${w}>`);
    return true;
  }
  return true;
}

export async function startBelvaGiveaways(client:Client,pool?:Pool){
  if(process.env.BELVA_TICKETS_ENABLED==='false'||!pool)return;
  await ensureTables(pool);
  const panel=await client.channels.fetch(PANEL_CHANNEL).catch(()=>null);
  if(panel?.type===ChannelType.GuildText){
    const recent=await panel.messages.fetch({limit:30});
    if(!recent.some(m=>m.author.id===client.user!.id&&JSON.stringify(m.components.map(r=>r.toJSON())).includes(ID.start)))await panel.send(staffPanel());
  }
  let busy=false;
  setInterval(()=>{
    if(busy)return;busy=true;
    void (async()=>{
      const due=(await pool.query(`SELECT * FROM belva_giveaways WHERE guild_id=$1 AND status='running' AND ends_at<=now()`,[GUILD_ID()])).rows as Giveaway[];
      for(const g of due)await finish(client,pool,g).catch(e=>console.error('[nozebot] fin giveaway Belva',g.id,e));
    })().catch(e=>console.error('[nozebot] giveaways Belva',e)).finally(()=>{busy=false;});
  },30_000).unref();
}
