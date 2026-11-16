import {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,SlashCommandBuilder,type Client,type Interaction} from 'discord.js';
import {LunaLiveApiError,bcoinRequest,type LunaLiveApiConfig,type LunaLiveBlackjack} from './lunalive-api.js';
import {renderBlackjackTable} from './blackjack-renderer.js';
import {revealCoinSlot} from './coin-reveal.js';
import {formatCoinSlot} from './commands.js';

// Mini-jeux du Discord de Belva en BCoins : mêmes jeux et même affichage que les NozeCoins du Discord LeCasiNoze.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const COIN='BCoins';
const COMMANDS=[
  new SlashCommandBuilder().setName('bcoins').setDescription('Ton solde de BCoins et ton profil de joueur Belva'),
  new SlashCommandBuilder().setName('claim').setDescription('Récupérer tes BCoins quotidiens'),
  new SlashCommandBuilder().setName('slot').setDescription('Lancer la machine à sous en BCoins'),
  new SlashCommandBuilder().setName('blackjack').setDescription('Une partie de blackjack en BCoins (mise 20)'),
];
const NAMES=new Set(COMMANDS.map(c=>c.name));

export async function registerBelvaGameCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  for(const c of COMMANDS)await guild.commands.create(c.toJSON());
}

const ts=(iso:string)=>`<t:${Math.floor(new Date(iso).getTime()/1000)}:R>`;
type Bj=LunaLiveBlackjack;

function bjButtons(g:Bj){
  const off=g.status==='finished';
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`belva:bj:${g.sessionId}:hit`).setLabel('Piocher').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(off||!g.actions.hit),
    new ButtonBuilder().setCustomId(`belva:bj:${g.sessionId}:stand`).setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(off||!g.actions.stand),
    new ButtonBuilder().setCustomId(`belva:bj:${g.sessionId}:double`).setLabel('Doubler').setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(off||!g.actions.double),
    new ButtonBuilder().setCustomId(`belva:bj:${g.sessionId}:split`).setLabel('Splitter').setEmoji('⚡').setStyle(ButtonStyle.Secondary).setDisabled(off||!g.actions.split));
}

async function bjMessage(g:Bj,username:string){
  const name=`belva-blackjack-${g.sessionId}.png`;
  const r=g.result;
  const text=!r?'À toi de jouer. La partie est enregistrée : tu peux la reprendre avec ces boutons.'
    :`${r.perHand.map(h=>`**Main ${h.i}** · ${h.kind==='win'?'Victoire':h.kind==='push'?'Égalité':h.kind==='bust'?'BUST':'Défaite'} · ${h.total}`).join('\n')}\n\n## ${r.totalNet>=0?'+':'−'}${Math.abs(r.totalNet)} ${COIN}\nSolde : **${r.balance} ${COIN}**`;
  const embed=new EmbedBuilder().setColor(!r?0x19d3d3:r.totalNet>0?0x45e0a8:r.totalNet<0?0xff5470:0xe4c866)
    .setTitle(g.status==='finished'?'La table a tranché':'Faites vos jeux').setDescription(text).setImage(`attachment://${name}`)
    .addFields({name:'Mise',value:`20 ${COIN}`,inline:true},{name:'Solde',value:`${g.balance} ${COIN}`,inline:true})
    .setFooter({text:'Belva • BCoins gratuits, sans valeur monétaire, non échangeables'});
  return {embeds:[embed],components:[bjButtons(g)],files:[new AttachmentBuilder(await renderBlackjackTable(g,username),{name})]};
}

