import {createHash} from 'node:crypto';
import {MessageFlags,type Client,type Message,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {LINK_BUTTON} from './belva-info.js';
import {LCN_GUILD,findChannel} from './belva-guilds.js';
import * as L from './belva-layout.js';
import {LCN_TICKETS,ticketCtx} from './belva-roles.js';
import {TICKET_PANEL_ID,ticketKindOptions} from './belva-tickets.js';

// Cartes du Discord LeCasiNoze, refaites dans le style des cartes de Belva (Components V2, une étape = un bouton).
// Les boutons et menus gardent leurs identifiants d'origine : les actions existantes (règlement, notifications,
// tickets, vérification Rainbet) continuent de fonctionner. Une carte n'est publiée qu'une fois validée (fiche lcn-…).
const ACCENT=0xD64065;
const OLD_RULES='1188921136902316093';
const C={rules:'1188914844909441204',start:'1188914815561891990',roles:'1217876409406586900',ticket:'1544429389415063604',general:'1188913389125255198',
  rainbet:'1569126449670004776',race:'1569141661403971686',betportal:'1562493112327348276',celsius:'1544405889455362158',games:'1304110217419559026',
  nozebot:'1559957255288520836',shop:'1559957261466734737',rumble:'1544405891187740695',lunalive:'1544405928906989690',insta:'1544405931075305571',
  youtube:'1544405933428314254',site:'1544405935777120266'};
const url=(id:string)=>L.chUrl(id,LCN_GUILD());
const go=(label:string,emoji:string,id:string)=>L.link(label,emoji,url(id));
const card=(components:object[],accent=ACCENT)=>({flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:accent,components}] as never[]});
const select=(custom_id:string,placeholder:string,min:number,max:number,options:object[])=>({type:1,components:[{type:3,custom_id,placeholder,min_values:min,max_values:max,options}]});

