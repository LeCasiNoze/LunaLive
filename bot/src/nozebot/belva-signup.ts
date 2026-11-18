import {MessageFlags,type Interaction} from 'discord.js';
import {OFFERS} from './belva-offers.js';
import {LCN_GUILD} from './belva-guilds.js';
import * as L from './belva-layout.js';

// Bouton d'inscription en couleur : Discord ne colore pas les boutons lien, donc le bouton coloré répond en privé
// avec le lien d'inscription du serveur où il a été cliqué (liens de Belva chez Belva, liens de LeCasiNoze chez LeCasiNoze).
const RAINBET='https://rainbet.com/?r=nivoranet';
const LCN_LINKS:Record<string,string>={rainbet:RAINBET,betportal:'https://affiliate.betportal.com/visit/?bta=35392&brand=betportal',celsius:'https://nivoranet.onrender.com/r/lecasinoze-celsius'};
const NAMES:Record<string,string>={rainbet:'Rainbet',betportal:'Betportal',celsius:'Celsius',hazcasino:'HazCasino',velobet:'VeloBet'};

export function signupLink(casino:string,guildId?:string|null){
  if(guildId===LCN_GUILD())return LCN_LINKS[casino];
  return casino==='rainbet'?RAINBET:(OFFERS as Record<string,{link:string}>)[casino]?.link;
}

export async function handleSignup(i:Interaction):Promise<boolean>{
  if(!i.isButton()||!i.customId.startsWith(L.SIGNUP_PREFIX))return false;
  const casino=i.customId.slice(L.SIGNUP_PREFIX.length);const href=signupLink(casino,i.guildId);
  if(!href){await i.reply({ephemeral:true,content:'Lien indisponible pour le moment.'});return true;}
  await i.reply({flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral,components:[{type:17,accent_color:0x2FBF71,components:[
    L.T(`### ${L.logo(casino)} Ton lien ${NAMES[casino]??casino}\nInscris-toi avec ce lien : c’est lui qui te donne droit aux offres et à la vérification de ton compte.`),
    {type:1,components:[{type:2,style:5,label:`Ouvrir ${NAMES[casino]??casino}`,emoji:L.logoEmoji(casino),url:href}]},
  ]}] as never[]});
  return true;
}