function errorText(e:unknown){
  const code=e instanceof LunaLiveApiError?e.code:'';
  if(code==='rumble_not_linked')return 'Relie d’abord ton compte Rumble avec **/lier** (ou dans 🔗︱lier-mon-compte) pour jouer avec tes BCoins.';
  if(code==='insufficient_coins'&&e instanceof LunaLiveApiError)return `Pas assez de BCoins : solde ${e.details.balance??0}, il en faut ${e.details.cost??20}. Récupère ton **/claim** quotidien.`;
  if(code==='cooldown'&&e instanceof LunaLiveApiError&&typeof e.details.nextAt==='string')return `Délai en cours. Reviens ${ts(e.details.nextAt)}.`;
  if(code==='session_forbidden')return 'Cette table appartient à un autre joueur. Lance la tienne avec **/blackjack**.';
  return 'Action non confirmée. Vérifie ton solde avec **/bcoins** avant de réessayer.';
}

export async function handleBelvaGames(interaction:Interaction,config:LunaLiveApiConfig):Promise<boolean>{
  if(interaction.guildId!==GUILD_ID())return false;
  if(interaction.isButton()&&interaction.customId.startsWith('belva:bj:')){
    const [,,sessionId,move]=interaction.customId.split(':');
    await interaction.deferUpdate();
    try{const r=await bcoinRequest<{game:Bj}>(config,interaction.user.id,'bj-act',{sessionId,move});await interaction.editReply(await bjMessage(r.game,interaction.user.username));}
    catch(e){await interaction.followUp({ephemeral:true,content:errorText(e)});}
    return true;
  }
  if(!interaction.isChatInputCommand()||!NAMES.has(interaction.commandName))return false;
  const cmd=interaction.commandName;
  await interaction.deferReply({ephemeral:cmd==='bcoins'||cmd==='claim'});
  try{
    if(cmd==='blackjack'){const r=await bcoinRequest<{game:Bj}>(config,interaction.user.id,'bj-start');await interaction.editReply(await bjMessage(r.game,interaction.user.username));return true;}
    if(cmd==='bcoins'){
      const {profile:p}=await bcoinRequest<{profile:{username:string;balance:number;nextClaimAt:string|null;rules:{claim:number;claimMs:number;bet:number}}}>(config,interaction.user.id,'profile');
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x19d3d3).setTitle(`${p.username} · Belva`).addFields(
        {name:COIN,value:`**${p.balance}**`,inline:true},
        {name:'Claim',value:`${p.rules.claim} / ${p.rules.claimMs/3_600_000} h`,inline:true},
        {name:'Prochain claim',value:p.nextClaimAt&&new Date(p.nextClaimAt).getTime()>Date.now()?ts(p.nextClaimAt):'Disponible · /claim',inline:true},
        {name:'Jeux',value:`/slot · mise ${p.rules.bet}\n/blackjack · mise 20`,inline:false})
        .setFooter({text:'BCoins gratuits, sans valeur monétaire, non échangeables'})]});
      return true;
    }
    const r=await bcoinRequest<{ok:boolean;nextAt?:string;delta:number;balance:number;art?:string;bet?:number;payout?:number;replayed?:boolean}>(config,interaction.user.id,cmd as 'claim'|'slot',{receipt:interaction.id});
    if(!r.ok){await interaction.editReply(`Délai en cours. Reviens ${r.nextAt?ts(r.nextAt):'plus tard'}.`);return true;}
    if(cmd==='claim'){await interaction.editReply(`+${r.delta} ${COIN} · Solde : **${r.balance} ${COIN}**${r.nextAt?`\nProchain claim ${ts(r.nextAt)}`:''}`);return true;}
    const final=`**${formatCoinSlot(String(r.art))}**\nMise : ${r.bet} · Retour : ${r.payout} ${COIN}\nSolde : **${r.balance}** ${COIN}`;
    // Le débit et le résultat sont déjà enregistrés avant l'animation.
    try{if(r.replayed)await interaction.editReply(final);else await revealCoinSlot(t=>interaction.editReply(t),String(r.art),final);}catch{await interaction.editReply(final).catch(()=>undefined);}
  }catch(e){await interaction.editReply(errorText(e));}
  return true;
}
