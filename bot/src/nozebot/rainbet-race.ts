import {AttachmentBuilder,ChannelType,EmbedBuilder,type Client,type Message,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {renderRace} from './race-renderer.js';
import {isApproved} from './belva-approval.js';
import {BELVA_GUILD,belvaRaceCard,upsertBelvaRace} from './belva-race.js';
import {LCN_GUILD} from './belva-guilds.js';

export const RACE_TITLE='🏁 Wager Race RainBet';
// Monthly prizes in dollars, funded by Rainbet's 200 $ leaderboard budget. Weekly races (until 15 Nov) paid in euros.
export const RACE_PRIZES_USD=[100,60,40];
const WEEKLY_PRIZES_EUR=[100,50,25];
const prizesOf=(r:RaceRange)=>r.monthly?{list:RACE_PRIZES_USD,cur:'$'}:{list:WEEKLY_PRIZES_EUR,cur:'€'};
export const RACE_MIN_WAGER_USD=1000;
const REFERRAL_URL='https://rainbet.com/?r=nivoranet';
const MAIN_CHANNEL_ID=()=>process.env.NOZEBOT_RAINBET_RACE_CHANNEL_ID?.trim()||'1569141661403971686';
// Partner servers must be allowlisted: NozeBot sits in other casino servers that may run their own races.
const PARTNER_GUILD_IDS=()=>(process.env.NOZEBOT_RAINBET_RACE_PARTNER_GUILDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const RANKS=['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.'];

export type RaceEntry={username:string;wagered:number};
export type RaceRange={start:string;end:string;endsAt:Date;label:string;monthly?:boolean};
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

// Monthly since the Rainbet stream deal, from the 16th to the 15th: Rainbet refunds the leaderboard per deal month.
export const MONTHLY_START='2026-11-16';
const fr=(d:Date)=>d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',timeZone:'UTC'});
export function monthRange(now:Date,offset=0):RaceRange{
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+(now.getUTCDate()>=16?0:-1)+offset,16));
  const next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,16)),end=new Date(next.getTime()-86_400_000);
  return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),endsAt:next,label:`${fr(start)} → ${fr(end)}`,monthly:true};
}
// Before MONTHLY_START the weekly races apply; the first monthly race shows the last weekly winners.
export function raceRange(now:Date,offset=0):RaceRange{
  if(now.toISOString().slice(0,10)<MONTHLY_START)return weekRange(now,offset);
  const r=monthRange(now,offset);
  return r.start<MONTHLY_START?weekRange(new Date(MONTHLY_START+'T00:00:00Z'),-1):r;
}

export function maskName(name:string):string{
  const n=[...name.trim()];
  if(n.length<=3)return n[0]+'**';
  return n.slice(0,2).join('')+'*'.repeat(Math.min(4,n.length-3))+n[n.length-1];
}

export function ranking(entries:readonly RaceEntry[],prizes:readonly number[]=RACE_PRIZES_USD){
  return [...entries].filter(e=>e.wagered>0).sort((a,b)=>b.wagered-a.wagered).slice(0,10).map((e,i)=>({
    ...e,rank:i+1,prize:i<prizes.length&&e.wagered>=RACE_MIN_WAGER_USD?prizes[i]:0}));
}

