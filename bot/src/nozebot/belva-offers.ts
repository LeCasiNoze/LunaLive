import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ChannelType,MessageFlags,type Client,type Message} from 'discord.js';
import {signup} from './belva-layout.js';
import {refreshBrands,type Brand,offerOn} from './belva-roles.js';

// Cartes d'offres des salons « Offres Casino » de Belva (composants Discord v2). Les visuels sont dans bot/assets/belva.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const ASSETS=new URL('../../assets/belva/',import.meta.url);
const OFFER_EUR=20;

type Offer={name:string;title:string;accent:number;link:string;tagline:string;why?:string;welcome?:string;terms?:string};
export const OFFERS:Record<string,Offer>={
  betportal:{name:'Betportal',title:'🎰 Betportal',accent:0x1ff25e,link:'https://affiliate.betportal.com/visit/?bta=35392&brand=betportal',
    tagline:'Casino crypto · slots, live et sport',terms:'https://betportal.com/en/promotions/38',
    welcome:'### 🎰 Bonus de bienvenue Betportal\nRéparti sur tes 3 premiers dépôts : **jusqu’à 1 000 € + 250 free spins**.\n> **1er dépôt** · 150 % jusqu’à 500 € + jusqu’à 200 FS\n> **2e dépôt** · 100 % jusqu’à 300 € + 50 FS\n> **3e dépôt** · 50 % jusqu’à 200 €\n-# Slots uniquement · mise max 5 €/spin · 14 jours · gains plafonnés à 5× le bonus. Active-le dans Mon profil → Bonus avant de jouer.'},
  hazcasino:{name:'HazCasino',title:'🎲 HazCasino',accent:0xe8b04a,link:'https://go.dravixaff.com/campaign/2?ref=belva',
    tagline:'Un peu de hasard, beaucoup de choix',
    why:'### 💜 Pourquoi Haz\n> 🎰 Des dizaines de providers : Pragmatic Play, Play’n GO, NetEnt, Push Gaming…\n> 🚀 JetX, Plinko, jeux crypto et bonus buy en un clic\n> 🃏 Roulette, blackjack, baccarat et live casino\n> 🧪 Mode démo pour tester avant de miser\n> ₿ Crypto, carte ou e-wallets · chat 24h/24'},
  velobet:{name:'VeloBet',title:'🍀 VeloBet',accent:0x8be800,link:'https://amliiink.com/g/nksmb58',
    tagline:'Un seul compte, tout le terrain de jeu',
    why:'### 💚 Pourquoi VeloBet\n> 🎰 Des milliers de jeux, des Megaways aux crash games\n> 🎥 Des centaines de tables live : Evolution, Pragmatic Play Live, Ezugi\n> ⚽ Sportsbook complet : plus de 30 sports et l’esport\n> 💳 Crypto, cartes ou Apple Pay · casino, live et sport sur le même solde\n> 💬 Support 24h/24 par chat (en anglais)'},
  celsius:{name:'Celsius',title:'<:Celsius:1571173496682192936> Celsius',accent:0xff6a3d,link:'https://celsius.games/CdTfJuequj',
    tagline:'Ici, ça chauffe vraiment',
    why:'### 🧡 Pourquoi Celsius\n> 🎰 Un lobby démesuré : Pragmatic Play, Hacksaw, Nolimit City, Evolution…\n> 🚀 Fast games : Aviator, Plinko, Limbo, Spaceman\n> ⚔️ Bonus Battles : le plus gros multiplicateur l’emporte\n> 🏆 Rangs VIP et récompenses pour les joueurs réguliers\n> ⚽ Sportsbook intégré · jeu instantané sur mobile et PC'},
};

const T=(content:string)=>({type:10,content});
const SEP=(spacing=2,divider=true)=>({type:14,divider,spacing});
const btn=(label:string,emoji:string,style:number,custom_id:string)=>({type:2,style,label,emoji:{name:emoji},custom_id});
const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});

