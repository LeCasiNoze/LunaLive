// web/src/pages/CasinosPage.mobile.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  CheckTaSlot — Mobile  |  Design : Purple Velvet × Blue Night
//  Page mobile dédiée et propre, pensée pour un usage tactile.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link } from "react-router-dom";
import { listCasinos, type CasinoListItem, type CasinoListResp, absApiUrl } from "../lib/api_casinos";

type SortMode = "luna" | "community" | "newest";

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function fmtRating(v: number) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  const r = Math.round(x * 10) / 10;
  const hasDec = Math.abs(r - Math.round(r)) > 1e-9;
  return r.toLocaleString("fr-FR", { minimumFractionDigits: hasDec ? 1 : 0, maximumFractionDigits: 1 });
}
function getLunaRating(c: any): number | null {
  const raw = c?.teamRating ?? c?.team_rating ?? null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 5) : null;
}
function initials(name: string) {
  const s = (name || "?").trim(); if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  return ((parts[0]?.[0] ?? s[0]) + (parts[1]?.[0] ?? "")).toUpperCase();
}
function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

.cm-page {
  --cm-text-1: rgba(235,232,255,.96);
  --cm-text-2: rgba(180,185,230,.70);
  --cm-text-3: rgba(140,145,195,.50);
  --cm-border: rgba(124,92,252,.18);
  --cm-surf:   #14102a;
  --cm-surf-2: #1a1535;
  --cm-grad: linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
  --cm-safe:  env(safe-area-inset-bottom, 0px);
  --cm-ease:  cubic-bezier(.22,1,.36,1);

  min-height: 100dvh;
  padding: 0 12px calc(96px + var(--cm-safe));
  font-family: 'Syne', system-ui, sans-serif;
  color: var(--cm-text-1);
  position: relative; overflow-x: hidden;
}
.cm-page::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(110vw 50vh at 15% -5%, rgba(124,92,252,.13), transparent 58%),
    radial-gradient(80vw 45vh at 85% 35%, rgba(59,77,200,.10), transparent 58%);
}

.cm-content { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }

/* ── Hero compact ───────────────────────────────────────────────────────── */
.cm-hero {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--cm-border);
  background: rgba(11,9,22,.86);
  box-shadow: 0 12px 38px rgba(0,0,0,.40);
  position: relative; overflow: hidden;
}
.cm-hero::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.45) 40%,rgba(91,142,248,.30) 60%,transparent);
}
.cm-hero-title {
  margin: 0;
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 26px; letter-spacing: -.8px; line-height: 1;
  background: var(--cm-grad); background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 12px rgba(124,92,252,.45));
}
.cm-hero-sub {
  margin-top: 6px;
  font-size: 12px; font-weight: 500; color: var(--cm-text-2);
}

/* ── Search ─────────────────────────────────────────────────────────────── */
.cm-search-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 14px;
  border: 1px solid rgba(124,92,252,.22);
  background: var(--cm-surf);
  box-shadow: 0 6px 18px rgba(0,0,0,.30), 0 0 0 1px rgba(167,139,250,.05) inset;
}
.cm-search-row:focus-within {
  border-color: rgba(167,139,250,.55);
  box-shadow: 0 8px 22px rgba(124,92,252,.20), 0 0 0 3px rgba(124,92,252,.10);
}
.cm-search-icon { font-size: 15px; color: rgba(196,181,253,.70); }
.cm-search-input {
  flex: 1; min-width: 0; border: 0; outline: none; background: transparent;
  color: var(--cm-text-1); font-family: inherit; font-size: 14px; font-weight: 600; letter-spacing: -.1px;
}
.cm-search-input::placeholder { color: rgba(167,155,220,.55); font-weight: 500; }
.cm-search-clear {
  background: rgba(255,255,255,.06); border: 0; color: rgba(235,232,255,.70);
  border-radius: 999px; width: 22px; height: 22px; padding: 0; cursor: pointer;
  font-size: 11px; display: grid; place-items: center;
}

/* ── Segmented (sort) ──────────────────────────────────────────────────── */
.cm-seg {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
  padding: 4px; border-radius: 14px;
  border: 1px solid var(--cm-border); background: var(--cm-surf);
  box-shadow: 0 6px 18px rgba(0,0,0,.30) inset;
}
.cm-seg-btn {
  padding: 9px 6px; border-radius: 10px; border: 0; background: transparent;
  color: var(--cm-text-2); cursor: pointer;
  font-family: inherit; font-size: 11.5px; font-weight: 700; letter-spacing: -.05px;
  -webkit-tap-highlight-color: transparent;
  transition: background 160ms ease, color 160ms ease, transform 120ms var(--cm-ease);
}
.cm-seg-btn:active { transform: scale(.97); }
.cm-seg-btn.active {
  background: linear-gradient(135deg, rgba(124,92,252,.24), rgba(91,142,248,.16));
  color: rgba(235,232,255,.98);
  box-shadow: 0 4px 14px rgba(124,92,252,.20), 0 0 0 1px rgba(167,139,250,.18) inset;
}

