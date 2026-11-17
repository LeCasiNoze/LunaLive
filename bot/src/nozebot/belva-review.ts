import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,ChannelType,LabelBuilder,MessageFlags,ModalBuilder,PermissionFlagsBits,
  TextInputBuilder,TextInputStyle,type Client,type Guild,type Interaction,type MessageCreateOptions,type TextChannel,
} from 'discord.js';
import type {Pool} from 'pg';
import {ROLE_SPEC,MANUAL_SPEC,RETIRED,applyRoleSpec,hex} from './belva-role-spec.js';
import {welcomeCard} from './belva-welcome.js';
import {CHECK_TEXT,linkDm,linkPrompt} from './belva-link.js';
import {gamesCard,linkCard,rewardsCard} from './belva-info.js';
import {bjMessage} from './belva-games.js';
import {BRACKET_URL,BUY_CENTS,bracketCard,championText,confirmCard,eliminationText,priceOption,registrationCard,type BonusOption,type LiveState,type Slot} from './belva-tournament.js';
import {GRADES,SEASON_EXAMPLE,XP_RULES,gradeUpCard,levelThresholds,seasonCard,tierUpLine} from './belva-progress-designs.js';
import {forgetApproval,reviewSchema} from './belva-approval.js';
import {ensureBelvaRainbetPanel,rainbetCard} from './belva-rainbet.js';
import {agendaCard,mondayOf,refreshAgenda} from './belva-agenda.js';
import {huntCard,huntInfoCard,notEligibleCard} from './belva-hunt.js';
import {huntReminder,tournamentReminder} from './belva-reminders.js';
import {belvaRaceCard} from './belva-race.js';
import {ensureVipGuide,vipGuideCard} from './belva-vip-guide.js';
import {rankText,topCard} from './belva-xp.js';
import {questJournal} from './belva-quests.js';
import {tipDm} from './belva-tips.js';
import {applyOnboarding,doneStep,linkStep,notifStep,rulesCard} from './belva-onboarding.js';

// Salon staff de validation : chaque message public est d'abord posté ici tel quel. Un design n'est utilisé
// en public qu'une fois validé ; s'il change dans le code, il est reposté et repasse « en attente ».
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PATRON_ROLE='1482854912059511006';
const VIDEUR_ROLE='1483165106140352632';
const STAFF_CATEGORY='1483112145154474005';
const CHANNEL_NAME='🎨︱validation-design';
const P='belva:rv:';
const demo=(c:Ctx)=>({id:c.botId,avatarUrl:'https://cdn.discordapp.com/embed/avatars/2.png'});

type Preview=MessageCreateOptions;
type Ctx={botId:string;pool:Pool;channel:(suffix:string)=>string|undefined};
type Design={key:string;title:string;where:string;note?:string;previews:(c:Ctx)=>Promise<Preview[]>};
const text=(content:string):Preview=>({content,allowedMentions:{parse:[]}});
const v2=(p:{flags?:unknown;components?:unknown;files?:unknown}):Preview=>({...p,allowedMentions:{parse:[]}} as Preview);

export async function rolesPalettePng(){
  const strip=(s:string)=>s.replace(/^[^\p{L}]+/u,'').trim();
  const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/’/g,'\'');
  const all=[{group:'Staff',name:MANUAL_SPEC[0].name,color:MANUAL_SPEC[0].color,shade:MANUAL_SPEC[0].shade,auto:'Belva · à appliquer à la main'},...ROLE_SPEC];
  const W=1240,rh=50;let y=150,last='';const parts:string[]=[];
  for(const r of all){
    if(r.group!==last){last=r.group;y+=14;parts.push(`<text x="64" y="${y+24}" font-family="DejaVu Sans,Segoe UI,Arial" font-size="17" font-weight="700" fill="#949BA4" letter-spacing="2">${r.group.toUpperCase()}</text>`);y+=32;}
    const c=hex(r.color);
    parts.push(`<rect x="48" y="${y}" width="${W-96}" height="${rh-8}" rx="10" fill="#2B2D31"/><circle cx="84" cy="${y+21}" r="13" fill="${c}"/>`,
      `<text x="112" y="${y+29}" font-family="DejaVu Sans,Segoe UI,Arial" font-size="22" font-weight="700" fill="${c}">${esc(strip(r.name))}</text>`,
      `<text x="430" y="${y+29}" font-family="DejaVu Sans Mono,Consolas,monospace" font-size="19" fill="#DBDEE1">${c}</text>`,
      `<text x="560" y="${y+29}" font-family="DejaVu Sans,Segoe UI,Arial" font-size="18" font-style="italic" fill="#B5BAC1">${esc(r.shade)}</text>`,
      `<text x="${W-70}" y="${y+29}" text-anchor="end" font-family="DejaVu Sans,Segoe UI,Arial" font-size="15" fill="#949BA4">${esc(strip(r.auto))}</text>`);
    y+=rh;
  }
  const H=y+60;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="h" x1="0" x2="1"><stop offset="0" stop-color="#19D3D3"/><stop offset=".5" stop-color="#9B7BD4"/><stop offset="1" stop-color="#F3C14B"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#1E1F22"/><rect width="${W}" height="6" fill="url(#h)"/>
