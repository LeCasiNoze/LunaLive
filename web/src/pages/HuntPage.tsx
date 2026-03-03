// web/src/pages/HuntPage.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET DESKTOP — HuntPage
//  Design : Glass morphism, gradient accents, smooth animations
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  huntAdd,
  huntClose,
  huntDelete,
  huntDeleteAll,
  huntGetState,
  huntLoad,
  huntMyHunts,
  huntNew,
  huntOpen,
  huntRemove,
  huntRevert,
  huntSave,
  huntSetBet,
  huntSetPay,
  huntSetStart,
  huntSuggest,
} from "../lib/hunt_api";
import type { HuntState, SuggestItem, SavedHunt } from "../lib/hunt_types";

/* ─── Helpers ────────────────────────────────────────────────────────── */
const fmtEur = (n: number) => `${(Number(n) || 0).toFixed(2)}€`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function canUseCallsHunt(token: any, streamerSlug: any) {
  return !!token && !!streamerSlug;
}

async function callsHuntGetState(slug: string, token: string) {
  const payload = await callsHuntJson(slug, token, "state");
  return { ok: true, state: mapCallsHuntToHuntState(payload), raw: payload };
}

async function callsHuntSetStart(slug: string, token: string, startEur: number) {
  return callsHuntJson(slug, token, "start", { startEur, start: startEur });
}

async function callsHuntAddItem(slug: string, token: string, name: string) {
  return callsHuntJson(slug, token, "add", { name });
}

async function callsHuntRemoveItem(slug: string, token: string, id: string) {
  return callsHuntJson(slug, token, "remove", { id });
}

async function callsHuntSetBet(slug: string, token: string, id: string, betEur: number) {
  return callsHuntJson(slug, token, "bet", { id, betEur, bet: betEur });
}

async function callsHuntSetPay(slug: string, token: string, _id: string, payEur: number) {
  return callsHuntJson(slug, token, "pay", { payEur, pay: payEur });
}

async function callsHuntOpen(slug: string, token: string) {
  return callsHuntJson(slug, token, "open", {});
}

async function callsHuntClose(slug: string, token: string) {
  return callsHuntJson(slug, token, "close", {});
}

async function callsHuntRevert(slug: string, token: string) {
  return callsHuntJson(slug, token, "revert", {});
}

async function callsHuntNew(slug: string, token: string) {
  return callsHuntJson(slug, token, "reset", {});
}

async function callsHuntLoad(slug: string, token: string, _huntId: number) {
  return callsHuntJson(slug, token, "reset", {});
}

async function callsHuntJson(slug: string, token: string, path: string, body?: any) {
  const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/hunt/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || j?.message || `API ${r.status}`);
  return j;
}

function mapCallsHuntToHuntState(payload: any): HuntState {
  const phase = (payload?.opening || payload?.mode === "open") ? "open" : "edit";
  const start = payload?.startEur ?? payload?.hunt?.start ?? null;

  const rawBonus =
    (Array.isArray(payload?.bonusDrops) && payload.bonusDrops) ||
    (Array.isArray(payload?.queue) ? payload.queue.filter((x: any) => (Number(x?.betEur) || 0) > 0) : []) ||
    [];

  const items = rawBonus.map((it: any) => ({
    id: String(it?.id ?? ""),
    name: String(it?.slotName ?? it?.name ?? ""),
    provider: it?.provider ?? null,
    image_url: it?.imageUrl ?? it?.image_url ?? null,
    pos: Number.isFinite(Number(it?.pos)) ? Number(it.pos) : null,
    bet: (it?.betEur ?? it?.bet ?? null),
    pay: (it?.payEur ?? it?.pay ?? null),
    caller: it?.username ?? it?.caller ?? null,
  }));

  return {
    phase,
    opened: phase === "open",
    start: start == null ? null : Number(start),
    items,
  } as any;
}

function apiBase() {
  const envBase = (import.meta as any).env?.VITE_API_BASE;
  const base = envBase ? String(envBase) : "https://lunalive-api.onrender.com";
  return base.replace(/\/+$/, "");
}

function pickImageUrl(x: any): string | null {
  const u = x?.image_url ?? x?.imageUrl ?? x?.imageURL ?? x?.thumb_url ?? x?.thumbUrl ?? null;
  const s = String(u || "").trim();
  return s ? s : null;
}

function pickProvider(x: any): string | null {
  const p = x?.provider ?? x?.provider_name ?? x?.providerName ?? null;
  const s = String(p || "").trim();
  return s ? s : null;
}

type CallQueueItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl?: string | null;
};

function pickStreamerSlugFromUser(u: any): string | null {
  const cands = [u?.streamer?.slug, u?.streamerSlug, u?.streamer_slug, u?.slug];
  for (const x of cands) {
    const s = String(x || "").trim();
    if (s) return s;
  }
  return null;
}

function pickHuntSyncEnabled(cfg: any): boolean {
  const v =
    cfg?.huntSync ??
    cfg?.hunt_sync ??
    cfg?.huntSyncEnabled ??
    cfg?.hunt_sync_enabled ??
    cfg?.syncHunt ??
    cfg?.sync_hunt ??
    false;
  return !!v;
}