/* ── Section header ────────────────────────────────────────────────────── */
.cm-sec-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 4px 4px 2px;
}
.cm-sec-title {
  margin: 0;
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase; color: var(--cm-text-2);
  position: relative; padding-left: 12px;
}
.cm-sec-title::before {
  content: ""; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 11px; border-radius: 2px;
  background: linear-gradient(180deg,#a78bfa,#5b8ef8);
}
.cm-sec-hint { font-size: 11px; font-weight: 600; color: var(--cm-text-3); }

/* ── Podium (carousel horizontal) ──────────────────────────────────────── */
.cm-podium {
  display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px;
  scrollbar-width: none; scroll-snap-type: x mandatory;
}
.cm-podium::-webkit-scrollbar { display: none; }

.cm-podium-card {
  flex-shrink: 0; width: 76vw; max-width: 320px;
  scroll-snap-align: start;
  position: relative; overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,.22);
  background: var(--cm-surf);
  box-shadow: 0 14px 40px rgba(0,0,0,.42);
  text-decoration: none; color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: transform 140ms var(--cm-ease), border-color 140ms ease;
  display: flex; flex-direction: column;
}
.cm-podium-card:active { transform: scale(.98); }
.cm-podium-card.rank-1 { border-color: rgba(251,191,36,.34); box-shadow: 0 14px 40px rgba(0,0,0,.42), 0 0 24px rgba(251,191,36,.10); }
.cm-podium-card.rank-2 { border-color: rgba(196,181,253,.30); }
.cm-podium-card.rank-3 { border-color: rgba(91,142,248,.30); }
.cm-podium-rank {
  position: absolute; top: 8px; left: 8px; z-index: 2;
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  font-size: 13px; font-weight: 800;
  background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.16);
  backdrop-filter: blur(6px);
}
.cm-podium-card.rank-1 .cm-podium-rank { color: #fde68a; border-color: rgba(251,191,36,.36); }
.cm-podium-card.rank-2 .cm-podium-rank { color: #c4b5fd; border-color: rgba(196,181,253,.36); }
.cm-podium-card.rank-3 .cm-podium-rank { color: #93c5fd; border-color: rgba(91,142,248,.36); }
.cm-podium-logo {
  width: 100%; aspect-ratio: 16/9; background: rgba(0,0,0,.35);
  display: grid; place-items: center; overflow: hidden;
  border-bottom: 1px solid rgba(124,92,252,.10);
}
.cm-podium-logo img { width: 100%; height: 100%; object-fit: contain; padding: 14px; }
.cm-podium-logo-fallback {
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 30px; letter-spacing: -.5px;
  color: rgba(196,181,253,.85);
}
.cm-podium-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.cm-podium-name {
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px; letter-spacing: -.3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cm-podium-rating {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--cm-text-2);
}
.cm-stars { display: inline-flex; gap: 2px; }
.cm-star { color: rgba(251,191,36,.92); font-size: 13px; }
.cm-star.dim { opacity: .25; }
.cm-rating-num { font-weight: 800; color: rgba(253,230,138,.92); font-size: 13px; }

/* ── Casino list ───────────────────────────────────────────────────────── */
.cm-list { display: flex; flex-direction: column; gap: 8px; }

.cm-card {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surf);
  box-shadow: 0 6px 18px rgba(0,0,0,.32);
  text-decoration: none; color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--cm-ease);
}
.cm-card:active { transform: scale(.99); background: var(--cm-surf-2); }
.cm-card.is-watch { border-color: rgba(91,142,248,.30); }
.cm-card.is-avoid { border-color: rgba(239,68,68,.30); background: #2a1014; }
.cm-card.is-partner { border-color: rgba(251,191,36,.28); }

.cm-card-logo {
  width: 50px; height: 50px; border-radius: 12px; flex-shrink: 0; overflow: hidden;
  border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35);
  display: grid; place-items: center;
}
.cm-card-logo img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
.cm-card-logo-fallback {
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 16px; color: rgba(196,181,253,.80);
}
.cm-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cm-card-name {
  font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: -.2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cm-card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--cm-text-2); }
.cm-card-meta-dot { opacity: .35; }

