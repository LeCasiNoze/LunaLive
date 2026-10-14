import { randomInt } from 'node:crypto';

export const COIN_RULES = Object.freeze({ claim:100, claimHours:[24,23,22,20], rain:25,
  rainIntervalMs:900_000, rainWindowMs:120_000, slotCooldownMs:30_000, bets:[20,30,40,50] });
export const UPGRADES = {
  claim:{label:'Claim généreux',costs:[300,600,1200]},
  cooldown:{label:'Claim rapide',costs:[400,800,1600]},
  rain:{label:'Parapluie Noze',costs:[300,600,1200]},
  slot:{label:'Mise du mini-jeu',costs:[300,600,1200]},
} as const;
export type Upgrade = keyof typeof UPGRADES;
export function accountRules(row:{claim_tier?:number;cooldown_tier?:number;rain_tier?:number;slot_tier?:number}) {
  const tier=(n:number|undefined)=>Math.max(0,Math.min(3,Number.isInteger(n)?n!:0));
  return {claim:100+25*tier(row.claim_tier),claimMs:COIN_RULES.claimHours[tier(row.cooldown_tier)]!*3_600_000,
    rain:25+5*tier(row.rain_tier),bet:COIN_RULES.bets[tier(row.slot_tier)]!};
}
// Mutually exclusive outcomes; virtual coins only, no purchase or cash/Rubis conversion.
export const SLOT_OUTCOMES = [
  {weight:55000,art:'XXXXXX',multiplier:0}, {weight:25000,art:'0XXXXX',multiplier:1},
  {weight:12000,art:'00XXXX',multiplier:2}, {weight:5000,art:'000XXX',multiplier:3},
  {weight:2000,art:'0000XX',multiplier:5}, {weight:800,art:'00000X',multiplier:10},
  {weight:180,art:'000000',multiplier:25}, {weight:19,art:'777777',multiplier:100},
  {weight:1,art:'MAX WIN',multiplier:250},
] as const;
export function slotOutcome(draw=randomInt(100000)) {
  if(!Number.isInteger(draw)||draw<0||draw>=100000)throw Error('bad_draw');
  let threshold=0;for(const item of SLOT_OUTCOMES){threshold+=item.weight;if(draw<threshold)return item;}
  throw Error('bad_distribution');
}
