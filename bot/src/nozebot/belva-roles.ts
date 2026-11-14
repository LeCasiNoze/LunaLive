import type {GuildMember} from 'discord.js';

// Belva's server roles. Tiers: Invité (no casino linked) → Membre du Club (verified on a casino) → Carré Or (has deposited).
export const BELVA_ROLES={
  invite:'1482854045210120343',
  membre:'1571169945687949472',
  carreOr:'1571169943981133894',
  notifGiveaways:'1571152748970385530',
} as const;
export const CASINO_ROLES:Record<string,string>={
  hazcasino:'1571169951102931038',velobet:'1571169952436715631',boo:'1571169953468514445',
  celsius:'1571169954412101664',rainbet:'1571169955616002059',
};

export async function grantCasinoRoles(member:GuildMember,casinoId:string,deposited:boolean,reason:string){
  const add=[BELVA_ROLES.membre,CASINO_ROLES[casinoId],...(deposited?[BELVA_ROLES.carreOr]:[])].filter((r):r is string=>!!r&&!member.roles.cache.has(r));
  if(add.length)await member.roles.add(add,reason);
  if(member.roles.cache.has(BELVA_ROLES.invite))await member.roles.remove(BELVA_ROLES.invite,reason);
}
