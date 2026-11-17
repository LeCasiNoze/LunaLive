import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,SlashCommandBuilder,type Client,type Interaction} from 'discord.js';
import {LunaLiveApiError,checkBelvaCommentLink,requestAutomodLink,type LunaLiveApiConfig} from './lunalive-api.js';
import {LINK_BUTTON} from './belva-info.js';

// /lier sur le Discord de Belva : en live, la commande se colle dans le chat ; hors live, elle se poste en commentaire
// sous la dernière vidéo de Belva et le bouton « Vérifier » termine la liaison (le bouton marche aussi en MP).
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const STREAMER='belvaa';
const CHANNEL_URL='https://rumble.com/user/Belvaa';
const CHECK_BUTTON='belva:link:check';
const COMMAND=new SlashCommandBuilder().setName('lier').setDescription('Lier ton compte Rumble à ton compte Discord Belva');

export async function registerBelvaCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  // create() met à jour cette seule commande sans toucher aux autres commandes du serveur.
  await guild.commands.create(COMMAND.toJSON());
}

export const CHECK_TEXT={
  linked:(u?:string)=>`✅ C’est fait : ton compte Rumble **${u}** est relié à ton Discord.`,
  pending:(u?:string)=>`✅ Commentaire trouvé ! Ton compte **${u}** sera activé dès ton premier message dans le chat de Belva (tes BCoins et tes tickets y sont attachés).`,
  not_found:()=>'Je ne trouve pas encore ton commentaire. Vérifie qu’il contient la commande complète (`!lier …`) sous la dernière vidéo de Belva, puis réessaie dans 30 secondes.',
  no_code:()=>'Ta commande a expiré (10 minutes) : reclique sur **Lier mon Rumble** dans le serveur.',
  conflict:()=>'Ce compte Rumble ou ce Discord est déjà lié à un autre compte. Ouvre un ticket pour changer la liaison.',
  unavailable:()=>'Rumble ne répond pas pour le moment. Réessaie dans une minute.',
};

export async function handleBelvaLink(interaction:Interaction,config:LunaLiveApiConfig):Promise<boolean>{
  if(interaction.isButton()&&interaction.customId===CHECK_BUTTON){
    await interaction.deferReply({ephemeral:true});
    const r=await checkBelvaCommentLink(config,interaction.user.id).catch(()=>({status:'unavailable' as const,username:undefined}));
    await interaction.editReply(CHECK_TEXT[r.status](r.username));
    return true;
  }
  const slash=interaction.isChatInputCommand()&&interaction.commandName==='lier';
  const button=interaction.isButton()&&interaction.customId===LINK_BUTTON;
  if((!slash&&!button)||interaction.guildId!==GUILD_ID()||!interaction.isRepliable())return false;
  await interaction.deferReply({ephemeral:true});
  try{
    const link=await requestAutomodLink(config,interaction.user.id,STREAMER);
    if(link.linked){await interaction.editReply(`✅ Ton compte Rumble **${link.username}** est déjà lié.`);return true;}
    const t=link.targets??{live:false,liveUrl:`${CHANNEL_URL}/live`,videoUrl:CHANNEL_URL};
    const {embed,buttons}=linkDm(t);
    const dm=await interaction.user.send({embeds:[embed]}).then(()=>interaction.user.send({content:link.command!,components:[buttons]})).then(()=>true).catch(()=>false);
    await interaction.editReply(dm?'📩 Je t’ai envoyé la marche à suivre en message privé.'
      :{content:`Je n’ai pas pu t’écrire en privé (MP fermés). Voici ta commande :\n\`${link.command}\`\n${t.live?'Colle-la dans le chat du live de Belva, ou p':'P'}oste-la en commentaire sous [la dernière vidéo de Belva](${t.videoUrl}), puis clique sur Vérifier.\n-# Valable 10 minutes.`,components:[buttons]});
  }catch(e){
    await interaction.editReply(e instanceof LunaLiveApiError&&e.code==='link_cooldown'?'Patiente une minute avant de redemander une commande.':'Liaison indisponible pour le moment. Réessaie dans un instant.');
  }
  return true;
}

export function linkDm(t:{live:boolean;liveUrl:string;videoUrl:string}){
  const embed=new EmbedBuilder().setColor(0x19d3d3).setTitle('🔗 Lier ton compte Rumble').setDescription([
    t.live?'🟢 **Belva est en live !** Colle la commande ci-dessous dans son chat Rumble : le bot te répond tout de suite.'
      :'⚫ **Belva n’est pas en live**, pas de souci :',
    '',
    `${t.live?'**Ou, hors live :**':'**1 ·**'} poste la commande ci-dessous en **commentaire** sous [la dernière vidéo de Belva](${t.videoUrl}).`,
    `${t.live?'puis':'**2 ·**'} clique sur **Vérifier mon commentaire** : c’est lié.`,
    '',
    `-# Abonne-toi à la chaîne pour les prochains lives : ${CHANNEL_URL}`,
    '-# La commande est valable 10 minutes et ne sert qu’une fois.',
  ].join('\n'));
  const buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(t.live?[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir le live').setEmoji('🟢').setURL(t.liveUrl)]:[]),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir la vidéo').setEmoji('💬').setURL(t.videoUrl),
    new ButtonBuilder().setCustomId(CHECK_BUTTON).setStyle(ButtonStyle.Success).setLabel('Vérifier mon commentaire').setEmoji('✅'));
  return {embed,buttons};
}

// Réponse quand une commande a besoin du compte Rumble relié (/blackjack, /claim, /slot, /bcoins, /tournoi…).
export function linkPrompt(reason:string){
  return {embeds:[new EmbedBuilder().setColor(0x19d3d3).setTitle('🔗 Relie ton compte Rumble').setDescription([
      reason,'',
      '**30 secondes, une seule fois :** clique sur **Lier mon Rumble**. Le bot t’envoie une commande en message privé :',
      '> 🟢 Belva en live → colle-la dans son chat Rumble',
      '> ⚫ Hors live → poste-la en commentaire sous sa dernière vidéo, puis clique sur **Vérifier**',
    ].join('\n')).setFooter({text:'Belva • tes BCoins, ton XP et tes tickets sont attachés à ton pseudo Rumble'})],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(LINK_BUTTON).setStyle(ButtonStyle.Primary).setLabel('Lier mon Rumble').setEmoji('🔗'),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Voir le live').setEmoji('🟢').setURL(`${CHANNEL_URL}/live`))]};
}
