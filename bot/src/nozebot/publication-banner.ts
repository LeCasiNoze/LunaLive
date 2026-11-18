import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import type {PublicationEvent} from './publication-outbox.js';

// Bannière générée pour chaque nouvelle vidéo / Short / Reel : miniature en grand sur fond flouté aux couleurs
// de la plateforme, badge, titre et avatar LeCasiNoze. En cas d'échec (miniature absente), la carte s'en passe.
const AVATAR=new URL('../../assets/lecasinoze/avatar.png',import.meta.url);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function wrap(text:string,max:number,lines:number){
  const out:string[]=[];let cur='';
  for(const w of text.split(/\s+/)){
    if((cur+' '+w).trim().length>max){if(cur)out.push(cur);cur=w;}else cur=(cur+' '+w).trim();
    if(out.length===lines)break;
  }
  if(out.length<lines&&cur)out.push(cur);
  if(out.length===lines&&text.length>out.join(' ').length)out[lines-1]=out[lines-1]!.replace(/.{0,3}$/,'…');
  return out.slice(0,lines);
}

export async function publicationBanner(e:PublicationEvent):Promise<Buffer|null>{
  if(!e.thumbnail)return null;
  const r=await fetch(e.thumbnail,{signal:AbortSignal.timeout(10_000)}).catch(()=>null);
  if(!r?.ok)return null;
  const thumb=Buffer.from(await r.arrayBuffer());
  const ig=e.platform==='instagram',short=!ig&&(e.isShort||e.kind==='short'),vertical=ig||short;
  const color=ig?'#E1306C':'#FF0033',badge=ig?'NOUVEAU REEL':short?'NOUVEAU SHORT':'NOUVELLE VIDÉO';
  const W=1200,H=630;
  const bg=await sharp(thumb).resize(W,H,{fit:'cover'}).blur(28).modulate({brightness:.55}).png().toBuffer();
  const [tw,th]=vertical?[300,533]:[640,360];
  const radius=22;
  const mask=Buffer.from(`<svg width="${tw}" height="${th}"><rect width="${tw}" height="${th}" rx="${radius}" fill="#fff"/></svg>`);
  const framed=await sharp(thumb).resize(tw,th,{fit:'cover'}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  const tx=vertical?80:60,ty=Math.round((H-th)/2);
  const textX=tx+tw+50,maxChars=vertical?26:20;
  const lines=wrap(e.title.replace(/\s*·\s*LeCasiNoze\s*$/i,''),maxChars,4);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif">
    <defs><linearGradient id="tint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset=".55" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".6"/></filter></defs>
    <rect width="${W}" height="${H}" fill="url(#tint)"/>
    <rect x="${tx-6}" y="${ty-6}" width="${tw+12}" height="${th+12}" rx="${radius+6}" fill="${color}" filter="url(#sh)"/>
    <rect x="${textX}" y="${vertical?120:150}" width="${badge.length*17+48}" height="54" rx="27" fill="${color}"/>
    <text x="${textX+24}" y="${vertical?156:186}" font-size="26" font-weight="800" fill="#fff" letter-spacing="2">${badge}</text>
    ${lines.map((l,k)=>`<text x="${textX}" y="${(vertical?240:270)+k*58}" font-size="46" font-weight="800" fill="#fff">${esc(l)}</text>`).join('')}
    <text x="${textX+76}" y="${H-62}" font-size="28" font-weight="700" fill="#fff">LeCasiNoze</text>
    <text x="${textX+76}" y="${H-30}" font-size="20" fill="#fff" fill-opacity=".7">${ig?'Instagram':'YouTube'}</text>
  </svg>`;
  const avatar=await sharp(readFileSync(AVATAR)).resize(60,60).composite([{input:Buffer.from('<svg width="60" height="60"><circle cx="30" cy="30" r="30" fill="#fff"/></svg>'),blend:'dest-in'}]).png().toBuffer();
  return sharp(bg).composite([{input:Buffer.from(svg)},{input:framed,left:tx,top:ty},{input:avatar,left:textX,top:H-100}]).png().toBuffer();
}
