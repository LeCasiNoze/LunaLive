import type { HuntState } from "./hunt_types";

export const EMPTY_HUNT: HuntState = {
  phase: "edit",
  opened: false,
  start: null,
  items: [],
};
export const HUNT_REFRESH_MS = 3000;

export function parseHuntAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 100000000 ? amount : null;
}

export function huntStats(state: HuntState) {
  const totalBet = state.items.reduce((n, it) => n + (Number(it.bet) || 0), 0);
  const totalPay = state.items.reduce((n, it) => n + (Number(it.pay) || 0), 0);
  const unpaid = state.items.filter((it) => it.pay == null);
  const remainingBet = unpaid.reduce((n, it) => n + (Number(it.bet) || 0), 0);
  const start = Number(state.start) || 0;
  const left = Math.max(0, start - totalPay);
  return {
    totalBet,
    totalPay,
    start,
    profit: totalPay - start,
    unpaid: unpaid.length,
    paid: state.items.length - unpaid.length,
    breakEven: start > 0 && totalBet > 0 ? start / totalBet : null,
    remainingMulti:
      left === 0 ? 0 : remainingBet > 0 ? left / remainingBet : null,
    recovered: start > 0 ? Math.min(100, (totalPay / start) * 100) : 0,
  };
}

export function mapCallsHunt(payload: any): HuntState {
  const phase =
    payload.mode === "closed"
      ? "closed"
      : payload.opening || payload.mode === "open"
        ? "open"
        : "edit";
  const source = Array.isArray(payload.bonusDrops)
    ? payload.bonusDrops
    : (payload.queue || []).filter(
        (x: any) => x.isBonus || Number(x.betEur) > 0,
      );
  return {
    phase,
    opened: phase === "open",
    start: payload.startEur ?? payload.hunt?.start ?? null,
    archive_id: payload.hunt?.archive_id ?? null,
    items: source.map((it: any) => ({
      id: String(it.id),
      name: it.slotName ?? it.name,
      provider: it.provider ?? null,
      image_url: it.imageUrl ?? it.image_url ?? null,
      bet: it.betEur ?? it.bet ?? null,
      pay: it.payEur ?? it.pay ?? null,
      caller: it.username ?? null,
    })),
  };
}

export function huntError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "conflict")
    return "Cette valeur a été modifiée depuis un autre écran. Vérifie la nouvelle valeur avant de réessayer.";
  if (message === "unauthorized" || message === "forbidden")
    return "Ta session ne permet plus de modifier ce hunt. Reconnecte-toi.";
  if (message === "bet_required" || message === "bad_bet")
    return "Renseigne une mise supérieure à zéro pour chaque machine.";
  if (message === "slot_already_in_queue")
    return "Cette machine est déjà dans les calls ou le hunt.";
  return "Impossible de confirmer l'enregistrement. Tes saisies sont conservées : vérifie la connexion et réessaie.";
}

export function createHuntClient(token: string, slug: string | null) {
  const base = String(
    import.meta.env.VITE_API_BASE || "https://lunalive-api.onrender.com",
  ).replace(/\/+$/, "");
  const prefix = slug
    ? `/calls/${encodeURIComponent(slug)}/hunt`
    : "/api/hunt2";
  async function json(
    path: string,
    body?: unknown,
    method = "POST",
    signal?: AbortSignal,
  ) {
    const response = await fetch(base + path, {
      method: body === undefined && method === "POST" ? "GET" : method,
      signal: signal ?? AbortSignal.timeout(12000),
      cache: "no-cache",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok)
      throw new Error(
        response.status === 409 ? "conflict" : data?.error || "request_failed",
      );
    return data;
  }
  return {
    async state(signal?: AbortSignal): Promise<HuntState> {
      const data = await json(prefix + "/state", undefined, "GET", signal);
      return slug ? mapCallsHunt(data) : data.state;
    },
    start: (value: number, expected: number | null) =>
      json(prefix + (slug ? "/start" : "/set-start"), {
        start: value,
        startEur: value,
        expected,
      }),
    add: (name: string) => json(prefix + "/add", { name }),
    bet: (id: string, value: number, expected: number | null) =>
      json(
        prefix + (slug ? `/bonus/${encodeURIComponent(id)}` : "/set-bet"),
        { id, bet: value, betEur: value, expected },
        slug ? "PATCH" : "POST",
      ),
    pay: (id: string, value: number, expected: number | null) =>
      json(prefix + (slug ? "/pay" : "/set-pay"), {
        id,
        pay: value,
        payEur: value,
        expected,
      }),
    remove: (id: string) =>
      json(
        prefix + (slug ? `/bonus/${encodeURIComponent(id)}` : "/remove"),
        { id },
        slug ? "DELETE" : "POST",
      ),
    open: () => json(prefix + "/open", { opening: true }),
    revert: () => json(prefix + "/revert", {}),
    close: () => json(prefix + "/close", {}),
    reset: () => json(prefix + (slug ? "/reset" : "/new"), {}),
    save: (title?: string) => json(prefix + "/save", { title }),
    async archives() {
      return (await json("/api/hunt2/my-hunts")).items;
    },
  };
}
