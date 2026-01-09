// web/src/pages/dashboard/sections/bot/modules/HuntTabs.tsx
import * as React from "react";
import { Settings } from "lucide-react";
import {
  getCallsHuntState,
  callsHuntPass,
  callsHuntBonusDrop,
  callsHuntOpen,
  callsHuntPay,
  callsHuntSetStart,
  callsHuntSetBet,
  callsHuntReset,
  type ApiCallsHuntState,
  type ApiHuntBonusDrop,
} from "../../lib/api";

// ✅ On réutilise les mêmes helpers/API que CallsHuntModule (déjà branchés / déjà OK)
import {
  getCallsBans,
  banCalls,
  unbanCalls,
  getCallsProviderPolicy,
  setCallsProviderPolicy,
  allowCallsProviders,
  unallowCallsProviders,
  allowOnlyCallsProvider,
  type ApiCallBanRow,
} from "../../lib/api";

const fmtEur = (n: any) => `${(Number(n) || 0).toFixed(2)}€`;

const API_BASE = ((import.meta as any).env?.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type SlotItem = { name: string; provider: string | null; imageUrl?: string | null };

// ✅ Best-effort: sync aussi le start côté Hunt2 (tableau Hunt)
async function syncHunt2Start(token: string, startEur: number) {
  try {
    await fetch(`${API_BASE}/api/hunt2/set-start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start: startEur }),
    });
  } catch {
    // ignore
  }
}

function asArr<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function uniqStr(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    const k = String(s || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function normProvider(p: any) {
  return String(p ?? "").trim();
}

function getOpening(s: ApiCallsHuntState | null) {
  if (!s) return false;
  const phase = (s as any)?.hunt?.phase;
  return s.mode === "open" || (s as any).opening === true || phase === "open" || (s as any)?.hunt?.opened === true;
}

function getStartRaw(s: ApiCallsHuntState | null): number | null {
  if (!s) return null;
  const v = (s as any).startEur ?? (s as any)?.hunt?.start ?? null;
  if (v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickBonusDrops(s: ApiCallsHuntState | null): ApiHuntBonusDrop[] {
  if (!s) return [];
  const anyS: any = s;

  const explicit = asArr<ApiHuntBonusDrop>(anyS.bonusDrops);
  if (explicit.length) return explicit;

  const alt1 = asArr<ApiHuntBonusDrop>(anyS.bonus);
  if (alt1.length) return alt1;

  const alt2 = asArr<ApiHuntBonusDrop>(anyS.hunt?.bonusDrops ?? anyS.hunt?.bonus);
  if (alt2.length) return alt2;

  const list = asArr<any>(anyS.queue ?? anyS.items ?? anyS.calls ?? []);
  return list
    .filter((it) => Number(it?.betEur ?? it?.bet ?? 0) > 0)
    .map((it) => ({
      id: it.id,
      slotName: it.slotName ?? it.name,
      provider: it.provider ?? null,
      username: it.username ?? null,
      imageUrl: it.imageUrl ?? it.image_url ?? null,
      betEur: Number(it.betEur ?? it.bet ?? 0) || 0,
      payEur: it.payEur ?? it.pay ?? null,
    }));
}

function Panel({ title, right, children }: any) {
  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>{title}</span>
        {right ? <span>{right}</span> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function SmallBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="btnGhostInline"
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        fontWeight: 950,
        ...(props.style || {}),
      }}
    />
  );
}

function Thumb({ url }: { url?: string | null }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.12)",
        flex: "0 0 auto",
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div className="muted" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 900 }}>
          ?
        </div>
      )}
    </div>
  );
}

export function HuntTabs({
  token,
  streamerSlug,
  canModerate,
}: {
  token: string;
  streamerSlug: string;
  canModerate: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [state, setState] = React.useState<ApiCallsHuntState | null>(null);

  const [showOpts, setShowOpts] = React.useState(false);

  // ✅ options sections
  const [optsSection, setOptsSection] = React.useState<"options" | "bans">("options");
  const [bansTab, setBansTab] = React.useState<"slot" | "provider">("slot");

  // inputs
  const [startInp, setStartInp] = React.useState("");
  const [payInp, setPayInp] = React.useState("");

  // ✅ start edit dans engrenage (bouton -> input)
  const [showStartEdit, setShowStartEdit] = React.useState(false);

  // ✅ bonus -> ask bet (farm only)
  const [askBet, setAskBet] = React.useState(false);
  const [bonusBetInp, setBonusBetInp] = React.useState("");

  // ✅ GG toast
  const [gg, setGg] = React.useState(false);

  // ✅ FIX: éviter que le polling écrase l'input start pendant qu'on tape
  const editingStartRef = React.useRef(false);

  // ✅ Polling plus léger (évite les appels en rafale + pause quand onglet caché)
  const inFlightRef = React.useRef(false);

  // ===== BANS (slots/providers) =====
  const [bansLoading, setBansLoading] = React.useState(false);
  const [slotBans, setSlotBans] = React.useState<ApiCallBanRow[]>([]);
  const [providerBans, setProviderBans] = React.useState<ApiCallBanRow[]>([]);

  // slot suggestions (ban slot)
  const [slotQ, setSlotQ] = React.useState("");
  const [slotSug, setSlotSug] = React.useState<SlotItem[]>([]);
  const [slotPick, setSlotPick] = React.useState<SlotItem | null>(null);
  const [slotSugLoading, setSlotSugLoading] = React.useState(false);

  // provider catalog + suggestions
  const [providerCatalog, setProviderCatalog] = React.useState<string[]>([]);
  const [providerQ, setProviderQ] = React.useState("");
  const [providerPick, setProviderPick] = React.useState<string | null>(null);

  // provider policy
  const [policyMode, setPolicyMode] = React.useState<"allow_all" | "allow_only">("allow_all");
  const [allowedProviders, setAllowedProviders] = React.useState<string[]>([]);
  const [policyLoading, setPolicyLoading] = React.useState(false);

  function flashGg() {
    setGg(true);
    window.setTimeout(() => setGg(false), 1300);
  }

  async function load() {
    const s = await getCallsHuntState(streamerSlug, token);
    setState(s);

    // ✅ ne pas écraser l'input si l'utilisateur est en train d'écrire
    if (!editingStartRef.current && !showStartEdit) {
      const startRaw = getStartRaw(s);
      setStartInp(startRaw !== null ? String(startRaw) : "");
    }
  }

  // ✅ Polling léger + smart pause
  React.useEffect(() => {
    let alive = true;
    let t: number | null = null;

    async function tick() {
      if (!alive) return;
      if (document.hidden) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        await load();
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || "Erreur"));
      } finally {
        inFlightRef.current = false;
      }
    }

    // initial load
    void tick();

    const pollMs = showOpts ? 4500 : 2500; // ✅ moins agressif, et encore plus lent en mode options
    t = window.setInterval(() => void tick(), pollMs);

    const onVis = () => {
      if (!alive) return;
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);

    return () => {
      alive = false;
      if (t) window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, streamerSlug, showOpts]);

  const opening = getOpening(state);
  const bonusDrops = pickBonusDrops(state);

  const currentFarm = (state as any)?.currentCall ?? null;
  const rawCurrentOpen = (state as any)?.currentOpenItem ?? (state as any)?.currentBonus ?? (state as any)?.currentOpen ?? null;

  const currentOpen =
    rawCurrentOpen ||
    (opening ? bonusDrops.find((b: any) => b && (b.payEur === null || typeof b.payEur === "undefined")) || bonusDrops[0] || null : null);

  const startRaw = getStartRaw(state);
  const hasStart = startRaw !== null && startRaw > 0;
  const startEur = startRaw ?? 0;

  const callsCount =
    Number((state as any)?.callsCount) || asArr<any>((state as any)?.queue).filter((x) => !(Number(x?.betEur ?? 0) > 0)).length;

  const bonusCount = Number((state as any)?.bonusCount) || bonusDrops.length;

  // ✅ construit un catalogue providers “best-effort” (si backend renvoie une liste complète dans provider-policy, on l’utilise)
  function mergeProviderCatalog(extra?: string[]) {
    const fromState = uniqStr(
      [
        normProvider(currentFarm?.provider),
        normProvider(currentOpen?.provider),
        ...bonusDrops.map((b: any) => normProvider(b?.provider)),
      ].filter(Boolean) as string[]
    );

    const fromBans = uniqStr(providerBans.map((b) => normProvider((b as any)?.label ?? (b as any)?.banKey)).filter(Boolean) as string[]);
    const fromAllowed = uniqStr(allowedProviders.map((p) => normProvider(p)).filter(Boolean) as string[]);
    const fromExtra = uniqStr((extra || []).map((p) => normProvider(p)).filter(Boolean) as string[]);

    const merged = uniqStr([...providerCatalog, ...fromAllowed, ...fromBans, ...fromState, ...fromExtra]);
    setProviderCatalog(merged);
  }

  // ====== actions hunt ======
  async function doPass() {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await callsHuntPass(streamerSlug, token);
      setAskBet(false);
      setBonusBetInp("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  function onClickBonus() {
    if (!canModerate) return;
    setErr(null);
    setAskBet(true);
    setBonusBetInp("");
  }

  async function doConfirmBonusWithBet() {
    if (!canModerate) return;

    const v = Number(String(bonusBetInp).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      setErr("Bet invalide");
      return;
    }

    setErr(null);
    setBusy(true);
    try {
      await callsHuntSetBet(streamerSlug, token, v);
      await callsHuntBonusDrop(streamerSlug, token);

      setAskBet(false);
      setBonusBetInp("");
      flashGg();
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doToggleOpenFarm() {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await callsHuntOpen(streamerSlug, token);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!canModerate) return;
    const v = Number(String(payInp).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      setErr("Pay invalide");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await callsHuntPay(streamerSlug, token, v);
      setPayInp("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doSetStart() {
    if (!canModerate) return;
    const v = Number(String(startInp).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      setErr("Start invalide");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await callsHuntSetStart(streamerSlug, token, v);
      await syncHunt2Start(token, v);

      editingStartRef.current = false;
      setShowStartEdit(false);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur (route start ?)"));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (!canModerate) return;
    const ok = window.confirm("Reset Hunt ? (Start + machines + session seront supprimés)");
    if (!ok) return;

    setErr(null);
    setBusy(true);
    try {
      await callsHuntReset(streamerSlug, token);
      setPayInp("");
      setStartInp("");
      setAskBet(false);
      setBonusBetInp("");
      setShowStartEdit(false);
      editingStartRef.current = false;
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  // ====== bans/policy loaders (only when needed) ======
  async function reloadBansAndPolicy(kind?: "slot" | "provider") {
    if (!canModerate) return;
    setErr(null);
    setBansLoading(true);
    try {
      const wantKind = kind ?? bansTab;

      const [slots, provs, pol] = await Promise.all([
        wantKind === "slot" || wantKind === undefined ? getCallsBans(streamerSlug, token, "slot") : Promise.resolve(null),
        wantKind === "provider" || wantKind === undefined ? getCallsBans(streamerSlug, token, "provider") : Promise.resolve(null),
        getCallsProviderPolicy(streamerSlug, token),
      ]);

      if (slots) setSlotBans(asArr<ApiCallBanRow>((slots as any)?.items));
      if (provs) setProviderBans(asArr<ApiCallBanRow>((provs as any)?.items));

      // provider-policy (best effort)
      const mode = (pol as any)?.mode === "allow_only" ? "allow_only" : "allow_all";
      const allowed = asArr<string>((pol as any)?.allowed);
      setPolicyMode(mode);
      setAllowedProviders(allowed);

      // ✅ si backend renvoie une liste complète, on la prend (sinon fallback sur merge)
      const allFromApi = asArr<string>((pol as any)?.providers ?? (pol as any)?.allProviders ?? (pol as any)?.items ?? []);
      mergeProviderCatalog(allFromApi);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBansLoading(false);
    }
  }

  // ✅ Load bans/policy uniquement quand on ouvre l’engrenage (et pas en permanence)
  React.useEffect(() => {
    if (!showOpts) return;
    if (!canModerate) return;

    // reset UI states
    setErr(null);
    setAskBet(false);
    setBonusBetInp("");
    setOptsSection((s) => s || "options");
    // initial load (slots + policy, puis providers au besoin)
    void reloadBansAndPolicy("slot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOpts, streamerSlug]);

  React.useEffect(() => {
    if (!showOpts) return;
    if (!canModerate) return;
    if (optsSection !== "bans") return;

    void reloadBansAndPolicy(bansTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsSection, bansTab]);

  // ====== slot suggestions (ban slot) ======
async function fetchSlotSuggestions(text: string) {
  const s = String(text || "").trim();
  if (s.length < 2) {
    setSlotSug([]);
    return;
  }
  setSlotSugLoading(true);
  try {
    const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=10`);
    const j = await r.json();
    if (j?.ok) {
      const list = asArr<SlotItem>(j.items);
      setSlotSug(list);

      // enrich providers catalog best-effort
      mergeProviderCatalog(list.map((it) => normProvider(it.provider)).filter(Boolean) as string[]);
    } else {
      setSlotSug([]);
    }
  } catch {
    setSlotSug([]);
  } finally {
    setSlotSugLoading(false);
  }
}

React.useEffect(() => {
  if (!showOpts) return;
  if (!canModerate) return;
  if (optsSection !== "bans") return;
  if (bansTab !== "slot") return;

  const s = slotQ.trim();
  if (s.length < 2 || slotPick) {
    setSlotSug([]);
    return;
  }

  const t = window.setTimeout(() => {
    void fetchSlotSuggestions(s);
  }, 120);

  return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [slotQ, slotPick, showOpts, optsSection, bansTab, canModerate]);

  // ====== provider suggestions (from catalog, no extra requests) ======
  const providerSug = React.useMemo(() => {
    const q = providerQ.trim().toLowerCase();
    if (!q) return [];
    return providerCatalog
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 12);
  }, [providerQ, providerCatalog]);

async function postBan(payload: any) {
  const slug = encodeURIComponent(streamerSlug);

  // ✅ Selon les versions, l’ajout de ban est souvent sur /ban (singulier)
  // ou /bans/add. On essaye plusieurs routes, on ignore seulement les 404.
  const candidates = [
    `/calls/${slug}/ban`,
    `/calls/${slug}/bans/add`,
    `/calls/${slug}/bans`, // garde au cas où (mais chez toi ça 404)
  ];

  let last404: any = null;

  for (const path of candidates) {
    const r = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // si 404 → on tente la candidate suivante
    if (r.status === 404) {
      last404 = path;
      continue;
    }

    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || j?.message || `http_${r.status}`);
    }
    return j;
  }

  throw new Error(`ban_route_not_found (tried: ${candidates.join(", ")}; last404=${last404})`);
}

  // ====== bans actions ======
