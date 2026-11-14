import {AttachmentBuilder,ChannelType,EmbedBuilder,type Client,type Message,type TextChannel} from 'discord.js';
import {renderRace} from './race-renderer.js';

export const RACE_TITLE='🏁 Wager Race RainBet';
export const RACE_PRIZES_EUR=[100,50,25];
export const RACE_MIN_WAGER_USD=1000;
const REFERRAL_URL='https://rainbet.com/?r=nivoranet';
const MAIN_CHANNEL_ID=()=>process.env.NOZEBOT_RAINBET_RACE_CHANNEL_ID?.trim()||'1569141661403971686';
// Partner servers must be allowlisted: NozeBot sits in other casino servers that may run their own races.
const PARTNER_GUILD_IDS=()=>(process.env.NOZEBOT_RAINBET_RACE_PARTNER_GUILDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const RANKS=['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.'];

export type RaceEntry={username:string;wagered:number};
export type RaceRange={start:string;end:string;endsAt:Date;label:string};
// The first race ran from Monday 9 November 2026; earlier weeks never had prizes.
export const RACE_FIRST_START='2026-11-09';

// Weekly race, Monday to Sunday included. RainBet filters by calendar date (UTC), so the week closes at Monday 00:00 UTC.
export function weekRange(now:Date,offset=0):RaceRange{
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const monday=new Date(today-((now.getUTCDay()+6)%7)*86_400_000+offset*7*86_400_000);
  const sunday=new Date(monday.getTime()+6*86_400_000),next=new Date(monday.getTime()+7*86_400_000);
  const iso=(d:Date)=>d.toISOString().slice(0,10);
  const day=(d:Date,withMonth:boolean)=>d.toLocaleDateString('fr-FR',withMonth?{day:'numeric',month:'long',timeZone:'UTC'}:{day:'numeric',timeZone:'UTC'});
  return {start:iso(monday),end:iso(sunday),endsAt:next,label:`semaine du ${day(monday,monday.getUTCMonth()!==sunday.getUTCMonth())} au ${day(sunday,true)}`};
}

export function maskName(name:string):string{
  const n=[...name.trim()];
  if(n.length<=3)return n[0]+'**';
  return n.slice(0,2).join('')+'*'.repeat(Math.min(4,n.length-3))+n[n.length-1];
}

export function ranking(entries:readonly RaceEntry[]){
  return [...entries].filter(e=>e.wagered>0).sort((a,b)=>b.wagered-a.wagered).slice(0,10).map((e,i)=>({
    ...e,rank:i+1,prize:i<RACE_PRIZES_EUR.length&&e.wagered>=RACE_MIN_WAGER_USD?RACE_PRIZES_EUR[i]:0}));
}

const usd=(n:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n).replace(/ | /g,' ')} $`;

export async function racePanel(current:RaceEntry[],previous:RaceEntry[],now:Date){
  const week=weekRange(now),prev=weekRange(now,-1);
  const top=ranking(current);
  const pot=RACE_PRIZES_EUR.reduce((a,b)=>a+b,0);
  const image=await renderRace({month:week.label,endsLabel:'fin dimanche minuit',pot,prizes:RACE_PRIZES_EUR,minWagerUsd:RACE_MIN_WAGER_USD,
    rows:top.map(e=>({rank:e.rank,name:maskName(e.username),wagered:e.wagered,prize:e.prize})),
    updatedLabel:now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'})});
  const embed=new EmbedBuilder().setColor(16747069).setTitle(RACE_TITLE).setURL(REFERRAL_URL)
    .setDescription([
      `**${pot} € à gagner chaque semaine** · ${RACE_PRIZES_EUR.map((p,i)=>`${RANKS[i]} ${p} €`).join(' · ')}`,
      `Race de la ${week.label} · fin <t:${Math.floor(week.endsAt.getTime()/1000)}:R>`,
      `Inscris-toi avec notre lien RainBet, joue, et grimpe au classement. **${usd(RACE_MIN_WAGER_USD)} misés minimum** sur la semaine pour être payé.`,
    ].join('\n'))
    .setImage('attachment://wager-race.png')
    .setFooter({text:'18+ · Joue de façon responsable · Classement mis à jour toutes les 5 min'})
    .setTimestamp(now);
  const winners=prev.start>=RACE_FIRST_START?ranking(previous).filter(e=>e.prize):[];
  if(winners.length)embed.addFields({name:`🏆 Gagnants de la ${prev.label}`,value:winners.map(e=>`${RANKS[e.rank-1]} ${maskName(e.username)} · ${usd(e.wagered)} · **${e.prize} €**`).join('\n')});
  return {embeds:[embed],files:[new AttachmentBuilder(image,{name:'wager-race.png'})],attachments:[] as never[],
    components:[{type:1,components:[{type:2,style:5,label:'Rejoindre la race',emoji:{name:'🏁'},url:REFERRAL_URL}]}],allowedMentions:{parse:[] as never[]}};
}

export async function fetchWagers(range:RaceRange):Promise<RaceEntry[]>{
  const key=process.env.RAINBET_AFFILIATE_API_KEY?.trim();
  if(!key)throw Error('RAINBET_AFFILIATE_API_KEY absent');
  const url=`https://services.rainbet.com/v1/external/affiliates?key=${encodeURIComponent(key)}&start_at=${range.start}&end_at=${range.end}`;
  const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'NozeBot/1.0'},signal:AbortSignal.timeout(20_000)});
  const body=await r.json().catch(()=>null) as {affiliates?:{username?:string;wagered_amount?:string}[];error?:string}|null;
  if(!r.ok||!Array.isArray(body?.affiliates))throw Error(`RainBet API ${r.status} ${body?.error??''}`.trim());
  return body!.affiliates.flatMap(a=>{const wagered=Number(a.wagered_amount);return a.username&&Number.isFinite(wagered)?[{username:a.username,wagered}]:[];});
}

