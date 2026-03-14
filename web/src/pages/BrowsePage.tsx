// web/src/pages/BrowsePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — Browse  |  Design : Purple Velvet × Casino Night
//  Syne 800 titres, tokens alignés sur le design system global
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link } from "react-router-dom";
import { getStreamers } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import { setSeo } from "../lib/seo";
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ─── utils ─────────────────────────────────────────────────────────── */
function norm(s: any) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  // ✅ Uniquement /avatars/u/... va sur API_BASE (comme le header)
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
}
function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}
function initialsOf(name: string) {
  return String(name || "?").trim().slice(0, 1).toUpperCase() || "?";
}
function pickAvatarUrl(s: any) {
  // Priorité 1: Avatar perso uploadé (déjà dans avatarUrl)
  // Priorité 2: Avatar par défaut (déjà dans avatarUrl depuis le backend)
  // Priorité 3: Fallback svgThumb si vraiment rien
  const avatarUrl = s?.avatarUrl ?? null;
  if (avatarUrl) {
    return absolutize(avatarUrl);
  }
  return svgThumb(s?.displayName || "Streamer");
}

/* ─── CSS ────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

/* ── Page shell ── */
.bp-page {
  position: relative; padding-bottom: 36px;
  color: rgba(235,232,255,.96);
  font-family: 'Syne', system-ui, sans-serif;
}

/* ── Contenu z-index ── */
.bp-wrap { position: relative; z-index: 1; }

/* ── Header hero ── */
.bp-hero {
  position: relative; overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(124,92,252,.20);
  background: rgba(11,9,22,.90);
  box-shadow: 0 24px 70px rgba(0,0,0,.50), 0 0 0 1px rgba(167,139,250,.06) inset;
  backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
  padding: 20px 22px 18px;
  margin-bottom: 14px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
}
.bp-hero::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.45) 40%,rgba(91,142,248,.35) 60%,transparent);
  pointer-events:none;
}
.bp-hero::after {
  content:""; position:absolute; top:-60px; left:-60px;
  width:300px; height:200px; border-radius:50%;
  background: radial-gradient(ellipse,rgba(124,92,252,.14),transparent 70%);
  pointer-events:none;
}

.bp-title {
  position: relative; z-index: 1;
  margin: 0;
  font-family: 'Syne', sans-serif; font-weight: 800;
  font-size: clamp(28px, 3.5vw, 42px);
  letter-spacing: -1.4px; line-height: 1;
  background: linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 16px rgba(124,92,252,.55)) drop-shadow(0 0 40px rgba(91,142,248,.22));
  animation: bp-shimmer 5s ease-in-out infinite;
}
@keyframes bp-shimmer {
  0%  { background-position:   0% 50%; }
  50% { background-position: 100% 50%; }
  100%{ background-position:   0% 50%; }
}
.bp-sub {
  position: relative; z-index: 1;
  margin-top: 6px; font-size: 12px; font-weight: 500;
  color: rgba(140,145,195,.55);
}

/* ── Pills ── */
.bp-pills { position:relative; z-index:1; display:flex; gap:8px; flex-wrap:wrap; }
.bp-pill {
  display:inline-flex; align-items:center; gap:6px;
  padding: 6px 12px; border-radius: 999px;
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:700;
  letter-spacing:-.05px; white-space:nowrap;
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
}
.bp-pill-live    { background:rgba(239,68,68,.14); border:1px solid rgba(239,68,68,.28); color:#fca5a5; }
.bp-pill-offline { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); color:rgba(180,185,230,.70); }
.bp-pill-total   { background:rgba(124,92,252,.12); border:1px solid rgba(124,92,252,.24); color:rgba(196,181,253,.85); }

/* ── Toolbar ── */
.bp-toolbar {
  position:relative; overflow:hidden;
  border-radius:18px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(11,9,22,.88);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  padding: 13px 14px;
  margin-bottom:16px;
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
}
.bp-toolbar::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.28) 45%,rgba(91,142,248,.20) 65%,transparent);
  pointer-events:none;
}