<text x="48" y="74" font-family="DejaVu Sans,Segoe UI,Arial" font-size="38" font-weight="800" fill="#F2F3F5">Rôles du Discord de Belva</text>
<text x="48" y="112" font-family="DejaVu Sans,Segoe UI,Arial" font-size="19" fill="#B5BAC1">Couleur · code hexa · nom de la teinte · attribution. Ordre = ordre d'affichage.</text>
${parts.join('')}<text x="48" y="${H-24}" font-family="DejaVu Sans,Segoe UI,Arial" font-size="15" fill="#80848E">Aperçu sur le thème sombre de Discord</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const PERMS_TEXT=[
  '### 🔐 Permissions',
  '> **🛡️ Videur** : **administrateur**. Ce sont les admins du serveur (LeCasiNoze, Ricou) ; Belva est propriétaire.',
  '> **🎟️ Invité** et tous les autres rôles : **aucune permission propre**, ils héritent de @everyone. Retire à l’Invité la création d’emojis et d’événements qu’il avait.',
  '> **👑 Patron** et « nouveau rôle » sont au-dessus du bot : à régler à la main. « nouveau rôle » fait doublon avec Videur et peut être supprimé.',
  `### 🧹 Anciens rôles MEE6\n> ${RETIRED.map(r=>`${r.name} → ${r.to?ROLE_SPEC.find(s=>s.key===r.to)!.name:'supprimé (0 membre)'}`).join(' · ')}`,
  '-# ✅ Valider applique tout automatiquement (noms, couleurs, ordre, permissions, migration) et poste le compte rendu ici.',
].join('\n');


// Machines d'exemple FIXES pour les aperçus : lire la base ferait changer la fiche (donc sa validation) à chaque mise à jour du catalogue.
const EX_SLOTS:Record<string,{slot:Slot;offers:[string,string,number|null][]}>={
  'wanted dead or a wild':{slot:{name:'Wanted Dead or a Wild',key:'wanted dead or a wild',provider:'Hacksaw Gaming',image:'https://static.raincdn.com/cdn/max-w-256/slots/hacksaw-wanted-dead-or-a-wild.webp'},
    offers:[['freespins_train','The Great Train Robbery',80],['freespins_duel','Duel At Dawn',200],['freespins_dead','Dead Man’s Hand',400]]},
  'fruit party':{slot:{name:'Fruit Party',key:'fruit party',provider:'Pragmatic Play',image:'https://static.raincdn.com/cdn/max-w-256/slots/pragmatic-play-fruit-party.webp'},offers:[['fs','Free Spins',100]]},
  'le bandit':{slot:{name:'Le Bandit',key:'le bandit',provider:'Hacksaw Gaming',image:'https://static.raincdn.com/cdn/max-w-256/slots/hacksaw-le-bandit.webp'},
    offers:[['luck','Luck Of The Bandit',100],['gold','All That Glitters Is Gold',250]]},
  'sugar rush 1000':{slot:{name:'Sugar Rush 1000',key:'sugar rush 1000',provider:'Pragmatic Play',image:'https://static.raincdn.com/cdn/max-w-256/slots/pragmatic-play-sugar-rush-1000.webp'},offers:[['classic','Bonus classique',null]]},
};
const exSlot=(q:string):Slot|undefined=>EX_SLOTS[q.toLowerCase()]?.slot;
const exOptions=(s:Slot):BonusOption[]=>(EX_SLOTS[s.key]?.offers??[['classic','Bonus classique',null]]).map(([id,label,m])=>priceOption(id,label,m,BUY_CENTS()));

