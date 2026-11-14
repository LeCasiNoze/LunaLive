import {ActionRowBuilder,ChannelType,EmbedBuilder,ModalBuilder,PermissionFlagsBits,TextInputBuilder,TextInputStyle,type Interaction} from 'discord.js';
import type {Pool} from 'pg';

export const BUTTON_RAINBET_VERIFY='nozebot:rainbet:verify';
const MODAL_RAINBET='nozebot:rainbet:modal';
const INPUT_RAINBET_USERNAME='nozebot:rainbet:username';
const ROLE_ID=()=>process.env.NOZEBOT_RAINBET_ROLE_ID?.trim()||'1569126447577038908';
const LOG_CHANNEL_ID=()=>process.env.NOZEBOT_AFFILIATE_LOG_CHANNEL_ID?.trim()||'1424038780792209548';
const TABLE='nozebot_rainbet_links';

export type ReferredUser={username:string;id:string;signed_up_at?:string};
const normalize=(name:string)=>name.trim().replace(/^@/,'').toLowerCase();

export function findReferred(users:readonly ReferredUser[],input:string):ReferredUser|null{
  const wanted=normalize(input);
  return wanted?users.find(u=>typeof u.username==='string'&&normalize(u.username)===wanted&&u.id)??null:null;
}

// RainBet caches this list for up to 10 minutes; one shared copy avoids hammering their API.
let cached:{at:number;users:ReferredUser[]}|null=null;
export async function referredUsers():Promise<ReferredUser[]>{
  if(cached&&Date.now()-cached.at<60_000)return cached.users;
  const key=process.env.RAINBET_AFFILIATE_API_KEY?.trim();
  if(!key)throw Error('RAINBET_AFFILIATE_API_KEY absent');
  const r=await fetch('https://services.rainbet.com/v1/external/affiliates/users?key='+encodeURIComponent(key),{headers:{Accept:'application/json','User-Agent':'NozeBot/1.0'},signal:AbortSignal.timeout(15_000)});
  const body=await r.json().catch(()=>null) as {affiliates?:ReferredUser[];error?:string}|null;
  if(!r.ok||!Array.isArray(body?.affiliates))throw Error(`RainBet API ${r.status} ${body?.error??''}`.trim());
  cached={at:Date.now(),users:body!.affiliates};
  return cached.users;
}

let tableReady=false;
async function ensureTable(pool:Pool){
  if(tableReady)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (rainbet_id TEXT PRIMARY KEY, rainbet_username TEXT NOT NULL, discord_id TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  tableReady=true;
}

export function rainbetVerifyModal(){
  return new ModalBuilder().setCustomId(MODAL_RAINBET).setTitle('Vérifier mon compte RainBet').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(INPUT_RAINBET_USERNAME)
      .setLabel('Ton pseudo RainBet').setPlaceholder('Exactement comme sur ton profil RainBet').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(40)));
}

const lastAttempt=new Map<string,number>();

export async function handleRainbetVerification(interaction:Interaction,guildId:string,pool?:Pool):Promise<boolean>{
  if(interaction.isButton()&&interaction.customId===BUTTON_RAINBET_VERIFY){
    await interaction.showModal(rainbetVerifyModal());
    return true;
  }
  if(!interaction.isModalSubmit()||interaction.customId!==MODAL_RAINBET)return false;
  if(!interaction.guild||interaction.guildId!==guildId)return true;
  await interaction.deferReply({ephemeral:true});
  const now=Date.now();
  if(now-(lastAttempt.get(interaction.user.id)??0)<20_000){await interaction.editReply('Patiente quelques secondes avant de réessayer.');return true;}
  lastAttempt.set(interaction.user.id,now);
  if(!pool){await interaction.editReply('La vérification RainBet est momentanément indisponible. Réessaie plus tard ou ouvre un ticket.');return true;}
  const input=interaction.fields.getTextInputValue(INPUT_RAINBET_USERNAME).trim();
  const referred=findReferred(await referredUsers(),input);
  const log=async(status:string,color:number)=>{
    const channel=await interaction.guild!.channels.fetch(LOG_CHANNEL_ID()).catch(()=>null);
    if(channel?.type!==ChannelType.GuildText)return;
    await channel.send({allowedMentions:{parse:[]},embeds:[new EmbedBuilder().setColor(color).setTitle('Vérification RainBet').addFields(
      {name:'Membre',value:`<@${interaction.user.id}>\n\`${interaction.user.id}\``,inline:true},
      {name:'Pseudo saisi',value:input.replace(/[`\\*_~|]/g,'').slice(0,40)||'—',inline:true},
      {name:'Résultat',value:status,inline:false}).setTimestamp()]}).catch(()=>undefined);
  };
  if(!referred){
    await log('❌ Pseudo absent des inscrits avec le code nivoranet',0xe63946);
    await interaction.editReply('Ce pseudo n’apparaît pas parmi les comptes inscrits avec notre lien RainBet. Vérifie l’orthographe exacte de ton pseudo. Si tu viens de t’inscrire, la liste RainBet peut mettre une dizaine de minutes à se mettre à jour. En cas de souci, ouvre un ticket « Vérification d’affiliation ».');
    return true;
  }
  await ensureTable(pool);
  await pool.query(`INSERT INTO ${TABLE} (rainbet_id,rainbet_username,discord_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[referred.id,referred.username,interaction.user.id]);
  const owner=(await pool.query(`SELECT rainbet_id,discord_id FROM ${TABLE} WHERE rainbet_id=$1 OR discord_id=$2`,[referred.id,interaction.user.id])).rows as {rainbet_id:string;discord_id:string}[];
  if(owner.some(row=>row.rainbet_id===referred.id&&row.discord_id!==interaction.user.id)){
    await log('⚠️ Pseudo affilié déjà lié à un autre compte Discord',0xf4c95d);
    await interaction.editReply('Ce compte RainBet est déjà lié à un autre compte Discord. Ouvre un ticket « Vérification d’affiliation » si c’est bien le tien.');
    return true;
  }
  if(owner.some(row=>row.discord_id===interaction.user.id&&row.rainbet_id!==referred.id)){
    await log('⚠️ Ce membre a déjà lié un autre compte RainBet',0xf4c95d);
    await interaction.editReply('Ton compte Discord est déjà lié à un autre compte RainBet. Ouvre un ticket « Vérification d’affiliation » pour le modifier.');
    return true;
  }
  const member=await interaction.guild.members.fetch(interaction.user.id);
  const me=await interaction.guild.members.fetchMe();
  if(!me.permissions.has(PermissionFlagsBits.ManageRoles))throw Error('ManageRoles manquant');
  if(!member.roles.cache.has(ROLE_ID()))await member.roles.add(ROLE_ID(),'Compte RainBet affilié vérifié');
  await log(`✅ Affilié vérifié · rôle <@&${ROLE_ID()}> attribué`,0x2ecc71);
  await interaction.editReply(`Compte RainBet vérifié ✅ Tu as maintenant le rôle <@&${ROLE_ID()}>.`);
  return true;
}