.bp-search {
  flex: 1 1 280px; display:flex; align-items:center; gap:9px;
  padding: 9px 13px; border-radius:13px;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  transition: border-color 150ms ease, background 150ms ease;
}
.bp-search:focus-within {
  border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.10);
  box-shadow: 0 0 0 3px rgba(124,92,252,.10);
}
.bp-search-icon { font-size:14px; opacity:.55; flex-shrink:0; }
.bp-search input {
  flex:1; background:transparent; border:none; outline:none;
  color:rgba(235,232,255,.94); font-family:'Syne',system-ui,sans-serif;
  font-size:13px; font-weight:500;
}
.bp-search input::placeholder { color:rgba(140,145,195,.45); }
.bp-clear {
  width:24px; height:24px; border-radius:8px; flex-shrink:0;
  border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.05);
  color:rgba(200,195,240,.60); cursor:pointer; display:grid; place-items:center; font-size:11px;
  transition:background 130ms ease;
}
.bp-clear:hover { background:rgba(124,92,252,.15); color:rgba(196,181,253,.90); }

.bp-select {
  padding: 9px 12px; border-radius:13px;
  border:1px solid rgba(124,92,252,.16); background:rgba(11,9,22,.90);
  color:rgba(200,195,240,.80); cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-size:12px; font-weight:700;
  outline:none; appearance:none; -webkit-appearance:none;
  padding-right:28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(167,139,250,0.6)'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center;
  transition: border-color 150ms ease;
}
.bp-select:focus { border-color:rgba(124,92,252,.36); }

.bp-refresh {
  height:38px; padding:0 16px; border-radius:13px;
  border:1px solid rgba(124,92,252,.28);
  background:linear-gradient(135deg,rgba(124,92,252,.22),rgba(59,77,200,.16),rgba(91,142,248,.12));
  color:rgba(235,232,255,.92); cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-size:12px; font-weight:700;
  transition: filter 150ms ease, transform 120ms ease; white-space:nowrap;
}
.bp-refresh:hover:not(:disabled)  { filter:brightness(1.12); }
.bp-refresh:active:not(:disabled) { transform:scale(.97); }
.bp-refresh:disabled               { opacity:.45; cursor:not-allowed; }

.bp-count {
  width:100%; margin-top:4px;
  font-size:11px; font-weight:500; color:rgba(140,145,195,.45);
}

/* ── Grid ── */
.bp-grid {
  display:grid; gap:12px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  align-items:start;
}

/* ── Stream card ── */
.bp-card-link { text-decoration:none; color:inherit; display:block; }
.bp-card {
  position:relative; overflow:hidden; border-radius:20px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(13,11,24,.86);
  box-shadow:0 14px 44px rgba(0,0,0,.40);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  transition: transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease, border-color 180ms ease;
  animation: bp-card-in 400ms cubic-bezier(.22,1,.36,1) both;
}
.bp-card:hover {
  transform:translateY(-3px) scale(1.005);
  box-shadow:0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(124,92,252,.36);
  border-color:rgba(124,92,252,.32);
}
.bp-card.is-live {
  border-color:rgba(239,68,68,.22);
  background:
    radial-gradient(500px 180px at 20% 0%, rgba(239,68,68,.08), transparent 60%),
    rgba(13,11,24,.88);
}
.bp-card.is-live:hover { border-color:rgba(239,68,68,.40); box-shadow:0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(239,68,68,.28); }

/* Reflet haut */
.bp-card::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.28) 45%,rgba(91,142,248,.20) 65%,transparent);
  pointer-events:none;
}

@keyframes bp-card-in {
  from { opacity:0; transform:translateY(14px) scale(.98); }
  to   { opacity:1; transform:translateY(0) scale(1); }
}

/* Thumbnail live */
.bp-thumb {
  position:relative; height:148px; overflow:hidden;
  border-radius:18px 18px 0 0; background:rgba(0,0,0,.35);
}
.bp-thumb::after {
  content:""; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.68) 100%),
             linear-gradient(135deg,rgba(124,92,252,.04),rgba(59,77,200,.04));
  pointer-events:none;
}
.bp-thumb-bg {
  position:absolute; inset:0;
  background-size:cover; background-position:center; background-repeat:no-repeat;
  opacity:.92; filter:contrast(1.06) saturate(1.18) brightness(1.02);
  transform:scale(1.04);
  transition: transform 400ms ease;
}
.bp-card:hover .bp-thumb-bg { transform:scale(1.0); }