export const DESIGNS:Design[]=[
  {key:'roles',title:'Rôles : noms, couleurs, ordre, permissions',where:'Liste des membres et pseudos colorés',previews:async()=>[
    {files:[new AttachmentBuilder(await rolesPalettePng(),{name:'roles-palette.png'})],allowedMentions:{parse:[]}},text(PERMS_TEXT)]},
  {key:'welcome',title:'Carte de bienvenue',where:'👋︱bienvenue · à chaque arrivée (remplace MEE6)',previews:async c=>[
    v2(welcomeCard(demo(c),63,{offers:c.channel('toutes-les-offres'),link:c.channel('lier-mon-compte'),notifs:c.channel('notifications'),games:c.channel('mini-jeux')}))]},
  {key:'link-dm',title:'Message privé de liaison Rumble',where:'MP · clic sur « Lier mon Rumble » ou /lier',note:'Version hors live, puis les réponses du bouton Vérifier.',previews:async()=>{
    const off=linkDm({live:false,liveUrl:'https://rumble.com/user/Belvaa/live',videoUrl:'https://rumble.com/user/Belvaa'});
    return [{embeds:[off.embed]},{content:'!lier 3F9A1C0B7E2D4A61',components:[off.buttons]},
      text(Object.values(CHECK_TEXT).map(f=>`> ${f('Pseudo_Rumble')}`).join('\n'))];}},
  {key:'link-card',title:'Carte « Relie ton compte Rumble »',where:'🔗︱lier-mon-compte · déjà en ligne',previews:async()=>[v2(wrap(linkCard()))]},
  {key:'games',title:'Mini-jeux BCoins',where:'🎰︱mini-jeux · carte + réponses /claim, /slot, /blackjack',previews:async()=>[
    v2(wrap(gamesCard())),text('+100 BCoins · Solde : **240 BCoins**\nProchain claim <t:1795000000:R>'),
    text('**[OOO OXX]**\nMise : 20 · Retour : 80 BCoins\nSolde : **300** BCoins'),
    await bjMessage({sessionId:'demo',status:'active',mode:'classic',dealer:{cards:[{rank:'K',suit:'♠'},null],total:null},
      hands:[{cards:[{rank:'9',suit:'♥'},{rank:'7',suit:'♣'}],total:16,bet:20,doubled:false,finished:false,active:true}],sideBetLines:[],
      actions:{hit:true,stand:true,double:true,split:false},balance:280,cooldownEndsAt:new Date(0).toISOString(),result:null} as never,'Pseudo') as Preview]},
  {key:'rewards',title:'Carte des récompenses',where:'🏆︱récompenses · déjà en ligne',previews:async()=>[v2(wrap(rewardsCard()))]},
  {key:'grades',title:'Grades : 5 sous-niveaux, barème XP et messages de passage',where:'Salon général · quand un membre monte de niveau',note:'Maquette avec un exemple : rien n’est actif.',previews:async c=>[
    text(['### 📈 Paliers (XP cumulée)',...GRADES.map(g=>{const ls=levelThresholds().filter(l=>l.grade.key===g.key);
      return `> ${ROLE_SPEC.find(r=>r.key===g.key)!.name} · ${ls.map(l=>`${['I','II','III','IV','V'][l.tier-1]} ${l.xp.toLocaleString('fr-FR')}`).join(' · ')}${'deposit' in g&&g.deposit?' · dépôt vérifié requis':''}`;}),
      '### 🎁 Avantages par grade',...GRADES.map(g=>`> ${ROLE_SPEC.find(r=>r.key===g.key)!.name} · ${g.perk}`),
      '### ⚡ Gagner de l’XP',...XP_RULES.map(([a,b])=>`> ${a} · **${b}**`)].join('\n')),
    text('**Nouveau grade (Bronze → Fer, Fer → Or…) :**'),v2(gradeUpCard(demo(c),9_000)),
    text('**Simple sous-niveau (Or I → Or II…) :**'),{...tierUpLine(c.botId,11_640),allowedMentions:{parse:[]}}]},
  {key:'quests',title:'Journal de quêtes',where:'Réponse privée à /quetes + MP du lundi',note:'Exemple : chaque quête non terminée a son bouton d’action. Le journal arrive aussi en MP le lundi à 10 h aux membres qui ont relié leur Rumble.',previews:async c=>[v2(questJournal(49,{link:1,lives:1,tournament:0,blackjack:2,casino:0},11_640,{link:c.channel('lier-mon-compte'),games:c.channel('mini-jeux'),offers:c.channel('toutes-les-offres')}))]},
  {key:'season',title:'Classement de la saison du tournoi',where:'🏅︱classements · réécrit après chaque tournoi, figé à la fin du mois (historique)',note:'Pseudos fictifs. Le détail montre chaque place obtenue ; un absent compte juste dans le « 3/4 ».',previews:async()=>[v2(seasonCard(SEASON_EXAMPLE))]},
  {key:'offer-rainbet',title:'Carte Rainbet (partenaire principal)',where:'🌧️︱rainbet · remplace l’ancien message, Rainbet passe en tête des offres',previews:async()=>[{...rainbetCard(),allowedMentions:{parse:[]}} as Preview]},
  {key:'tournament',title:'Tournoi : inscriptions /tournoi et choix du bonus',where:'⚔️︱tournoi · /tournoi + nom de la machine (autocomplétion), puis confirmation privée',
    note:`Prix d’achat commun : ${(BUY_CENTS()/100).toLocaleString('fr-FR')} € par bonus (modifiable à l’ouverture). La mise découle du multiplicateur du bonus. Une machine ne peut être prise qu’une fois.`,previews:async c=>{
    const pick=async(name:string,bonus:number)=>{const s=exSlot(name);if(!s)return null;const o=exOptions(s)[bonus]??exOptions(s)[0]!;
      return {s,o,e:{discord_id:c.botId,display_name:'Pseudo',slot_name:s.name,slot_key:s.key,provider:s.provider,image_url:s.image,bonus_label:o.label,multiplier:o.multiplier?String(o.multiplier):null,bet_cents:o.betCents,cost_cents:o.costCents,place:null}};};
    const rows=(await Promise.all([pick('wanted dead or a wild',1),pick('fruit party',0),pick('le bandit',0),pick('sugar rush 1000',0)])).filter(x=>x!==null);
    const first=rows[0]!;
    return [text('**Étape 1 · le joueur tape `/tournoi wanted` et choisit dans la liste. Il voit (lui seul) :**'),
      {...confirmCard(first.s,exOptions(first.s),first.o.id),allowedMentions:{parse:[]}} as Preview,
      text('**Si la machine est déjà prise :**'),{...confirmCard(first.s,[],null,c.botId),allowedMentions:{parse:[]}} as Preview,
      text('**Étape 2 · la carte des inscriptions dans ⚔️︱tournoi :**'),
      {...registrationCard({title:'Tournoi du samedi 6 décembre',status:'open',buy_cents:BUY_CENTS()},rows.map(r=>r.e)),allowedMentions:{parse:[]}} as Preview];}},
  {key:'bracket',title:'Tournoi en direct : bracket, chat Rumble, pings',where:'⚔️︱tournoi + chat Rumble de Belva + page web lunalive.win/belva/tournoi',
    note:'Exemple avec 4 joueurs fictifs. Tirage automatique samedi 18 h ; tant que cette fiche n’est pas validée, aucun tirage ne se fait.',previews:async c=>{
    const names=['wanted dead or a wild','fruit party','le bandit','sugar rush 1000'],pseudo=['Mise_Max','Lucky_Léo','Spin_Sam','Tilt_Zéro'];
    const players:LiveState['players']={};const ids=['1','2','3','4'].map(n=>`${c.botId.slice(0,-1)}${n}`);
    for(const [k,q] of names.entries()){const s=exSlot(q);const o=s?exOptions(s)[0]:null;
      players[ids[k]!]={rumble:pseudo[k]!,name:pseudo[k]!,slot:s?.name??q,image:s?.image??null,bonus:o?.label??'Bonus'};}
    const [a,b,cc,d]=ids as [string,string,string,string];
    const state:LiveState={tournament:{id:0,status:'live',version:3,champion:null},players,bracket:{rounds:2,champion:null,places:{[cc]:3},
      current:{key:'1-1',player:b,opponent:d},
      matches:[{key:'1-0',round:1,a,b:cc,bestOf:1,legs:[{a:24500,b:8000}],winsA:1,winsB:0,winner:a,loser:cc,status:'done'},
        {key:'1-1',round:1,a:b,b:d,bestOf:1,legs:[],winsA:0,winsB:0,winner:null,loser:null,status:'ready'},
        {key:'2-0',round:2,a,b:null,bestOf:3,legs:[],winsA:0,winsB:0,winner:null,loser:null,status:'waiting'}]}};
    return [
      text(`**Le site** : <${BRACKET_URL}> · bracket en direct, et pour le staff connecté : saisie et correction des gains (source de vérité).`),
      text('**Carte en direct dans ⚔️︱tournoi :**'),{...bracketCard('Tournoi du samedi 6 décembre',state),allowedMentions:{parse:[]}} as Preview,
      text(['**Dans le chat Rumble (court, sans mise en page) :**',
        `> Mise_Max (${players[a]!.slot}) : 245 € · au tour de Spin_Sam (${players[cc]!.slot})`,
        `> Mise_Max (${players[a]!.slot}) vs Spin_Sam (${players[cc]!.slot}) [245 € - 80 €] [Gagnant : Mise_Max (${players[a]!.slot})] [Perdant : Spin_Sam +17 pts]`,
        `> Suivant : Lucky_Léo (${players[b]!.slot}) vs Tilt_Zéro (${players[d]!.slot})`,
        `> Lucky_Léo (${players[b]!.slot}) vs Tilt_Zéro (${players[d]!.slot}) [0 € - 0 €] [Égalité : on rachète]`,
        `> Mise_Max (${players[a]!.slot}) vs Tilt_Zéro (${players[d]!.slot}) [310 € - 95 €] [Champion : Mise_Max (${players[a]!.slot}) +25 pts] [Perdant : Tilt_Zéro +20 pts]`,
        '-# Points de saison = 10 de présence + bonus de place (1er +15, 2e +10, 3e +7, 4e-5e +4).'].join('\n')),
      text('**Ping au joueur éliminé (⚔️︱tournoi) :**\n'+eliminationText(c.botId,'Demi-finales',3)),
      text('**Fin du tournoi :**\n'+championText(c.botId,players[a]!.slot)),
    ];}},
  {key:'agenda',title:'Agenda de la semaine',where:'📅︱agenda (nouveau salon dans Infos) · /agenda absent, note, effacer pour le staff',
    note:'Exemple avec une absence et une note. Programme validé avec Belva le 18/11 : pas de stream lundi matin ni dimanche soir, hunt le mercredi, tournoi le samedi.',
    previews:async c=>{const m=mondayOf(new Date(Date.UTC(2026,11,1,12)));
      return [v2(agendaCard(m,[{day:'2026-12-02',slot:'matin',kind:'absent',who:'LeCasiNoze',text:null},{day:'2026-12-06',slot:'journee',kind:'note',who:null,text:'Giveaway 50 € à 21 h'}],null,{hunt:c.channel('hunt'),tournament:c.channel('tournoi')}))];}},
  {key:'hunt',title:'Hunt des viewers du mercredi',where:'🎯︱hunt (nouveau salon dans Récompenses) + /hunt sur Discord + chat LunaLive de LeCasiNoze + chat Rumble de Belva',
    note:'Exemple fictif. Tant que cette fiche n’est pas validée : /hunt répond « bientôt », /hunt (LunaLive), !open et !bonus ne font rien.',previews:async c=>{
    const img=async(q:string)=>exSlot(q)?.image??null;
    const it=async(slot:string,caller:string,bet:number,pay:number|null,bonus=true)=>({slot,caller,bet,pay,bonus,image:await img(slot)});
    const items=[await it('Wanted Dead or a Wild','Mise_Max',1.2,245),await it('Fruit Party','Lucky_Léo',1.2,18),await it('Le Bandit','Spin_Sam',1.2,null),
      await it('Sugar Rush 1000','Tilt_Zéro',1,null),await it('Gates of Olympus','Bonus_Hunter',0,null,false)];
    const base={id:0,startedAt:new Date(Date.UTC(2026,11,2,9)),start:600};
    return [
      text(['**Le parcours :**','> 1 · Mercredi matin, LeCasiNoze tape **/hunt** dans son chat LunaLive : son hunt est archivé puis vidé, les calls du Discord arrivent dans sa file.',
        '> 2 · Les membres 🍾 Carré Or proposent leur machine avec **/hunt** sur le Discord (une par personne, jamais deux fois la même).',
        '> 3 · LeCasiNoze farme comme d’habitude dans l’outil Hunt : chaque bonus garde le pseudo de celui qui l’a callé.',
        '> 4 · Le soir, Belva (ou un modo) tape **!open** puis **!bonus <gain>** après chaque bonus.'].join('\n')),
      text('**Carte pendant le farm :**'),v2(huntCard({...base,status:'farm',items:items.map(i=>i.slot==='Wanted Dead or a Wild'||i.slot==='Fruit Party'?{...i,pay:null}:i)})),
      text('**Carte pendant l’ouverture :**'),v2(huntCard({...base,status:'open',items})),
      text(['**Chat Rumble de Belva (court) :**',
        '> 🎯 Ouverture du hunt : 4 bonus · start 600 € · BE x130 · 1er : Wanted Dead or a Wild (Mise_Max) bet 1,20 €',
        '> Wanted Dead or a Wild (Mise_Max) : 245 € (x204) · BE x104 · 3 restants · Suivant : Fruit Party (Lucky_Léo) bet 1,20 €',
        '> Sugar Rush 1000 (Tilt_Zéro) : 40 € (x40) · 🏁 Hunt terminé : 615 € pour 600 € (+15 €) · Meilleur call : Wanted Dead or a Wild x204 (Mise_Max)'].join('\n')),
      text('**Réponse à /hunt (visible par lui seul) :**\n> 🎯 **Call enregistré !** Le Bandit (3ᵉ dans la file). Suis le hunt en direct dans #🎯︱hunt.'),
    ];}},
  {key:'xp-top',title:'Classement de l’XP : top 10 et /rang',where:'🏅︱classements (avec la saison du tournoi) · /rang en réponse privée',
    note:'Exemple fictif. L’XP ne compte qu’à partir du lancement (BELVA_XP_START, 1er décembre). Les grades se posent tout seuls ; Rubis et plus demandent le rôle 🍾 Carré Or.',
    previews:async c=>[
      v2(topCard([{discord_id:c.botId,xp:12_480},{discord_id:c.botId,xp:9_350},{discord_id:c.botId,xp:4_120},{discord_id:c.botId,xp:2_910},{discord_id:c.botId,xp:640}])),
      text('**Réponse à /rang (visible par lui seul) :**\n> '+rankText(47,212,1_930).replace(/\n/g,'\n> ')),
      text(['**D’où vient l’XP :**','> 💬 Chat Rumble de Belva pendant le live · **+5** (max 1 toutes les 5 min, compte relié)',
        '> ⚔️ Tournoi du samedi · **25** + **20 par duel gagné**','> ✅ Compte casino vérifié · **+300** par casino',
        '> 💸 Dépôt remboursé · **1 XP par €** déposé (les dépôts offerts ne comptent pas)','> 🌧️ Wager Rainbet · **1 XP par 10 $** misés','> 🎯 Call du hunt du mercredi · **1 XP par tranche de 5x** (max 500)',
        '-# Les quêtes (/quetes) arriveront ensuite avec leurs boutons et le MP du lundi.'].join('\n')),
    ]},
  {key:'link-prompt',title:'Message « relie ton compte » avec bouton',where:'Réponse privée quand le compte Rumble n’est pas relié : /blackjack, /slot, /claim, /bcoins, /tournoi',
    note:'Le bouton lance directement la liaison (même parcours que /lier, MP compris).',previews:async()=>[{...linkPrompt('Tes **BCoins** sont attachés à ton pseudo Rumble : relie ton compte pour jouer.'),allowedMentions:{parse:[]}} as Preview]},
  {key:'tips',title:'!tips : tip annoncé en live',where:'Chat Rumble de Belva (staff) + MP au joueur + note staff dans 📋︱liste-remboursements',
    note:'Le MP n’est envoyé qu’après validation. La réponse dans le chat donne le pseudo casino vérifié pour tipper tout de suite.',previews:async()=>[
      text(['**Dans le chat Rumble :**','> !tips Mise_Max 20','> 💸 Tip pour Mise_Max (20 €) → Rainbet : MiseMax77','> 💸 Tip pour Spin_Sam : compte pas encore relié. Spin_Sam, tape !lier pour qu’on te retrouve sur le Discord de Belva.'].join('\n')),
      text('**MP reçu par le joueur :**'),{...tipDm('LeCasiNoze',20),allowedMentions:{parse:[]}} as Preview]},
  {key:'onboarding',title:'Parcours d’arrivée : règlement → notifications → Rumble',where:'📜 règlement + réponses privées · ⚠️ Valider ferme le serveur aux nouveaux tant qu’ils n’ont pas accepté le règlement',
    note:'À la validation : rôle technique 🔓 Accès donné à tous les membres actuels (personne ne perd l’accès), catégories fermées aux non-acceptés, ancien règlement remplacé par la carte ci-dessous. 🌙 Habitué = règlement accepté + Rumble lié (après validation de la fiche Rôles).',
    previews:async c=>[text('**Le règlement (un seul message) :**'),v2(rulesCard()),text('**Après le clic, en privé :**'),v2(notifStep()),v2(linkStep()),
      v2(doneStep({offers:c.channel('toutes-les-offres'),rewards:c.channel('récompenses'),games:c.channel('mini-jeux'),general:c.channel('général')}))]},
  {key:'hunt-week',title:'Section hunt : calls à l’avance, règles, rappels',where:'🎯︱hunt (carte permanente) + réponse privée + 📢︱annonces (@everyone au lancement, à mi-parcours et 24 h avant)',
    note:'Premier hunt le mercredi 25 novembre ; les calls sont réservés dès maintenant et entrent dans la file à l’ouverture du farm. Réservé aux 🍾 Carré Or ; les autres reçoivent le message « réservé aux joueurs qui ont déposé ».',
    previews:async c=>[text('**Carte du salon 🎯︱hunt :**'),v2(huntInfoCard('2026-11-25',[{slot:'Sweet Bonanza',who:'Mise_Max'},{slot:'Wanted Dead or a Wild',who:'Spin_Sam'}],{offers:c.channel('toutes-les-offres'),guide:c.channel('guide-vip')})),
      text('**Si le membre n’est pas Carré Or (en privé) :**'),v2(notEligibleCard(c.channel('toutes-les-offres'))),
      text('**Rappel dans 📢︱annonces (exemple : la veille) :**'),v2(huntReminder('h24','2026-11-25',new Date(Date.UTC(2026,10,25,18,30)),7,{hunt:c.channel('hunt'),offers:c.channel('toutes-les-offres'),guide:c.channel('guide-vip')}))]},
  {key:'tournament-reminder',title:'Rappels du tournoi du samedi',where:'📢︱annonces (@everyone au lancement, à mi-parcours et 24 h avant)',
    note:'Premier tournoi le samedi 28 novembre (tirage à 18 h). Inscriptions ouvertes dès la validation de la fiche Tournoi, qui a maintenant un bouton S’inscrire.',
    previews:async c=>[v2(tournamentReminder('launch','Tournoi du samedi 28 novembre',new Date(Date.UTC(2026,10,28,17)),3,120,{tournament:c.channel('tournoi')}))]},
  {key:'race',title:'Wager race Rainbet (nouvelle carte)',where:'🏆︱wager-race · ⚠️ Valider vide le salon et n’y laisse que cette carte',
    note:'Exemple avec des mises fictives. Le classement réel vient de l’API Rainbet et se met à jour toutes les 5 minutes.',
    previews:async()=>[v2(await belvaRaceCard([{username:'BelvaaaTV',wagered:12450},{username:'PIAILLE',wagered:8120},{username:'MiseMax',wagered:2310},{username:'SpinSam',wagered:940},{username:'Lucky77',wagered:410}],[],new Date(Date.UTC(2026,10,20,12))))]},
  {key:'vip-guide',title:'Guide VIP : XP, grades et avantages',where:'📖︱guide-vip (nouveau salon dans Récompenses)',
    note:'Les boutons « Guide VIP » du hunt et des rappels y renvoient.',
    previews:async c=>[v2(vipGuideCard({offers:c.channel('toutes-les-offres'),hunt:c.channel('hunt'),tournament:c.channel('tournoi')}))]},
];

