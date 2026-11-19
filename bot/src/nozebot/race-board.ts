import {readFileSync} from 'node:fs';
import sharp from 'sharp';

// Classement de la wager race, mise en page inspirée des leaderboards de streamers (logo casino, gros montant,
// compte à rebours, podium à 3 cartes puis tableau). Une seule image pour les deux serveurs : la marque change
// les visuels des côtés et la couleur d'accent. Aucun texte sous 22 px pour 1200 px (lisible sur mobile).
export type BoardRow={rank:number;name:string;wagered:number;prize:number};
export type Brand='BELVA'|'LECASINOZE';
export const BOARD_LABELS={
  toWin:'À GAGNER', race:'WAGER RACE', remaining:'TEMPS RESTANT', d:'j', h:'h', min:'min',
  wagered:'MISÉS', prize:'GAIN', free:'Place libre', standings:'LE CLASSEMENT', from4:'À partir de la 4ᵉ place',
  rank:'RANG', player:'JOUEUR', min_wager:'misés minimum pour être payé', ended:'Terminée',
};
type Labels=typeof BOARD_LABELS;

const ASSETS=new URL('../../assets/',import.meta.url);
const b64=(p:string)=>`data:image/png;base64,${readFileSync(new URL(p,ASSETS)).toString('base64')}`;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const usd=(n:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n).replace(/[  ]/g,' ')} $`;
const BRAND={
  BELVA:{accent:'#22d3ee',glow:'#0891b2',side:'belva/logo-belva.png',round:false},
  LECASINOZE:{accent:'#ff7a3d',glow:'#c2410c',side:'lecasinoze/avatar.png',round:true},
} as const;
const MEDAL=[{fill:'#f5c518',ink:'#2a1d00',txt:'#f5c518'},{fill:'#cfd6e4',ink:'#1e2430',txt:'#dfe5f0'},{fill:'#e0995e',ink:'#2e1606',txt:'#f0a56a'}];

function countdown(endsAt:Date,now:Date,L:Labels,accent:string){
  const s=Math.max(0,Math.floor((endsAt.getTime()-now.getTime())/1000));
  if(!s)return `<text x="600" y="402" text-anchor="middle" font-size="46" font-weight="bold" fill="#fff">${L.ended}</text>`;
  const parts:[number,string][]=[[Math.floor(s/86400),L.d],[Math.floor(s/3600)%24,L.h],[Math.floor(s/60)%60,L.min]];
  // Largeur approximative de chaque bloc « nombre + unité » pour centrer l'ensemble.
  const w=parts.map(([n,u])=>String(n).padStart(2,'0').length*30+u.length*19+34);
  let x=600-w.reduce((a,b)=>a+b,0)/2;
  return parts.map(([n,u],i)=>{const t=`<text x="${x}" y="402" font-size="52" font-weight="bold" fill="#fff">${String(n).padStart(2,'0')}<tspan font-size="32" fill="${accent}" dx="6">${u}</tspan></text>`;x+=w[i]!;return t;}).join('');
}

function podiumCard(row:BoardRow|undefined,place:number,x:number,y:number,w:number,h:number,prize:number,L:Labels){
  const m=MEDAL[place-1]!,cx=x+w/2,first=place===1;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${first?'url(#card1)':'url(#card)'}" stroke="${m.fill}" stroke-opacity="${first?.95:.55}" stroke-width="${first?3:2}" filter="url(#sh)"/>
    <rect x="${cx-30}" y="${y-30}" width="60" height="60" rx="16" fill="${m.fill}" filter="url(#sh)"/>
    <text x="${cx}" y="${y+14}" text-anchor="middle" font-size="36" font-weight="bold" fill="${m.ink}">${place}</text>
    <text x="${cx}" y="${y+(first?100:80)}" text-anchor="middle" font-size="34" font-weight="bold" fill="${row?'#fff':'#6f6880'}">${esc(row?row.name:L.free)}</text>
    <text x="${cx}" y="${y+(first?150:128)}" text-anchor="middle" font-size="31" font-weight="bold" fill="${row?m.txt:'#4d4659'}">${row?usd(row.wagered):'—'}<tspan font-size="22" fill="#a99dbb" dx="10">${L.wagered}</tspan></text>
    <line x1="${x+30}" x2="${x+w-30}" y1="${y+h-120}" y2="${y+h-120}" stroke="#ffffff" stroke-opacity=".1" stroke-width="2"/>
    <text x="${cx}" y="${y+h-82}" text-anchor="middle" font-size="22" font-weight="bold" fill="#a99dbb" letter-spacing="3">${L.prize}</text>
    <text x="${cx}" y="${y+h-26}" text-anchor="middle" font-size="${first?50:44}" font-weight="bold" fill="${first?m.fill:'#fff'}">${prize} $</text>
  </g>`;
}