const usd=(n:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n).replace(/ | /g,' ')} $`;

export async function racePanel(current:RaceEntry[],previous:RaceEntry[],now:Date){
  const week=raceRange(now),prev=raceRange(now,-1);
  const {list:prizes,cur}=prizesOf(week),{list:prevPrizes,cur:prevCur}=prizesOf(prev);
  const top=ranking(current,prizes);
  const pot=prizes.reduce((a,b)=>a+b,0);
  const image=await renderRace({month:week.label,endsLabel:week.monthly?`fin le ${fr(new Date(week.end+'T00:00:00Z'))} à minuit`:'fin dimanche minuit',pot,prizes,currency:cur,minWagerUsd:RACE_MIN_WAGER_USD,
    rows:top.map(e=>({rank:e.rank,name:maskName(e.username),wagered:e.wagered,prize:e.prize})),
    updatedLabel:now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'})});
  const embed=new EmbedBuilder().setColor(16747069).setTitle(RACE_TITLE).setURL(REFERRAL_URL)
    .setDescription([
      `**${pot} ${cur} à gagner ${week.monthly?'chaque mois':'chaque semaine'}** · ${prizes.map((p,i)=>`${RANKS[i]} ${p} ${cur}`).join(' · ')}`,
      `Race ${week.monthly?'du mois · ':'de la '}${week.label} · fin <t:${Math.floor(week.endsAt.getTime()/1000)}:R>`,
      `Inscris-toi avec notre lien RainBet, joue, et grimpe au classement. **${usd(RACE_MIN_WAGER_USD)} misés minimum** sur ${week.monthly?'le mois':'la semaine'} pour être payé.`,
      '-# Mises pondérées par RainBet selon le RTP du jeu : le dice et les originals comptent moins que les slots.',
    ].join('\n'))
    .setImage('attachment://wager-race.png')
    .setFooter({text:'18+ · Joue de façon responsable · Classement mis à jour toutes les 5 min'})
    .setTimestamp(now);
  const winners=prev.start>=RACE_FIRST_START?ranking(previous,prevPrizes).filter(e=>e.prize):[];
  if(winners.length)embed.addFields({name:`🏆 Gagnants ${prev.monthly?'du mois · ':'de la '}${prev.label}`,value:winners.map(e=>`${RANKS[e.rank-1]} ${maskName(e.username)} · ${usd(e.wagered)} · **${e.prize} ${prevCur}**`).join('\n')});
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

// Classement public déjà masqué : l'API LunaLive le lit sans jamais détenir la clé Rainbet.
export function publicRace(current:readonly RaceEntry[],previous:readonly RaceEntry[],now:Date){
  const race=raceRange(now),prev=raceRange(now,-1);
  const {list:prizes,cur}=prizesOf(race),{list:prevPrizes,cur:prevCur}=prizesOf(prev);
  const row=(e:ReturnType<typeof ranking>[number])=>({rank:e.rank,name:maskName(e.username),wagered:Math.round(e.wagered*100)/100,prize:e.prize});
  return {race:{start:race.start,end:race.end,endsAt:race.endsAt.toISOString(),label:race.label,monthly:!!race.monthly},
    prizes,currency:cur,minWagerUsd:RACE_MIN_WAGER_USD,referralUrl:REFERRAL_URL,
    leaderboard:ranking(current,prizes).map(row),
    players:current.filter(e=>e.wagered>0).length,
    totalWageredUsd:Math.round(current.reduce((s,e)=>s+Math.max(0,e.wagered),0)),
    previous:prev.start>=RACE_FIRST_START?{start:prev.start,end:prev.end,label:prev.label,currency:prevCur,winners:ranking(previous,prevPrizes).filter(e=>e.prize).map(row)}:null,
    updatedAt:now.toISOString()};
}
async function publishPublicRace(pool:Pool,current:readonly RaceEntry[],previous:readonly RaceEntry[],now:Date){
  await pool.query(`CREATE TABLE IF NOT EXISTS rainbet_race_public(id text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW())`);
  await pool.query(`INSERT INTO rainbet_race_public(id,data,updated_at) VALUES('current',$1,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`,[JSON.stringify(publicRace(current,previous,now))]);
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

export function startRainbetRace(client:Client,pool?:Pool):()=>void{
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
      const [current,previous]=await Promise.all([fetchWagers(raceRange(now)),fetchWagers(raceRange(now,-1))]);
      if(pool)await publishPublicRace(pool,current,previous,now).catch(error=>console.error('[nozebot][race] publication publique impossible',(error as Error)?.message??error));
      const payload=await racePanel(current,previous,now);
      // Discord de Belva : nouvelle carte (validée dans 🎨︱validation-design), sinon l'ancien panneau.
      const belva=await isApproved(pool,'race')?await belvaRaceCard(current,previous,now,'BELVA',await isApproved(pool,'race-v3')):null;
      // Discord LeCasiNoze : même carte, à sa marque (fiche lcn-race).
      const lcn=await isApproved(pool,'lcn-race')?await belvaRaceCard(current,previous,now,'LECASINOZE',await isApproved(pool,'lcn-race-v3')):null;
      // discord.js ajoute les fichiers dans payload.attachments à chaque envoi : un tableau neuf par salon.
      for(const channel of await raceChannels(client))
        await ((belva&&channel.guild.id===BELVA_GUILD())||(lcn&&channel.guild.id===LCN_GUILD())?upsertBelvaRace(channel,(channel.guild.id===BELVA_GUILD()?belva:lcn)!,messages.get(channel.id)).then(id=>{messages.set(channel.id,id);}):upsert(channel,{...payload,attachments:[]})).catch(error=>console.error(`[nozebot][race] mise à jour impossible salon=${channel.id}`,error?.message??error));
    }catch(error){console.error('[nozebot][race] rafraîchissement impossible',(error as Error)?.message??error);}
    finally{running=false;}
  }
  void tick();
  const timer=setInterval(()=>void tick(),5*60_000);
  return ()=>clearInterval(timer);
}
