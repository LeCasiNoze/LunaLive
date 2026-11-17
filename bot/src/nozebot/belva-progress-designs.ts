import {MessageFlags} from 'discord.js';
import {ROLE_SPEC,GRADE_KEYS} from './belva-role-spec.js';

// Grades, quêtes et saison du tournoi : barèmes et rendus des messages (soumis à validation avant activation).
// Chaque grade a 5 sous-niveaux (I à V). Rubis et au-dessus demandent un dépôt vérifié.
export const GRADES=[
  {key:'bronze',xp:300,perk:'Ton grade s’affiche dans la liste des membres'},
  {key:'fer',xp:3_000,perk:'+10 BCoins sur chaque /claim'},
  {key:'or',xp:9_000,perk:'+25 BCoins sur chaque /claim · giveaways réservés aux grades Or et plus'},
  {key:'rubis',xp:22_000,perk:'+50 BCoins sur chaque /claim · accès au salon 💎 VIP',deposit:true},
  {key:'saphir',xp:45_000,perk:'+75 BCoins sur chaque /claim · giveaway mensuel réservé Saphir et plus',deposit:true},
  {key:'diamant',xp:85_000,perk:'+100 BCoins sur chaque /claim · ton !call passe en priorité une fois par live',deposit:true},
  {key:'obsidienne',xp:150_000,perk:'Tous les avantages · rôle affiché tout en haut · cadeau surprise de Belva',deposit:true},
] as const;
const XP_MAX=250_000;
const ROMAN=['I','II','III','IV','V'];

export type Level={grade:typeof GRADES[number];index:number;tier:number;label:string;floor:number;next:number|null};
// Paliers des sous-niveaux : 5 marches égales entre un grade et le suivant, arrondies à 50 XP.
export function levelThresholds(){
  return GRADES.flatMap((g,i)=>{const top=GRADES[i+1]?.xp??XP_MAX;
    return ROMAN.map((_,t)=>({grade:g,index:i,tier:t+1,xp:Math.round((g.xp+(top-g.xp)*t/5)/50)*50}));});
}
export function levelFor(xp:number):Level|null{
  const all=levelThresholds();let k=-1;for(let j=0;j<all.length;j++)if(xp>=all[j]!.xp)k=j;if(k<0)return null;
  const l=all[k]!;const spec=ROLE_SPEC.find(r=>r.key===l.grade.key)!;
  return {grade:l.grade,index:l.index,tier:l.tier,label:`${spec.name} ${ROMAN[l.tier-1]}`,floor:l.xp,next:all[k+1]?.xp??null};
}

export const XP_RULES=[
  ['Message dans le chat Rumble pendant le live','+5 XP (max 1 toutes les 5 min)'],
  ['Participation au tournoi du samedi','+50 XP'],
  ['Quête de la semaine terminée','+40 à +150 XP'],
  ['Compte casino vérifié','+300 XP'],
  ['Dépôt remboursé ou offert payé','+500 XP'],
] as const;
export const SEASON_POINTS={presence:10,place:[15,10,7,4,4],fullAttendance:10,prizes:['50 €','30 €','20 €']};

const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const spec=(key:string)=>ROLE_SPEC.find(r=>r.key===key)!;
const fr=(n:number)=>n.toLocaleString('fr-FR');
const bar=(pct:number)=>'▰'.repeat(Math.round(pct/10))+'▱'.repeat(10-Math.round(pct/10))+` ${pct} %`;
const FOOT=T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.');
const v2=(accent:number,components:object[],mention?:string|string[])=>({flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{users:mention?[mention].flat():[]},
  components:[{type:17,accent_color:accent,components}] as never[]});

// Nouveau grade (Bronze → Fer…) : carte complète. Simple sous-niveau (Or II → Or III) : une ligne.
export function gradeUpCard(user:{id:string;avatarUrl:string},xp:number){
  const l=levelFor(xp)!;const s=spec(l.grade.key);const next=levelFor(l.next??xp);
  const pct=l.next?Math.min(99,Math.round((xp-l.floor)/(l.next-l.floor)*100)):100;
  const nextGrade=GRADES[l.index+1];
  return v2(s.color,[
    {type:9,components:[T(`# ${s.name.split(' ')[0]} Nouveau grade : ${l.label.split(' ').slice(1).join(' ')} !`),T(`Bravo <@${user.id}>, tu passes **${l.label}** avec **${fr(xp)} XP**.`)],
      accessory:{type:11,media:{url:user.avatarUrl},description:'Membre'}},
    SEP(),
    T(`### 🎁 Ce que ça débloque\n> ${l.grade.perk}`),
    T(l.next?`### ⏭️ Prochain palier : ${next?.label}\n\`${bar(pct)}\` · ${fr(l.next)} XP`:'### 🖤 Niveau maximum atteint'),
    ...(nextGrade?[T(`-# Prochain grade : ${spec(nextGrade.key).name} à ${fr(nextGrade.xp)} XP${'deposit' in nextGrade&&nextGrade.deposit?' · dépôt vérifié requis':''}`)]:[]),
    SEP(1,false),
    T('-# Gagne de l’XP en live, au tournoi du samedi et avec les quêtes : tape **/quetes**.'),
  ],user.id);
}
export function tierUpLine(userId:string,xp:number){
  const l=levelFor(xp)!;return {content:`${l.label.split(' ')[0]} <@${userId}> passe **${l.label}** · ${fr(xp)} XP`,allowedMentions:{users:[userId]}};
}