function isProfitable(h: SavedHunt) {
  const start = Number((h as any).start) || 0;
  const pay = Number((h as any).total_pay) || 0;
  if (start <= 0) return null;
  return pay >= start;
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pill">
      <span>{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

function createdLabel(h: any) {
  const v = h?.created_at ?? h?.createdAt ?? null;
  if (!v) return "—";
  const t = new Date(String(v));
  if (!Number.isFinite(t.getTime())) return "—";
  return t.toLocaleString();
}

function SlotThumb({ url, size = 42 }: { url?: string | null; size?: number }) {
  const [broken, setBroken] = React.useState(false);

  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 12,
    flex: "0 0 auto",
    border: "1px solid rgba(124,92,252,0.18)",
    background: "rgba(124,92,252,0.06)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  };

  if (!url || broken) {
    return (
      <div style={boxStyle} aria-hidden="true" title="🎰">
        <span style={{ fontSize: 16, opacity: 0.9 }}>🎰</span>
      </div>
    );
  }

  return (
    <div style={boxStyle} aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

function GlassCard({ children, style, className }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={{
      position: "relative", borderRadius: 20,
      border: "1px solid rgba(124,92,252,0.14)",
      background: "rgba(13,11,24,0.82)",
      boxShadow: "0 18px 55px rgba(0,0,0,0.38)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      overflow: "hidden", ...style,
    }}>
      <div aria-hidden style={{
        position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
        background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35) 40%, rgba(91,142,248,0.25) 60%, transparent)",
        pointerEvents: "none", zIndex: 2,
      }} />
      {children}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function HuntPage() {
  const { user, token } = useAuth() as any;

  const streamerSlug = React.useMemo(() => pickStreamerSlugFromUser(user), [user]);
  const [huntSyncEnabled, setHuntSyncEnabled] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [debugOn, setDebugOn] = React.useState(false);
  const [debugStateRaw, setDebugStateRaw] = React.useState<any>(null);
  const [debugLastPay, setDebugLastPay] = React.useState<any>(null);
  const [debugLastAction, setDebugLastAction] = React.useState<string>("");

  const [state, setState] = React.useState<HuntState>(
    {
      phase: "edit",
      opened: false,
      items: [],
      start: null,
    } as any
  );

  const phase = (state?.phase || ((state as any)?.opened ? "open" : "edit")) as HuntState["phase"];
  const items = (state?.items || []) as any[];

  const itemsRef = React.useRef<any[]>([]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const busyRef = React.useRef(false);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const syncInFlightRef = React.useRef(false);
  const processedCallIdRef = React.useRef<Record<string, true>>({});
  const editingStartRef = React.useRef(false);

  const itemsEdit = React.useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : [];
    return arr.reverse();
  }, [items]);

  const [myHunts, setMyHunts] = React.useState<SavedHunt[]>([]);
  const [startInput, setStartInput] = React.useState<string>("");

  const [q, setQ] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<SuggestItem[]>([]);
  const [suggLoading, setSuggLoading] = React.useState(false);
  const [suggError, setSuggError] = React.useState<string | null>(null);
  const [showSugg, setShowSugg] = React.useState(false);
  const [sel, setSel] = React.useState(0);

  const [slotMetaByName, setSlotMetaByName] = React.useState<
    Record<string, { imageUrl: string | null; provider: string | null }>
  >({});

  function keyName(n: any) {
    return String(n || "").trim().toLowerCase();
  }

  function pickItemImage(x: any): string | null {
    return pickImageUrl(x) ?? slotMetaByName[keyName(x?.name)]?.imageUrl ?? null;
  }

  function pickItemProvider(x: any): string | null {
    return pickProvider(x) ?? slotMetaByName[keyName(x?.name)]?.provider ?? null;
  }

  const suggReqRef = React.useRef(0);
  const betRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingFocusId, setPendingFocusId] = React.useState<string | null>(null);

  const [deckIndex, setDeckIndex] = React.useState(0);
  const [draftPay, setDraftPay] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});

  const startValue = Number((state as any)?.start) || 0;

  const totalBetAll = React.useMemo(() => items.reduce((s: number, it: any) => s + (Number(it.bet) || 0), 0), [items]);
  const totalPayAll = React.useMemo(() => items.reduce((s: number, it: any) => s + (Number(it.pay) || 0), 0), [items]);
  const profit = React.useMemo(() => totalPayAll - startValue, [totalPayAll, startValue]);
  const globalMulti = React.useMemo(() => (totalBetAll > 0 ? totalPayAll / totalBetAll : 0), [totalBetAll, totalPayAll]);

  const remainingBet = React.useMemo(
    () =>
      items
        .filter((it: any) => it.pay === null || typeof it.pay === "undefined")
        .reduce((s: number, it: any) => s + (Number(it.bet) || 0), 0),
    [items]
  );

  const remainingToRecoup = React.useMemo(() => {
    const left = startValue - totalPayAll;
    return left > 0 ? left : 0;
  }, [startValue, totalPayAll]);

  const beBase = React.useMemo(() => {
    if (startValue <= 0 || totalBetAll <= 0) return 0;
    return startValue / totalBetAll;
  }, [startValue, totalBetAll]);

  const beLive = React.useMemo(() => {
    if (remainingToRecoup <= 0) return 0;
    if (remainingBet <= 0) return 0;
    return remainingToRecoup / remainingBet;
  }, [remainingToRecoup, remainingBet]);

  const canOpen = React.useMemo(() => {
    const useCalls = canUseCallsHunt(token, streamerSlug);
    if (useCalls) return startValue > 0 && items.length > 0;
    return phase === "edit" && startValue > 0 && items.length > 0 && items.every((it: any) => Number(it.bet) > 0);
  }, [phase, startValue, items, token, streamerSlug]);

  React.useEffect(() => {
    if (items?.length) setDeckIndex((i) => Math.max(0, Math.min(i, items.length - 1)));
    else setDeckIndex(0);
  }, [items.length]);

  const metaInFlight = React.useRef<Record<string, boolean>>({});

  async function ensureMetaForName(name: string) {
    const k = keyName(name);
    if (!k) return;

    const already = slotMetaByName[k];
    if (already?.imageUrl || already?.provider) return;

    if (metaInFlight.current[k]) return;
    metaInFlight.current[k] = true;

    try {
      const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(name)}&limit=8`);
      const j = await r.json().catch(() => null);
      if (!j?.ok || !Array.isArray(j.items) || !j.items.length) return;

      const want = k;
      const best = j.items.find((x: any) => keyName(x?.name) === want) ?? j.items[0];

      const img = pickImageUrl(best) ?? (best?.imageUrl ? String(best.imageUrl) : null);
      const prov = pickProvider(best);

      if (img || prov) {
        setSlotMetaByName((prev) => {
          const cur = prev[k];
          const next = {
            imageUrl: cur?.imageUrl ?? (img || null),
            provider: cur?.provider ?? (prov || null),
          };
          return { ...prev, [k]: next };
        });
      }
    } catch {
    } finally {
      metaInFlight.current[k] = false;
    }
  }

  function hydrateMetaForItems(list: any[]) {
    setSlotMetaByName((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const it of list || []) {
        const k = keyName(it?.name);
        if (!k) continue;

        const img = pickImageUrl(it);
        const prov = pickProvider(it);

        if (!next[k]) {
          if (img || prov) {
            next[k] = { imageUrl: img ?? null, provider: prov ?? null };
            changed = true;
          }
        } else {
          const cur = next[k];
          const ni = cur.imageUrl || !img ? cur.imageUrl : img;
          const np = cur.provider || !prov ? cur.provider : prov;
          if (ni !== cur.imageUrl || np !== cur.provider) {
            next[k] = { imageUrl: ni ?? null, provider: np ?? null };
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });

    for (const it of list || []) {
      const name = String(it?.name || "").trim();
      if (!name) continue;
      const k = keyName(name);
      if (!k) continue;

      const known = slotMetaByName[k];
      const hasInline = !!pickImageUrl(it) || !!pickProvider(it);
      if (hasInline) continue;
      if (known?.imageUrl || known?.provider) continue;

      ensureMetaForName(name).catch(() => {});
    }
  }

  React.useEffect(() => {
    if (!items?.length) return;
    hydrateMetaForItems(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function refreshState(opts?: { preserveStartInput?: boolean }) {
    const useCalls = canUseCallsHunt(token, streamerSlug);

    const s = useCalls
      ? await callsHuntGetState(String(streamerSlug), String(token))
      : await huntGetState();

    if (useCalls) {
      setDebugStateRaw((s as any)?.raw ?? null);
    }

    if (s?.ok && (s as any).state) {
      const nextState = (s as any).state as any;
      setState(nextState);

      if (!opts?.preserveStartInput && !editingStartRef.current) {
        setStartInput(nextState?.start != null ? String(nextState.start) : "");
      }

      try {
        const list = Array.isArray(nextState?.items) ? nextState.items : [];
        if (list.length) hydrateMetaForItems(list);
      } catch {}
    }
  }

  async function refreshAll() {
    await refreshState();
    const h = await huntMyHunts().catch(() => null);
    if (h?.ok) setMyHunts(h.items || []);
  }

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refreshAll();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!token || !streamerSlug) return;

    const slug = streamerSlug;
    let alive = true;

    async function loadCfg() {
      try {
        const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => null);
        if (!alive) return;

        const cfg = j?.config ?? j;
        setHuntSyncEnabled(pickHuntSyncEnabled(cfg));
      } catch {
      }
    }

    void loadCfg();
    const t = window.setInterval(() => void loadCfg(), 15000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [token, streamerSlug]);

  const syncActive = huntSyncEnabled && startValue > 0 && (phase === "edit" || phase === "open");

  React.useEffect(() => {
    if (!token || !streamerSlug || !syncActive) return;

    const slug = streamerSlug;
    let stop = false;

    async function tick() {
      if (stop) return;
      if (busyRef.current) return;
      if (syncInFlightRef.current) return;

      syncInFlightRef.current = true;
      try {
        const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/list?limit=80`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => null);
        if (!j?.ok || !Array.isArray(j.items)) return;

        const queue = j.items as CallQueueItem[];

        const currentItems = itemsRef.current || [];
        const existingNames = new Set(currentItems.map((it: any) => String(it?.name || "").trim().toLowerCase()));

        const toAdd: CallQueueItem[] = [];
        for (const c of queue) {
          const callId = String(c?.id || "").trim();
          if (!callId) continue;

          if (processedCallIdRef.current[callId]) continue;

          const nm = String(c?.slotName || "").trim();
          const k = nm.toLowerCase();

          if (!k || existingNames.has(k)) {
            processedCallIdRef.current[callId] = true;
            continue;
          }

          toAdd.push(c);
          if (toAdd.length >= 5) break;
        }

        if (!toAdd.length) return;

        for (const c of toAdd) {
          const callId = String(c.id || "").trim();
          const nm = String(c.slotName || "").trim();
          const k = nm.toLowerCase();

          setSlotMetaByName((prev) => ({
            ...prev,
            [k]: {
              imageUrl: (c.imageUrl ?? prev[k]?.imageUrl ?? null) as any,
              provider: c.provider ?? prev[k]?.provider ?? null,
            },
          }));

          processedCallIdRef.current[callId] = true;
          const useCalls = canUseCallsHunt(token, streamerSlug);
          if (useCalls) await callsHuntAddItem(String(streamerSlug), String(token), nm);
          else await huntAdd(nm);
        }

        await refreshState();
      } catch {
      } finally {
        syncInFlightRef.current = false;
      }
    }

    void tick();
    const t = window.setInterval(() => void tick(), 2500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [token, streamerSlug, syncActive]);

  React.useEffect(() => {
    if (!token) return;

    const shouldPoll = phase === "open" || syncActive;
    if (!shouldPoll) return;

    let stop = false;

    async function tick() {
      if (stop) return;
      if (busyRef.current) return;
      if (syncInFlightRef.current) return;
      await refreshState({ preserveStartInput: true }).catch(() => {});
    }

    void tick();

    const ms = phase === "open" ? 1000 : 2500;
    const t = window.setInterval(() => void tick(), ms);

    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [token, phase, syncActive]);

  async function fetchSuggestions(text: string) {
    const s = String(text || "").trim();
    const reqId = ++suggReqRef.current;

    if (s.length < 2) {
      setSuggestions([]);
      setSuggError(null);
      setSuggLoading(false);
      return;
    }

    setSuggLoading(true);
    setSuggError(null);

    try {
      let raw: any[] = [];
      try {
        const r = await huntSuggest(s, 12);
        raw = Array.isArray((r as any)?.items) ? (r as any).items : [];
      } catch (e: any) {
        raw = [];
        setSuggError(String(e?.message || "hunt_suggest_failed"));
      }

      if (!raw.length) {
        try {
          const r2 = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=12`);
          const j2 = await r2.json().catch(() => null);
          if (j2?.ok && Array.isArray(j2.items)) {
            raw = j2.items.map((x: any) => ({
              name: String(x?.name || ""),
              provider: x?.provider ?? null,
              image_url: x?.imageUrl ?? null,
              score: 0,
            }));
            setSuggError(null);
          }
        } catch (e: any) {
          setSuggError((prev) => prev ?? String(e?.message || "slots_search_failed"));
        }
      }

      if (reqId !== suggReqRef.current) return;

      const already = new Set(items.map((it: any) => String(it.name || "").trim().toLowerCase()));
      const seen = new Set<string>();

      const filtered = raw.filter((x: any) => {
        const key = String(x?.name || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return !already.has(key);
      });

      setSlotMetaByName((prev) => {
        const next = { ...prev };
        for (const x of filtered) {
          const k = keyName((x as any)?.name);
          if (!k) continue;
          const img = pickImageUrl(x);
          const prov = pickProvider(x);
          if (!next[k]) next[k] = { imageUrl: img ?? null, provider: prov ?? null };
          else {
            if (!next[k].imageUrl && img) next[k].imageUrl = img;
            if (!next[k].provider && prov) next[k].provider = prov;
          }
        }
        return next;
      });

      setSuggestions(filtered);
      setSel(0);
    } finally {
      if (reqId === suggReqRef.current) setSuggLoading(false);
    }
  }

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      fetchSuggestions(q).catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, items]);

  React.useEffect(() => {
    if (!pendingFocusId) return;
    const el = betRefs.current[pendingFocusId];
    if (el) {
      el.focus();
      try {
        (el as any).select?.();
      } catch {}
      setPendingFocusId(null);
    }
  }, [pendingFocusId, itemsEdit]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "open") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDeckIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setDeckIndex((i) => Math.min((items?.length || 1) - 1, i + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, items]);

  React.useEffect(() => {
    if (phase !== "open") return;
    if (!items?.length) return;

    const cur = items[deckIndex];
    const curPaid = cur && cur.pay !== null && typeof cur.pay !== "undefined";
    if (!cur || curPaid) {
      const firstUnpaid = items.findIndex((it: any) => it && (it.pay === null || typeof it.pay === "undefined"));
      if (firstUnpaid >= 0) setDeckIndex(firstUnpaid);
      else setDeckIndex(Math.min(deckIndex, items.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, items, items.length]);

  if (!user) {
    return (
      <main className="page huntPage">
        <div className="huntLayout" style={{ gridTemplateColumns: "1fr" }}>
          <section className="huntPanel">
            <div className="huntPanelInner">
              <h1 className="huntTitle">Hunt</h1>
              <div className="huntSubtitle">Connecte-toi pour créer et gérer ton hunt.</div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  async function saveStart() {
    const v = Number(startInput);
    if (!(v > 0)) return;

    const useCalls = canUseCallsHunt(token, streamerSlug);

    setBusy(true);
    try {
      if (useCalls) await callsHuntSetStart(String(streamerSlug), String(token), Number(v.toFixed(2)));
      else await huntSetStart(v);

      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function addItemFromSelection(item: SuggestItem | null) {
    if (!(startValue > 0)) {
      alert("Définis d'abord le Start du hunt.");
      return;
    }
    const nm = (item?.name || q || "").trim();
    if (!nm) return;

    if (item?.name) {
      const k = keyName(item.name);
      const img = pickImageUrl(item);
      const prov = pickProvider(item);
      setSlotMetaByName((prev) => ({
        ...prev,
        [k]: {
          imageUrl: img ?? prev[k]?.imageUrl ?? null,
          provider: prov ?? prev[k]?.provider ?? null,
        },
      }));
    }

    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);

      const j = useCalls
        ? await callsHuntAddItem(String(streamerSlug), String(token), nm)
        : await huntAdd(nm);

      setQ("");
      setSuggestions([]);
      setSuggError(null);
      setSuggLoading(false);
      setShowSugg(false);
      setSel(0);

      if (j?.ok && (j as any).id) setPendingFocusId(String((j as any).id));

      await refreshState();

    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);
      if (useCalls) await callsHuntRemoveItem(String(streamerSlug), String(token), String(id));
      else await huntRemove(id);

      await refreshState();

    } finally {
      setBusy(false);
    }
  }

  async function setBet(id: string, bet: number) {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);
      const b = Math.max(0, Number((Number(bet) || 0).toFixed(2)));

      if (useCalls) await callsHuntSetBet(String(streamerSlug), String(token), String(id), b);
      else await huntSetBet(id, b);

      await refreshState();

    } finally {
      setBusy(false);
    }
  }

  async function setPay(id: string, pay: number) {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);
      const p = Math.max(0, Number((Number(pay) || 0).toFixed(2)));

      setDebugLastAction(`pay(${p})`);

      if (useCalls) {
        const resp = await callsHuntSetPay(String(streamerSlug), String(token), String(id), p);
        setDebugLastPay(resp);
      } else {
        const resp = await huntSetPay(id, p);
        setDebugLastPay(resp);
      }

      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doOpen() {
    if (!canOpen) return;
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);

      if (useCalls) await callsHuntOpen(String(streamerSlug), String(token));
      else await huntOpen();

      await refreshState();

    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);

      if (useCalls) await callsHuntClose(String(streamerSlug), String(token));
      else await huntClose();

      await refreshAll();

    } finally {
      setBusy(false);
    }
  }

  async function doRevert() {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);

      if (useCalls) await callsHuntRevert(String(streamerSlug), String(token));
      else await huntRevert();

      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doNew() {
    setBusy(true);
    try {

      const useCalls = canUseCallsHunt(token, streamerSlug);

      if (useCalls) await callsHuntNew(String(streamerSlug), String(token));
      else await huntNew();

      setDraftPay({});
      setConfirmed({});
      processedCallIdRef.current = {};

      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function doLoad(id: number) {
    setBusy(true);
    try {
      const useCalls = canUseCallsHunt(token, streamerSlug);

      if (useCalls) await callsHuntLoad(String(streamerSlug), String(token), id);
      else await huntLoad(id);

      setDraftPay({});
      setConfirmed({});
      processedCallIdRef.current = {};

      await refreshState();

    } finally {
      setBusy(false);
    }
  }

  async function doSaveCopy() {
    const title = prompt("Titre (optionnel) :", "") || undefined;
    setBusy(true);
    try {
      await huntSave(title);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSaved(id: number) {
    setBusy(true);
    try {
      await huntDelete(id);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllSaved() {
    const ok = confirm("Supprimer TOUTES tes sauvegardes ?");
    if (!ok) return;
    setBusy(true);
    try {
      await huntDeleteAll();
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  const progressPct = startValue > 0 ? clamp01(totalPayAll / startValue) * 100 : 0;

  const current = phase === "open" ? items[deckIndex] : null;
  const currentId = current ? String(current.id) : null;
  const currentKey = currentId || "";
  const isConfirmed = currentId ? !!confirmed[currentKey] : false;

  const currentImg = current ? pickItemImage(current) : null;
  const currentProv = current ? pickItemProvider(current) : null;

  async function validateCurrentPay() {
    if (!currentId) return;
    const raw = String(draftPay[currentKey] ?? "").trim();
    if (!raw) return;
    const v = Math.max(0, Number((Number(raw) || 0).toFixed(2)));

    await setPay(currentId, v);
    setConfirmed((p) => ({ ...p, [currentKey]: true }));

    const nextUnpaid = items.findIndex((it: any, idx: number) => {
      if (idx <= deckIndex) return false;
      return it && (it.pay === null || typeof it.pay === "undefined");
    });
    if (nextUnpaid >= 0) setDeckIndex(nextUnpaid);
    else if (deckIndex < items.length - 1) setDeckIndex((x) => Math.min(items.length - 1, x + 1));

  }

  function goNext() {
    setDeckIndex((x) => Math.min(items.length - 1, x + 1));
  }

  const primaryDeckLabel =
    phase === "open" && current
      ? isConfirmed
        ? deckIndex >= items.length - 1
          ? "Terminer"
          : "Next"
        : "Valider"
      : "Valider";

  return (
    <main className="page huntPage">
      <div className="huntLayout">
        <aside className="huntPanel">
          <div className="huntPanelInner">
            <div className="huntSidebarHeader">
              <div className="huntSidebarTitle">Mes Hunts</div>
              <div className="huntRow">
                <button className="btn" onClick={refreshAll} disabled={busy} title="Rafraîchir">
                  ↻
                </button>
                <button className="btn btnDanger" onClick={deleteAllSaved} disabled={busy} title="Tout supprimer">
                  ✕
                </button>
              </div>
            </div>

            {!myHunts.length ? (
              <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                Aucun hunt sauvegardé pour l'instant.
              </div>
            ) : (
              <div className="huntList">
                {myHunts.map((h) => {
                  const prof = isProfitable(h);
                  const tone =
                    prof === true
                      ? "border:1px solid rgba(16,185,129,0.35)"
                      : prof === false
                      ? "border:1px solid rgba(244,63,94,0.35)"
                      : "";
                  return (
                    <div key={h.id} className="huntListItem" style={tone ? ({ border: tone as any } as any) : undefined}>
                      <div className="huntListTop">
                        <div className="huntListTitle">
                          <button
                            onClick={async () => {
                              await doLoad(h.id);
                            }}
                            disabled={busy}
                          >
                            {h.title ? h.title : `Hunt #${h.id}`}
                          </button>
                        </div>
                        <button className="btn btnDanger" onClick={() => deleteSaved(h.id)} disabled={busy} title="Supprimer">
                          ✕
                        </button>
                      </div>

                      <div className="huntListMeta">
                        {createdLabel(h)} • {(h as any).items_count ?? 0} items
                        <br />
                        start {fmtEur(Number((h as any).start || 0))} • total pay {fmtEur(Number((h as any).total_pay || 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                Commencer un nouveau Hunt
              </button>
            </div>
          </div>
        </aside>

        <section style={{ display: "grid", gap: 14 }}>
          <GlassCard>
            <div className="huntPanelInner">
              <h1 className="huntTitle" style={{
                background: "linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 0 14px rgba(124,92,252,0.55))",
              }}>
                Hunt
              </h1>
              <div className="huntSubtitle">Gère ton hunt avec sync automatique et statistiques en temps réel.</div>

              <div className="huntRow" style={{ marginTop: 12 }}>
                <div className="huntRow" style={{ gap: 8 }}>
                  <span className="huntSmallMuted">Start</span>
                  <input
                    type="number"
                    step="0.01"
                    value={startInput}
                    onFocus={() => (editingStartRef.current = true)}
                    onBlur={() => (editingStartRef.current = false)}
                    onChange={(e) => setStartInput(e.target.value)}
                    placeholder="ex: 100"
                    style={{ width: 160 }}
                    disabled={busy}
                  />
                  <button className="btn btnPrimary" onClick={saveStart} disabled={busy || !(Number(startInput) > 0)}>
                    Valider Start
                  </button>
                </div>

                <div style={{ marginLeft: "auto" }} className="huntRow">
                  {phase === "edit" && (
                    <button className="btn btnPrimary" onClick={doOpen} disabled={busy || !canOpen}>
                      Ouvrir le hunt
                    </button>
                  )}

                  {phase === "open" && (
                    <>
                      <button className="btn" onClick={doRevert} disabled={busy}>
                        Revenir en édition
                      </button>
                      <button className="btn btnPrimary" onClick={doClose} disabled={busy}>
                        Terminer le hunt
                      </button>
                    </>
                  )}

                  {phase === "closed" && (
                    <>
                      <button className="btn" onClick={doRevert} disabled={busy}>
                        Revenir en édition
                      </button>
                      <button className="btn" onClick={doSaveCopy} disabled={busy}>
                        Sauvegarder (copie)
                      </button>
                      <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                        Nouveau Hunt
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="huntPills">
                <StatPill label="Phase" value={String(phase)} />
                <StatPill label="Items" value={String(items.length)} />
                <StatPill label="Total bet" value={fmtEur(totalBetAll)} />
                <StatPill label="Total pay" value={fmtEur(totalPayAll)} />
                <StatPill label="Profit" value={fmtEur(profit)} />
                <StatPill label="Multi" value={`x${globalMulti.toFixed(2)}`} />
                <StatPill label="BE base" value={`x${beBase.toFixed(2)}`} />
                <StatPill label="BE reste" value={`x${beLive.toFixed(2)}`} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <span className="huntSmallMuted">Récupéré</span>
                  <span className="huntSmallMuted">
                    {fmtEur(totalPayAll)} / {fmtEur(startValue)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid rgba(124,92,252,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPct}%`,
                      background: progressPct >= 100
                        ? "linear-gradient(90deg, rgba(16,185,129,0.70), rgba(52,211,153,0.70))"
                        : "linear-gradient(90deg, rgba(124,92,252,0.70), rgba(91,142,248,0.70))",
                      transition: "width 200ms ease",
                    }}
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          {phase === "edit" && (
            <>
              <GlassCard>
                <div className="huntPanelInner">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Ajouter une machine</div>

                  <div className="huntRow">
                    <input
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        if (!showSugg) setShowSugg(true);
                      }}
                      placeholder="Tape un nom de machine…"
                      style={{ width: 460, maxWidth: "100%" }}
                      disabled={busy}
                      onFocus={() => setShowSugg(true)}
                      onBlur={() => setTimeout(() => setShowSugg(false), 160)}
                      onKeyDown={(e) => {
                        const visible = showSugg && q.trim().length >= 2;
                        if (!visible) {
                          if (e.key === "Enter") addItemFromSelection(null);
                          return;
                        }

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (suggestions.length) setSel((i) => Math.min(suggestions.length - 1, i + 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (suggestions.length) setSel((i) => Math.max(0, i - 1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (suggestions.length) addItemFromSelection(suggestions[sel] || null);
                          else addItemFromSelection(null);
                        } else if (e.key === "Escape") {
                          setShowSugg(false);
                        }
                      }}
                    />

                    <button className="btn btnPrimary" disabled={busy || !q.trim()} onClick={() => addItemFromSelection(null)}>
                      Ajouter
                    </button>
                  </div>

                  {showSugg && q.trim().length >= 2 ? (
                    <div style={{ marginTop: 10 }}>
                      {suggLoading ? <div className="huntSmallMuted">Suggestions…</div> : null}

                      {suggestions.length ? (
                        <div className="suggGrid">
                          {suggestions.map((s, i) => {
                            const img = pickImageUrl(s);
                            const prov = pickProvider(s);
                            return (
                              <button
                                key={`${s.name}-${prov || ""}-${i}`}
                                className="suggItem"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => addItemFromSelection(s)}
                                disabled={busy}
                                style={i === sel ? ({ outline: "2px solid rgba(167,139,250,0.55)", outlineOffset: 2 } as any) : undefined}
                              >
                                <div className="suggRow">
                                  <SlotThumb url={img} size={42} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="suggName">{s.name}</div>
                                    <div className="suggSub">{prov ? prov : "—"}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : !suggLoading ? (
                        <div className="huntSmallMuted">{suggError ? `Aucune suggestion. (${suggError})` : "Aucune suggestion."}</div>
                      ) : null}
                    </div>
                  ) : null}

                  {startValue <= 0 ? (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      ⚠️ Tu peux chercher des machines, mais pour <b>ajouter</b> il faut définir un <b>Start</b>.
                    </div>
                  ) : null}
                </div>
              </GlassCard>

              <GlassCard>
                <div className="huntPanelInner">
                  <div className="huntRow" style={{ justifyContent: "space-between" }}>
                    <div className="huntSmallMuted">
                      {items.length} machine{items.length > 1 ? "s" : ""} • total bet <b>{fmtEur(totalBetAll)}</b>
                    </div>
                    <button className="btn btnPrimary" onClick={doOpen} disabled={busy || !canOpen}>
                      Ouvrir le hunt
                    </button>
                  </div>

                  {!items.length ? (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      Aucune machine pour l'instant.
                    </div>
                  ) : (
                    <div className="itemsGrid" style={{ marginTop: 10 }}>
                      {itemsEdit.map((it: any) => {
                        const img = pickItemImage(it);
                        const prov = pickItemProvider(it);
                        return (
                          <div key={it.id} className="itemRow">
                            <div className="itemImg">
                              <SlotThumb url={img} size={46} />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div className="itemName">{it.name}</div>
                              <div className="itemProvider">{prov ?? "—"}</div>
                            </div>

                            <input
                              ref={(el) => {
                                betRefs.current[String(it.id)] = el;
                              }}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="bet"
                              defaultValue={it.bet ?? ""}
                              disabled={busy}
                              onBlur={(e) => {
                                const v = Number(e.currentTarget.value || "0");
                                if (!Number.isFinite(v)) return;
                                setBet(String(it.id), Math.max(0, Number(v.toFixed(2))));
                              }}
                            />

                            <input type="number" placeholder="pay (lock)" disabled value={it.pay ?? ""} />

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <button className="btn btnDanger" disabled={busy} onClick={() => removeItem(String(it.id))}>
                                Supprimer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!canOpen && items.length > 0 && (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      ⚠️ Pour ouvrir : Start &gt; 0, au moins 1 machine, et chaque machine doit avoir une mise (bet) &gt; 0.
                    </div>
                  )}
                </div>
              </GlassCard>
            </>
          )}

          {phase === "open" && (
            <GlassCard>
              <div className="huntPanelInner">
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Ouverture des bonus</div>
                    <div className="huntSmallMuted">{items.length ? `${deckIndex + 1} / ${items.length}` : "—"}</div>
                  </div>
                  <div className="huntRow">
                    <button className="btn" onClick={doRevert} disabled={busy}>
                      Revenir en édition
                    </button>
                    <button className="btn btnPrimary" onClick={doClose} disabled={busy}>
                      Terminer le hunt
                    </button>
                  </div>
                </div>

                {!current ? (
                  <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                    Aucune machine.
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <div className="huntRow" style={{ justifyContent: "space-between" }}>
                      <button className="btn" onClick={() => setDeckIndex((i) => Math.max(0, i - 1))} disabled={busy || deckIndex === 0}>
                        ◀ Précédent
                      </button>
                      <button
                        className="btn"
                        onClick={() => setDeckIndex((i) => Math.min(items.length - 1, i + 1))}
                        disabled={busy || deckIndex >= items.length - 1}
                      >
                        Suivant ▶
                      </button>
                    </div>

                    <div
                      className="huntPanel"
                      style={{
                        borderRadius: 18,
                        overflow: "hidden",
                        border: "1px solid rgba(124,92,252,0.16)",
                        background: "rgba(124,92,252,0.06)",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 0 }}>
                        <div
                          style={{
                            height: 260,
                            minHeight: 260,
                            maxHeight: 260,
                            background: "rgba(0,0,0,0.25)",
                            overflow: "hidden",
                          }}
                        >
                          {currentImg ? (
                            <img
                              src={currentImg}
                              alt={current.name}
                              referrerPolicy="no-referrer"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <div style={{ height: "100%", display: "grid", placeItems: "center", opacity: 0.7 }}>—</div>
                          )}
                        </div>

                        <div style={{ padding: 14, display: "grid", gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.2 }}>{current.name}</div>
                            <div className="huntSmallMuted">{currentProv ?? "—"}</div>
                          </div>

                          <div className="huntPills" style={{ marginTop: 0 }}>
                            <StatPill label="Bet" value={fmtEur(Number(current.bet) || 0)} />
                            <StatPill label="Pay" value={fmtEur(Number(current.pay) || 0)} />
                            <StatPill
                              label="Multi"
                              value={`x${
                                Number(current.bet) > 0 ? ((Number(current.pay) || 0) / Number(current.bet)).toFixed(2) : "0.00"
                              }`}
                            />
                          </div>

                          <div style={{ display: "grid", gap: 6 }}>
                            <div className="huntSmallMuted">Entrer le gain</div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={draftPay[currentKey] ?? (current.pay != null ? String(current.pay) : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraftPay((p) => ({ ...p, [currentKey]: val }));
                                setConfirmed((p) => ({ ...p, [currentKey]: false }));
                              }}
                              disabled={busy}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  await validateCurrentPay();
                                }
                              }}
                            />
                          </div>

                          <div className="huntRow" style={{ justifyContent: "space-between", marginTop: 6 }}>
                            <button
                              className="btn btnPrimary"
                              disabled={busy || !currentId || (!isConfirmed && !String(draftPay[currentKey] ?? "").trim())}
                              onClick={async () => {
                                if (!currentId) return;

                                if (!isConfirmed) {
                                  await validateCurrentPay();
                                  return;
                                }

                                if (deckIndex >= items.length - 1) {
                                  await doClose();
                                  return;
                                }

                                goNext();
                              }}
                            >
                              {primaryDeckLabel}
                            </button>

                            <div className="huntSmallMuted" style={{ marginLeft: "auto" }}>
                              Astuce : flèches clavier ◀ ▶ pour naviguer.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {phase === "closed" && (
            <GlassCard>
              <div className="huntPanelInner">
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 900 }}>Hunt terminé</div>
                  <div className="huntRow">
                    <button className="btn" onClick={doRevert} disabled={busy}>
                      Revenir en édition
                    </button>
                    <button className="btn" onClick={doSaveCopy} disabled={busy}>
                      Sauvegarder (copie)
                    </button>
                    <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                      Nouveau Hunt
                    </button>
                  </div>
                </div>

                <div className="huntPills" style={{ marginTop: 12 }}>
                  <StatPill label="Start" value={fmtEur(startValue)} />
                  <StatPill label="Total pay" value={fmtEur(totalPayAll)} />
                  <StatPill label="Global multi" value={`x${globalMulti.toFixed(2)}`} />
                  <StatPill label="Profit" value={fmtEur(profit)} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="huntRow" style={{ justifyContent: "space-between" }}>
                    <span className="huntSmallMuted">Récupéré</span>
                    <span className="huntSmallMuted">
                      {fmtEur(totalPayAll)} / {fmtEur(startValue)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      height: 10,
                      borderRadius: 999,
                      border: "1px solid rgba(124,92,252,0.16)",
                      background: "rgba(0,0,0,0.25)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progressPct}%`,
                        background: progressPct >= 100
                          ? "linear-gradient(90deg, rgba(16,185,129,0.70), rgba(52,211,153,0.70))"
                          : "linear-gradient(90deg, rgba(124,92,252,0.70), rgba(91,142,248,0.70))",
                        transition: "width 200ms ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {loading ? <div className="huntSmallMuted">Chargement…</div> : null}
        </section>
      </div>

      <div
        style={{
          position: "fixed",
          right: 14,
          bottom: 14,
          zIndex: 9999,
          display: "grid",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        <button
          className="btn"
          onClick={() => setDebugOn((v) => !v)}
          title="Debug"
          style={{ width: 46, justifyContent: "center" }}
        >
          🐛
        </button>

        {debugOn ? (
          <div
            style={{
              width: 420,
              maxWidth: "92vw",
              maxHeight: "70vh",
              overflow: "auto",
              borderRadius: 14,
              border: "1px solid rgba(124,92,252,0.18)",
              background: "rgba(0,0,0,0.72)",
              padding: 12,
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Debug Hunt</div>

            <div className="huntSmallMuted" style={{ marginBottom: 10 }}>
              action: <b>{debugLastAction || "—"}</b>
            </div>

            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div className="huntSmallMuted">
                phase: <b>{String(phase)}</b> • opening(raw):{" "}
                <b>{String(debugStateRaw?.opening ?? debugStateRaw?.mode ?? "—")}</b>
              </div>
              <div className="huntSmallMuted">
                start: <b>{String(debugStateRaw?.startEur ?? state?.start ?? "—")}</b> • items: <b>{items.length}</b>
              </div>
              <div className="huntSmallMuted">
                deckIndex: <b>{deckIndex}</b> • currentId: <b>{currentId ?? "—"}</b>
              </div>

              <div className="huntSmallMuted">
                unpaidIds:{" "}
                <b>
                  {items
                    .filter((it: any) => it && (it.pay === null || typeof it.pay === "undefined"))
                    .map((it: any) => String(it.id))
                    .join(", ") || "—"}
                </b>
              </div>
            </div>

            <div style={{ fontWeight: 800, marginBottom: 6 }}>Last PAY response</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.25,
                margin: 0,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(124,92,252,0.14)",
                background: "rgba(124,92,252,0.06)",
              }}
            >
              {JSON.stringify(debugLastPay, null, 2)}
            </pre>

            <div style={{ fontWeight: 800, marginTop: 10, marginBottom: 6 }}>Raw state (/calls/.../hunt/state)</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.25,
                margin: 0,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(124,92,252,0.14)",
                background: "rgba(124,92,252,0.06)",
              }}
            >
              {JSON.stringify(debugStateRaw, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </main>
  );
}