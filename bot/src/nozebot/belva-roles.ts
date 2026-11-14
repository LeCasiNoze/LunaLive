import {ChannelType,type Guild,type GuildMember} from 'discord.js';

// Belva's server roles. Tiers: Invité (no casino linked) → Membre du Club (verified on a casino) → Carré Or (has deposited).
export const BELVA_ROLES={
  invite:'1482854045210120343',
  membre:'1571169945687949472',
  carreOr:'1571169943981133894',
  notifGiveaways:'1571152748970385530',
} as const;

// The brand list follows the channels of the "Offres Casino" category: one channel = one brand.
// "35€-offerts-celsius" → Celsius with a 35 € refund; any other name → its first word, no refund.
const OFFERS_CATEGORY='1570917911206563931';
export type Brand={id:string;name:string;emoji:string;role:string;bonus?:number;channelId?:string;api?:boolean};
const KNOWN:Brand[]=[
  {id:'hazcasino',name:'HazCasino',emoji:'💜',role:'1571169951102931038',bonus:30,channelId:'1518632995945189507'},
  {id:'velobet',name:'VeloBet',emoji:'💚',role:'1571169952436715631',bonus:30,channelId:'1569361303192084521'},
  {id:'boo',name:'Boo!',emoji:'🩵',role:'1571169953468514445',bonus:30,channelId:'1570060951452123226'},
  {id:'celsius',name:'Celsius',emoji:'🧡',role:'1571169954412101664',bonus:35,channelId:'1570927516301004990'},
  {id:'rainbet',name:'Rainbet',emoji:'🌧️',role:'1571169955616002059',channelId:'1571169962041811014',api:true},
];
let current:Brand[]=KNOWN;
export const brands=()=>current;
export const brand=(id:string)=>current.find(b=>b.id===id)??KNOWN.find(b=>b.id===id);

export function parseOfferChannel(name:string):{id:string;bonus?:number}|null{
  const base=name.split('︱').pop()!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const m=base.match(/^(\d+)\s*(?:€|e|eur|euros?)?-?offerts?-([a-z0-9-]+)$/);
  const id=(m?m[2]:base.split('-')[0]).replace(/[^a-z0-9]/g,'');
  return id.length>=2?{id,...(m?{bonus:Number(m[1])}:{})}:null;
}

const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');

export async function refreshBrands(guild:Guild){
  const channels=[...guild.channels.cache.values()].filter(c=>c.type===ChannelType.GuildText&&c.parentId===OFFERS_CATEGORY)
    .sort((a,b)=>('position' in a?a.position:0)-('position' in b?b.position:0));
  if(!channels.length)return current;
  const next:Brand[]=[];
  for(const ch of channels){
    const parsed=parseOfferChannel(ch.name);if(!parsed||next.some(b=>b.id===parsed.id))continue;
    const known=KNOWN.find(b=>b.id===parsed.id);
    const name=known?.name??parsed.id[0].toUpperCase()+parsed.id.slice(1);
    let role=known?.role??guild.roles.cache.find(r=>norm(r.name).endsWith(parsed.id))?.id;
    if(!role)role=(await guild.roles.create({name:`🎰 ${name}`,color:0x94a3b8,reason:`Nouveau casino dans Offres Casino : #${ch.name}`})).id;
    next.push({...known,id:parsed.id,name,emoji:known?.emoji??'🎰',role,channelId:ch.id,bonus:parsed.bonus});
  }
  if(next.length)current=next;
  return current;
}

export async function grantCasinoRoles(member:GuildMember,casinoId:string,deposited:boolean,reason:string){
  const add=[BELVA_ROLES.membre,brand(casinoId)?.role,...(deposited?[BELVA_ROLES.carreOr]:[])].filter((r):r is string=>!!r&&!member.roles.cache.has(r));
  if(add.length)await member.roles.add(add,reason);
  if(member.roles.cache.has(BELVA_ROLES.invite))await member.roles.remove(BELVA_ROLES.invite,reason);
}
