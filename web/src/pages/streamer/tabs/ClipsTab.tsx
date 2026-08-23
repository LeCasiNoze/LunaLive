// web/src/pages/streamer/tabs/ClipsTab.tsx
// Purple Velvet
import * as React from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { CalendarDays, Flame, Heart, Play, RefreshCw, Scissors, Trash2, X } from "lucide-react";
import { deleteStreamerClip, getStreamerClips, toggleClipLike, type ApiClip } from "../../../lib/api_streamer_clips";
import { trackFeatureEvent } from "../../../lib/feature_events";

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function timeAgo(ms: number) {
  const d = Date.now() - (ms || 0);
  const mins = Math.floor(d / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} j`;
}
type SortKey = "recent" | "top";

const CLIP_STYLES = `
.clip-root { font-family:'Manrope',sans-serif; color:#f4f0fc; }
.clip-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
.clip-heading { min-width:0; }
.clip-kicker { display:flex; align-items:center; gap:7px; color:#9388ab; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.clip-title { display:block; margin-top:5px; color:#f5f2ff; font-size:20px; font-weight:800; letter-spacing:-.045em; }
.clip-subtitle { margin-top:5px; color:#847b96; font-size:10px; font-weight:600; }
.clip-filters { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.clip-filter { min-height:36px; display:inline-flex; align-items:center; gap:6px; padding:8px 11px; border:1px solid rgba(167,139,250,.13); border-radius:11px; background:rgba(255,255,255,.027); color:#91889f; cursor:pointer; font:750 10px 'Manrope',sans-serif; }
.clip-filter:hover { border-color:rgba(167,139,250,.27); color:#d9d2e7; }
.clip-filter.active { border-color:rgba(167,139,250,.32); background:linear-gradient(135deg,rgba(139,92,246,.2),rgba(91,141,239,.07)); color:#f3effb; }
.clip-filter:disabled { opacity:.45; cursor:wait; }
.clip-state { min-height:150px; display:grid; place-items:center; padding:24px; border:1px dashed rgba(167,139,250,.14); border-radius:17px; color:#81788f; font-size:11px; text-align:center; }
.clip-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:14px; align-items:start; }
.clip-card { padding:0; overflow:hidden; border:1px solid rgba(167,139,250,.12); border-radius:17px; background:rgba(255,255,255,.024); color:inherit; text-align:left; cursor:pointer; transition:transform 160ms,border-color 160ms,background 160ms; }
.clip-card:hover { transform:translateY(-3px); border-color:rgba(167,139,250,.3); background:rgba(139,92,246,.06); }
.clip-thumb { position:relative; overflow:hidden; aspect-ratio:16/9; background:linear-gradient(145deg,#171126,#08060f); }
.clip-thumb img { width:100%; height:100%; display:block; object-fit:cover; transition:transform 260ms ease; }
.clip-card:hover .clip-thumb img { transform:scale(1.025); }
.clip-thumb::after { content:""; position:absolute; inset:0; background:linear-gradient(to top,rgba(3,2,9,.72),transparent 58%); pointer-events:none; }
.clip-play { position:absolute; left:50%; top:50%; z-index:2; width:42px; height:42px; display:grid; place-items:center; transform:translate(-50%,-50%); border:1px solid rgba(255,255,255,.24); border-radius:50%; background:rgba(9,6,18,.62); color:#fff; backdrop-filter:blur(8px); opacity:.86; }
.clip-duration,.clip-likes { position:absolute; bottom:9px; z-index:2; display:inline-flex; align-items:center; gap:5px; min-height:25px; padding:5px 8px; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:rgba(5,3,11,.72); color:#f7f4fd; font-size:9px; font-weight:800; backdrop-filter:blur(8px); }
.clip-duration { left:9px; }
.clip-likes { right:9px; }
.clip-card-body { padding:12px; }
.clip-card-title { overflow:hidden; color:#f0ecf8; font-size:12px; font-weight:750; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.clip-card-meta { display:flex; align-items:center; gap:6px; margin-top:7px; color:#776f85; font-size:9px; font-weight:650; }
.clip-more { margin-top:14px; display:flex; justify-content:center; }
.clip-viewer-backdrop { position:fixed; inset:0; z-index:100000; display:grid; place-items:center; padding:clamp(8px,2vw,24px); background:rgba(2,1,7,.92); animation:clip-modal-in 160ms ease both; }
.clip-viewer { width:min(1180px,100%); max-height:calc(100dvh - 16px); display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(196,181,253,.18); border-radius:22px; background:linear-gradient(155deg,rgba(21,15,37,.99),rgba(8,6,16,.99)); box-shadow:0 36px 120px rgba(0,0,0,.78); }
.clip-viewer-head { min-height:62px; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 14px 12px 18px; border-bottom:1px solid rgba(167,139,250,.11); }
.clip-viewer-heading { min-width:0; }
.clip-viewer-kicker { color:#8b819d; font-size:8px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.clip-viewer-title { margin-top:3px; overflow:hidden; color:#f5f2ff; font-size:13px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.clip-viewer-actions { display:flex; align-items:center; gap:7px; flex:0 0 auto; }
.clip-viewer-button { min-height:36px; display:inline-flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid rgba(167,139,250,.14); border-radius:11px; background:rgba(255,255,255,.04); color:#c9c1d7; cursor:pointer; font:750 9px 'Manrope',sans-serif; }
.clip-viewer-button.danger { border-color:rgba(248,113,113,.2); color:#f3a1aa; }
.clip-viewer-close { width:36px; padding:0; justify-content:center; }
.clip-viewer-stage { min-height:0; display:grid; place-items:center; padding:clamp(8px,1.5vw,18px); background:#020204; }
.clip-viewer-stage video { width:100%; max-height:calc(100dvh - 150px); display:block; aspect-ratio:16/9; border-radius:13px; background:#000; }
.clip-viewer-meta { display:flex; align-items:center; gap:14px; padding:10px 16px; border-top:1px solid rgba(167,139,250,.09); color:#7e758d; font-size:9px; font-weight:650; }
@keyframes clip-modal-in { from{opacity:0} to{opacity:1} }
@media(max-width:620px){
  .clip-header { align-items:flex-start; flex-direction:column; }
  .clip-filters { width:100%; justify-content:flex-start; }
  .clip-grid { grid-template-columns:1fr; }
  .clip-viewer-backdrop { padding:0; }
  .clip-viewer { height:100dvh; max-height:none; border:0; border-radius:0; }
  .clip-viewer-head { padding-top:calc(11px + env(safe-area-inset-top)); }
  .clip-viewer-button span { display:none; }
  .clip-viewer-stage { flex:1; }
  .clip-viewer-stage video { max-height:calc(100dvh - 130px); border-radius:8px; }
  .clip-viewer-meta { padding-bottom:calc(10px + env(safe-area-inset-bottom)); }
}
`;

export function ClipsTab({ slug, token, isOwner, onRequireLogin }: { slug: string; token: string | null; isOwner: boolean; onRequireLogin: () => void }) {
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [clips, setClips] = React.useState<ApiClip[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasNext, setHasNext] = React.useState(false);
  const [openClip, setOpenClip] = React.useState<ApiClip | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function loadMore(reset = false) {
    setLoading(true); setError(null);
    try {
      const r = await getStreamerClips(slug, reset ? null : cursor, 24, sort, token);
      if (!r?.ok) throw new Error(String((r as any)?.error || "Erreur"));
      const list = Array.isArray(r.clips) ? r.clips : [];
      setClips(p => (reset ? list : [...p, ...list]));
      setCursor(r?.pageInfo?.endCursor ?? null);
      setHasNext(!!r?.pageInfo?.hasNextPage);
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { setClips([]); setCursor(null); setHasNext(false); setOpenClip(null); loadMore(true); /* eslint-disable-next-line */ }, [slug, sort]);
  React.useEffect(() => {
    if (!token || !openClip) return;
    void trackFeatureEvent(token, { kind: "clip_open", subject: `${slug}|${openClip.id}` });
  }, [openClip, slug, token]);

  async function onToggleLike(c: ApiClip) {
    if (!token) return onRequireLogin();
    if (busyId) return;
    const nextLike = !c.myLiked;
    setBusyId(c.id);
    setClips(prev => prev.map(x => (x.id === c.id ? { ...x, myLiked: nextLike, likesCount: Math.max(0, Number(x.likesCount || 0) + (nextLike ? 1 : -1)) } : x)));
    try {
      const r = await toggleClipLike(c.id, nextLike, token);
      setClips(prev => prev.map(x => (x.id === c.id ? { ...x, myLiked: r.myLiked, likesCount: r.likesCount } : x)));
      if (openClip?.id === c.id) setOpenClip(p => (p ? { ...p, myLiked: r.myLiked, likesCount: r.likesCount } : p));
    } catch (e: any) {
      setClips(prev => prev.map(x => (x.id === c.id ? { ...x, myLiked: c.myLiked, likesCount: c.likesCount } : x)));
      setError(String(e?.message || "Erreur"));
    } finally { setBusyId(null); }
  }

  async function onDeleteClip(c: ApiClip) {
    if (!isOwner || !token || busyId) return;
    const ok = window.confirm("Supprimer ce clip ?");
    if (!ok) return;
    setBusyId(c.id); setError(null);
    try {
      await deleteStreamerClip(c.id, token);
      setClips(prev => prev.filter(x => x.id !== c.id));
      if (openClip?.id === c.id) setOpenClip(null);
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setBusyId(null); }
  }

  const showEmpty = !loading && !error && clips.length === 0;

  return (
    <div className="clip-root">
      <style>{CLIP_STYLES}</style>
      <header className="clip-header">
        <div className="clip-heading">
          <div className="clip-kicker"><Scissors size={13} /> Vidéothèque</div>
          <span className="clip-title">Clips de la chaîne</span>
          <div className="clip-subtitle">Les meilleurs moments, prêts à être regardés sans quitter le direct.</div>
        </div>
        <div className="clip-filters" aria-label="Trier les clips">
          <button type="button" className={`clip-filter${sort === "recent" ? " active" : ""}`} disabled={loading} onClick={() => setSort("recent")}><CalendarDays size={13} /> Récents</button>
          <button type="button" className={`clip-filter${sort === "top" ? " active" : ""}`} disabled={loading} onClick={() => setSort("top")}><Flame size={13} /> Populaires</button>
          <button type="button" className="clip-filter" disabled={loading} onClick={() => loadMore(true)} aria-label="Actualiser"><RefreshCw size={13} /></button>
        </div>
      </header>
      {error ? <div className="clip-state" role="alert">{error}</div> : null}
      {loading && !clips.length ? <div className="clip-state">Chargement des clips…</div> : null}
      {showEmpty ? <div className="clip-state">Aucun clip n’a encore été publié sur cette chaîne.</div> : null}
      {clips.length ? (
        <div className="clip-grid">
          {clips.map((clip) => (
            <button key={clip.id} type="button" className="clip-card" onClick={() => setOpenClip(clip)}>
              <div className="clip-thumb">
                {clip.thumbUrl ? <img src={clip.thumbUrl} alt="" loading="lazy" /> : null}
                <span className="clip-play"><Play size={18} fill="currentColor" /></span>
                <span className="clip-duration">{fmtDuration(clip.durationSec)}</span>
                <span className="clip-likes"><Heart size={11} fill="currentColor" /> {Number(clip.likesCount || 0)}</span>
              </div>
              <div className="clip-card-body">
                <div className="clip-card-title">{clip.title || "Clip sans titre"}</div>
                <div className="clip-card-meta"><CalendarDays size={11} /> Publié il y a {timeAgo(clip.createdAtMs)}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {hasNext ? (
        <div className="clip-more"><button type="button" className="clip-filter active" disabled={loading} onClick={() => loadMore(false)}>{loading ? "Chargement…" : "Afficher plus de clips"}</button></div>
      ) : null}
      {openClip ? (
        <ClipModal clip={openClip} token={token} isOwner={isOwner} busy={busyId === openClip.id} onRequireLogin={onRequireLogin} onClose={() => setOpenClip(null)} onToggleLike={() => onToggleLike(openClip)} onDelete={() => onDeleteClip(openClip)} />
      ) : null}
    </div>
  );
}

function ClipModal({ clip, token, isOwner, busy, onRequireLogin, onClose, onToggleLike, onDelete }: {
  clip: ApiClip; token: string | null; isOwner: boolean; busy: boolean;
  onRequireLogin: () => void; onClose: () => void; onToggleLike: () => void; onDelete: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Pause les autres vidéos (live player, autres clips) pendant que la modal
  // est ouverte. Évite la concurrence des décodeurs et libère le GPU pour
  // une lecture fluide du clip.
  React.useEffect(() => {
    const allVideos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
    const pausedByUs: HTMLVideoElement[] = [];
    for (const v of allVideos) {
      if (v === videoRef.current) continue;
      if (!v.paused) {
        try { v.pause(); pausedByUs.push(v); } catch {}
      }
    }
    return () => {
      // À la fermeture, on relance ce qu'on a mis en pause
      for (const v of pausedByUs) {
        try { v.play().catch(() => {}); } catch {}
      }
    };
  }, []);

  // IMPORTANT: ne dépendre QUE des champs qui définissent quelle vidéo charger.
  // Avant on dépendait de `clip` (objet entier) → chaque re-render parent (like, etc.)
  // changeait la référence → useEffect cleanup → video.src reset → reload + stutter.
  const clipId = clip.id;
  const clipUrl = String((clip as any).clipUrl || "").trim();
  const vodUrl = clip.vodUrl || "";
  const seekToStr = String(clip.startSec || 0);
  const durationStr = String(clip.durationSec || 0);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (clipUrl) {
      video.src = clipUrl;
      const onMeta = () => { video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", onMeta);
      return () => { video.removeEventListener("loadedmetadata", onMeta); video.pause(); video.removeAttribute("src"); video.load(); };
    }
    const url = vodUrl;
    if (!url) return;
    let hls: Hls | null = null;
    const seekTo = Math.max(0, Math.floor(Number(seekToStr) || 0));
    const clipEnd = seekTo + Math.max(1, Number(durationStr) || 0);
    const keepInsideClip = () => {
      try {
        if (video.currentTime < seekTo - 0.25) video.currentTime = seekTo;
        if (video.currentTime >= clipEnd - 0.25) {
          video.pause();
          video.currentTime = clipEnd - 0.25;
        }
      } catch {}
    };
    video.addEventListener("timeupdate", keepInsideClip);
    video.addEventListener("seeking", keepInsideClip);
    const trySeek = () => { try { if (Number.isFinite(seekTo) && seekTo > 0) video.currentTime = seekTo; } catch {} };
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      const onMeta = () => { trySeek(); video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", onMeta);
      return () => { video.removeEventListener("loadedmetadata", onMeta); video.removeEventListener("timeupdate", keepInsideClip); video.removeEventListener("seeking", keepInsideClip); video.pause(); video.removeAttribute("src"); video.load(); };
    }
    if (Hls.isSupported()) {
      hls = new Hls({});
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { trySeek(); video.play().catch(() => {}); });
    } else {
      video.src = url;
      const onMeta = () => { trySeek(); video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", onMeta);
      return () => { video.removeEventListener("loadedmetadata", onMeta); video.removeEventListener("timeupdate", keepInsideClip); video.removeEventListener("seeking", keepInsideClip); };
    }
    return () => { try { hls?.destroy(); } catch {} if (video) { video.removeEventListener("timeupdate", keepInsideClip); video.removeEventListener("seeking", keepInsideClip); video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [clipId, clipUrl, vodUrl, seekToStr, durationStr]);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="clip-viewer-backdrop" onClick={onClose} role="presentation">
      <section className="clip-viewer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={clip.title || "Clip"}>
        <header className="clip-viewer-head">
          <div className="clip-viewer-heading">
            <div className="clip-viewer-kicker">Lecture du clip</div>
            <div className="clip-viewer-title">{clip.title || "Clip sans titre"}</div>
          </div>
          <div className="clip-viewer-actions">
            <button type="button" className="clip-viewer-button" onClick={() => { if (!token) return onRequireLogin(); onToggleLike(); }} disabled={busy} title={!token ? "Connecte-toi pour aimer" : "Aimer"}>
              <Heart size={14} fill={clip.myLiked ? "currentColor" : "none"} /><span>{Number(clip.likesCount || 0)} j’aime</span>
            </button>
            {isOwner ? <button type="button" className="clip-viewer-button danger" onClick={onDelete} disabled={busy} title="Supprimer le clip"><Trash2 size={14} /><span>{busy ? "Suppression…" : "Supprimer"}</span></button> : null}
            <button type="button" className="clip-viewer-button clip-viewer-close" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
          </div>
        </header>
        <div className="clip-viewer-stage">
          {!(clip as any).clipUrl && !clip.vodUrl ? (
            <div className="clip-state">La vidéo de ce clip n’est pas encore disponible.</div>
          ) : (
            <video ref={videoRef} controls playsInline />
          )}
        </div>
        <footer className="clip-viewer-meta">
          <span>Durée : <strong>{fmtDuration(clip.durationSec)}</strong></span>
          <span>Publié il y a <strong>{timeAgo(clip.createdAtMs)}</strong></span>
          <span>Source : <strong>{(clip as any).clipUrl ? "Clip MP4" : "VOD"}</strong></span>
        </footer>
      </section>
    </div>,
    document.body
  );
}
