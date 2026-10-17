export type LunaLiveApiConfig = {
  baseUrl: string;
  internalKey: string;
  guildId: string;
};

export type LunaLiveProfile = {
  userId: number;
  username: string;
  rubis: number;
  xp: number;
  level: number;
  levelTitle: string;
  pctToNext: number;
  xpToNext: number;
  isMaxLevel: boolean;
  watchSecondsTotal: number;
  chatMessagesTotal: number;
  callsTotal: number;
  predictionsTotal: number;
  predictionWinsTotal: number;
  wheelSpinsTotal: number;
  dailyBonusClaimsTotal: number;
  rubisEarnedTotal: number;
  rubisSpentTotal: number;
  achievementsByTier: {
    bronze: { unlocked: number; total: number };
    silver: { unlocked: number; total: number };
    gold: { unlocked: number; total: number };
    master: { unlocked: number; total: number };
  };
  achievementsTotalUnlocked: number;
  achievementsTotalAll: number;
  entitlementsTotal: number;
  questsCompletedTotal: number;
  createdAt: string | null;
  lastLoginAt: string | null;
  equippedTitleCode: string | null;
  followsCount: number;
};

export type LunaLiveClaim = {
  amount: number;
  baseAmount: number;
  bonus: number;
  countThisMonth: number;
  nextAt: string;
  balance: number;
  xpGained: number;
  level: number;
  levelTitle: string;
  leveledUp: boolean;
};

export type LunaLiveBlackjackCard = { r: string; s: string };
export type LunaLiveBlackjack = {
  sessionId: string;
  status: "active" | "finished";
  mode: "classic" | "plus";
  dealer: { cards: Array<LunaLiveBlackjackCard | null>; total: number | null };
  hands: Array<{
    cards: LunaLiveBlackjackCard[];
    total: number;
    bet: number;
    doubled: boolean;
    finished: boolean;
    active: boolean;
  }>;
  sideBetLines: string[];
  actions: { hit: boolean; stand: boolean; double: boolean; split: boolean };
  balance: number;
  cooldownEndsAt: string;
  result: null | {
    dealerTotal: number;
    perHand: Array<{ i: number; bet: number; total: number; doubled: boolean; kind: "win" | "lose" | "push" | "bust"; net: number }>;
    mainNet: number;
    sideNet: number;
    totalNet: number;
    isNaturalBlackjack: boolean;
    xpGained: number;
    balance: number;
  };
};

export type LunaLiveSlot = {
  code: string;
  label: string;
  art: string;
  bet: number;
  payout: number;
  penalty: number;
  net: number;
  balance: number;
  nextAt: string;
};

export class LunaLiveApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "LunaLiveApiError";
  }
}

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function fetchAutomodProfile(config:LunaLiveApiConfig,discordUserId:string){
 return post<{ok:true;profile:null|{username:string;message:string}}>(config,'/internal/bot/nozebot/automod/profile',discordUserId);
}
export function requestAutomodLink(config:LunaLiveApiConfig,discordUserId:string){
 return post<{ok:true;linked:boolean;username?:string;command?:string}>(config,'/internal/bot/nozebot/automod/link',discordUserId);
}

export type CoinProfile={username:string;balance:number;automod:number;nextClaimAt:string|null;journal?:Array<{id:string;label:string;complete:boolean}>;
 rules:{claim:number;claimMs:number;rain:number;bet:number};tiers:Record<string,number>};
export function coinRequest(config:LunaLiveApiConfig,discordUserId:string,action:'profile'|'claim'|'slot'|'upgrade',receipt?:string,upgrade?:string,expectedTier?:number){
 return post<{ok:boolean;error?:string;nextAt?:string;profile?:CoinProfile;balance?:number;delta?:number;art?:string;bet?:number;payout?:number;replayed?:boolean}>(
  config,`/internal/bot/nozebot/coins/${action}`,discordUserId,{receipt,upgrade,expectedTier});
}
export function fetchLinkedCoinNames(config:LunaLiveApiConfig,discordUserId:string,cursor=''){
 return post<{ok:true;links:Array<{discordId:string;username:string;rumbleId?:string;usernameVerifiedAt?:string|null}>;nextCursor:string|null}>(config,'/internal/bot/nozebot/coins/links',discordUserId,{cursor});
}

