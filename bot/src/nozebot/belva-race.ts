import sharp from 'sharp';
import {MessageFlags,type Interaction,type Message,type TextChannel} from 'discord.js';
import * as L from './belva-layout.js';
import {RACE_MIN_WAGER_USD,RACE_PRIZES_USD,maskName,raceRange,ranking,type RaceEntry} from './rainbet-race.js';

// Wager race Rainbet sur le Discord de Belva : carte Components V2 (même DA que les cartes casino),
// bannière podium en grand, classement lisible en texte, étapes et boutons.
export const BELVA_GUILD=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const REFERRAL_URL='https://rainbet.com/?r=nivoranet';
const MARK='belva-race-v2';
export const JOIN_ID='belva:race:join';
const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const usd=(n:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n).replace(/[  ]/g,' ')} $`;
const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));

export async function raceBanner(pot:number,top:{name:string;wagered:number;prize:number}[],label:string,brand='BELVA'){
  const slot=(i:number,x:number,h:number,color:string,medal:string)=>{
    const e=top[i];const y=470-h;
    return `<rect x="${x}" y="${y}" width="300" height="${h}" rx="24" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="4"/>
      <circle cx="${x+150}" cy="${y+48}" r="30" fill="${color}"/><text x="${x+150}" y="${y+62}" font-size="38" font-weight="900" fill="#0b1a3a" text-anchor="middle">${medal}</text>
      <text x="${x+150}" y="${y+118}" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${esc(e?e.name:'À prendre')}</text>
      <text x="${x+150}" y="${y+162}" font-size="30" fill="#cfc6e6" text-anchor="middle">${e?usd(e.wagered):'—'}</text>
      <text x="${x+150}" y="${y+h-26}" font-size="44" font-weight="800" fill="${color}" text-anchor="middle">${RACE_PRIZES_USD[i]} $</text>`;
  };
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500" font-family="DejaVu Sans, sans-serif">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a3a"/><stop offset="1" stop-color="#1b0f33"/></linearGradient></defs>
    <rect width="1200" height="500" rx="32" fill="url(#bg)"/>
    <text x="60" y="88" font-size="58" font-weight="800" fill="#fff">WAGER RACE</text>
    <text x="60" y="140" font-size="34" fill="#3D8BFF" font-weight="700">RAINBET × ${brand}</text>
    <text x="1140" y="96" font-size="84" font-weight="900" fill="#F3C14B" text-anchor="end">${pot} $</text>
    <text x="1140" y="140" font-size="28" fill="#cfc6e6" text-anchor="end">${esc(label)}</text>
    ${slot(1,90,270,'#C0C7D6','2')}${slot(0,450,310,'#F3C14B','1')}${slot(2,810,250,'#D08B5B','3')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function belvaRaceCard(current:RaceEntry[],previous:RaceEntry[],now:Date,brand='BELVA'){
  const r=raceRange(now),prev=raceRange(now,-1);
  const top=ranking(current,RACE_PRIZES_USD);
  const pot=RACE_PRIZES_USD.reduce((a,b)=>a+b,0);
  const banner=await raceBanner(pot,top.slice(0,3).map(e=>({name:maskName(e.username),wagered:e.wagered,prize:e.prize})),r.label,brand);
  const rest=top.slice(3).map(e=>`**${e.rank}.** ${maskName(e.username)} · ${usd(e.wagered)}`);
  const winners=prev.monthly?ranking(previous,RACE_PRIZES_USD).filter(e=>e.prize):[];
  const ends=Math.floor(r.endsAt.getTime()/1000);
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},files:[{attachment:banner,name:'race-banner.png'}],components:[{type:17,accent_color:0x3D8BFF,components:[
    {type:12,items:[{media:{url:'attachment://race-banner.png'},description:`Wager race Rainbet : ${pot} $ à gagner`}]},
    T(`# 🏁 Wager Race Rainbet\n## ${pot} $ à gagner chaque mois\n🥇 **100 $** · 🥈 **60 $** · 🥉 **40 $** · fin <t:${ends}:R>`),
    SEP(),
    ...L.step('1 · Crée ton compte Rainbet',`Avec ${brand==='BELVA'?'le lien de Belva':'notre lien'} (code **NIVORANET**) : c’est ce qui t’inscrit à la race.`,[L.btn('Rejoindre la race','🏁',3,JOIN_ID)]),
    L.GAP,
    ...L.step('2 · Joue',`Chaque mise compte automatiquement. Mise au moins **${usd(RACE_MIN_WAGER_USD)}** sur le mois pour être payé.`),
    L.LINE,
    T(`### 📊 Classement · ${r.label}\n${top.length?`🥇 ${top[0]?`${maskName(top[0].username)} · ${usd(top[0].wagered)}`:'—'}\n🥈 ${top[1]?`${maskName(top[1].username)} · ${usd(top[1].wagered)}`:'—'}\n🥉 ${top[2]?`${maskName(top[2].username)} · ${usd(top[2].wagered)}`:'—'}${rest.length?'\n'+rest.join('\n'):''}`:'Personne n’a encore misé ce mois-ci : la première place est à prendre !'}`),
    ...(winners.length?[SEP(1,false),T(`### 🏆 Gagnants du mois dernier\n${winners.map(e=>`${['🥇','🥈','🥉'][e.rank-1]} ${maskName(e.username)} · **${e.prize} $**`).join('\n')}`)]:[]),
    SEP(),
    T(`-# Mises pondérées par Rainbet selon le RTP du jeu : le dice et les originals comptent moins que les slots. Mise à jour toutes les 5 min · ${MARK}\n-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.`),
  ]}] as never[]};
}

// Le salon ne garde que la carte de la race : au premier passage, tout le reste est supprimé.
export async function upsertBelvaRace(channel:TextChannel,payload:Awaited<ReturnType<typeof belvaRaceCard>>,cachedId?:string):Promise<string>{
  const me=channel.client.user!.id;
  let msg:Message|null=cachedId?await channel.messages.fetch(cachedId).catch(()=>null):null;
  // Un ancien panneau classique (embed) ne peut pas devenir une carte : on le remplace.
  if(msg&&!msg.flags.has(MessageFlags.IsComponentsV2))msg=null;
  if(!msg){
    const all=await channel.messages.fetch({limit:100});
    msg=all.find(m=>m.author.id===me&&JSON.stringify(m.components.map(c=>c.toJSON())).includes(MARK))??null;
    if(!msg)for(const m of all.values())await m.delete().catch(()=>undefined);
  }
  if(msg){await msg.edit({...payload,attachments:[]});return msg.id;}
  const sent=await channel.send(payload);await sent.pin('Garder la race visible').catch(()=>undefined);
  return sent.id;
}

// Bouton vert « Rejoindre la race » : réponse privée avec le lien Rainbet (un bouton lien ne peut pas être en couleur).
export async function handleBelvaRace(i:Interaction):Promise<boolean>{
  if(!i.isButton()||i.customId!==JOIN_ID)return false;
  await i.reply({flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral,components:[{type:17,accent_color:0x3D8BFF,components:[
    L.T('### 🏁 Rejoins la race Rainbet\nInscris-toi avec ce lien (code **NIVORANET**) : tes mises comptent automatiquement pour le classement.'),
    {type:1,components:[L.link('S’inscrire sur Rainbet','🌧️',REFERRAL_URL)]},
  ]}] as never[]});
  return true;
}