/* Fallback bg (offline) */
.bp-thumb-fallback {
  position:absolute; inset:0;
  background:
    radial-gradient(600px 200px at 20% 0%, rgba(124,92,252,.18), transparent 60%),
    radial-gradient(500px 180px at 85% 20%, rgba(59,77,200,.14), transparent 58%),
    repeating-linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,.035) 1px, transparent 1px, transparent 9px);
  opacity:.80;
}

/* Badge LIVE / Offline */
.bp-thumb-badges {
  position:absolute; top:10px; left:10px; right:10px; z-index:3;
  display:flex; justify-content:space-between; align-items:center;
  pointer-events:none;
}
.bp-badge {
  display:inline-flex; align-items:center; gap:5px;
  padding: 4px 10px; border-radius:999px;
  font-family:'Syne',system-ui,sans-serif; font-size:10px; font-weight:700;
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  letter-spacing:.04em; white-space:nowrap;
}
.bp-badge-live { background:rgba(239,68,68,.18); border:1px solid rgba(239,68,68,.32); color:#fca5a5; }
.bp-badge-off  { background:rgba(0,0,0,.52); border:1px solid rgba(255,255,255,.12); color:rgba(180,185,230,.65); }
.bp-live-ping  {
  width:6px; height:6px; border-radius:999px;
  background:rgba(239,68,68,.95); display:inline-block;
  box-shadow:0 0 0 4px rgba(239,68,68,.20);
  animation:bp-ping 1.6s ease-in-out infinite;
}
@keyframes bp-ping {
  0%,100%{ box-shadow:0 0 0 4px rgba(239,68,68,.20); }
  50%    { box-shadow:0 0 0 7px rgba(239,68,68,.06); }
}

/* Card body */
.bp-card-body { padding:12px 14px 14px; position:relative; z-index:1; display:grid; gap:10px; }

.bp-card-row { display:flex; align-items:center; gap:11px; min-width:0; }

/* Avatar */
.bp-ava {
  width:42px; height:42px; border-radius:14px; flex-shrink:0;
  border:1px solid rgba(124,92,252,.22); background:rgba(0,0,0,.35);
  position:relative; overflow:hidden;
  display:grid; place-items:center;
  font-family:'Syne',sans-serif; font-size:15px; font-weight:800;
  color:rgba(196,181,253,.80);
  transition: border-color 150ms ease;
}
.bp-card:hover .bp-ava { border-color:rgba(124,92,252,.42); }
.bp-ava img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
.bp-card.is-live .bp-ava { border-color:rgba(239,68,68,.30); }

/* Infos texte */
.bp-card-info { min-width:0; flex:1; }
.bp-card-name {
  font-family:'Syne',sans-serif; font-weight:700; font-size:14px; letter-spacing:-.25px;
  color:rgba(235,232,255,.94);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.bp-card-title {
  font-size:11px; font-weight:500; color:rgba(167,155,220,.55);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  margin-top:3px;
}

/* Divider signature */
.bp-card-divider {
  height:1px; border-radius:999px;
  background:linear-gradient(90deg,rgba(124,92,252,0),rgba(124,92,252,.28),rgba(91,142,248,.18),rgba(91,142,248,0));
}
.bp-card.is-live .bp-card-divider {
  background:linear-gradient(90deg,rgba(239,68,68,0),rgba(239,68,68,.32),rgba(239,68,68,0));
}

/* Empty state */
.bp-empty {
  grid-column:1/-1; padding:32px; text-align:center;
  border-radius:18px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.04);
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:500;
  color:rgba(140,145,195,.50);
}

/* Loading skeleton */
.bp-skel {
  border-radius:20px; overflow:hidden;
  background:linear-gradient(90deg,rgba(255,255,255,.05) 0%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.05) 100%);
  background-size:200% 100%;
  animation:bp-skel 1.6s ease-in-out infinite;
}
@keyframes bp-skel { 0%{background-position:100% 50%} 100%{background-position:-100% 50%} }