async function addSlotBan() {
  if (!canModerate) return;

  const pick = slotPick;
  const slotName = String(pick?.name ?? "").trim();
  const provider = pick?.provider ? String(pick.provider).trim() : null;

  if (!slotName) {
    setErr("Choisis une machine (suggestions)");
    return;
  }

  setErr(null);
  setBusy(true);
  try {
    // ✅ on envoie TOUTES les clés possibles -> plus de "missing_slot"
    await banCalls(streamerSlug, token, {
      kind: "slot",
      slot: slotName,
      slotName,
      label: slotName,
      provider,
    });

    setSlotPick(null);
    setSlotQ("");
    setSlotSug([]);

    // ✅ refresh seulement ce qu'il faut
    await reloadBansAndPolicy("slot");
  } catch (e: any) {
    setErr(String(e?.message || "Erreur"));
  } finally {
    setBusy(false);
  }
}

  async function removeSlotBanKey(banKey: string) {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await unbanCalls(streamerSlug, token, "slot", [banKey]);
      await reloadBansAndPolicy();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function clearAllSlotBans() {
    if (!canModerate) return;
    const keys = slotBans.map((b) => b.banKey).filter(Boolean);
    if (!keys.length) return;

    const ok = window.confirm(`Tout débannir (${keys.length}) ?`);
    if (!ok) return;

    setErr(null);
    setBusy(true);
    try {
      await unbanCalls(streamerSlug, token, "slot", keys);
      await reloadBansAndPolicy("slot");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

async function addProviderBan() {
  if (!canModerate) return;

  const provider = String(providerPick ?? providerQ ?? "").trim();
  if (!provider) {
    setErr("Provider requis");
    return;
  }

  setErr(null);
  setBusy(true);
  try {
    // ✅ on envoie provider + providerKey -> plus de "missing_provider"
    await banCalls(streamerSlug, token, {
      kind: "provider",
      provider,
      providerKey: provider,
      label: provider,
    });

    setProviderPick(null);
    setProviderQ("");

    await reloadBansAndPolicy("provider");
  } catch (e: any) {
    setErr(String(e?.message || "Erreur"));
  } finally {
    setBusy(false);
  }
}

  async function removeProviderBanKey(banKey: string) {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await unbanCalls(streamerSlug, token, "provider", [banKey]);
      await reloadBansAndPolicy("provider");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function clearAllProviderBans() {
    if (!canModerate) return;
    const keys = providerBans.map((b) => b.banKey).filter(Boolean);
    if (!keys.length) return;

    const ok = window.confirm(`Tout débannir (${keys.length}) ?`);
    if (!ok) return;

    setErr(null);
    setBusy(true);
    try {
      await unbanCalls(streamerSlug, token, "provider", keys);
      await reloadBansAndPolicy("provider");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  // ====== provider policy actions ======
  async function setMode(next: "allow_all" | "allow_only") {
    if (!canModerate) return;
    setErr(null);
    setPolicyLoading(true);
    try {
      await setCallsProviderPolicy(streamerSlug, token, next);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      const mode = (pol as any)?.mode === "allow_only" ? "allow_only" : "allow_all";
      const allowed = asArr<string>((pol as any)?.allowed);
      setPolicyMode(mode);
      setAllowedProviders(allowed);

      const allFromApi = asArr<string>((pol as any)?.providers ?? (pol as any)?.allProviders ?? (pol as any)?.items ?? []);
      mergeProviderCatalog(allFromApi);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setPolicyLoading(false);
    }
  }

  async function addAllowedProvider() {
    if (!canModerate) return;
    const p = normProvider(providerPick ?? providerQ);
    if (!p) return;

    setErr(null);
    setPolicyLoading(true);
    try {
      await allowCallsProviders(streamerSlug, token, [p]);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      const mode = (pol as any)?.mode === "allow_only" ? "allow_only" : "allow_all";
      const allowed = asArr<string>((pol as any)?.allowed);
      setPolicyMode(mode);
      setAllowedProviders(allowed);

      setProviderPick(null);
      setProviderQ("");
      const allFromApi = asArr<string>((pol as any)?.providers ?? (pol as any)?.allProviders ?? (pol as any)?.items ?? []);
      mergeProviderCatalog(allFromApi);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setPolicyLoading(false);
    }
  }

  async function removeAllowedProvider(p: string) {
    if (!canModerate) return;
    setErr(null);
    setPolicyLoading(true);
    try {
      await unallowCallsProviders(streamerSlug, token, [p]);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      const mode = (pol as any)?.mode === "allow_only" ? "allow_only" : "allow_all";
      const allowed = asArr<string>((pol as any)?.allowed);
      setPolicyMode(mode);
      setAllowedProviders(allowed);

      const allFromApi = asArr<string>((pol as any)?.providers ?? (pol as any)?.allProviders ?? (pol as any)?.items ?? []);
      mergeProviderCatalog(allFromApi);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setPolicyLoading(false);
    }
  }

  async function allowOnlyOneProvider() {
    if (!canModerate) return;
    const p = normProvider(providerPick ?? providerQ);
    if (!p) {
      setErr("Provider requis");
      return;
    }
    setErr(null);
    setPolicyLoading(true);
    try {
      await allowOnlyCallsProvider(streamerSlug, token, p);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      const mode = (pol as any)?.mode === "allow_only" ? "allow_only" : "allow_all";
      const allowed = asArr<string>((pol as any)?.allowed);
      setPolicyMode(mode);
      setAllowedProviders(allowed);

      setProviderPick(null);
      setProviderQ("");
      const allFromApi = asArr<string>((pol as any)?.providers ?? (pol as any)?.allProviders ?? (pol as any)?.items ?? []);
      mergeProviderCatalog(allFromApi);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setPolicyLoading(false);
    }
  }

  // ===== UI helpers =====
  const showBonusDropsPanel = !showOpts; // ✅ demandé: quand engrenage ouvert, on masque Bonus drops pour gagner de la place

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
      <style>{`
        @keyframes ggPop {
          0% { transform: translateY(8px) scale(0.96); opacity: 0; }
          25% { transform: translateY(0px) scale(1.00); opacity: 1; }
          80% { transform: translateY(0px) scale(1.00); opacity: 1; }
          100% { transform: translateY(-6px) scale(0.98); opacity: 0; }
        }
      `}</style>

      {gg ? (
        <div style={{ position: "sticky", top: 8, zIndex: 50, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div
            style={{
              animation: "ggPop 1.3s ease-in-out both",
              padding: "10px 14px",
              borderRadius: 999,
              fontWeight: 950,
              border: "1px solid rgba(124,77,255,0.40)",
              background: "rgba(124,77,255,0.16)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
          >
            GG ✅
          </div>
        </div>
      ) : null}

      {err ? <div className="hint">⚠️ {err}</div> : null}

      <Panel
        title={
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            Hunt
            <span
              style={{
                fontSize: 11,
                fontWeight: 950,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: opening ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
              }}
            >
              {opening ? "OUVERTURE" : "FARM"}
            </span>
          </span>
        }
        right={
          canModerate ? (
            <button
              onClick={() => {
                setShowOpts((v) => !v);
                // UX: quand on ouvre, on commence sur options
                if (!showOpts) {
                  setOptsSection("options");
                  setBansTab("slot");
                  setShowStartEdit(false);
                }
              }}
              className="btnGhostInline"
              style={{ padding: "8px 10px", borderRadius: 12, display: "inline-flex", gap: 8, alignItems: "center" }}
              title="Options Hunt"
            >
              <Settings size={16} />
            </button>
          ) : null
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Start
            </div>
            <div style={{ fontWeight: 950 }}>{fmtEur(startEur)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Calls en cours
            </div>
            <div style={{ fontWeight: 950 }}>{callsCount}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Bonus drops
            </div>
            <div style={{ fontWeight: 950 }}>{bonusCount}</div>
          </div>
        </div>

        {/* ✅ Setup start visible direct si pas de start */}
        {canModerate && !hasStart ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(124,77,255,0.22)",
              background: "rgba(124,77,255,0.10)",
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontWeight: 950, fontSize: 12 }}>Set up a start</div>
              <input
                value={startInp}
                onFocus={() => (editingStartRef.current = true)}
                onBlur={() => (editingStartRef.current = false)}
                onChange={(e) => {
                  editingStartRef.current = true;
                  setStartInp(e.target.value);
                }}
                placeholder="ex: 200"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
            </div>
            <SmallBtn disabled={busy} onClick={doSetStart} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
              Valider start
            </SmallBtn>
          </div>
        ) : null}

        {/* ✅ Options engrenage */}
        {canModerate && showOpts ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.10)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            {/* Section switch */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
              {(["options", "bans"] as const).map((k) => (
                <button
                  key={k}
                  className="btnGhostInline"
                  onClick={() => setOptsSection(k)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    fontWeight: 950,
                    border: optsSection === k ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                    background: optsSection === k ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
                  }}
                >
                  {k === "options" ? "Options" : "Bans"}
                </button>
              ))}

              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <SmallBtn
                  disabled={busy || bansLoading || policyLoading}
                  onClick={() => reloadBansAndPolicy()}
                  style={{ opacity: 0.95 }}
                >
                  {(bansLoading || policyLoading) ? "…" : "Rafraîchir"}
                </SmallBtn>
              </div>
            </div>

            {optsSection === "options" ? (
              <>
                {/* Start edit: bouton -> input */}
                <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                  <div style={{ fontWeight: 950, fontSize: 12 }}>Start</div>

                  {!showStartEdit ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div className="muted" style={{ fontSize: 12, fontWeight: 850 }}>
                        {fmtEur(startEur)}
                      </div>
                      <SmallBtn
                        disabled={busy}
                        onClick={() => {
                          setShowStartEdit(true);
                          editingStartRef.current = true;
                        }}
                        style={{ border: "1px solid rgba(124,77,255,0.45)", background: "rgba(124,77,255,0.08)" }}
                      >
                        Modifier le start
                      </SmallBtn>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        value={startInp}
                        onFocus={() => (editingStartRef.current = true)}
                        onBlur={() => (editingStartRef.current = false)}
                        onChange={(e) => {
                          editingStartRef.current = true;
                          setStartInp(e.target.value);
                        }}
                        placeholder="ex: 200"
                        style={{
                          flex: "1 1 180px",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(0,0,0,0.12)",
                          color: "inherit",
                        }}
                      />
                      <SmallBtn disabled={busy} onClick={doSetStart} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                        Valider
                      </SmallBtn>
                      <SmallBtn
                        disabled={busy}
                        onClick={() => {
                          setShowStartEdit(false);
                          editingStartRef.current = false;
                          const sr = getStartRaw(state);
                          setStartInp(sr !== null ? String(sr) : "");
                        }}
                      >
                        Annuler
                      </SmallBtn>
                    </div>
                  )}
                </div>

                <div style={{ flex: "1 1 100%", height: 1, background: "rgba(255,255,255,0.08)" }} />

                <SmallBtn
                  disabled={busy}
                  onClick={doToggleOpenFarm}
                  style={{ border: "1px solid rgba(124,77,255,0.45)", background: "rgba(124,77,255,0.08)" }}
                >
                  {opening ? "Revenir en farm" : "Ouvrir le hunt"}
                </SmallBtn>

                <SmallBtn
                  disabled={busy}
                  onClick={doReset}
                  style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.10)" }}
                >
                  Reset Hunt
                </SmallBtn>
              </>
            ) : (
              <>
                {/* BANS tabs */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
                  {(["slot", "provider"] as const).map((k) => (
                    <button
                      key={k}
                      className="btnGhostInline"
                      onClick={() => setBansTab(k)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        fontWeight: 950,
                        border: bansTab === k ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                        background: bansTab === k ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
                      }}
                    >
                      {k === "slot" ? "Slots" : "Providers"}
                    </button>
                  ))}
                </div>

                {/* SLOT BANS */}
                {bansTab === "slot" ? (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>Slots bannies</div>

                    {/* Search + suggestions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ flex: "1 1 360px", minWidth: 260 }}>
                        <input
                          value={slotQ}
                          onChange={(e) => {
                            setSlotQ(e.target.value);
                            setSlotPick(null);
                          }}
                          placeholder="Rechercher une machine (ex: Sweet Bonanza)"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(0,0,0,0.12)",
                            color: "inherit",
                          }}
                        />

                        {slotSugLoading ? (
                          <div className="muted" style={{ marginTop: 8, fontSize: 12, fontWeight: 850 }}>
                            Suggestions…
                          </div>
                        ) : null}

                        {slotSug.length > 0 && !slotPick ? (
                          <div
                            style={{
                              marginTop: 8,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(0,0,0,0.12)",
                              overflow: "hidden",
                            }}
                          >
                            {slotSug.map((s) => (
                              <button
                                key={`${s.name}::${s.provider ?? ""}`}
                                type="button"
                                onClick={() => setSlotPick(s)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  padding: 10,
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  border: "none",
                                  background: "transparent",
                                  color: "inherit",
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 12,
                                    overflow: "hidden",
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    background: "rgba(0,0,0,0.10)",
                                  }}
                                >
                                  {s.imageUrl ? (
                                    <img
                                      src={s.imageUrl}
                                      alt=""
                                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                    />
                                  ) : null}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 950, fontSize: 13, lineHeight: 1.1 }}>{s.name}</div>
                                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                    {s.provider ?? "—"}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {slotPick ? (
                          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                            Sélection: <b>{slotPick.name}</b>
                            {slotPick.provider ? ` (${slotPick.provider})` : ""}
                          </div>
                        ) : null}

                        {slotQ.trim().length >= 2 && !slotPick && !slotSugLoading && slotSug.length === 0 ? (
                          <div className="muted" style={{ marginTop: 8, fontSize: 12, fontWeight: 850 }}>
                            Aucune suggestion.
                          </div>
                        ) : null}
                      </div>

                      <SmallBtn disabled={busy || !slotPick} onClick={addSlotBan} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                        Ajouter
                      </SmallBtn>

                      <SmallBtn
                        disabled={busy || slotBans.length === 0}
                        onClick={clearAllSlotBans}
                        style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.10)" }}
                      >
                        Tout débannir
                      </SmallBtn>
                    </div>

                    {/* List */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {slotBans.length === 0 ? (
                        <div className="muted">Aucune slot bannie.</div>
                      ) : (
                        slotBans.map((b) => (
                          <div
                            key={String(b.id)}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              padding: 10,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(0,0,0,0.10)",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b.label ? b.label : b.banKey}
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                key: {b.banKey}
                              </div>
                            </div>
                            <SmallBtn disabled={busy} onClick={() => removeSlotBanKey(b.banKey)}>
                              Déban
                            </SmallBtn>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                {/* PROVIDER BANS + POLICY */}
                {bansTab === "provider" ? (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontWeight: 950 }}>Providers</div>

                    {/* Provider input + suggestions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ flex: "1 1 360px", minWidth: 260 }}>
                        <input
                          value={providerQ}
                          onChange={(e) => {
                            setProviderQ(e.target.value);
                            setProviderPick(null);
                          }}
                          placeholder="Rechercher un provider (ex: pragmaticplay, hacksaw)"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(0,0,0,0.12)",
                            color: "inherit",
                          }}
                        />

                        {providerSug.length > 0 && !providerPick ? (
                          <div
                            style={{
                              marginTop: 8,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(0,0,0,0.12)",
                              overflow: "hidden",
                            }}
                          >
                            {providerSug.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setProviderPick(p)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  padding: 10,
                                  border: "none",
                                  background: "transparent",
                                  color: "inherit",
                                  cursor: "pointer",
                                  fontWeight: 950,
                                }}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {providerPick ? (
                          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                            Sélection: <b>{providerPick}</b>
                          </div>
                        ) : null}
                      </div>

                      <SmallBtn disabled={busy} onClick={addProviderBan} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                        Ban provider
                      </SmallBtn>

                      <SmallBtn
                        disabled={busy || providerBans.length === 0}
                        onClick={clearAllProviderBans}
                        style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.10)" }}
                      >
                        Tout débannir
                      </SmallBtn>
                    </div>

                    {/* Banned providers list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {providerBans.length === 0 ? (
                        <div className="muted">Aucun provider banni.</div>
                      ) : (
                        providerBans.map((b) => (
                          <div
                            key={String(b.id)}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              padding: 10,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(0,0,0,0.10)",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b.label ? b.label : b.banKey}
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                key: {b.banKey}
                              </div>
                            </div>
                            <SmallBtn disabled={busy} onClick={() => removeProviderBanKey(b.banKey)}>
                              Déban
                            </SmallBtn>
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

                    {/* Provider policy: ban all except one */}
                    <div>
                      <div style={{ fontWeight: 950 }}>Ban tous les providers sauf…</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Ça correspond au mode <b>Autoriser seulement</b>.
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="radio" checked={policyMode === "allow_all"} onChange={() => setMode("allow_all")} disabled={policyLoading} />
                          <span style={{ fontWeight: 950 }}>Autoriser tous</span>
                        </label>

                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="radio"
                            checked={policyMode === "allow_only"}
                            onChange={() => setMode("allow_only")}
                            disabled={policyLoading}
                          />
                          <span style={{ fontWeight: 950 }}>Autoriser seulement</span>
                        </label>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <SmallBtn disabled={policyLoading} onClick={addAllowedProvider}>
                          Ajouter whitelist
                        </SmallBtn>

                        <SmallBtn
                          disabled={policyLoading}
                          onClick={allowOnlyOneProvider}
                          style={{ border: "1px solid rgba(255,190,60,0.35)" }}
                        >
                          Tout interdire sauf celui-là
                        </SmallBtn>
                      </div>

                      {policyMode === "allow_only" ? (
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          {allowedProviders.length === 0 ? (
                            <div className="muted">Whitelist vide (du coup tout est refusé).</div>
                          ) : (
                            allowedProviders.map((p) => (
                              <div
                                key={p}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  alignItems: "center",
                                  padding: 10,
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  background: "rgba(0,0,0,0.10)",
                                }}
                              >
                                <div style={{ fontWeight: 950 }}>{p}</div>
                                <SmallBtn disabled={policyLoading} onClick={() => removeAllowedProvider(p)}>
                                  Retirer
                                </SmallBtn>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div className="muted" style={{ marginTop: 10 }}>
                          Mode “Autoriser tous” actif.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Panel>

      {/* Machine en cours / Bonus en cours */}
      <Panel title={opening ? "Bonus en cours" : "Machine en cours"}>
        {!opening ? (
          currentFarm ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Thumb url={currentFarm.imageUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.2 }}>
                  {currentFarm.slotName || "—"}
                  {currentFarm.provider ? <span className="muted"> ({currentFarm.provider})</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  call par @{currentFarm.username || "?"}
                </div>

                {/* ✅ input bet inline quand on clique "Bonus" */}
                {canModerate && askBet ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(124,77,255,0.25)",
                      background: "rgba(124,77,255,0.10)",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 950, fontSize: 12, marginRight: 2 }}>Bet du bonus :</div>
                    <input
                      value={bonusBetInp}
                      onChange={(e) => setBonusBetInp(e.target.value)}
                      placeholder="ex: 0.30"
                      style={{
                        width: 140,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.12)",
                        color: "inherit",
                      }}
                    />
                    <SmallBtn disabled={busy} onClick={doConfirmBonusWithBet} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                      Valider
                    </SmallBtn>
                    <SmallBtn
                      disabled={busy}
                      onClick={() => {
                        setAskBet(false);
                        setBonusBetInp("");
                      }}
                    >
                      Annuler
                    </SmallBtn>
                  </div>
                ) : null}
              </div>

              {canModerate ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <SmallBtn disabled={busy} onClick={onClickBonus} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                    Bonus
                  </SmallBtn>
                  <SmallBtn disabled={busy} onClick={doPass}>
                    Pass
                  </SmallBtn>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div className="muted">Aucune machine.</div>
              {canModerate ? (
                <SmallBtn disabled={busy} onClick={doToggleOpenFarm} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                  Ouvrir le hunt
                </SmallBtn>
              ) : null}
            </div>
          )
        ) : currentOpen ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Thumb url={currentOpen.imageUrl ?? currentOpen.image_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.2 }}>
                {currentOpen.slotName ?? currentOpen.name ?? "—"}
                {currentOpen.provider ? <span className="muted"> ({currentOpen.provider})</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                bet: <b>{fmtEur((currentOpen.betEur ?? currentOpen.bet) ?? 0)}</b>
              </div>
            </div>

            {canModerate ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                <input
                  value={payInp}
                  onChange={(e) => setPayInp(e.target.value)}
                  placeholder="Pay du bonus (ex: 45.20)"
                  style={{
                    width: 220,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.12)",
                    color: "inherit",
                  }}
                />
                <SmallBtn disabled={busy} onClick={doPay} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                  Valider
                </SmallBtn>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="muted">Aucun bonus à ouvrir.</div>
        )}
      </Panel>

      {/* ✅ Bonus drops masqués quand engrenage ouvert (gain de place) */}
      {showBonusDropsPanel ? (
        <Panel title={`Bonus drops (${bonusDrops.length})`}>
          {bonusDrops.length === 0 ? (
            <div className="muted">
              Aucun bonus drop pour l’instant.
              <br />
              (Quand une machine a une bet, elle doit apparaître ici.)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bonusDrops.map((b: any, idx) => (
                <div
                  key={String(b.id ?? `${b.slotName}-${idx}`)}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.10)",
                  }}
                >
                  <Thumb url={b.imageUrl} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 13, lineHeight: 1.2 }}>
                      #{idx + 1} — {b.slotName || "—"}
                      {b.provider ? <span className="muted"> ({b.provider})</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      bet: <b>{fmtEur(b.betEur ?? 0)}</b>
                      {Number(b.payEur) >= 0 ? (
                        <span className="muted">
                          {" "}
                          — pay: <b>{fmtEur(b.payEur)}</b>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