export function rulesCard(){
  return card([
    L.T('# 📜 Le règlement'),L.T('Simple et clair : six règles pour que tout le monde passe un bon moment.'),
    L.LINE,
    L.T(['**1 ·** Respecte les autres membres, même en cas de désaccord.','**2 ·** Pas de spam, de démarchage sauvage ni de lien douteux.',
      '**3 ·** Ne partage pas d’information personnelle dans les salons publics.','**4 ·** Un seul compte par personne : pas de double compte (multi-comptes et triche aux giveaways = sanction).',
      '**5 ·** Utilise les salons pour leur sujet et écoute l’équipe de modération.',
      '**6 ·** Garde une ambiance adulte, détendue et agréable.'].join('\n')),
    L.LINE,
    ...L.step('✅ Pour ouvrir le serveur','Accepte le règlement, puis choisis tes notifications (ou continue sans). Le reste du serveur se dévoile tout seul.',
      [L.btn('J’accepte le règlement','✅',3,'nozebot:rules:accept')]),
    L.GAP,
    ...L.step('🔗 Relie ton compte Rumble','Ça remplace l’ancien !linkme : un clic, le bot t’envoie la marche à suivre en privé. Ta liaison vaut aussi sur le Discord de Belva.',
      [L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
    L.LINE,
    L.T('### 🔞 Joue de façon responsable\n> Le jeu est un divertissement, pas un revenu : sur la durée, on perd. Ne joue que ce que tu peux perdre et fais une pause quand il le faut.\n> **Joueurs Info Service : 09 74 75 13 13** (appel non surtaxé)'),
  ]);
}

export function startCard(ch:{hunt?:string;tournament?:string}){
  return card([
    L.T('# 🚀 Bienvenue chez LeCasiNoze'),L.T('Le serveur de la commu : lives, calls, hunt, tournoi et bons plans casino. Quatre étapes pour bien démarrer.'),
    L.LINE,
    ...L.step('1 · Accepte le règlement','Un clic et le serveur s’ouvre.',[go('Le règlement','📜',C.rules)]),
    L.GAP,
    ...L.step('2 · Choisis tes notifications','Lives, vidéos, giveaways… ou aucune, c’est toi qui vois.',[go('Mes notifications','🔔',C.roles)]),
    L.GAP,
    ...L.step('3 · Relie ton compte Rumble','Pour les BCoins, l’XP, le hunt et le tournoi. 30 secondes, une seule fois.',[L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
    L.GAP,
    ...L.step('4 · Participe','Le hunt des viewers le mercredi, le tournoi le samedi, et nos offres casino.',
      [L.chLink('Le hunt','🎯',ch.hunt,LCN_GUILD()),L.chLink('Le tournoi','⚔️',ch.tournament,LCN_GUILD()),go('Les offres','🎁',C.rainbet)]),
    L.LINE,
    {type:1,components:[go('Le général','💬',C.general),go('Ouvrir un ticket','🎫',C.ticket)]},
    L.FOOT,
  ]);
}

export function notifCard(){
  return card([
    L.T('# 🔔 Tes notifications'),L.T('Choisis ce qui te ping. Tu peux revenir changer d’avis quand tu veux.'),
    L.LINE,
    L.T(['🟢 **Lives** · une alerte dès que LeCasiNoze passe en direct (Rumble + LunaLive).','▶️ **YouTube** · les nouvelles vidéos et les meilleurs moments.',
      '📸 **Instagram** · les nouveaux Reels et les annonces.','🎉 **Giveaways** · les concours et opérations de la commu.','🤖 **AutoMod & Auto Hunt** · les lancements et les étapes importantes.'].join('\n')),
    L.GAP,
    select('nozebot:notifications','Choisir mes notifications…',0,5,[
      {label:'Lives — Rumble + LunaLive',value:'1188926242519523328',description:'Une alerte dès que LeCasiNoze passe en direct.',emoji:{name:'🟢'}},
      {label:'Nouvelles vidéos YouTube',value:'1188926088852799578',description:'Une alerte lorsqu’une nouvelle vidéo sort.',emoji:{name:'▶️'}},
      {label:'Nouveautés Instagram',value:'1217875557631393923',description:'Les Reels et publications importantes.',emoji:{name:'📸'}},
      {label:'Giveaways',value:'1188926393946484783',description:'Une alerte lorsqu’une opération commence.',emoji:{name:'🎉'}},
      {label:'AutoMod & Auto Hunt',value:'1556031808603291689',description:'Lancements, étapes du Hunt et ouvertures imminentes.',emoji:{name:'🤖'}}]),
    {type:1,components:[L.btn('Continuer sans notifications','➡️',2,'nozebot:notifications:none')]},
    L.T('-# Dernière étape pour ouvrir le serveur : valide tes choix, ou continue sans notifications.'),
  ]);
}

// Même système de tickets que chez Belva (remboursements, vérifications), avec les casinos et le staff de LeCasiNoze.
export function ticketCard(){
  const options=ticketCtx.run(LCN_TICKETS,()=>ticketKindOptions());
  return card([
    L.T('# 🎫 Support LeCasiNoze'),L.T('Choisis ta demande dans le menu en bas : un salon privé s’ouvre avec l’équipe, visible seulement par toi et le staff.'),
    L.LINE,
    L.T('### 💸 Remboursement de dépôt\nTu as fait ton **1er dépôt** avec notre lien ? On te rembourse **jusqu’à 30 €**, versés de préférence sur un de nos casinos où tu n’as pas encore de compte.\n-# 📸 Prépare la capture de ton dépôt.'),
    L.GAP,
    L.T('### 🔎 Vérification de compte\nInscrit avec notre lien ? Le staff vérifie ton compte : tu reçois **✅ Joueur Vérifié** et le rôle du casino.'),
    L.GAP,
    L.T('### 💎 VIP host\nGros joueur ? Une personne dédiée t’accompagne.'),
    L.GAP,
    L.T('### 🛟 Aide · 🤝 Partenariat · 📝 Autre\nUn souci, une proposition ou une question : on te répond dans ton salon.'),
    L.LINE,
    select(TICKET_PANEL_ID,'👉 Choisis le type de demande…',1,1,options),
    L.T('-# Une demande à la fois · 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.'),
  ]);
}

export function rainbetCard(){
  return card([
    L.T(`# ${L.logo('rainbet')} Rainbet · partenaire principal`),L.T('Inscris-toi avec notre lien et le code **NIVORANET** : tu soutiens la chaîne et tu entres dans la wager race.'),
    L.LINE,
    ...L.signup('rainbet','S’inscrire sur Rainbet','**Étape 1** · crée ton compte avec notre lien (code **NIVORANET** déjà inclus).'),
    L.GAP,
    ...L.step('2 · Vérifie ton compte','Entre ton pseudo Rainbet exact : tu reçois le rôle 🌧️ Rainbet et ✅ Joueur Vérifié.',[L.btn('Vérifier mon compte','✅',3,'nozebot:rainbet:verify')]),
    L.LINE,
    ...L.step('🏁 Wager race du mois','**200 $** pour le top 3 : 🥇 100 $ · 🥈 60 $ · 🥉 40 $. **1 000 $** misés minimum sur le mois, classement en direct.',[go('Le classement','🏁',C.race)]),
    L.GAP,
    L.T('### 🎁 Chez Rainbet\nRakeback réclamable toutes les 15 min, reloads quotidiens, bonus hebdomadaires et mensuels, rangs VIP de Bronze à Diamond.'),
    {type:1,components:[L.link('Conditions générales','📄','https://rainbet.com/terms'),L.link('Programme VIP','💎','https://rainbet.com/vip'),go('Ouvrir un ticket','🎫',C.ticket)]},
    L.T('-# 18+ · Partenaire, lien affilié · Selon pays et éligibilité · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.'),
  ],0x3D8BFF);
}

export function betportalCard(){
  return card([
    L.T(`# ${L.logo('betportal')} Betportal`),L.T('Le package de bienvenue est réparti sur les **trois premiers dépôts** : jusqu’à **1 000 € de bonus + 250 free spins**. Les 300 % cumulés ne s’appliquent pas à un seul dépôt.'),
    L.LINE,
    ...L.signup('betportal','S’inscrire sur Betportal','**Étape 1** · crée ton compte avec notre lien partenaire.'),
    L.GAP,
    ...L.step('2 · Déjà inscrit ?','Fais vérifier ton compte : tu reçois ✅ Joueur Vérifié et le rôle du casino. Après ton 1er dépôt, demande ton remboursement (jusqu’à **30 €**).',
      [L.btn('Vérifier mon compte','✅',3,'belva:t:quick:betportal'),L.btn('Remboursement','💸',1,'belva:t:qrefund:betportal')]),
    L.LINE,
    L.T('### 🎁 Les trois dépôts\n> **1er dépôt** · 150 % jusqu’à 500 € et jusqu’à 200 FS selon le dépôt\n> **2e dépôt** · 100 % jusqu’à 300 € et 50 FS\n> **3e dépôt** · 50 % jusqu’à 200 €'),
    L.T('### 🎰 Free spins du 1er dépôt\n20–50 € : **20 FS** · 51–100 € : **50 FS** · 101–200 € : **100 FS** · dès 201 € : **200 FS**. Valeur 0,10 €/spin, gains des FS annoncés au solde réel.'),
    L.T('### 📋 Conditions essentielles\nSlots uniquement · mise max **5 €/spin** · délai **14 jours** · gains de la promo plafonnés à **5 × le bonus initial**. Bonus buys et jeux de table exclus pendant le wager. Dépôt exclu du wager ; **multiplicateur à vérifier dans ton compte**.'),
    L.T('### ✅ Activation\nAprès le dépôt concerné : **Mon profil → Bonus → Offres disponibles**, avant de jouer. Si le bonus manque, contacte le support du casino avant toute mise.'),
    {type:1,components:[L.link('1er dépôt','📄','https://betportal.com/en/promotions/38'),L.link('2e dépôt','📄','https://betportal.com/en/promotions/37'),L.link('3e dépôt','📄','https://betportal.com/en/promotions/36'),go('Ouvrir un ticket','🎫',C.ticket)]},
    L.T('-# 💡 En crypto, l’adresse de dépôt peut changer d’un dépôt à l’autre : vérifie-la à chaque fois.\n-# 18+ · Offre partenaire, lien affilié · Selon pays et éligibilité · Fiches consultées le 21/10/2026. Joueurs Info Service : 09 74 75 13 13.'),
  ],0x1FF25E);
}

export function celsiusCard(){
  return card([
    L.T(`# ${L.logo('celsius')} Celsius`),L.T('Le package de bienvenue affiché par Celsius est réparti sur les deux premiers dépôts.'),
    L.LINE,
    ...L.signup('celsius','S’inscrire sur Celsius','**Étape 1** · crée ton compte avec notre lien partenaire.'),
    L.GAP,
    ...L.step('2 · Déjà inscrit ?','Fais vérifier ton compte : tu reçois ✅ Joueur Vérifié et le rôle du casino. Après ton 1er dépôt, demande ton remboursement (jusqu’à **30 €**).',
      [L.btn('Vérifier mon compte','✅',3,'belva:t:quick:celsius'),L.btn('Remboursement','💸',1,'belva:t:qrefund:celsius')]),
    L.LINE,
    L.T('### 🎁 Le package\n> **1er dépôt** · 100 % de bonus\n> **2e dépôt** · 200 % de bonus\n> **Total** · 300 % cumulés'),
    L.GAP,
    ...L.step('💎 Gros joueur ?','Un VIP host peut t’accompagner personnellement : ouvre un ticket et choisis **Demande VIP host**.',[go('Demander un VIP host','💎',C.ticket)]),
    L.T('-# Offre partenaire · consulte les conditions affichées à l’inscription · 18+ · Joueurs Info Service : 09 74 75 13 13.'),
  ],0xFF6A3D);
}

export function nozebotCard(){
  return card([
    L.T('# 🤖 NozeBot · le guide'),L.T('Ton compte, tes BCoins, ta progression. Tout se passe dans les jeux et commandes.'),
    L.LINE,
    ...L.step('1 · Relie ton Rumble','Ton pseudo Discord suit ensuite ton pseudo Rumble. Une identité Rumble par compte Discord.',[L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
    L.GAP,
    L.T('### 💰 Gagner des BCoins\n> **/claim** · 100 BCoins toutes les 24 h (plus avec les améliorations)\n> **!rain** sur Rumble · 25 BCoins, fenêtre de 2 min pendant les lives\n> **CNZ** · 200 BCoins par semaine avec un pseudo Rumble CNZ vérifié'),
    L.T('### 🎰 Jouer et consulter\n> **/slot** · mise 20, toutes les 30 min · **/regles** pour les chances\n> **/solde** et **/profil** · tes BCoins, tes talents et ton prochain claim'),
    L.T('-# Les BCoins sont communs avec le Discord de Belva : même solde partout. Points gratuits, sans valeur monétaire.'),
    L.LINE,
    {type:1,components:[go('Jeux et commandes','🎮',C.games),L.link('Ouvrir le shop','🛍️','https://lecasinoze.onrender.com/shop/')]},
  ]);
}

export function shopCard(){
  return card([
    L.T('# 🛍️ Le shop'),L.T('Améliore ton compte avec tes BCoins : valeur du claim, délai du claim, valeur de la rain, mise du /slot.'),
    L.LINE,
    ...L.step('1 · Choisis ton talent','Consulte le prochain palier et copie la commande.',[L.link('Entrer dans le shop','🛍️','https://lecasinoze.onrender.com/shop/')]),
    L.GAP,
    ...L.step('2 · Colle la commande','Dans les jeux et commandes : le bot vérifie le palier et ton solde. Un refus ne débite rien.',[go('Jeux et commandes','🎮',C.games)]),
    L.T('-# Le shop Automod garde son propre portefeuille (points Automod). Les paliers se prennent dans l’ordre.'),
  ]);
}

const linkCard=(title:string,body:string,label:string,emoji:string,href:string)=>card([L.T(`# ${title}`),L.T(body),{type:1,components:[L.link(label,emoji,href)]}]);
export const LINK_CARDS={
  rumble:()=>linkCard('🟢 LeCasiNoze sur Rumble','Les directs et la communauté LeCasiNoze sur Rumble.','Ouvrir Rumble','🟢','https://rumble.com/user/LeCasiNoze/live'),
  lunalive:()=>linkCard('🌙 LeCasiNoze sur LunaLive','Le direct, le chat et les activités communautaires sur LunaLive.','Ouvrir LunaLive','🌙','https://lunalive.win/s/lecasinoze'),
  insta:()=>linkCard('📸 LeCasiNoze sur Instagram','Reels, extraits, coulisses et annonces courtes.','Ouvrir Instagram','📸','https://instagram.com/lecasinoze'),
  youtube:()=>linkCard('▶️ LeCasiNoze sur YouTube','Vidéos, replays et meilleurs moments de la chaîne.','Ouvrir YouTube','▶️','https://www.youtube.com/@LeCasiNoze'),
};

// key → salon + carte. Le salon ne garde que la carte du bot (les messages des membres et du staff restent).
export async function lcnCards(client:Client){
  const g=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);
  const ch=g?{hunt:(await findChannel(g,'hunt'))?.id,tournament:(await findChannel(g,'tournoi'))?.id}:{};
  return [
    {key:'lcn-rules',title:'Règlement',channel:C.rules,build:rulesCard},
    {key:'lcn-start',title:'Commencer ici',channel:C.start,build:()=>startCard(ch)},
    {key:'lcn-notifs',title:'Choix des notifications',channel:C.roles,build:notifCard},
    {key:'lcn-tickets',title:'Ouvrir un ticket',channel:C.ticket,build:ticketCard},
    {key:'lcn-rainbet',title:'Rainbet',channel:C.rainbet,build:rainbetCard},
    {key:'lcn-betportal',title:'Betportal',channel:C.betportal,build:betportalCard},
    {key:'lcn-celsius',title:'Celsius',channel:C.celsius,build:celsiusCard},
    {key:'lcn-nozebot',title:'Guide NozeBot (BCoins)',channel:C.nozebot,build:nozebotCard},
    {key:'lcn-shop',title:'Le shop',channel:C.shop,build:shopCard},
    {key:'lcn-links',title:'Salons liens (Rumble, LunaLive, Instagram, YouTube)',channel:'',build:()=>LINK_CARDS.rumble()},
  ];
}

const versionOf=(components:object[])=>parseInt(createHash('sha1').update(JSON.stringify(components)).digest('hex').slice(0,7),16);
async function place(client:Client,channelId:string,payload:ReturnType<typeof card>){
  const channel=await client.channels.fetch(channelId).catch(()=>null) as TextChannel|null;if(!channel)return;
  const id=versionOf(payload.components);
  const withId={...payload,components:[{...(payload.components[0] as object),id}] as never[]};
  const me=client.user!.id;
  const mine=[...(await channel.messages.fetch({limit:50})).values()].filter((m:Message)=>m.author.id===me);
  const current=mine.find(m=>m.flags.has(MessageFlags.IsComponentsV2));
  if(current&&current.components[0]?.id!==id)await current.edit(withId);
  if(!current){const sent=await channel.send(withId);await sent.pin('Carte du salon').catch(()=>undefined);}
  // Ancien règlement écrit à la main (avec « !linkme ») : remplacé par la carte, à la demande de Lucas (18/11).
  if(channelId===C.rules)await channel.messages.delete(OLD_RULES).catch(()=>undefined);
  // Anciens panneaux du bot (embeds) : remplacés par la carte.
  for(const m of mine)if(m.id!==current?.id&&!m.flags.has(MessageFlags.IsComponentsV2))await m.delete().catch(()=>undefined);
}

export async function ensureLcnCards(client:Client,pool?:Pool){
  for(const c of await lcnCards(client)){
    if(!await isApproved(pool,c.key))continue;
    if(c.key==='lcn-links'){for(const [k,b] of Object.entries(LINK_CARDS))await place(client,C[k as keyof typeof C],b()).catch(e=>console.error('[nozebot] carte',k,e?.message||e));continue;}
    await place(client,c.channel,c.build()).catch(e=>console.error('[nozebot] carte',c.key,e?.message||e));
  }
}
