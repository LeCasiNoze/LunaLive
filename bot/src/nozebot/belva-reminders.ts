import {ChannelType,MessageFlags,type Client,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {HUNT_RULES,dayLabel,nextHuntDay} from './belva-hunt.js';
import {BRACKET_URL} from './belva-tournament.js';
import {LINK_BUTTON} from './belva-info.js';
import * as L from './belva-layout.js';

// Rappels automatiques dans 📢︱annonces (@everyone) pour le hunt du mercredi et le tournoi du samedi :
// au lancement, à mi-parcours, puis 24 h avant. Chaque rappel n'est envoyé qu'une fois par édition.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const ANNOUNCE_CHANNEL='1483108594575474749';
export type ReminderKind='launch'|'mid'|'h24';
const ts=(d:Date,f='F')=>`<t:${Math.floor(d.getTime()/1000)}:${f}>`;
const HEAD:Record<ReminderKind,string>={launch:'C’est ouvert !',mid:'Pense à t’inscrire',h24:'Demain, c’est le grand jour'};

export function huntReminder(kind:ReminderKind,day:string,at:Date,calls:number,ch:{hunt?:string;offers?:string;guide?:string}){
  return {allowedMentions:{parse:['everyone' as const]},flags:MessageFlags.IsComponentsV2 as const,components:[
    L.T('@everyone'),
    {type:17,accent_color:0xF3C14B,components:[
      L.T(`# 🎯 Hunt des viewers\n## ${HEAD[kind]}`),
      L.T(`**${dayLabel(day)}** · farm à **10 h**, ouverture en live à **19 h 30** (${ts(at,'R')}).\nTu choisis la machine, LeCasiNoze farme le bonus et Belva l’ouvre en live.${calls?`\n🎰 **${calls}** call${calls>1?'s':''} déjà réservé${calls>1?'s':''}.`:''}`),
      L.LINE,
      ...L.step('1 · Avoir le rôle 🍾 Carré Or','Un compte casino vérifié et un premier dépôt avec le lien de Belva. Pas encore fait ? C’est par ici :',[L.link('Les offres casino','🎁',L.chUrl(ch.offers))]),
      L.GAP,
      ...L.step('2 · Faire ton call','Choisis ta machine en un clic.',[L.btn('Faire mon call','🎯',3,'belva:hunt:call')]),
      L.LINE,
      ...L.step('📜 Les règles',HUNT_RULES.join('\n'),[L.link('Guide VIP','📖',L.chUrl(ch.guide)),L.link('Le salon hunt','📺',L.chUrl(ch.hunt))]),
      L.FOOT,
    ]}] as never[]};
}

export function tournamentReminder(kind:ReminderKind,title:string,drawAt:Date,entries:number,buyEur:number,ch:{tournament?:string}){
  return {allowedMentions:{parse:['everyone' as const]},flags:MessageFlags.IsComponentsV2 as const,components:[
    L.T('@everyone'),
    {type:17,accent_color:0x4C7DFF,components:[
      L.T(`# ⚔️ ${title}\n## ${HEAD[kind]}`),
      L.T(`Tirage du bracket ${ts(drawAt)} (${ts(drawAt,'R')}), puis les duels en live sur la chaîne de Belva.\n✍️ **${entries}** inscrit${entries>1?'s':''} pour l’instant.`),
      L.LINE,
      ...L.step('1 · Relie ton compte Rumble','C’est ton pseudo Rumble qui s’affiche dans le bracket. 30 secondes, une seule fois.',[L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
      L.GAP,
      ...L.step('2 · Inscris-toi','Donne ta machine, puis choisis ton bonus.',[L.btn('S’inscrire','✍️',3,'belva:tn:join')]),
      L.LINE,
      ...L.step('📜 Les règles',`**1 ·** Une machine par joueur, jamais deux fois la même : premier arrivé, premier servi.\n**2 ·** Tous les bonus au même prix d’achat (**${buyEur} €**), la mise dépend du bonus.\n**3 ·** Élimination directe : le plus gros gain en € gagne le duel. Finale en 3 manches.\n**4 ·** Points de saison pour tous, le top 3 du mois est récompensé.`,
        [L.link('Les inscrits','📋',L.chUrl(ch.tournament)),L.link('Le bracket','📺',BRACKET_URL)]),
      L.FOOT,
    ]}] as never[]};
}

// Quel rappel envoyer maintenant ? launch dès l'ouverture, mid à mi-chemin entre launch et l'événement, h24 la veille.
export function dueReminder(now:number,event:number,sent:Partial<Record<ReminderKind,number>>):ReminderKind|null{
  if(now>=event)return null;
  if(!sent.launch)return 'launch';
  const h24=event-24*3600e3,mid=sent.launch+(event-sent.launch)/2;
  if(!sent.h24&&now>=h24)return sent.launch>=h24?null:'h24';
  if(!sent.mid&&!sent.h24&&now>=mid&&mid<h24)return 'mid';
  return null;
}

// Heure de Paris d'un jour donné → instant (gère l'heure d'été).
export const parisAt=(day:string,hm:string)=>{
  const guess=Date.parse(`${day}T${hm}:00Z`);
  const wall=(tz:string)=>Date.parse(new Date(guess).toLocaleString('en-US',{timeZone:tz}));
  return guess-(wall('Europe/Paris')-wall('UTC'));
};

async function tick(client:Client,pool:Pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_event_reminders(event text NOT NULL,occurrence text NOT NULL,kind text NOT NULL,sent_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(event,occurrence,kind))`);
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  const channel=await client.channels.fetch(ANNOUNCE_CHANNEL).catch(()=>null) as TextChannel|null;if(!channel)return;
  const all=await guild.channels.fetch();const find=(n:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith(n))?.id;
  const sentOf=async(event:string,occ:string)=>Object.fromEntries((await pool.query(`SELECT kind,sent_at FROM belva_event_reminders WHERE event=$1 AND occurrence=$2`,[event,occ])).rows
    .map(r=>[r.kind,new Date(r.sent_at).getTime()])) as Partial<Record<ReminderKind,number>>;
  const send=async(event:string,occ:string,kind:ReminderKind,payload:object)=>{
    // Réserve d'abord la ligne : jamais deux fois le même rappel, même après un redémarrage.
    if(!(await pool.query(`INSERT INTO belva_event_reminders(event,occurrence,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[event,occ,kind])).rowCount)return;
    await channel.send(payload as never).catch(e=>console.error('[nozebot] rappel',event,kind,e?.message||e));
  };
  if(await isApproved(pool,'hunt-week')){
    const day=nextHuntDay(),at=parisAt(day,'19:30');
    const k=dueReminder(Date.now(),parisAt(day,'10:00'),await sentOf('hunt',day));
    if(k){const calls=Number((await pool.query(`SELECT count(*) n FROM belva_hunt_precalls WHERE hunt_id IS NULL`).catch(()=>({rows:[{n:0}]}))).rows[0].n);
      await send('hunt',day,k,huntReminder(k,day,new Date(at),calls,{hunt:find('︱hunt'),offers:find('toutes-les-offres'),guide:find('guide-vip')}));}
  }
  if(await isApproved(pool,'tournament-reminder')){
    const t=(await pool.query(`SELECT id,title,draw_at,buy_cents,(SELECT count(*) FROM belva_tournament_entries e WHERE e.tournament_id=t.id) n FROM belva_tournaments t WHERE status='open' AND draw_at IS NOT NULL ORDER BY id DESC LIMIT 1`).catch(()=>({rows:[]}))).rows[0];
    if(t){const draw=new Date(t.draw_at);const k=dueReminder(Date.now(),draw.getTime(),await sentOf('tournament',String(t.id)));
      if(k)await send('tournament',String(t.id),k,tournamentReminder(k,t.title,draw,Number(t.n),Math.round(t.buy_cents/100),{tournament:find('︱tournoi')}));}
  }
}

export function startBelvaReminders(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_REMINDERS==='false')return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void tick(client,pool).catch(e=>console.error('[nozebot] rappels Belva',e)).finally(()=>{busy=false;});};
  setTimeout(run,60_000).unref();setInterval(run,10*60_000).unref();
}