/* Error */
.bp-err {
  padding:12px 16px; border-radius:14px;
  border:1px solid rgba(239,68,68,.28); background:rgba(239,68,68,.08);
  font-size:12px; font-weight:500; color:rgba(252,165,165,.85);
  margin-bottom:12px;
}
`;

let _bpCssInjected = false;
function useBrowseStyles() {
  React.useEffect(() => {
    if (_bpCssInjected) return;
    const el = document.createElement("style");
    el.id = "bp-css"; el.textContent = CSS;
    document.head.appendChild(el); _bpCssInjected = true;
  }, []);
}

/* ─── Types ─────────────────────────────────────────────────────────── */
type UiStreamer = {
  id: string; slug: string; displayName: string;
  title?: string | null; isLive: boolean;
  avatarUrl?: string | null; userId?: number | string | null;
  ownerUserId?: number | string | null;
  thumbUrl?: string | null; previewUrl?: string | null;
  thumb: string;
};

/* ─── Composant ─────────────────────────────────────────────────────── */
export default function BrowsePage() {
  useBrowseStyles();
  React.useEffect(() => {
    setSeo({
      title: "Browse — Tous les streamers | LunaLive",
      description: "Parcours tous les streamers LunaLive : lives en cours, profils offline et recherche de streamers casino.",
      path: "/browse",
    });
  }, []);
  const [items, setItems]         = React.useState<UiStreamer[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [err, setErr]             = React.useState<string | null>(null);
  const [q, setQ]                 = React.useState("");
  const [filter, setFilter]       = React.useState<"all" | "live" | "offline">("all");
  const [sort, setSort]           = React.useState<"liveFirst" | "alpha">("liveFirst");
  const inputRef                  = React.useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const nowMs = Date.now();
      const data  = await getStreamers();
      const mapped: UiStreamer[] = (data || []).map((s: any) => {
        const rawLiveThumb = absolutize(s.thumbUrl || s.thumb_url || s.previewUrl || s.preview_url || null) || null;
        const liveThumb    = rawLiveThumb ? withMinuteBust(String(rawLiveThumb), nowMs) : null;
        return {
          ...s,
          ownerUserId: s.ownerUserId ?? s.owner_user_id ?? null,
          userId:      s.userId      ?? s.user_id      ?? null,
          avatarUrl:   s.avatarUrl   ?? s.avatar_url   ?? null,
          thumb:       svgThumb(s.displayName),
          previewUrl:  liveThumb,
          thumbUrl:    s.thumbUrl    ?? s.thumb_url    ?? null,
        };
      });
      setItems(mapped);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); }, []);

  const stats = React.useMemo(() => {
    const live = items.filter(x => !!x.isLive).length;
    return { live, off: items.length - live, total: items.length };
  }, [items]);

  const filtered = React.useMemo(() => {
    const nq = norm(q);
    let list = items;
    if (filter === "live")    list = list.filter(x =>  x.isLive);
    if (filter === "offline") list = list.filter(x => !x.isLive);
    if (nq) list = list.filter(x =>
      norm(x.displayName).includes(nq) || norm(x.slug).includes(nq) || norm(x.title).includes(nq)
    );
    return [...list].sort((a, b) => {
      if (sort === "liveFirst" && a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return norm(a.displayName).localeCompare(norm(b.displayName), "fr");
    });
  }, [items, q, filter, sort]);

  return (
    <main className="container bp-page">
      <div className="bp-wrap">

        {/* ── Hero header ── */}
        <div className="bp-hero">
          <div>
            <h1 className="bp-title">Browse</h1>
            <div className="bp-sub">Tous les streamers de la commu casino</div>
          </div>
          <div className="bp-pills">
            <span className="bp-pill bp-pill-live">
              <span style={{ width:7, height:7, borderRadius:"50%", background:"rgba(239,68,68,.95)",
                boxShadow:"0 0 0 4px rgba(239,68,68,.18)", display:"inline-block" }} aria-hidden />
              Live <b>{stats.live}</b>
            </span>
            <span className="bp-pill bp-pill-offline">🌙 Offline <b>{stats.off}</b></span>
            <span className="bp-pill bp-pill-total">👥 <b>{stats.total}</b> streamers</span>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="bp-toolbar">
          {/* Search */}
          <div className="bp-search">
            <span className="bp-search-icon" aria-hidden>🔎</span>
            <input
              ref={inputRef} value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Rechercher un streamer…"
              aria-label="Rechercher un streamer"
            />
            {q && (
              <button type="button" className="bp-clear" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Effacer">✕</button>
            )}
          </div>

          {/* Filtre */}
          <select className="bp-select" value={filter} onChange={e => setFilter(e.target.value as any)} aria-label="Filtrer">
            <option value="all">Tous</option>
            <option value="live">Live uniquement</option>
            <option value="offline">Offline uniquement</option>
          </select>

          {/* Tri */}
          <select className="bp-select" value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Trier">
            <option value="liveFirst">Live d'abord</option>
            <option value="alpha">Alphabétique</option>
          </select>

          {/* Refresh */}
          <button className="bp-refresh" type="button" onClick={load} disabled={loading}>
            {loading ? "…" : "↻ Rafraîchir"}
          </button>

          {/* Count */}
          {!loading && (
            <div className="bp-count">
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
              {q && ` pour « ${q} »`}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {err && <div className="bp-err">⚠️ {err}</div>}

        {/* ── Grid ── */}
        <section className="bp-grid" aria-label="Liste des streamers">

          {/* Skeletons */}
          {loading && Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bp-skel" style={{ height: 220, animationDelay: `${i * 80}ms` }} />
          ))}

          {/* Cards */}
          {!loading && !err && filtered.map((s, idx) => {
            const avatar  = pickAvatarUrl(s);
            const initial = initialsOf(s.displayName);
            const media   = s.isLive ? s.previewUrl : null;
            const title   = s.title ? String(s.title).trim() : (s.isLive ? "Live en cours" : "Hors ligne");

            return (
              <Link
                key={s.id}
                to={`/s/${s.slug}`}
                className="bp-card-link"
                aria-label={`Voir ${s.displayName}${s.isLive ? " (en direct)" : ""}`}
              >
                <div
                  className={`bp-card${s.isLive ? " is-live" : ""}`}
                  style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
                >
                  {/* Thumbnail */}
                  <div className="bp-thumb">
                    {media
                      ? <div className="bp-thumb-bg" style={{ backgroundImage: `url(${media})` }} aria-hidden />
                      : <div className="bp-thumb-fallback" aria-hidden />
                    }
                    <div className="bp-thumb-badges">
                      {s.isLive ? (
                        <span className="bp-badge bp-badge-live">
                          <span className="bp-live-ping" aria-hidden />LIVE
                        </span>
                      ) : (
                        <span className="bp-badge bp-badge-off">🌙 Offline</span>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="bp-card-body">
                    <div className="bp-card-row">
                      {/* Avatar */}
                      <div className="bp-ava" aria-hidden>
                        {avatar ? (
                          <img
                            src={avatar} alt=""
                            onLoad={() => console.log(`Browse - Avatar OK pour ${s.displayName}:`, avatar)}
                            onError={e => { 
                              console.log(`Browse - Avatar ERREUR pour ${s.displayName}:`, avatar);
                              // Si l'avatar par défaut ne charge pas, utiliser svgThumb
                              if (avatar.includes('/avatars/u/')) {
                                const fallbackSvg = svgThumb(s.displayName);
                                (e.currentTarget as HTMLImageElement).src = fallbackSvg;
                              }
                            }}
                          />
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>

                      {/* Infos */}
                      <div className="bp-card-info">
                        <div className="bp-card-name" title={s.displayName}>{s.displayName}</div>
                        <div className="bp-card-title" title={title}>{title}</div>
                      </div>
                    </div>

                    {/* Divider signature */}
                    <div className="bp-card-divider" aria-hidden />
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Empty */}
          {!loading && !err && filtered.length === 0 && (
            <div className="bp-empty">
              Aucun streamer ne correspond à ta recherche.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}