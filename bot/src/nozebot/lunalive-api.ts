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

async function post<T>(
  config: LunaLiveApiConfig,
  path: string,
  discordUserId: string
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
      body: JSON.stringify({ discordUserId, discordGuildId: config.guildId }),
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
    | { ok: true; linked: true; user: { id: number; username: string; role: string } }
    | { ok: true; linked: false; code: string; expiresAt: string }
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
