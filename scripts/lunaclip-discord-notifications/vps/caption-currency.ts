import fs from 'node:fs';
const REFERENCE='data/ars-eur-reference.json';
export function applyCaptionPolicy(caption:string,account:string){
 let text=caption.replace(/contenu casino\s*(?:[·|—:-]\s*)?/giu,'').trim();
 // Neutral attribution for both accounts, applied again just before publishing.
 // Retain the original clip title, currency disclosure and prevention message.
 text=text.replace(/#lunalive(?:_tv)?\b/giu,'');
 text=text.split('\n').filter(line=>!/(?:https?:\/\/)?(?:www\.)?lunalive\.[a-z]+\S*/iu.test(line)).map(line=>
  /\blunalive(?:_tv)?\b/iu.test(line)&&/extrait|live|stream|plateforme/iu.test(line)
   ?'Plateforme de stream en bio':line.replace(/@?\blunalive(?:_tv)?\b/giu,'').trim()).join('\n');
 text=text.split('\n').filter(line=>line.trim()!=='Plateforme de stream en bio').join('\n').trim();
 text+='\n\nPlateforme de stream en bio';
 text=text.replace(/^18\+\s*·\s*Jouer comporte des risques\.?$/gmi,'').trim();
 const tagLines=text.split('\n').filter(line=>/^\s*(?:#[\p{L}\p{N}_]+\s*)+$/u.test(line));
 const hashtags=[...new Set(tagLines.flatMap(line=>line.trim().split(/\s+/)))];
 text=text.split('\n').filter(line=>!tagLines.includes(line)).join('\n').trim();
 if(account==='lecasinoze'){
  text=text.replace(/^Montants affichés en ARS[^\n]*\n?/gmi,'').trim();
  let conversion='';
  try{const rate=JSON.parse(fs.readFileSync(REFERENCE,'utf8')) as {date:string;arsPerEur:number};
   const age=Date.now()-Date.parse(rate.date+'T00:00:00Z');
   if(age>=0&&age<14*86400000&&Number.isFinite(rate.arsPerEur)&&rate.arsPerEur>0)
    conversion=` Repère indicatif : 1 000 ARS ≈ ${(1000/rate.arsPerEur).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} € (taux BCRA du ${rate.date.split('-').reverse().join('/')}).`;
  }catch{}
  const note='Montants affichés en ARS (pesos argentins).'+conversion;
  text+='\n\n'+note;
 }
 if(!/Jouer comporte des risques/i.test(text))text+='\n\n18+ · Jouer comporte des risques.';
 return (text+(hashtags.length?'\n\n'+hashtags.join(' '):'')).replace(/\n{3,}/g,'\n\n');
}
let lastRefresh=0;
export async function refreshCurrencyReference(){
 if(Date.now()-lastRefresh<86400000)return;lastRefresh=Date.now();
 try{const r=await fetch('https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/EUR',{signal:AbortSignal.timeout(12000)});
  const b=await r.json() as {results?:{fecha:string;detalle:{codigoMoneda:string;tipoCotizacion:number}[]}[]};
  const row=b.results?.[0],value=row?.detalle.find(v=>v.codigoMoneda==='EUR')?.tipoCotizacion;
  if(!r.ok||!row||!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)||!value||!Number.isFinite(value)||value<=0)return;
  fs.writeFileSync(REFERENCE+'.tmp',JSON.stringify({date:row.fecha,arsPerEur:value,source:'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/EUR'}),{mode:0o600});fs.renameSync(REFERENCE+'.tmp',REFERENCE);
 }catch{/* Use a dated recent cached quote, or state ARS without fabricating a rate. */}
}
