import fs from 'node:fs';
import path from 'node:path';
import type {Pool} from 'pg';
import {enqueuePublication,PUBLICATION_CHANNEL,type PublicationEvent} from './publication-outbox.js';
import {uploadToR2} from './r2.js';
type InstagramMetadata={permalink?:string;thumbnail_url?:string;timestamp?:string;username?:string;caption?:string;media_product_type?:string};
type Graph=(route:string,fields:Record<string,string>)=>Promise<InstagramMetadata>;
let active=false,lastAttempt=0;
const retryFile='data/discord-metadata-retries.json';
function retries(){try{return JSON.parse(fs.readFileSync(retryFile,'utf8')) as Record<string,{attempts:number;after:number}>;}catch{return {};}}
function saveRetries(value:ReturnType<typeof retries>){
 const entries=Object.entries(value).sort((a,b)=>b[1].after-a[1].after).slice(0,1000);
 fs.writeFileSync(retryFile+'.tmp',JSON.stringify(Object.fromEntries(entries)),{mode:0o600});fs.renameSync(retryFile+'.tmp',retryFile);
}
export async function tickPublicationDiscord(pool:Pool,graph:Graph){
 if(active||Date.now()-lastAttempt<120000)return;active=true;lastAttempt=Date.now();
 try{
  const pending=retries();const excluded=Object.entries(pending).filter(([,r])=>r.after>Date.now()).map(([id])=>Number(id)).filter(Number.isSafeInteger);
  const retry=(id:number)=>{const attempts=(pending[id]?.attempts||0)+1;pending[id]={attempts,after:Date.now()+Math.min(21600000,300000*2**Math.min(attempts-1,6))};saveRetries(pending);};
  const rows=(await pool.query(`SELECT pj.id,pj.platform_id,pj.title,pj.description FROM publish_jobs pj
   JOIN lunaclip_discord_config cfg ON cfg.channel_id=$1
   WHERE pj.platform='instagram' AND pj.instagram_account_key='lecasinoze' AND pj.status='done'
    AND pj.platform_id IS NOT NULL AND pj.finished_at AT TIME ZONE 'UTC'>=cfg.activated_at
    AND NOT(pj.id=ANY($2::int[]))
    AND NOT EXISTS(SELECT 1 FROM lunaclip_discord_outbox o WHERE o.platform='instagram' AND o.media_id=pj.platform_id AND o.channel_id=cfg.channel_id)
   ORDER BY pj.finished_at DESC LIMIT 5`,[PUBLICATION_CHANNEL,excluded])).rows;
  for(const row of rows){
   try{
    const meta=await graph(row.platform_id,{fields:'permalink,thumbnail_url,timestamp,username,caption,media_product_type'});
    if(meta.username?.toLowerCase()!=='lecasinoze'||meta.media_product_type!=='REELS'||!meta.timestamp||!meta.permalink){retry(row.id);continue;}
    let thumbnail:string|undefined;
    if(meta.thumbnail_url)try{
     const u=new URL(meta.thumbnail_url);
     if(u.protocol==='https:'&&!u.username&&(u.hostname.endsWith('.cdninstagram.com')||u.hostname.endsWith('.fbcdn.net'))){
      const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(15000)});
      const contentType=response.headers.get('content-type')?.split(';')[0] as 'image/jpeg'|'image/png'|'image/webp'|undefined;
      if(response.ok&&contentType&&['image/jpeg','image/png','image/webp'].includes(contentType)){
       let size=0;const chunks:Buffer[]=[];if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>5*1024**2)throw Error('cover_too_large');chunks.push(Buffer.from(chunk));}
       if(size){const dir=path.resolve('data/discord-covers');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`${row.platform_id}.jpg`);fs.writeFileSync(file,Buffer.concat(chunks),{mode:0o600});thumbnail=await uploadToR2(file,`covers/instagram-${row.platform_id}.jpg`,contentType);}
      }
     }
    }catch{/* Missing real cover has a clean text-only fallback. */}
    const event:PublicationEvent={platform:'instagram',mediaId:row.platform_id,account:meta.username,visibility:'public',
     title:row.title||meta.caption?.split('\n')[0]||'Nouveau Reel LeCasiNoze',description:meta.caption?.split('\n').slice(1,4).join('\n')||'',
     url:meta.permalink.replace(/^https:\/\/instagram\.com\//,'https://www.instagram.com/'),publishedAt:meta.timestamp,thumbnail};
    if(await enqueuePublication(pool,event)){delete pending[row.id];saveRetries(pending);}else retry(row.id);
   }catch{retry(row.id);console.warn('[publication-discord] metadata_or_outbox_unavailable',{publishJobId:row.id});}
  }
 }finally{active=false;}
}