function wrap(card:{files:{attachment:Buffer;name:string}[];components:object[]}){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x19d3d3,components:card.components}] as never[],files:card.files};
}

const STATUS:Record<string,string>={pending:'⏳ En attente de ta validation',approved:'✅ Validé',rejected:'❌ À revoir'};
function verdict(d:Design,row:{status:string;note:string|null;decided_by:string|null;decided_at:Date|null}){
  const who=row.decided_by?` par <@${row.decided_by}> <t:${Math.floor(new Date(row.decided_at!).getTime()/1000)}:R>`:'';
  return {content:`**${STATUS[row.status]}**${who} · « ${d.title} »${row.note?`\n> ${row.note.replace(/\n/g,'\n> ')}`:''}`,allowedMentions:{parse:[] as never[]},
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${P}ok:${d.key}`).setLabel('Valider').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${P}no:${d.key}`).setLabel('À revoir').setEmoji('✏️').setStyle(ButtonStyle.Secondary))]};
}

async function reviewChannel(guild:Guild){
  const all=await guild.channels.fetch();
  const found=all.find(c=>c?.type===ChannelType.GuildText&&c.name===CHANNEL_NAME);
  if(found?.type===ChannelType.GuildText)return found;
  return guild.channels.create({name:CHANNEL_NAME,type:ChannelType.GuildText,parent:STAFF_CATEGORY,
    topic:'Aperçus des messages du bot à valider avant qu’ils passent en public.',
    permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:PATRON_ROLE,allow:[PermissionFlagsBits.ViewChannel]},
      {id:VIDEUR_ROLE,allow:[PermissionFlagsBits.ViewChannel]},{id:guild.client.user!.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]}]});
}

