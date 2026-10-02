export const SHOP_RULES = {
  version: 1, pointsPerEuro: 35, firstSpinPoints: 10, naturalBonusPoints: 25,
  rainPoints: 20, rainIntervalMs: 20 * 60_000, rainWindowMs: 120_000,
  personalCooldownMs: 15 * 60_000, globalCooldownMs: 10 * 60_000,
  maxPendingCalls: 2, maxPendingBuys: 1,
  globalStake: {factor:3,points:2500,durationMs:3600000},
  stake: [{ factor: 3, points: 300 }, { factor: 6, points: 750 }, { factor: 10, points: 1750 }],
  duration: [{ factor: 1.5, points: 250 }, { factor: 2, points: 700 }, { factor: 4, points: 1500 }],
  performance: [{ multiplier: 100, points: 15 }, { multiplier: 250, points: 35 },
    { multiplier: 500, points: 75 }, { multiplier: 1000, points: 250 }, { multiplier: 5000, points: 5000 }],
} as const;

export interface BonusOffer { id: string; label: string; costCents: number; baseStakeCents: number; }
export function validRumbleIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value);
}
export function shopReplyChunks(text:string):string[]{
  const chunks:string[]=[];let line='';
  for(const word of text.trim().split(/\s+/)){
    if(word.length>190){if(line){chunks.push(line);line='';}for(let i=0;i<word.length;i+=190)chunks.push(word.slice(i,i+190));continue;}
    if(line.length+word.length+1>190){chunks.push(line);line=word;}else line+=(line?' ':'')+word;
  }
  if(line)chunks.push(line);return chunks;
}
export function positiveCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 100_000_000;
}
export function bonusPointPrice(costCents: number): number {
  if (!positiveCents(costCents)) throw Error("invalid_bonus_cost");
  return Math.ceil(costCents * SHOP_RULES.pointsPerEuro / 100);
}
export function bonusRebatePoints(spentPoints: number, gainCents: number, costCents: number): number {
  if (!Number.isSafeInteger(spentPoints) || spentPoints < 0 || !Number.isSafeInteger(gainCents) || gainCents < 0 || !positiveCents(costCents)) throw Error("invalid_bonus_result");
  // Compare integer cents, not rounded euro ratios at tier boundaries.
  const percent = gainCents >= costCents * 10 ? 200 : gainCents >= costCents * 5 ? 150
    : gainCents >= costCents * 3 ? 110 : gainCents >= costCents * 2 ? 60 : gainCents >= costCents ? 25 : 0;
  return Math.floor(spentPoints * percent / 100);
}
export function performancePoints(gainCents: number, baseStakeCents: number, origin: "natural" | "purchase" | "inherited"): number {
  if (origin !== "natural" || !Number.isSafeInteger(gainCents) || gainCents < 0 || !positiveCents(baseStakeCents)) return 0;
  let points = 0;
  for (const tier of SHOP_RULES.performance) if (gainCents >= baseStakeCents * tier.multiplier) points = tier.points;
  return points;
}
export function floorStake(targetCents: number, available: readonly number[]): number | null {
  if (!positiveCents(targetCents)) return null;
  const stakes = available.filter(value => positiveCents(value) && value <= targetCents);
  return stakes.length ? Math.max(...stakes) : null;
}
export function validateOffers(value: unknown): BonusOffer[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw Error("invalid_bonus_offers");
  const ids = new Set<string>();
  return value.map(row => {
    if (!row || typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)
      || typeof row.label !== "string" || row.label.trim().length < 1 || row.label.length > 160
      || !positiveCents(row.costCents) || !positiveCents(row.baseStakeCents) || ids.has(row.id)) throw Error("invalid_bonus_offer");
    ids.add(row.id);
    return { id: row.id, label: row.label.trim(), costCents: row.costCents, baseStakeCents: row.baseStakeCents };
  });
}

export type ShopCommand = { kind: "balance" } | { kind: "shop" } | { kind: "rain" } | { kind: "choose"; choice: number }
  | {kind:"globalstake"}
  | { kind: "buy"; slotName: string; offerId: string | null }
  | { kind: "stake" | "duration"; slotName: string; tier: number };
export function parseShopCommand(text: string, awaitingChoice = false): ShopCommand | null {
  const body = text.trim();
  if (/^!points\s*$/i.test(body)) return { kind: "balance" };
  if (/^!shop\s*$/i.test(body)) return { kind: "shop" };
  if (/^!rain\s*$/i.test(body)) return { kind: "rain" };
  if (/^!mise\s+1h\s*$/i.test(body)) return {kind:"globalstake"};
  const choice = /^(?:!achat\s+)?([1-9]|1[0-6])$/.exec(body);
  if (choice && (awaitingChoice || body.startsWith("!"))) return { kind: "choose", choice: Number(choice[1]) };
  const buy = /^!achat\s+(.+)$/i.exec(body);
  if (buy) {
    const known = /^B:([a-zA-Z0-9_-]{1,100})\s+(.+)$/i.exec(buy[1]!);
    const slotName = (known ? known[2]! : buy[1]!).trim();
    return slotName.length > 0 && slotName.length <= 160 ? { kind: "buy", slotName, offerId: known?.[1] ?? null } : null;
  }
  const stake = /^!call\s+\+([123])\s+(.+)$/i.exec(body);
  const duration = /^!duree\s+([123])\s+(.+)$/i.exec(body);
  const match = stake ?? duration;
  if (match && match[2]!.trim().length <= 160) return { kind: stake ? "stake" : "duration", tier: Number(match[1]), slotName: match[2]!.trim() };
  return null;
}
