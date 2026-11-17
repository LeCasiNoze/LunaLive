import {MessageFlags} from 'discord.js';
import {ROLE_SPEC,GRADE_KEYS} from './belva-role-spec.js';

// Grades, quêtes et saison du tournoi : barèmes proposés et rendus des messages (soumis à validation avant activation).
export const GRADES=[
  {key:'bronze',xp:100,perk:'Ton grade s’affiche dans la liste des membres'},
  {key:'fer',xp:500,perk:'+10 BCoins sur chaque /claim'},
  {key:'or',xp:1500,perk:'+25 BCoins sur chaque /claim · 1 ticket de tombola offert chaque semaine'},
  {key:'rubis',xp:4000,perk:'2 tickets offerts par semaine · accès au salon 💎 VIP',deposit:true},
  {key:'saphir',xp:8000,perk:'3 tickets offerts par semaine · giveaways réservés aux grades Saphir+',deposit:true},
  {key:'diamant',xp:15000,perk:'4 tickets offerts par semaine · ton !call passe en priorité une fois par live',deposit:true},
  {key:'obsidienne',xp:30000,perk:'5 tickets offerts par semaine · rôle affiché tout en haut · cadeau surprise de Belva',deposit:true},
] as const;
export const XP_RULES=[
  ['Message dans le chat Rumble pendant le live','+5 XP (max 1 toutes les 5 min)'],
  ['Code tombola validé avec /code','+20 XP'],
  ['Participation au tournoi du samedi','+50 XP'],
  ['Quête de la semaine terminée','+40 à +150 XP'],
  ['Compte casino vérifié','+300 XP'],
  ['Dépôt remboursé ou offert payé','+500 XP'],
] as const;
export const SEASON_POINTS={presence:10,place:[15,10,7,4,4],fullAttendance:10,prizes:['50 €','30 €','20 €']};

const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const spec=(key:string)=>ROLE_SPEC.find(r=>r.key===key)!;
const bar=(pct:number)=>'▰'.repeat(Math.round(pct/10))+'▱'.repeat(10-Math.round(pct/10))+` ${pct} %`;
const FOOT=T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.');
const v2=(accent:number,components:object[],mention?:string)=>({flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{users:mention?[mention]:[]},
  components:[{type:17,accent_color:accent,components}] as never[]});

export function gradeUpCard(user:{id:string;avatarUrl:string},key:typeof GRADE_KEYS[number],xp:number){
  const i=GRADES.findIndex(g=>g.key===key),g=GRADES[i],next=GRADES[i+1],s=spec(key);
  const pct=next?Math.min(99,Math.round((xp-g.xp)/(next.xp-g.xp)*100)):100;
  return v2(s.color,[
    {type:9,components:[T(`# ${s.name.split(' ')[0]} Nouveau grade : ${s.name.split(' ').slice(1).join(' ')} !`),T(`Bravo <@${user.id}>, tu passes **${s.name}** avec **${xp.toLocaleString('fr-FR')} XP**.`)],
      accessory:{type:11,media:{url:user.avatarUrl},description:'Membre'}},
    SEP(),
    T(`### 🎁 Ce que ça débloque\n> ${g.perk}`),
    T(next?`### ⏭️ Prochain grade : ${spec(next.key).name}\n\`${bar(pct)}\` · ${next.xp.toLocaleString('fr-FR')} XP${'deposit' in next&&next.deposit?' · dépôt vérifié requis':''}`:'### 🖤 Grade maximum atteint'),
    SEP(1,false),
    T('-# Gagne de l’XP en live, avec les codes tombola, le tournoi du samedi et les quêtes : tape **/quetes**.'),
  ],user.id);
}

export function questJournalCard(week:number){
  const q=[
    {done:true,label:'Relier ton compte Rumble',reward:'+150 XP · une seule fois'},
    {done:false,label:'Valider 3 codes tombola',progress:'1/3',reward:'+60 XP · 1 ticket bonus'},
    {done:false,label:'Participer au tournoi du samedi',reward:'+80 XP'},
    {done:true,label:'Jouer 3 mains de blackjack',progress:'3/3',reward:'+40 XP'},
    {done:false,label:'Vérifier un compte casino partenaire',reward:'+300 XP · rôle 🃏 Membre du Club'},
  ];
  const doneN=q.filter(x=>x.done).length;
  return v2(spec('or').color,[
    T(`# 📜 Journal de quêtes · semaine ${week}`),
    T(`${spec('or').name} · **1 640 XP** · ${doneN}/${q.length} quêtes terminées\n\`${bar(Math.round(doneN/q.length*100))}\``),
    SEP(),
    T(q.map(x=>`${x.done?'✅':'⬜'} **${x.label}**${x.progress?` · ${x.progress}`:''}\n-# ${x.reward}`).join('\n')),
    SEP(1,false),
    T('-# Nouvelles quêtes chaque lundi à 0 h. Les quêtes « une seule fois » ne reviennent pas.'),
  ]);
}

export function seasonCard(month:string){
  const rows=[['Lucky_Léo',4,1,0],['Mise_Max',4,0,2],['Tilt_Zéro',3,2,0],['Bonus_Hunter',4,0,0],['Spin_Sam',1,1,0]] as const;
  const P=SEASON_POINTS;
  const score=([,n,w,s]:readonly [string,number,number,number])=>n*P.presence+w*P.place[0]+s*P.place[1]+(n===4?P.fullAttendance:0);
  const sorted=[...rows].sort((a,b)=>score(b)-score(a)||b[1]-a[1]);
  const medal=['🥇','🥈','🥉'];
  return v2(spec('saphir').color,[
    T(`# ⚔️ Saison du tournoi · ${month}`),
    T(`Un tournoi **chaque samedi** pendant le live. Le top 3 du mois gagne **${P.prizes.join(' · ')}** (comptes casino vérifiés).`),
    SEP(),
    T(sorted.map((r,i)=>`${medal[i]??`\`${i+1}.\``} **${r[0]}** · **${score(r)} pts** · ${r[1]}/4 tournois${r[2]?` · ${r[2]}× 1er`:''}${r[3]?` · ${r[3]}× 2e`:''}`).join('\n')),
    SEP(),
    T(`### 📏 Barème\n> **${P.presence} pts** pour chaque tournoi joué\n> Bonus classement : 1er **+${P.place[0]}** · 2e **+${P.place[1]}** · 3e **+${P.place[2]}** · 4e-5e **+${P.place[3]}**\n> **+${P.fullAttendance} pts** si tu joues tous les tournois du mois\n-# Venir à chaque fois rapporte plus qu’un seul tournoi gagné. Égalité : le plus de tournois joués passe devant.`),
    FOOT,
  ]);
}