export function soundRequest(config:LunaLiveApiConfig,discordUserId:string,action:'sound-catalogue'|'sound',body:Record<string,unknown>={}){
 return post<{ok:true;enabled?:boolean;sounds?:Array<{id:string;label:string;audioUrl:string;cost:number;durationMs:number;volume:number}>;state?:string;balance?:number;requestId?:string;replayed?:boolean}>(config,`/internal/bot/nozebot/coins/${action}`,discordUserId,body);
}

async function post<T>(
  config: LunaLiveApiConfig,
  path: string,
  discordUserId: string,
  extraBody: Record<string, unknown> = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${cleanBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-key": config.internalKey,
      },
      body: JSON.stringify({ discordUserId, discordGuildId: config.guildId, ...extraBody }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || payload.ok !== true) {
      throw new LunaLiveApiError(
        typeof payload.error === "string" ? payload.error : "api_error",
        response.status,
        payload
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof LunaLiveApiError) throw error;
    throw new LunaLiveApiError(error instanceof Error ? error.message : "network_error", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function requestLunaLiveLink(config: LunaLiveApiConfig, discordUserId: string) {
  return post<
    | { ok: true; linked: true; rumble?: {linked:boolean;username?:string;command?:string;retryAfterSec?:number}; user: { id: number; username: string; role: string } }
    | { ok: true; linked: false; rumble?: {linked:boolean;username?:string;command?:string;retryAfterSec?:number}; code: string; expiresAt: string }
  >(config, "/internal/bot/nozebot/link", discordUserId);
}

export async function fetchLunaLiveProfile(
  config: LunaLiveApiConfig,
  discordUserId: string
): Promise<LunaLiveProfile> {
  const result = await post<{ ok: true; profile: LunaLiveProfile }>(
    config,
    "/internal/bot/nozebot/profile",
    discordUserId
  );
  return result.profile;
}

export async function claimLunaLiveDaily(
  config: LunaLiveApiConfig,
  discordUserId: string
): Promise<LunaLiveClaim> {
  const result = await post<{ ok: true; claim: LunaLiveClaim }>(
    config,
    "/internal/bot/nozebot/claim",
    discordUserId
  );
  return result.claim;
}

export async function startLunaLiveBlackjack(
  config: LunaLiveApiConfig,
  discordUserId: string,
  mode: "classic" | "plus"
): Promise<LunaLiveBlackjack> {
  const result = await post<{ ok: true; game: LunaLiveBlackjack }>(
    config,
    "/internal/bot/nozebot/blackjack/start",
    discordUserId,
    { mode }
  );
  return result.game;
}

export async function actLunaLiveBlackjack(
  config: LunaLiveApiConfig,
  discordUserId: string,
  sessionId: string,
  action: "hit" | "stand" | "double" | "split"
): Promise<LunaLiveBlackjack> {
  const result = await post<{ ok: true; game: LunaLiveBlackjack }>(
    config,
    "/internal/bot/nozebot/blackjack/action",
    discordUserId,
    { sessionId, action }
  );
  return result.game;
}

export async function playLunaLiveSlot(
  config: LunaLiveApiConfig,
  discordUserId: string
): Promise<LunaLiveSlot> {
  const result = await post<{ ok: true; slot: LunaLiveSlot }>(
    config,
    "/internal/bot/nozebot/slot",
    discordUserId
  );
  return result.slot;
}

export async function coinSupportRewards(config:LunaLiveApiConfig,botId:string){
 return post<{ok:true;rewards:Array<{week:string;discordId:string;rumbleId:string;username:string;amount?:number}>}>(config,'/internal/bot/nozebot/coins/cnz',botId);
}
export async function acknowledgeSupportRewards(config:LunaLiveApiConfig,botId:string,week:string,ids:string[]){
 return post<{ok:true}>(config,'/internal/bot/nozebot/coins/cnz-ack',botId,{week,ids});
}