export function buildBoardSvg(o:{pot:number;prizes:number[];rows:BoardRow[];start:Date;end:Date;endsAt:Date;now:Date;brand:Brand;minWager:number;labels?:Labels}){
  const L=o.labels??BOARD_LABELS,B=BRAND[o.brand];
  const fmt=(d:Date)=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
  const max=Math.max(1,...o.rows.map(r=>r.wagered));
  const tTop=960,rowH=66;
  const side=b64(B.side),rb=b64('belva/logo-rainbet.png');
  const sideImg=(x:number)=>`<image href="${side}" x="${x}" y="300" width="360" height="360" opacity=".2" clip-path="url(#round)"/>`;
  const table=Array.from({length:7},(_,i)=>{
    const rank=i+4,row=o.rows.find(r=>r.rank===rank),y=tTop+20+i*rowH,prize=o.prizes[rank-1];
    const bar=row?Math.max(8,Math.round(240*row.wagered/max)):0;
    return `<g>
      <rect x="150" y="${y}" width="900" height="${rowH-8}" rx="14" fill="${i%2?'#160f24':'#1c1430'}"/>
      <text x="200" y="${y+40}" text-anchor="middle" font-size="27" font-weight="bold" fill="#a77bff">${String(rank).padStart(2,'0')}</text>
      <text x="260" y="${y+40}" font-size="28" font-weight="bold" fill="${row?'#fff':'#5a5368'}">${esc(row?row.name:L.free)}</text>
      <rect x="540" y="${y+24}" width="240" height="10" rx="5" fill="#2c2340"/>
      ${bar?`<rect x="540" y="${y+24}" width="${bar}" height="10" rx="5" fill="${B.accent}"/>`:''}
      <text x="925" y="${y+40}" text-anchor="end" font-size="28" font-weight="bold" fill="${row?'#fff':'#4d4659'}">${row?usd(row.wagered):'—'}</text>
      <text x="1025" y="${y+40}" text-anchor="end" font-size="28" font-weight="bold" fill="${prize?'#22c55e':'#6f6880'}">${prize?`${prize} $`:'—'}</text>
    </g>`;
  }).join('');
  const H=tTop+20+7*rowH+90;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="${H}" viewBox="0 0 1200 ${H}" font-family="DejaVu Sans, Verdana, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#120a22"/><stop offset=".5" stop-color="#0d0818"/><stop offset="1" stop-color="#08050f"/></linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#241a3a"/><stop offset="1" stop-color="#140e22"/></linearGradient>
      <linearGradient id="card1" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3a2c12"/><stop offset=".45" stop-color="#21182e"/><stop offset="1" stop-color="#140e22"/></linearGradient>
      <filter id="sh"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity=".55"/></filter>
      <radialGradient id="gB"><stop stop-color="${B.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${B.glow}" stop-opacity="0"/></radialGradient>
      <radialGradient id="gY"><stop stop-color="#f5c518" stop-opacity=".16"/><stop offset="1" stop-color="#f5c518" stop-opacity="0"/></radialGradient>
      <clipPath id="round" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>
      <clipPath id="rb"><rect x="540" y="40" width="120" height="120" rx="28"/></clipPath>
    </defs>
    <rect width="1200" height="${H}" rx="34" fill="url(#bg)"/>
    <circle cx="60" cy="480" r="380" fill="url(#gB)"/>
    <circle cx="1140" cy="480" r="380" fill="url(#gB)"/>
    <circle cx="600" cy="200" r="360" fill="url(#gY)"/>
    ${sideImg(-150)}${sideImg(990)}
    <image href="${rb}" x="540" y="40" width="120" height="120" clip-path="url(#rb)"/>
    <text x="600" y="262" text-anchor="middle" font-size="86" font-weight="bold"><tspan fill="#f5c518">${o.pot} $</tspan><tspan fill="#ffffff" dx="26">${L.toWin}</tspan></text>
    <text x="600" y="310" text-anchor="middle" font-size="26" font-weight="bold" fill="#a99dbb" letter-spacing="8">${L.race}</text>
    <text x="600" y="352" text-anchor="middle" font-size="22" font-weight="bold" fill="${B.accent}" letter-spacing="4">${L.remaining}</text>
    ${countdown(o.endsAt,o.now,L,B.accent)}
    <text x="600" y="446" text-anchor="middle" font-size="24" fill="#cfc6e6">${fmt(o.start)} → ${fmt(o.end)}</text>
    ${podiumCard(o.rows.find(r=>r.rank===2),2,150,560,280,280,o.prizes[1]!,L)}
    ${podiumCard(o.rows.find(r=>r.rank===1),1,460,520,280,320,o.prizes[0]!,L)}
    ${podiumCard(o.rows.find(r=>r.rank===3),3,770,580,280,260,o.prizes[2]!,L)}
    <text x="150" y="${tTop-50}" font-size="28" font-weight="bold" fill="#fff" letter-spacing="3">${L.standings}</text>
    <text x="1050" y="${tTop-50}" text-anchor="end" font-size="22" fill="#a99dbb">${L.from4}</text>
    <text x="200" y="${tTop+4}" text-anchor="middle" font-size="22" font-weight="bold" fill="#8a80a0">${L.rank}</text><text x="260" y="${tTop+4}" font-size="22" font-weight="bold" fill="#8a80a0">${L.player}</text><text x="925" y="${tTop+4}" text-anchor="end" font-size="22" font-weight="bold" fill="#8a80a0">${L.wagered}</text><text x="1025" y="${tTop+4}" text-anchor="end" font-size="22" font-weight="bold" fill="#8a80a0">${L.prize}</text>
    ${table}
    <text x="600" y="${H-36}" text-anchor="middle" font-size="22" fill="#8a80a0">${usd(o.minWager)} ${L.min_wager} · 18+ · RAINBET × ${o.brand==='BELVA'?'BELVA':'LECASINOZE'}</text>
  </svg>`;
}

export async function renderBoard(o:Parameters<typeof buildBoardSvg>[0]):Promise<Buffer>{
  return sharp(Buffer.from(buildBoardSvg(o))).png().toBuffer();
}
