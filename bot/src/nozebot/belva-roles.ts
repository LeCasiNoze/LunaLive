import {AsyncLocalStorage} from 'node:async_hooks';
import {ChannelType,type Guild,type GuildMember} from 'discord.js';

// Contexte serveur des tickets : le même système tourne chez Belva et chez LeCasiNoze, chacun avec ses casinos,
// ses salons et son staff (aucune synchro des tickets entre les deux). Sans contexte : Belva.
export type TicketGuild={id:string;brand:string;staff:string[];panel:string;openCat:string;closedCat:string|null;staffCat:string;listName:string;
  casinos?:Brand[];lcn?:boolean};
export const ticketCtx=new AsyncLocalStorage<TicketGuild>();
const LCN_CASINOS:Brand[]=[
  {id:'rainbet',name:'Rainbet',emoji:'🌧️',role:'',channelId:'1569126449670004776',api:true},
  {id:'betportal',name:'Betportal',emoji:'🟢',role:'',bonus:30,channelId:'1562493112327348276'},
  {id:'celsius',name:'Celsius',emoji:'🧡',role:'',bonus:35,channelId:'1544405889455362158'},
];
export const LCN_TICKETS:TicketGuild={id:process.env.LECASINOZE_GUILD_ID?.trim()||'1188913226990235800',brand:'LeCasiNoze',
  staff:['1188940226358415443','1188939890344329379'],panel:'1544429389415063604',openCat:'1544429387754246185',closedCat:null,
  staffCat:'1193268045100105759',listName:'〈📋〉┃𝗟𝗜𝗦𝗧𝗘-𝗥𝗘𝗠𝗕𝗢𝗨𝗥𝗦𝗘𝗠𝗘𝗡𝗧𝗦',casinos:LCN_CASINOS,lcn:true};
// Rôles LeCasiNoze (univers LunaLive) : ✅ Joueur Vérifié, rôle du casino, 🍾 Table VIP.
const LCN_ROLE_NAMES={membre:'✅ Joueur Vérifié',carreOr:'🍾 Table VIP',rainbet:'🌧️ Rainbet',betportal:'🟢 Betportal',celsius:'🧡 Celsius'} as Record<string,string>;

// Belva's server roles. Tiers: Invité (no casino linked) → Membre du Club (verified on a casino) → Carré Or (has deposited).
// Dépôt offert : retiré pour le moment, réactivé avec BELVA_OFFER=on (cartes, tickets, annonces).
export const offerOn=()=>process.env.BELVA_OFFER==='on';
export const BELVA_ROLES={
  invite:'1482854045210120343',
  membre:'1571169945687949472',
  carreOr:'1571169943981133894',
  notifGiveaways:'1571152748970385530',
} as const;

// The brand list follows the channels of the "Offres Casino" category: one channel = one brand.
// "35€-offerts-celsius" → Celsius with a 35 € refund; "💜︱hazcasino" → its first word, refund cap from DEFAULT_BONUS.
// Info channels of the category (toutes-les-offres…) are not brands.
// Catégorie « Rainbet ★ » (partenaire principal, tout en haut) + catégorie des autres casinos.
const OFFERS_CATEGORIES=new Set(['1572066401592549406','1570917911206563931']);
const DEFAULT_BONUS:Record<string,number>={hazcasino:30,velobet:30,celsius:35,betportal:30};
const NOT_BRANDS=new Set(['toutes','tous','offres','infos','wager','race']);
export type Brand={id:string;name:string;emoji:string;role:string;bonus?:number;channelId?:string;api?:boolean};
const KNOWN:Brand[]=[
  {id:'hazcasino',name:'HazCasino',emoji:'💜',role:'1571169951102931038',bonus:30,channelId:'1518632995945189507'},
  {id:'velobet',name:'VeloBet',emoji:'💚',role:'1571169952436715631',bonus:30,channelId:'1569361303192084521'},
  {id:'celsius',name:'Celsius',emoji:'🧡',role:'1571169954412101664',bonus:35,channelId:'1570927516301004990'},
  {id:'betportal',name:'Betportal',emoji:'🟢',role:'',bonus:30},
  {id:'rainbet',name:'Rainbet',emoji:'🌧️',role:'1571169955616002059',channelId:'1571169962041811014',api:true},
];
let current:Brand[]=KNOWN;
export const brands=()=>ticketCtx.getStore()?.casinos??current;
export const brand=(id:string)=>{const c=ticketCtx.getStore()?.casinos;return c?c.find(b=>b.id===id):current.find(b=>b.id===id)??KNOWN.find(b=>b.id===id);};

export function parseOfferChannel(name:string):{id:string;bonus?:number}|null{
  const base=name.split('︱').pop()!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const m=base.match(/^(\d+)\s*(?:€|e|eur|euros?)?-?offerts?-([a-z0-9-]+)$/);
  const id=(m?m[2]:base.split('-')[0]).replace(/[^a-z0-9]/g,'');
  return id.length>=2?{id,...(m?{bonus:Number(m[1])}:{})}:null;
}

const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');

export async function refreshBrands(guild:Guild){
  const channels=[...guild.channels.cache.values()].filter(c=>c.type===ChannelType.GuildText&&OFFERS_CATEGORIES.has(c.parentId??''))
    .sort((a,b)=>('position' in a?a.position:0)-('position' in b?b.position:0));
  if(!channels.length)return current;
  const next:Brand[]=[];
  for(const ch of channels){
    const parsed=parseOfferChannel(ch.name);if(!parsed||NOT_BRANDS.has(parsed.id)||next.some(b=>b.id===parsed.id))continue;
    const known=KNOWN.find(b=>b.id===parsed.id);
    const name=known?.name??parsed.id[0].toUpperCase()+parsed.id.slice(1);
    let role=known?.role||guild.roles.cache.find(r=>norm(r.name).endsWith(parsed.id))?.id;
    if(!role)role=(await guild.roles.create({name:`${known?.emoji??'🎰'} ${name}`,color:0x94a3b8,reason:`Nouveau casino dans Offres Casino : #${ch.name}`})).id;
    next.push({...known,id:parsed.id,name,emoji:known?.emoji??'🎰',role,channelId:ch.id,bonus:parsed.bonus??DEFAULT_BONUS[parsed.id]});
  }
  if(next.length)current=next;
  return current;
}

export async function grantCasinoRoles(member:GuildMember,casinoId:string,deposited:boolean,reason:string){
  if(ticketCtx.getStore()?.lcn){
    const names=[LCN_ROLE_NAMES.membre,LCN_ROLE_NAMES[casinoId],...(deposited?[LCN_ROLE_NAMES.carreOr]:[])].filter(Boolean);
    const add=member.guild.roles.cache.filter(r=>names.includes(r.name)&&!member.roles.cache.has(r.id)).map(r=>r.id);
    if(add.length)await member.roles.add(add,reason);
    return;
  }
  const add=[BELVA_ROLES.membre,brand(casinoId)?.role,...(deposited?[BELVA_ROLES.carreOr]:[])].filter((r):r is string=>!!r&&!member.roles.cache.has(r));
  if(add.length)await member.roles.add(add,reason);
  if(member.roles.cache.has(BELVA_ROLES.invite))await member.roles.remove(BELVA_ROLES.invite,reason);
}