const versionOf=(d:Design,previews:Preview[])=>createHash('sha1').update(d.title+d.where+(d.note??'')+JSON.stringify(previews,(_k,v)=>Buffer.isBuffer(v)||v instanceof Uint8Array?'bin':v)).digest('hex').slice(0,12);

export async function ensureReviews(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_REVIEWS==='false')return;
  await reviewSchema(pool);
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  const channel=await reviewChannel(guild);
  const chans=await guild.channels.fetch();
  const ctx:Ctx={botId:client.user!.id,pool,channel:suffix=>chans.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith('︱'+suffix))?.id};
  // Designs retirés du code (ex. tombola) : leurs fiches disparaissent du salon.
  for(const old of (await pool.query(`SELECT key,message_ids FROM belva_design_reviews WHERE NOT (key=ANY($1::text[]))`,[DESIGNS.map(d=>d.key)])).rows){
    for(const id of old.message_ids??[])await channel.messages.delete(id).catch(()=>undefined);
    await pool.query(`DELETE FROM belva_design_reviews WHERE key=$1`,[old.key]);forgetApproval(old.key);
  }
  for(const [i,d] of DESIGNS.entries()){
    const previews=await d.previews(ctx);const version=versionOf(d,previews);
    const row=(await pool.query(`SELECT * FROM belva_design_reviews WHERE key=$1`,[d.key])).rows[0];
    if(row?.version===version)continue;
    for(const id of row?.message_ids??[])await channel.messages.delete(id).catch(()=>undefined);
    const ids:string[]=[];
    ids.push((await channel.send({content:`## ${i+1} · ${d.title}\n📍 ${d.where}${d.note?`\n-# ${d.note}`:''}${row?'\n-# 🔁 Nouvelle version : à revalider.':''}`,allowedMentions:{parse:[]}})).id);
    for(const p of previews)ids.push((await channel.send(p)).id);
    const fresh={status:'pending',note:null,decided_by:null,decided_at:null};
    ids.push((await channel.send(verdict(d,fresh))).id);
    await pool.query(`INSERT INTO belva_design_reviews(key,version,status,message_ids) VALUES($1,$2,'pending',$3)
      ON CONFLICT(key) DO UPDATE SET version=$2,status='pending',note=NULL,decided_by=NULL,decided_at=NULL,message_ids=$3,updated_at=NOW()`,[d.key,version,ids]);
    forgetApproval(d.key);
  }
  // Palette validée mais pas (entièrement) appliquée : on la réapplique au démarrage.
  const roles=(await pool.query(`SELECT version,status,applied_version FROM belva_design_reviews WHERE key='roles'`)).rows[0];
  if(roles?.status==='approved'&&roles.applied_version!==roles.version+APPLY_REV)await applyRoles(guild,pool,channel,roles.version+APPLY_REV);
}

// À incrémenter quand applyRoleSpec change sans que la palette change (ex. correctif d'ordre des rôles).
const APPLY_REV=':2';
async function applyRoles(guild:Guild,pool:Pool,channel:TextChannel|null,applied:string){
  const report=await applyRoleSpec(guild).catch(e=>[`❌ ${(e as Error).message}`]);
  await pool.query(`UPDATE belva_design_reviews SET applied_version=$1 WHERE key='roles'`,[applied]);
  await channel?.send({content:`### 🎨 Rôles appliqués\n${report.join('\n')}`,allowedMentions:{parse:[]}});
}

export async function handleBelvaReview(i:Interaction,pool?:Pool):Promise<boolean>{
  const id=(i.isButton()||i.isModalSubmit())?i.customId:'';
  if(!id.startsWith(P)||i.guildId!==GUILD_ID())return false;
  if(!pool||!i.inCachedGuild())return true;
  const [action,key]=id.slice(P.length).split(':');
  const d=DESIGNS.find(x=>x.key===key);if(!d)return true;
  const m=i.member;
  if(!(m.roles.cache.has(PATRON_ROLE)||m.roles.cache.has(VIDEUR_ROLE)||m.permissions.has(PermissionFlagsBits.Administrator))){
    if(i.isRepliable())await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
  if(i.isButton()&&action==='no'){
    await i.showModal(new ModalBuilder().setCustomId(`${P}note:${key}`).setTitle('À revoir').addLabelComponents(
      new LabelBuilder().setLabel('Qu’est-ce qu’on change ?').setTextInputComponent(
        new TextInputBuilder().setCustomId('note').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))));
    return true;
  }
  const status=action==='ok'?'approved':'rejected';
  const note=i.isModalSubmit()?i.fields.getTextInputValue('note').trim()||null:null;
  await reviewSchema(pool);
  // Valider après « À revoir » garde la note écrite ; chaque clic est aussi historisé.
  const row=(await pool.query(`UPDATE belva_design_reviews SET status=$2,note=COALESCE($3,note),decided_by=$4,decided_at=NOW(),updated_at=NOW() WHERE key=$1 RETURNING *`,[key,status,note,i.user.id])).rows[0];
  await pool.query(`INSERT INTO belva_design_review_log(key,version,status,note,decided_by) VALUES($1,$2,$3,$4,$5)`,[key,row?.version??null,status,note,i.user.id]);
  forgetApproval(key);
  if(!row)return true;
  if(i.isButton())await i.update(verdict(d,row));
  else if(i.isModalSubmit()){await i.deferUpdate();await i.message?.edit(verdict(d,row));}
  if(key==='onboarding'&&status==='approved')await applyOnboarding(i.client,pool).catch(e=>console.error('[nozebot] parcours d’arrivée',e));
  if(key==='vip-guide'&&status==='approved')await ensureVipGuide(i.client,pool).catch(e=>console.error('[nozebot] guide VIP',e));
  if(key==='agenda'&&status==='approved')await refreshAgenda(i.client,pool).catch(e=>console.error('[nozebot] agenda',e));
  if(key==='offer-rainbet'&&status==='approved')await ensureBelvaRainbetPanel(i.client,pool).catch(e=>console.error('[nozebot] carte Rainbet',e));
  if(key==='roles'&&status==='approved')await applyRoles(i.guild,pool,i.channel as TextChannel|null,row.version+APPLY_REV);
  return true;
}
