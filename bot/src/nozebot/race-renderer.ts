import sharp from 'sharp';

export type RaceRow={rank:number;name:string;wagered:number;prize:number};
export type RaceImageInput={month:string;endsLabel:string;pot:number;prizes:number[];minWagerUsd:number;rows:RaceRow[];updatedLabel:string};

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const usd=(n:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n).replace(/ | /g,' ')} $`;
const MEDALS=[{fill:'#f6c453',ink:'#3a2a05'},{fill:'#d9dee8',ink:'#2a2f3a'},{fill:'#e0995e',ink:'#3b1f08'}];

function podium(row:RaceRow|undefined,place:number,x:number,top:number,prize:number){
  const m=MEDALS[place-1],h=485-top,w=320;
  const name=row?esc(row.name):'Place libre';
  return `<g>
    <rect x="${x}" y="${top}" width="${w}" height="${h}" rx="26" fill="url(#card)" stroke="${m.fill}" stroke-opacity="${row?0.9:0.35}" stroke-width="3" filter="url(#shadow)"/>
    <circle cx="${x+w/2}" cy="${top}" r="38" fill="${m.fill}" filter="url(#shadow)"/>
    <text x="${x+w/2}" y="${top+14}" text-anchor="middle" fill="${m.ink}" font-size="40" font-weight="900">${place}</text>
    <text x="${x+w/2}" y="${top+82}" text-anchor="middle" fill="${row?'#ffffff':'#6f6880'}" font-size="30" font-weight="800">${name}</text>
    <text x="${x+w/2}" y="${top+122}" text-anchor="middle" fill="${row?'#ffb067':'#4d4659'}" font-size="26" font-weight="700">${row?usd(row.wagered):'—'}</text>
    <rect x="${x+w/2-78}" y="${top+h-64}" width="156" height="46" rx="23" fill="${m.fill}" fill-opacity=".14" stroke="${m.fill}" stroke-opacity=".6"/>
    <text x="${x+w/2}" y="${top+h-33}" text-anchor="middle" fill="${m.fill}" font-size="24" font-weight="900">${prize} €</text>
  </g>`;
}

export function buildRaceSvg(input:RaceImageInput):string{
  const rows=input.rows;
  const max=Math.max(1,...rows.map(r=>r.wagered));
  const tableTop=525,rowH=58;
  const table=Array.from({length:7},(_,i)=>{
    const rank=i+4,row=rows.find(r=>r.rank===rank),y=tableTop+i*rowH;
    const bar=row?Math.max(6,Math.round(330*row.wagered/max)):0;
    const prize=input.prizes[rank-1];
    return `<g>
      <rect x="60" y="${y}" width="1080" height="${rowH-10}" rx="14" fill="${i%2?'#1a1424':'#1f1830'}"/>
      <text x="100" y="${y+32}" text-anchor="middle" fill="#8f86a3" font-size="22" font-weight="800">${rank}</text>
      <text x="150" y="${y+32}" fill="${row?'#ffffff':'#5a5368'}" font-size="23" font-weight="700">${row?esc(row.name):'Place libre'}</text>
      <rect x="520" y="${y+18}" width="330" height="12" rx="6" fill="#2c2340"/>
      ${bar?`<rect x="520" y="${y+18}" width="${bar}" height="12" rx="6" fill="url(#bar)"/>`:''}
      <text x="990" y="${y+32}" text-anchor="end" fill="${row?'#ffb067':'#4d4659'}" font-size="23" font-weight="800">${row?usd(row.wagered):'—'}</text>
      <text x="1110" y="${y+32}" text-anchor="end" fill="${prize?'#45e0a8':'#4d4659'}" font-size="22" font-weight="900">${prize?`${prize} €`:''}</text>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000" font-family="DejaVu Sans, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0911"/><stop offset=".55" stop-color="#191126"/><stop offset="1" stop-color="#0a0810"/></linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2a1f3d"/><stop offset="1" stop-color="#15101f"/></linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffc46b"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-opacity=".5"/></filter>
      <filter id="glow"><feGaussianBlur stdDeviation="40"/></filter>
    </defs>
    <rect width="1200" height="1000" rx="32" fill="url(#bg)"/>
    <circle cx="600" cy="300" r="230" fill="#ff8a3d" opacity=".10" filter="url(#glow)"/>
    <circle cx="1080" cy="80" r="120" fill="#45e0a8" opacity=".08" filter="url(#glow)"/>
    <text x="60" y="78" fill="#ffffff" font-size="40" font-weight="900" letter-spacing="3">WAGER RACE</text>
    <text x="60" y="114" fill="#a99dbb" font-size="22">RainBet × LeCasiNoze × Belva · ${esc(input.month)}</text>
    <rect x="930" y="44" width="210" height="72" rx="20" fill="#ff8a3d" fill-opacity=".12" stroke="#ff8a3d" stroke-width="2"/>
    <text x="1035" y="92" text-anchor="middle" fill="#ffb067" font-size="36" font-weight="900">${input.pot} €</text>
    <text x="1035" y="144" text-anchor="middle" fill="#a99dbb" font-size="18">${esc(input.endsLabel)}</text>
    ${podium(rows.find(r=>r.rank===2),2,60,215,input.prizes[1])}
    ${podium(rows.find(r=>r.rank===1),1,440,170,input.prizes[0])}
    ${podium(rows.find(r=>r.rank===3),3,820,255,input.prizes[2])}
    ${table}
    <text x="60" y="968" fill="#766d82" font-size="17">${usd(input.minWagerUsd)} misés minimum pour être payé · 18+ · Joue de façon responsable</text>
    <text x="1140" y="968" text-anchor="end" fill="#766d82" font-size="17">Mis à jour ${esc(input.updatedLabel)}</text>
  </svg>`;
}

export async function renderRace(input:RaceImageInput):Promise<Buffer>{
  return sharp(Buffer.from(buildRaceSvg(input))).png().toBuffer();
}