export function offerCard(b:Pick<Brand,'id'|'bonus'>,o:Offer){
  const cap=b.bonus??30;
  const container={type:17,accent_color:o.accent,components:[
    {type:12,items:[{media:{url:`attachment://banner-${b.id}.png`},description:`${o.name} × Belva : jusqu’à ${cap} € de dépôt remboursé${offerOn()?` et 1er dépôt de ${OFFER_EUR} € offert`:''}`}]},
    SEP(2,false),
    {type:9,components:[T(`# ${o.title} × Belva`),T(`L’offre de bienvenue réservée à la commu Belva.\n-# ${o.tagline} · 18+`)],
      accessory:{type:11,media:{url:`attachment://logo-${b.id}.png`},description:`Logo ${o.name}`}},
    SEP(),
    // Première chose visible : l'inscription (Discord ne permet ni de grossir ni de centrer un bouton, il est donc seul sur sa ligne).
    ...signup(b.id,`S’inscrire sur ${o.name}`,o.link,`**Étape 1** · crée ton compte sur **${o.name}** avec le lien de Belva : c’est ce lien qui te donne droit aux offres ci-dessous.`),
    SEP(),
    {type:9,components:[T(`### 💸 Ton dépôt remboursé\nFais ton premier dépôt avec le lien de Belva : on te rembourse **jusqu’à ${cap} €**.\n-# ${OFFER_EUR} € déposés → ${OFFER_EUR} € remboursés · ${cap} € ou plus → ${cap} €`)],accessory:btn('Remboursement','💸',3,`belva:t:qrefund:${b.id}`)},
    SEP(1,false),
    ...(offerOn()?[{type:9,components:[T(`### 🎁 Premier dépôt offert\nNouveau sur ${o.name} ? On t’envoie **${OFFER_EUR} €** pour faire ton premier dépôt.\n-# Comptes créés avec le lien de Belva · un seul par casino`)],accessory:btn('Dépôt offert','🎁',1,`belva:t:qoffer:${b.id}`)},
    SEP(1,false)]:[]),
    {type:9,components:[T(`### ✅ Déjà inscrit ?\nFais vérifier ton compte : tu reçois le rôle ${o.name} et l’accès aux giveaways membres.`)],accessory:btn('Vérifier','✅',2,`belva:t:quick:${b.id}`)},
    SEP(),
    T(`### 📋 Comment ça marche\n**1 ·** Crée ton compte avec le bouton **S’inscrire** (en haut ou en bas).\n${offerOn()?'**2 ·** Clique sur **Dépôt offert** si tu n’as pas encore déposé, ou sur **Remboursement** après ton dépôt.':'**2 ·** Fais ton premier dépôt, puis clique sur **Remboursement**.'}\n**3 ·** Le staff vérifie ton compte dans notre espace partenaire, puis l’argent part **directement sur ton adresse de dépôt**.\n-# Le remboursement est versé en priorité sur un autre de nos casinos où tu n’as pas encore de compte.`),
    ...(o.welcome||o.why?[SEP(),T((o.welcome??o.why)!)]:[]),
    SEP(),
    {type:1,components:[link(`S’inscrire sur ${o.name}`,'🎰',o.link),...(o.terms?[link('Conditions officielles','📄',o.terms)]:[])]},
    {type:1,components:[btn('Remboursement','💸',3,`belva:t:qrefund2:${b.id}`),...(offerOn()?[btn('Dépôt offert','🎁',1,`belva:t:qoffer2:${b.id}`)]:[]),btn('Vérifier mon compte','✅',2,`belva:t:quick2:${b.id}`)]},
    SEP(1),
    T('-# 💡 En crypto, l’adresse de dépôt peut changer d’un dépôt à l’autre : vérifie-la à chaque fois.\n-# 🔞 Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.'),
  ]};
  // La version permet de ne réécrire la carte (et ses images) que si son contenu change.
  const version=createHash('sha1').update(JSON.stringify(container)).digest('hex').slice(0,10);
  (container.components[0] as {items:{description:string}[]}).items[0].description+=` · v${version}`;
  return {version,payload:{flags:MessageFlags.IsComponentsV2 as const,components:[container] as never[],
    files:[{attachment:readFileSync(new URL(`banner-${b.id}.png`,ASSETS)),name:`banner-${b.id}.png`},{attachment:readFileSync(new URL(`logo-${b.id}.png`,ASSETS)),name:`logo-${b.id}.png`}]}};
}

const isCard=(m:Message,id:string)=>JSON.stringify(m.components.map(c=>c.toJSON())).includes(`belva:t:qrefund:${id}`);
// L'ancien message « Vérifie ton compte » du bot est remplacé par la carte.
const isOldVerify=(m:Message,id:string)=>{const j=JSON.stringify(m.components.map(c=>c.toJSON()));return j.includes(`belva:t:quick:${id}`)&&!j.includes('belva:t:qrefund:');};

export async function ensureOfferCards(client:Client){
  if(process.env.BELVA_OFFER_CARDS==='false')return;
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  for(const b of await refreshBrands(guild)){
    const o=OFFERS[b.id];if(!o||!b.channelId||b.api)continue;
    const channel=await client.channels.fetch(b.channelId).catch(()=>null);
    if(channel?.type!==ChannelType.GuildText)continue;
    const recent=await channel.messages.fetch({limit:30});
    const mine=recent.filter(m=>m.author.id===client.user!.id);
    const {version,payload}=offerCard(b,o);
    const card=mine.find(m=>isCard(m,b.id));
    if(card){if(!JSON.stringify(card.components.map(c=>c.toJSON())).includes(`v${version}`))await card.edit({...payload,attachments:[]});}
    else await channel.send(payload);
    for(const m of mine.filter(m=>isOldVerify(m,b.id)).values())await m.delete().catch(()=>undefined);
  }
}
