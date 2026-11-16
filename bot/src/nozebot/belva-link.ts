import {EmbedBuilder,SlashCommandBuilder,type Client,type Interaction} from 'discord.js';
import {LunaLiveApiError,requestAutomodLink,type LunaLiveApiConfig} from './lunalive-api.js';

// /lier sur le Discord de Belva : le bot envoie en MP une commande !lier à coller dans le chat Rumble de Belva.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const STREAMER='belvaa';
const COMMAND=new SlashCommandBuilder().setName('lier').setDescription('Lier ton compte Rumble à ton compte Discord Belva');

export async function registerBelvaCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  // create() met à jour cette seule commande sans toucher aux autres commandes du serveur.
  await guild.commands.create(COMMAND.toJSON());
}

export async function handleBelvaLink(interaction:Interaction,config:LunaLiveApiConfig):Promise<boolean>{
  if(!interaction.isChatInputCommand()||interaction.commandName!=='lier'||interaction.guildId!==GUILD_ID())return false;
  await interaction.deferReply({ephemeral:true});
  try{
    const link=await requestAutomodLink(config,interaction.user.id,STREAMER);
    if(link.linked){await interaction.editReply(`✅ Ton compte Rumble **${link.username}** est déjà lié.`);return true;}
    const steps=['1️⃣ Ouvre le **live de Belva** sur Rumble.','2️⃣ Copie la commande envoyée juste en dessous et colle-la dans le chat.','3️⃣ Le bot te répond dans le chat : c’est lié !','','-# La commande est valable 10 minutes et ne sert qu’une fois.'].join('\n');
    const embed=new EmbedBuilder().setColor(0x19d3d3).setTitle('🔗 Lier ton compte Rumble').setDescription(steps);
    const dm=await interaction.user.send({embeds:[embed]}).then(()=>interaction.user.send(link.command!)).then(()=>true).catch(()=>false);
    await interaction.editReply(dm?'📩 Je t’ai envoyé la commande en message privé.'
      :`Je n’ai pas pu t’écrire en privé (MP fermés). Colle cette commande dans le chat Rumble de Belva pendant un live :\n\`${link.command}\`\n-# Valable 10 minutes.`);
  }catch(e){
    await interaction.editReply(e instanceof LunaLiveApiError&&e.code==='link_cooldown'?'Patiente une minute avant de redemander une commande.':'Liaison indisponible pour le moment. Réessaie dans un instant.');
  }
  return true;
}
