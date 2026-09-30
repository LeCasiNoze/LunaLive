import type { AutomodItem } from "./automod-domain.js";
import type { ProviderKey } from "./provider-capabilities.js";

export interface LunaLiveCall {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl?: string;
  userId?: number;
}

interface ListResponse {
  ok?: boolean;
  error?: string;
  canModerate?: boolean;
  items?: unknown[];
}

interface SlotResponse {
  ok?: boolean;
  error?: string;
  items?: unknown[];
  item?: unknown;
}

export interface LunaLivePublicQueue {
  calls: LunaLiveCall[];
  count: number;
  phase: string | null;
  limited: true;
}

export type AutomodCallInsertion = { ok: true; call: LunaLiveCall } | { ok: false; error: "queue_not_empty" | "automod_call_finished" };

export interface LunaLiveClientOptions {
  baseUrl: string;
  streamerSlug: string;
  token?: string;
  serviceCredential?: { serviceId: string; secret: string };
  fetchImpl?: typeof fetch;
}

const PROVIDER_ALIASES: Readonly<Record<string, ProviderKey>> = {
  pragmatic: "pragmatic",
  pragmaticplay: "pragmatic",
  "pragmatic-play": "pragmatic",
  hacksaw: "hacksaw",
  hacksawgaming: "hacksaw",
  "hacksaw-gaming": "hacksaw",
  nolimit: "nolimit",
  nolimitcity: "nolimit",
  "nolimit-city": "nolimit",
  "no-limit-city": "nolimit",
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeAutomodProvider(value: string | null): ProviderKey | null {
  if (value === null) return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return PROVIDER_ALIASES[key] ?? PROVIDER_ALIASES[key.replace(/-/g, "")] ?? null;
}

function parseCall(value: unknown): LunaLiveCall | null {
  const row = object(value);
  if (row === null) return null;
  const id = string(row.id);
  const slotName = string(row.slotName);
  if (id === null || slotName === null) return null;
  return {
    id,
    slotName,
    provider: string(row.provider),
    username: string(row.username) ?? "",
    ...(Number.isSafeInteger(row.userId) && Number(row.userId) >= 0 ? { userId: Number(row.userId) } : {}),
    ...(safeImage(row.imageUrl) ? { imageUrl: safeImage(row.imageUrl)! } : {}),
    pos: typeof row.pos === "number" && Number.isFinite(row.pos) ? row.pos : Number.MAX_SAFE_INTEGER,
  };
}

function safeImage(value: unknown): string | null {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

function parseSlot(value: unknown): { name: string; provider: ProviderKey; imageUrl?: string } | null {
  const row = object(value);
  if (row === null) return null;
  const name = string(row.name) ?? string(row.slotName);
  const provider = normalizeAutomodProvider(string(row.provider));
  return name === null || provider === null ? null : { name, provider, ...(safeImage(row.imageUrl) ? { imageUrl: safeImage(row.imageUrl)! } : {}) };
}

export class LunaLiveClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private token: string | undefined;
  private serviceCredential: { serviceId: string; secret: string } | undefined;
  private tokenExpiresAt = 0;

  public constructor(private readonly options: LunaLiveClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token?.trim() || undefined;
    this.serviceCredential = options.serviceCredential;
  }

  public setToken(token: string | undefined): void {
    this.serviceCredential = undefined;
    this.token = token?.trim() || undefined;
    this.tokenExpiresAt = 0;
  }

  public setServiceCredential(value: { serviceId: string; secret: string } | undefined): void {
    this.serviceCredential = value;
    this.token = undefined;
    this.tokenExpiresAt = 0;
  }

  private async refreshServiceToken(): Promise<void> {
    const credential = this.serviceCredential;
    if (!credential) return;
    const response = await this.fetchImpl(`${this.baseUrl}/api/automod-service/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(credential), signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; accessToken?: string; expiresIn?: number } | null;
    if (!response.ok || payload?.ok !== true || typeof payload.accessToken !== "string" || !Number.isFinite(payload.expiresIn)) {
      throw new Error(`Renouvellement de l’accès service LunaLive refusé (HTTP ${response.status}).`);
    }
    this.token = payload.accessToken;
    this.tokenExpiresAt = Date.now() + Number(payload.expiresIn) * 1000;
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.serviceCredential && (!this.token || Date.now() >= this.tokenExpiresAt - 30_000)) await this.refreshServiceToken();
  }

  private async authorizedFetch(url: string, init: RequestInit): Promise<Response> {
    await this.ensureAccessToken();
    const response = await this.fetchImpl(url, init);
    if (response.status !== 401 || !this.serviceCredential) return response;
    await this.refreshServiceToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    return this.fetchImpl(url, { ...init, headers });
  }

  public async resolveImage(slotName: string, provider: ProviderKey): Promise<string | null> {
    try {
      const result = await this.json<SlotResponse>(`/api/public/slots/search?q=${encodeURIComponent(slotName)}&limit=10`, { signal: AbortSignal.timeout(3_000) });
      const normalize = (name: string) => name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
      const exact = result.items?.map(parseSlot).find(slot => slot?.provider === provider && normalize(slot.name) === normalize(slotName));
      return exact?.imageUrl ?? null;
    } catch { return null; }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    await this.ensureAccessToken();
    const token = this.token;
    if (!token) throw new Error("Token LunaLive requis pour retirer un call.");
    return { Authorization: `Bearer ${token}` };
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.authorizedFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
    const payload = await response.json().catch(() => null) as T | null;
    if (!response.ok || payload === null) {
      throw new Error(`LunaLive ${init?.method ?? "GET"} ${path} a échoué (${response.status}).`);
    }
    return payload;
  }

  public async listCalls(limit = 200): Promise<LunaLiveCall[]> {
    if (!this.token && !this.serviceCredential) throw new Error("Jeton Luna Live requis pour gérer la file.");
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const slug = encodeURIComponent(this.options.streamerSlug);
    const route = this.serviceCredential ? `/api/automod-service/v1/calls` : `/calls/${slug}/list?limit=${safeLimit}&offset=0`;
    const payload = await this.json<ListResponse>(route, {
      headers: await this.authHeaders(),
    });
    if (payload.ok !== true || !Array.isArray(payload.items)) throw new Error(payload.error || "Réponse de file LunaLive invalide.");
    if (!this.serviceCredential && payload.canModerate !== true) throw new Error("Le jeton Luna Live n’a pas les droits de gestion des calls de ce streamer.");
    return payload.items.map(parseCall).filter((item): item is LunaLiveCall => item !== null).sort((a, b) => a.pos - b.pos);
  }

  public async callsSettings(): Promise<Record<string, unknown>> {
    const slug = encodeURIComponent(this.options.streamerSlug);
    const route = this.serviceCredential ? `/api/automod-service/v1/settings` : `/calls/${slug}/config`;
    const payload = await this.json<{ ok?: boolean; config?: unknown; error?: string }>(route, { headers: await this.authHeaders() });
    const config = object(payload.config);
    if (payload.ok !== true || config === null) throw new Error(payload.error || "Lecture des réglages LunaLive refusée.");
    return config;
  }


  public async publicQueue(): Promise<LunaLivePublicQueue> {
    const slug = encodeURIComponent(this.options.streamerSlug);
    const payload = await this.json<Record<string, unknown>>(`/api/public/calls/${slug}/queue`);
    if (payload.ok !== true) throw new Error("Réponse publique LunaLive invalide.");
    const candidates = [payload.head, payload.next].map(parseCall).filter((item): item is LunaLiveCall => item !== null);
    const unique = [...new Map(candidates.map((call) => [call.id, call])).values()].sort((a, b) => a.pos - b.pos);
    return {
      calls: unique,
      count: typeof payload.count === "number" && Number.isFinite(payload.count) ? Math.max(0, Math.trunc(payload.count)) : unique.length,
      phase: string(payload.phase),
      limited: true,
    };
  }

  public async removeCall(id: string): Promise<boolean> {
    const slug = encodeURIComponent(this.options.streamerSlug);
    const payload = await this.json<{ ok?: boolean; deleted?: boolean; error?: string }>(
      this.serviceCredential ? `/api/automod-service/v1/calls/${encodeURIComponent(id)}` : `/calls/${slug}/item/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: await this.authHeaders() },
    );
    if (payload.ok !== true) throw new Error(payload.error || `Suppression du call ${id} refusée.`);
    return payload.deleted === true;
  }

  public async resolveProvider(slotName: string): Promise<ProviderKey | null> {
    const path = this.serviceCredential ? `/api/public/slots/search?q=${encodeURIComponent(slotName)}&limit=10` : `/slots/search?q=${encodeURIComponent(slotName)}&limit=10`;
    const payload = await this.json<SlotResponse>(path, this.serviceCredential ? undefined : { headers: await this.authHeaders() });
    if (payload.ok !== true || !Array.isArray(payload.items)) return null;
    const wanted = slotName.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
    const exact = payload.items.map(parseSlot).find((item) => item?.name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim() === wanted);
    return exact?.provider ?? null;
  }

  public async nextSupportedCall(
    allowedProviders: ReadonlySet<ProviderKey>,
    onSkipped?: (call: LunaLiveCall, reason: string) => void | Promise<void>,
  ): Promise<AutomodItem | null> {
    for (const call of await this.listCalls()) {
      const provider = normalizeAutomodProvider(call.provider) ?? await this.resolveProvider(call.slotName);
      if (provider === null || !allowedProviders.has(provider)) {
        await this.removeCall(call.id);
        await onSkipped?.(call, provider === null ? "provider-inconnu" : `provider-interdit:${provider}`);
        continue;
      }
      return {
        key: `call:${call.id}`,
        callId: call.id,
        source: "lunalive",
        slotName: call.slotName,
        provider,
        requestedBy: call.username || null,
        ...(call.userId ? { requestedById: call.userId } : {}),
        ...(call.imageUrl ? { imageUrl: call.imageUrl } : {}),
      };
    }
    return null;
  }

  public async randomSlot(allowedProviders: ReadonlySet<ProviderKey>, excludeNames: readonly string[] = []): Promise<AutomodItem> {
    if (this.serviceCredential) {
      const fallback = await this.randomSupportedCatalogSlot(allowedProviders, excludeNames);
      if (fallback === null) throw new Error("Aucun slot supporté trouvé dans le catalogue LunaLive.");
      return fallback;
    }
    const providers = [...allowedProviders].join(",");
    const query = new URLSearchParams({ providers });
    for (const name of excludeNames.slice(-20)) query.append("exclude", name);
    let payload: SlotResponse;
    try {
      payload = await this.json<SlotResponse>(`/slots/random?${query.toString()}`, {
        headers: await this.authHeaders(),
      });
    } catch (error) {
      // Older production API deployments do not expose /slots/random yet.
      // In that case use the existing public catalogue search, but only accept
      // exact-title matches from the explicitly allowed provider set.
      if (!(error instanceof Error) || !/\(404\)/.test(error.message)) throw error;
      const fallback = await this.randomSupportedCatalogSlot(allowedProviders, excludeNames);
      if (fallback === null) throw new Error("Aucun slot supporté trouvé dans le catalogue LunaLive.");
      return fallback;
    }
    if (payload.ok !== true) throw new Error(payload.error || "Sélection aléatoire LunaLive refusée.");
    const slot = parseSlot(payload.item);
    if (slot === null || !allowedProviders.has(slot.provider)) throw new Error("Slot aléatoire LunaLive hors politique.");
    const normalizeName = (name: string): string => name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
    const excluded = new Set(excludeNames.map(normalizeName));
    if (excluded.has(normalizeName(slot.name))) {
      const fallback = await this.randomSupportedCatalogSlot(allowedProviders, excludeNames);
      if (fallback === null) throw new Error("L’API LunaLive a renvoyé un slot exclu et aucun autre slot supporté n’est disponible.");
      return fallback;
    }
    return {
      key: `random:${slot.provider}:${slot.name}:${Date.now()}`,
      callId: null,
      source: "random",
      slotName: slot.name,
      provider: slot.provider,
      requestedBy: null,
      ...(slot.imageUrl ? { imageUrl: slot.imageUrl } : {}),
    };
  }

  public async enqueueAutomodCall(item: AutomodItem, requestId: string): Promise<AutomodCallInsertion> {
    const slug = encodeURIComponent(this.options.streamerSlug);
    const path = this.serviceCredential ? `/api/automod-service/v1/calls` : `/calls/${slug}/automod`;
    const response = await this.authorizedFetch(`${this.baseUrl}${path}`, {
      method: "POST", headers: { ...await this.authHeaders(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ requestId, slotName: item.slotName, provider: item.provider }), signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; item?: unknown; error?: string } | null;
    if (response.status === 409 && (payload?.error === "queue_not_empty" || payload?.error === "automod_call_finished")) return { ok: false, error: payload.error };
    if (!response.ok || payload?.ok !== true) throw Error(`Insertion Automod LunaLive non confirmée (HTTP ${response.status}, ${payload?.error ?? "réponse invalide"}).`);
    const call = parseCall(payload.item);
    if (!call || call.username !== "Automod" || call.userId !== 0) throw Error("Identité du call Automod non confirmée.");
    return { ok: true, call };
  }

  public async syncSessionStats(stats: unknown): Promise<void> {
    if (!this.serviceCredential) return;
    const row = object(stats);
    const sessionId = string(row?.sessionId);
    if (!sessionId) return;
    const response = await this.authorizedFetch(`${this.baseUrl}/api/automod-service/v1/session-stats/${encodeURIComponent(sessionId)}`, {
      method: "PUT", headers: { ...await this.authHeaders(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(stats), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Synchronisation des statistiques LunaLive refusée (HTTP ${response.status}).`);
  }

  private async randomSupportedCatalogSlot(
    allowedProviders: ReadonlySet<ProviderKey>,
    excludeNames: readonly string[],
  ): Promise<AutomodItem | null> {
    const candidates: readonly [ProviderKey, readonly string[]][] = [
      ["pragmatic", ["Sweet Bonanza", "Gates of Olympus", "Big Bass Bonanza", "Sugar Rush", "Starlight Princess", "Fruit Party", "The Dog House"]],
      ["hacksaw", ["Wanted Dead or a Wild", "Le Bandit", "Chaos Crew", "Hand of Anubis", "RIP City", "Dork Unit", "Stack'em"]],
      ["nolimit", ["San Quentin", "Tombstone", "Deadwood", "Mental", "Book of Shadows", "Fire in the Hole", "Punk Rocker"]],
    ];
    const excluded = new Set(excludeNames.map((name) => name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()));
    const pool = candidates.flatMap(([provider, names]) => allowedProviders.has(provider)
      ? names.map((name) => ({ provider, name }))
      : []);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    for (const candidate of pool.slice(0, 8)) {
      if (excluded.has(candidate.name.toLocaleLowerCase("fr"))) continue;
      let payload: SlotResponse;
      try {
        payload = await this.json<SlotResponse>(`/api/public/slots/search?q=${encodeURIComponent(candidate.name)}&limit=10`);
      } catch {
        continue;
      }
      if (payload.ok !== true || !Array.isArray(payload.items)) continue;
      const wanted = candidate.name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
      const slot = payload.items.map(parseSlot).find((item) => item !== null
        && item.provider === candidate.provider
        && item.name.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim() === wanted);
      if (slot == null) continue;
      return {
        key: `random:${slot.provider}:${slot.name}:${Date.now()}`,
        callId: null,
        source: "random",
        slotName: slot.name,
        provider: slot.provider,
        requestedBy: null,
        ...(slot.imageUrl ? { imageUrl: slot.imageUrl } : {}),
      };
    }
    return null;
  }
}
