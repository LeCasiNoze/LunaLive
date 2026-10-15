import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,type Interaction} from 'discord.js';
import {LunaLiveApiError,soundRequest,type LunaLiveApiConfig} from './lunalive-api.js';
type Config={guildId:string;lunaLive:LunaLiveApiConfig};
export async function handleSoundboardInteraction(interaction:Interaction,config:Config){
 const command=interaction.isChatInputCommand()&&interaction.commandName==='sons';
 const select=interaction.isStringSelectMenu?.()&&interaction.customId.startsWith('nz:s:menu:');
 const button=interaction.isButton()&&interaction.customId.startsWith('nz:s:buy:');
 if(!command&&!select&&!button)return false;
 if(interaction.guildId!==config.guildId)return true;
 if(!interaction.isChatInputCommand()&&!interaction.isStringSelectMenu()&&!interaction.isButton())return false;
 await interaction.deferReply({ephemeral:true});
 try{
  if(interaction.isButton()||interaction.isStringSelectMenu()){const owner=interaction.customId.split(':')[3];if(owner!==interaction.user.id){await interaction.editReply('Ce menu appartient à un autre compte. Ouvre /sons pour ton propre menu.');return true;}}
  if(button&&interaction.isButton()){
   const parts=interaction.customId.split(':');
   const result=await soundRequest(config.lunaLive,interaction.user.id,'sound',{soundId:parts[4],expectedCost:Number(parts[5]),receipt:interaction.id});
   await interaction.editReply(result.state==='refunded'?'Cette demande a été remboursée. Aucun son ne sera relancé.':`Son ${result.replayed?'déjà enregistré':'ajouté à la file'} · ${result.balance===undefined?'Consulte /solde pour ton solde actuel.':`Solde : **${result.balance} NozeCoins**.`}\nSi la lecture échoue ou expire, le coût est remboursé. Ne relance pas la commande pour confirmer.`);
   return true;
  }
  const catalogue=await soundRequest(config.lunaLive,interaction.user.id,'sound-catalogue');
  if(!catalogue.enabled||!catalogue.sounds?.length){
   await interaction.editReply({content:'La soundboard est en préparation. Aucun achat ni débit possible pour le moment.',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Le shop').setURL('https://lecasinoze.onrender.com/shop/#soundboard'))]});return true;
  }
  if(select&&interaction.isStringSelectMenu()){
   const sound=catalogue.sounds.find(entry=>entry.id===interaction.values[0]);
   if(!sound){await interaction.editReply('Ce son n’est plus disponible. Rouvre /sons.');return true;}
   await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xd64065).setTitle(sound.label).setDescription(`**${sound.cost} NozeCoins** · ${(sound.durationMs/1000).toLocaleString('fr-FR')} s\nLecture uniquement en live personnel, si le lecteur OBS est prêt.\n\nLe bouton Aperçu ouvre le fichier dans ton navigateur ; il ne dépense aucun point.`)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Aperçu gratuit').setURL(sound.audioUrl),new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel(`Déclencher · ${sound.cost} NC`).setCustomId(`nz:s:buy:${interaction.user.id}:${sound.id}:${sound.cost}`))]});return true;
  }
  const menu=new StringSelectMenuBuilder().setCustomId(`nz:s:menu:${interaction.user.id}`).setPlaceholder('Choisir un son — aucun débit à cette étape').addOptions(catalogue.sounds.map(sound=>({label:sound.label,value:sound.id,description:`${sound.cost} NozeCoins · ${(sound.durationMs/1000).toLocaleString('fr-FR')} secondes`})));
  await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xd64065).setTitle('Soundboard · À toi de jouer').setDescription('Choisis un son pour voir son prix et écouter l’aperçu. Le débit n’a lieu qu’après confirmation, si OBS est disponible.\n\nUne demande par minute et par personne, file limitée à cinq sons. Points gratuits, sans valeur monétaire.')],components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]});
 }catch(error){
  const e=error instanceof LunaLiveApiError?error:null;
  const messages:Record<string,string>={rumble_not_linked:'Lie ton compte Rumble avec /link avant d’utiliser les sons.',soundboard_disabled:'La soundboard n’est pas encore activée. Rien n’a été débité.',unknown_sound:'Ce son n’est plus au catalogue. Rouvre /sons.',sound_price_changed:'Le prix a changé. Rouvre /sons pour le vérifier avant tout achat.',soundboard_unavailable:'La soundboard est indisponible : live personnel ou lecteur OBS non prêt. Rien n’a été débité.',soundboard_queue_full:'La file de cinq sons est pleine. Réessaie plus tard ; rien n’a été débité.',soundboard_cooldown:'Attends une minute entre deux demandes. Rien n’a été débité.'};
  await interaction.editReply(e?.code==='insufficient_coins'?`Solde : ${e.details.balance} · Prix : ${e.details.cost} · Il manque ${e.details.missing} NozeCoins. Rien n’a été débité.`:messages[e?.code??'']??'Demande non confirmée. Consulte /solde avant de réessayer.');
 }
 return true;
}