.cm-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: .03em;
}
.cm-pill-partner { background: rgba(251,191,36,.14); border: 1px solid rgba(251,191,36,.32); color: #fde68a; }
.cm-pill-watch   { background: rgba(91,142,248,.12); border: 1px solid rgba(91,142,248,.30); color: #93c5fd; }
.cm-pill-avoid   { background: rgba(239,68,68,.14); border: 1px solid rgba(239,68,68,.30); color: #fca5a5; }

.cm-card-rating {
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;
}
.cm-card-arrow { color: rgba(124,92,252,.55); font-size: 14px; flex-shrink: 0; align-self: center; }

/* ── Empty / loading ───────────────────────────────────────────────────── */
.cm-skel {
  height: 70px; border-radius: 14px;
  background: linear-gradient(90deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 100%);
  background-size: 200% 100%;
  animation: cm-skel 1.6s ease-in-out infinite;
}
@keyframes cm-skel { 0% { background-position: 100% 50%; } 100% { background-position: -100% 50%; } }

.cm-empty {
  padding: 28px 16px; text-align: center;
  font-size: 13px; color: var(--cm-text-3);
  border: 1px dashed rgba(124,92,252,.18); border-radius: 14px;
  background: rgba(11,9,22,.40);
}

/* Passe sobre, cohérente avec les pages publiques. */
.cm-page { padding-inline:10px; font-family:'Manrope',sans-serif; font-variant-numeric:tabular-nums; }
.cm-page *,.cm-page :is(button,input,select) { font-family:'Manrope',sans-serif; }
.cm-content { gap:10px; padding-top:9px; }
.cm-hero { padding:4px 2px 11px; border:0; border-bottom:1px solid rgba(196,181,253,.14); border-radius:0; background:none; box-shadow:none; }
.cm-hero::before { display:none; }
.cm-hero-kicker { display:block; margin-bottom:4px; color:#a78bfa; font-size:8px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
.cm-hero-title { color:#f4effa; background:none; filter:none; font-size:23px; letter-spacing:-.055em; }
.cm-hero-sub { margin-top:4px; color:#91869e; font-size:9px; }
.cm-search-row { min-height:43px; padding:0 11px; border-color:rgba(196,181,253,.14); border-radius:12px; background:rgba(19,13,31,.86); box-shadow:0 10px 28px rgba(0,0,0,.18); }
.cm-search-row:focus-within { border-color:rgba(167,139,250,.4); box-shadow:0 0 0 3px rgba(157,124,248,.08); }
.cm-search-input { font-size:12px; font-weight:650; }
.cm-seg { padding:3px; border-color:rgba(196,181,253,.14); border-radius:12px; background:rgba(19,13,31,.86); box-shadow:none; }
.cm-seg-btn { min-height:35px; border-radius:9px; font-size:8px; font-weight:750; }
.cm-seg-btn.active { background:rgba(157,124,248,.13); box-shadow:inset 0 0 0 1px rgba(167,139,250,.16); }
.cm-sec-head { margin-top:10px; }
.cm-sec-title { color:#f0ebf7; background:none; filter:none; font-size:14px; font-weight:800; letter-spacing:-.035em; }
.cm-sec-hint { border-radius:8px; background:rgba(157,124,248,.07); color:#9d91aa; font-size:8px; }
.cm-podium,.cm-list { gap:8px; }
.cm-podium-card,.cm-card { border-color:rgba(196,181,253,.14); border-radius:14px; background:rgba(19,13,31,.86); box-shadow:0 11px 30px rgba(0,0,0,.2); }
.cm-podium-card { padding:10px; }
.cm-card { min-height:64px; padding:9px 10px; }
.cm-card-logo { width:40px; height:40px; border-radius:11px; }
.cm-card-name,.cm-podium-name { color:#eee9f6; font-size:11px; font-weight:800; letter-spacing:-.02em; }
.cm-card-meta,.cm-podium-rating { color:#958a9f; font-size:8px; }
.cm-pill { border-radius:7px; font-size:7px; }
.cm-card-arrow { width:26px; height:26px; border-radius:8px; background:rgba(157,124,248,.07); }
.cm-skel { height:64px; border-radius:14px; }
`;

let _cssInjected = false;
function useStyles() {
  React.useEffect(() => {
    if (_cssInjected) return;
    const el = document.createElement("style");
    el.id = "cm-css"; el.textContent = CSS;
    document.head.appendChild(el);
    _cssInjected = true;
  }, []);
}

function Stars({ value }: { value: number }) {
  const v = clamp(value, 0, 5);
  const full = Math.round(v);
  return (
    <span className="cm-stars" aria-label={`Note ${v.toFixed(1)} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`cm-star${i < full ? "" : " dim"}`}>★</span>
      ))}
    </span>
  );
}

function CasinoLogo({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: "card" | "podium" }) {
  const [ok, setOk] = React.useState(true);
  const url = logoUrl ? absApiUrl(logoUrl) || logoUrl : null;
  if (!url || !ok) {
    return size === "podium"
      ? <span className="cm-podium-logo-fallback">{initials(name)}</span>
      : <span className="cm-card-logo-fallback">{initials(name)}</span>;
  }
  return <img src={url} alt={name} onError={() => setOk(false)} />;
}

function CasinoCard({ c }: { c: CasinoListItem }) {
  const luna = getLunaRating(c);
  const community = Number.isFinite(Number(c.avgRating)) ? Number(c.avgRating) : null;
  const isPartner = (c.featuredRank ?? null) != null;
  const isWatch = c.watchLevel === "watch";
  const isAvoid = c.watchLevel === "avoid";
  const cls = `cm-card${isAvoid ? " is-avoid" : isWatch ? " is-watch" : isPartner ? " is-partner" : ""}`;

  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} className={cls} aria-label={`Voir ${c.name}`}>
      <div className="cm-card-logo" aria-hidden>
        <CasinoLogo name={c.name} logoUrl={c.logoUrl} size="card" />
      </div>
      <div className="cm-card-body">
        <div className="cm-card-name">{c.name}</div>
        <div className="cm-card-meta">
          {isPartner ? <span className="cm-pill cm-pill-partner">⭐ Partenaire</span> : null}
          {isWatch ? <span className="cm-pill cm-pill-watch">👁 Surveiller</span> : null}
          {isAvoid ? <span className="cm-pill cm-pill-avoid">⚠ À éviter</span> : null}
          {luna != null ? (
            <>
              <span><b style={{ color: "rgba(253,230,138,.92)" }}>{fmtRating(luna)}</b>/5 <span style={{ opacity: .65 }}>Luna</span></span>
            </>
          ) : null}
          {community != null && (c.ratingsCount ?? 0) > 0 ? (
            <>
              <span className="cm-card-meta-dot">·</span>
              <span><b>{fmtRating(community)}</b>/5 <span style={{ opacity: .65 }}>({c.ratingsCount})</span></span>
            </>
          ) : null}
          {c.bonusHeadline ? (
            <>
              {(luna != null || community != null) && <span className="cm-card-meta-dot">·</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>🎁 {c.bonusHeadline}</span>
            </>
          ) : null}
        </div>
      </div>
      <span className="cm-card-arrow" aria-hidden>›</span>
    </Link>
  );
}

function PodiumCard({ c, rank }: { c: CasinoListItem; rank: 1 | 2 | 3 }) {
  const luna = getLunaRating(c);
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} className={`cm-podium-card rank-${rank}`} aria-label={`Voir ${c.name} (rang ${rank})`}>
      <span className="cm-podium-rank">{medal}</span>
      <div className="cm-podium-logo">
        <CasinoLogo name={c.name} logoUrl={c.logoUrl} size="podium" />
      </div>
      <div className="cm-podium-body">
        <div className="cm-podium-name">{c.name}</div>
        {luna != null ? (
          <div className="cm-podium-rating">
            <Stars value={luna} />
            <span className="cm-rating-num">{fmtRating(luna)}/5</span>
          </div>
        ) : c.bonusHeadline ? (
          <div className="cm-podium-rating">🎁 {c.bonusHeadline}</div>
        ) : null}
      </div>
    </Link>
  );
}

export default function CasinosPageMobile() {
  useStyles();

  const [data, setData] = React.useState<CasinoListResp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q, 250);
  const [sort, setSort] = React.useState<SortMode>("luna");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const apiSort = sort === "newest" ? "newest" : "top";
        const r = await listCasinos({ q: dq.trim() || null, sort: apiSort as any });
        if (cancelled) return;
        setData(r);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dq, sort]);

  const podium = React.useMemo(() => {
    if (!data?.casinos?.length) return [];
    const arr = [...data.casinos];
    arr.sort((a, b) => {
      const la = getLunaRating(a) ?? -1; const lb = getLunaRating(b) ?? -1;
      if (lb !== la) return lb - la;
      const fa = a.featuredRank ?? 999999; const fb = b.featuredRank ?? 999999;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), "fr");
    });
    return arr.slice(0, 3);
  }, [data]);

  const sortedAll = React.useMemo(() => {
    if (!data?.casinos?.length) return [];
    const arr = [...data.casinos];
    if (sort === "newest") return arr;
    arr.sort((a, b) => {
      const ka = sort === "community"
        ? (Number.isFinite(Number(a.avgRating)) ? Number(a.avgRating) : -1)
        : (getLunaRating(a) ?? -1);
      const kb = sort === "community"
        ? (Number.isFinite(Number(b.avgRating)) ? Number(b.avgRating) : -1)
        : (getLunaRating(b) ?? -1);
      if (kb !== ka) return kb - ka;
      if (sort === "community") {
        const ca = Number(a.ratingsCount ?? 0); const cb = Number(b.ratingsCount ?? 0);
        if (cb !== ca) return cb - ca;
      }
      const fa = a.featuredRank ?? 999999; const fb = b.featuredRank ?? 999999;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), "fr");
    });
    return arr;
  }, [data, sort]);

  const watchlist = React.useMemo(() =>
    (data?.casinos ?? []).filter(c => c.watchLevel === "watch" || c.watchLevel === "avoid")
  , [data]);

  return (
    <main className="cm-page">
      <div className="cm-content">

        {/* En-tête compact */}
        <div className="cm-hero">
          <span className="cm-hero-kicker">Avis et transparence</span>
          <h1 className="cm-hero-title">CheckTaSlot</h1>
          <div className="cm-hero-sub">Notes LunaLive, avis communauté et alertes réunis.</div>
        </div>

        {/* Search */}
        <div className="cm-search-row">
          <span className="cm-search-icon" aria-hidden>🔍</span>
          <input
            className="cm-search-input"
            type="search" inputMode="search" autoComplete="off" spellCheck={false}
            placeholder="Chercher un casino…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Chercher un casino"
          />
          {q ? <button type="button" className="cm-search-clear" onClick={() => setQ("")} aria-label="Effacer">✕</button> : null}
        </div>

        {/* Sort segmented */}
        <div className="cm-seg" role="tablist" aria-label="Tri">
          <button type="button" role="tab" aria-selected={sort === "luna"}
            className={`cm-seg-btn${sort === "luna" ? " active" : ""}`}
            onClick={() => setSort("luna")}>Top LunaLive</button>
          <button type="button" role="tab" aria-selected={sort === "community"}
            className={`cm-seg-btn${sort === "community" ? " active" : ""}`}
            onClick={() => setSort("community")}>Top Communauté</button>
          <button type="button" role="tab" aria-selected={sort === "newest"}
            className={`cm-seg-btn${sort === "newest" ? " active" : ""}`}
            onClick={() => setSort("newest")}>Récents</button>
        </div>

        {/* Error */}
        {err ? (
          <div className="cm-empty" style={{ color: "rgba(252,165,165,.85)", borderColor: "rgba(239,68,68,.30)" }}>
            ⚠ Erreur de chargement : {err}
          </div>
        ) : null}

        {/* Podium (uniquement quand pas de search) */}
        {!q.trim() && podium.length > 0 ? (
          <>
            <div className="cm-sec-head">
              <h2 className="cm-sec-title">Podium LunaLive</h2>
              <span className="cm-sec-hint">Top 3</span>
            </div>
            <div className="cm-podium">
              {podium.map((c, i) => <PodiumCard key={c.id} c={c} rank={(i + 1) as 1 | 2 | 3} />)}
            </div>
          </>
        ) : null}

        {/* Watchlist */}
        {!q.trim() && watchlist.length > 0 ? (
          <>
            <div className="cm-sec-head">
              <h2 className="cm-sec-title">À surveiller</h2>
              <span className="cm-sec-hint">{watchlist.length}</span>
            </div>
            <div className="cm-list">
              {watchlist.map(c => <CasinoCard key={c.id} c={c} />)}
            </div>
          </>
        ) : null}

        {/* All casinos */}
        <div className="cm-sec-head">
          <h2 className="cm-sec-title">{q.trim() ? "Résultats" : "Tous les casinos"}</h2>
          <span className="cm-sec-hint">{sortedAll.length}</span>
        </div>
        {loading && !data ? (
          <div className="cm-list">
            {[0,1,2,3,4].map(i => <div key={i} className="cm-skel" style={{ animationDelay: `${i * 100}ms` }} />)}
          </div>
        ) : sortedAll.length === 0 ? (
          <div className="cm-empty">{q.trim() ? `Aucun casino trouvé pour « ${q} »` : "Aucun casino disponible."}</div>
        ) : (
          <div className="cm-list">
            {sortedAll.map(c => <CasinoCard key={c.id} c={c} />)}
          </div>
        )}

      </div>
    </main>
  );
}