const isRaceChannelName=(name:string)=>name.normalize('NFKC').toLowerCase().includes('wager-race');

async function raceChannels(client:Client):Promise<TextChannel[]>{
  const out:TextChannel[]=[];
  const main=await client.channels.fetch(MAIN_CHANNEL_ID()).catch(()=>null);
  if(main?.type===ChannelType.GuildText)out.push(main);
  for(const guildId of PARTNER_GUILD_IDS()){
    const guild=await client.guilds.fetch(guildId).catch(()=>null);
    if(!guild){console.warn(`[nozebot][race] NozeBot absent du serveur partenaire ${guildId}`);continue;}
    const channel=(await guild.channels.fetch()).find(c=>c?.type===ChannelType.GuildText&&isRaceChannelName(c.name));
    if(channel?.type===ChannelType.GuildText)out.push(channel);
    else console.warn(`[nozebot][race] aucun salon wager-race sur ${guildId}`);
  }
  return out;
}

export function startRainbetRace(client:Client):()=>void{
  const messages=new Map<string,string>();
  let running=false;
  async function upsert(channel:TextChannel,payload:Awaited<ReturnType<typeof racePanel>>){
    const cachedId=messages.get(channel.id);
    let message:Message|null=cachedId?await channel.messages.fetch(cachedId).catch(()=>null):null;
    if(!message)message=(await channel.messages.fetch({limit:25})).find(m=>m.author.id===client.user!.id&&m.embeds[0]?.title===RACE_TITLE)??null;
    if(message)await message.edit(payload);
    else{message=await channel.send(payload);await message.pin('Garder le classement visible').catch(()=>undefined);}
    messages.set(channel.id,message.id);
  }
  async function tick(){
    if(running||!client.isReady())return;
    running=true;
    try{
      const now=new Date();
      const [current,previous]=await Promise.all([fetchWagers(weekRange(now)),fetchWagers(weekRange(now,-1))]);
      const payload=await racePanel(current,previous,now);
      // discord.js ajoute les fichiers dans payload.attachments à chaque envoi : un tableau neuf par salon.
      for(const channel of await raceChannels(client))
        await upsert(channel,{...payload,attachments:[]}).catch(error=>console.error(`[nozebot][race] mise à jour impossible salon=${channel.id}`,error?.message??error));
    }catch(error){console.error('[nozebot][race] rafraîchissement impossible',(error as Error)?.message??error);}
    finally{running=false;}
  }
  void tick();
  const timer=setInterval(()=>void tick(),5*60_000);
  return ()=>clearInterval(timer);
}
