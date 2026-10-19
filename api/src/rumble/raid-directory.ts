import { fetchRumbleGamblingCategoryLives } from '../rumble.js';
import { raidUrl } from './raid.js';
export type RaidTarget = {url:string;channel:string;viewers:number|null;title:string;videoId:string};
function text(value:string):string {
  return value.replace(/<[^>]*>/g,'').replace(/&(?:amp|quot|apos|lt|gt|#39|#34|#x[0-9a-f]+|#\d+);/gi,entity=>{
    const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
    if(named[entity])return named[entity];
    const n=entity.startsWith('&#x')?parseInt(entity.slice(3),16):parseInt(entity.slice(2),10);
    return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  }).trim();
}
export function sortTargets(targets:RaidTarget[]):RaidTarget[]{
  return [...targets].sort((a,b)=>(b.viewers??-1)-(a.viewers??-1)||a.channel.localeCompare(b.channel));
}
export function parseLiveDirectory(html:string): {targets:RaidTarget[];hasMore:boolean} {
  const cards=html.split(/<div\s+class="videostream thumbnail__grid-item"/).slice(1);
  if(!cards.length)throw new Error('directory_unavailable');
  const seen=new Set<string>(),targets:RaidTarget[]=[];
  for(const card of cards){
    if(!/videostream__status--live/.test(card))continue;
    const url=raidUrl('https://rumble.com'+(card.match(/class="title__link[^>]*href="([^"?]+)/)?.[1]||''));
    const channel=text(card.match(/class="channel__name[^>]*>([\s\S]*?)<\/span>/)?.[1]||'');
    const raw=text(card.match(/class="videostream__number"[^>]*>([\s\S]*?)<\/span>/)?.[1]||'');
    const count=raw.replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
    const multiplier:Record<string,number>={K:1000,M:1000000,B:1000000000};
    const viewers=count?Math.round(Number(count[1])*(multiplier[count[2]?.toUpperCase()]||1)):null;
    const title=text(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]||'');
    if(!url||!channel||seen.has(url))continue;
    seen.add(url);targets.push({url,channel,viewers,title,videoId:card.match(/data-video-id="(\d+)"/)?.[1]||''});
  }
  return {targets:sortTargets(targets),hasMore:/rel="next"|rel=next/.test(html)};
}
const cache=new Map<string,{until:number;promise:Promise<{targets:RaidTarget[];hasMore:boolean}>}>();
export function raidDirectory(scope:'gambling'|'all',page:number){
  const key=scope+':'+page,existing=cache.get(key);
  if(existing&&existing.until>Date.now())return existing.promise;
  const promise=(async()=>{
    if(scope==='gambling'){
      const snapshot=await fetchRumbleGamblingCategoryLives();
      if(!snapshot)throw Error('directory_unavailable');
      return {targets:sortTargets([...snapshot.lives.values()].flatMap(l=>{
        const url=raidUrl(l.videoUrl);return url?[{url,channel:l.username,title:l.title||'',viewers:l.viewersKnown===false?null:l.viewersCount,videoId:l.videoIdNumeric||''}]:[];
      })),hasMore:false};
    }
    const response=await fetch('https://rumble.com/browse/live'+(page>1?'?page='+page:''),{
      redirect:'error',signal:AbortSignal.timeout(12000),headers:{accept:'text/html','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'},
    });
    if(!response.ok||!response.body)throw Error('directory_unavailable');
    let bytes=0;const chunks:Uint8Array[]=[];
    for await(const chunk of response.body as any){bytes+=chunk.length;if(bytes>1500000)throw Error('directory_too_large');chunks.push(chunk);}
    return parseLiveDirectory(Buffer.concat(chunks).toString('utf8'));
  })();
  // Only fetch on picker use; never poll for each viewer or load every page.
  if(cache.size>35)cache.clear();
  cache.set(key,{until:Date.now()+60000,promise});
  promise.catch(()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
  return promise;
}
