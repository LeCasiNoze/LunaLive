import {createHash} from 'node:crypto';
import {ChannelType,MessageFlags,type Client,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {GRADES,XP_RULES} from './belva-progress-designs.js';
import {ROLE_SPEC} from './belva-role-spec.js';
import {LINK_BUTTON} from './belva-info.js';
import * as L from './belva-layout.js';

// Salon 📖︱guide-vip (catégorie Récompenses) : comment gagner de l'XP, les grades, ce que chacun débloque.
const REWARDS_CATEGORY='1481924757380272289';
const CHANNEL_NAME='📖︱guide-vip';
const fr=(n:number)=>n.toLocaleString('fr-FR');

// nameOf : nom du rôle de chaque grade sur le serveur (noms Belva par défaut, univers LunaLive chez LeCasiNoze).
export function vipGuideCard(ch:{offers?:string;hunt?:string;tournament?:string;guild?:string}={},nameOf:(key:string)=>string=k=>ROLE_SPEC.find(r=>r.key===k)!.name){
  const grades=GRADES.map(g=>{
    return `**${nameOf(g.key)}** · dès **${fr(g.xp)} XP**${'deposit' in g&&g.deposit?' · dépôt vérifié requis':''}\n> ${g.perk}`;});
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:0xF3C14B,components:[
    L.T('# 📖 Guide VIP'),
    L.T('Tout ce que tu fais sur la chaîne et sur le Discord te rapporte de l’**XP**. L’XP te fait monter de grade, et chaque grade débloque des avantages.'),
    L.LINE,
    ...L.step('1 · Relie ton compte Rumble','Sans ça, ton XP ne peut pas être comptée. 30 secondes, une seule fois.',[L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
    L.GAP,
    ...L.step('2 · Vérifie un compte casino',`+300 XP par casino, et c’est ce qui ouvre les grades à partir de ${nameOf('rubis')} (avec un dépôt).`,[L.chLink('Les offres casino','🎁',ch.offers,ch.guild)]),
    L.LINE,
    L.T(`### ⭐ Comment gagner de l’XP\n${XP_RULES.map(([what,xp])=>`> **${what}** · ${xp}`).join('\n')}`),
    L.LINE,
    L.T(`### 🏅 Les grades et leurs avantages\n${grades.slice(0,4).join('\n\n')}`),
    L.GAP,
    L.T(grades.slice(4).join('\n\n')),
    L.T('-# Chaque grade a 5 sous-niveaux (I à V). Tape **/rang** pour voir ton niveau et ce qu’il te manque.'),
    L.LINE,
    ...L.step('🎯 Au hunt du mercredi',`Une machine par joueur, **deux à partir du grade ${nameOf('saphir')}**. Réservé aux ${nameOf('carreOr')}.`,[L.chLink('Le salon hunt','🎯',ch.hunt,ch.guild)]),
    L.GAP,
    ...L.step('⚔️ Au tournoi du samedi','+25 XP pour participer, +20 XP par duel gagné, et des points de saison : le top 3 du mois est récompensé.',[L.chLink('Le tournoi','⚔️',ch.tournament,ch.guild)]),
    L.FOOT,
  ]}] as never[]};
}

export async function ensureVipGuide(client:Client,pool?:Pool){
  if(!await isApproved(pool,'vip-guide'))return;
  const guild=await client.guilds.fetch(L.GUILD_ID()).catch(()=>null);if(!guild)return;
  const all=await guild.channels.fetch();
  const find=(s:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith(s))?.id;
  let channel=all.find(c=>c?.type===ChannelType.GuildText&&c.name===CHANNEL_NAME) as TextChannel|undefined;
  channel??=await guild.channels.create({name:CHANNEL_NAME,type:ChannelType.GuildText,parent:REWARDS_CATEGORY,topic:'Comment gagner de l’XP, les grades et ce qu’ils débloquent.'});
  const card=vipGuideCard({offers:find('toutes-les-offres'),hunt:find('︱hunt'),tournament:find('︱tournoi')});
  // Le container porte un id dérivé du contenu : la carte n'est réécrite que si elle change.
  const id=parseInt(createHash('sha1').update(JSON.stringify(card.components)).digest('hex').slice(0,7),16);
  const payload={...card,components:[{...(card.components[0] as object),id}] as never[]};
  const mine=(await channel.messages.fetch({limit:10})).find(m=>m.author.id===client.user!.id);
  if(!mine)await channel.send(payload);
  else if(mine.components[0]?.id!==id)await mine.edit(payload);
}

export function startBelvaVipGuide(client:Client,pool?:Pool){
  if(!pool)return;
  const run=()=>void ensureVipGuide(client,pool).catch(e=>console.error('[nozebot] guide VIP Belva',e));
  setTimeout(run,30_000).unref();setInterval(run,10*60_000).unref();
}