export function questJournalCard(week:number){
  const q=[
    {done:true,label:'Relier ton compte Rumble',reward:'+150 XP · une seule fois'},
    {done:false,label:'Être présent à 3 lives (au moins un message)',progress:'1/3',reward:'+90 XP'},
    {done:false,label:'Participer au tournoi du samedi',reward:'+80 XP'},
    {done:true,label:'Jouer 3 mains de blackjack',progress:'3/3',reward:'+40 XP'},
    {done:false,label:'Vérifier un compte casino partenaire',reward:'+300 XP · rôle 🃏 Membre du Club'},
  ];
  const doneN=q.filter(x=>x.done).length;const l=levelFor(11_640)!;
  return v2(spec('or').color,[
    T(`# 📜 Journal de quêtes · semaine ${week}`),
    T(`${l.label} · **${fr(11_640)} XP** · ${doneN}/${q.length} quêtes terminées\n\`${bar(Math.round(doneN/q.length*100))}\``),
    SEP(),
    T(q.map(x=>`${x.done?'✅':'⬜'} **${x.label}**${x.progress?` · ${x.progress}`:''}\n-# ${x.reward}`).join('\n')),
    SEP(1,false),
    T('-# Nouvelles quêtes chaque lundi à 0 h. Les quêtes « une seule fois » ne reviennent pas.'),
  ]);
}

export type SeasonRow={name:string;id?:string;places:(number|null)[]};
export function seasonScore(r:SeasonRow,total:number){
  const P=SEASON_POINTS,played=r.places.filter((p):p is number=>p!==null);
  return played.length*P.presence+played.reduce((s,p)=>s+(P.place[p-1]??0),0)+(total>0&&played.length===total?P.fullAttendance:0);
}
const place=(p:number)=>p===1?'1er':`${p}ᵉ`;
// Classement de la saison (un message par mois, réécrit après chaque tournoi, figé à la fin du mois).
export function seasonCard(s:{month:string;total:number;rows:SeasonRow[];final?:boolean}){
  const P=SEASON_POINTS;
  const sorted=[...s.rows].map(r=>({r,score:seasonScore(r,s.total),played:r.places.filter(p=>p!==null).length}))
    .sort((a,b)=>b.score-a.score||b.played-a.played).slice(0,25);
  const medal=['🥇','🥈','🥉'];
  return v2(spec('saphir').color,[
    T(`# ⚔️ Saison du tournoi · ${s.month}${s.final?' · terminée':''}`),
    T(s.final?`Saison close après **${s.total}** tournois. Le top 3 gagne **${P.prizes.join(' · ')}**.`
      :`Un tournoi **chaque samedi** pendant le live (**${s.total}** joué${s.total>1?'s':''}). Le top 3 du mois gagne **${P.prizes.join(' · ')}** (comptes casino vérifiés).`),
    SEP(),
    T(sorted.length?sorted.map((x,i)=>`${medal[i]??`\`${i+1}.\``} ${x.r.id?`<@${x.r.id}>`:`**${x.r.name}**`} · **${x.score} pts** · ${x.played}/${s.total}\n-# ${x.r.places.filter((p):p is number=>p!==null).map(place).join(' · ')}`).join('\n'):'Aucun résultat pour l’instant.'),
    SEP(),
    T(`### 📏 Barème\n> **${P.presence} pts** pour chaque tournoi joué\n> Bonus classement : 1er **+${P.place[0]}** · 2e **+${P.place[1]}** · 3e **+${P.place[2]}** · 4e-5e **+${P.place[3]}**\n> **+${P.fullAttendance} pts** si tu joues tous les tournois du mois\n-# Venir à chaque fois rapporte plus qu’un seul tournoi gagné. Égalité : le plus de tournois joués passe devant.`),
    FOOT,
  ],s.rows.map(r=>r.id).filter((x):x is string=>!!x));
}
export const SEASON_EXAMPLE:{month:string;total:number;rows:SeasonRow[]}={month:'décembre',total:4,rows:[
  {name:'Mise_Max',places:[8,2,2,1]},{name:'Lucky_Léo',places:[1,5,9,6]},{name:'Tilt_Zéro',places:[null,1,1,3]},
  {name:'Bonus_Hunter',places:[4,7,6,11]},{name:'Spin_Sam',places:[null,null,null,1]}]};
export {GRADE_KEYS};
