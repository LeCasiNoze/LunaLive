// web/src/pages/streamer/tabs/ClipsTab.tsx
// Purple Velvet
import * as React from "react";
import Hls from "hls.js";
import { deleteStreamerClip, getStreamerClips, toggleClipLike, type ApiClip } from "../../../lib/api_streamer_clips";

const whiteStroke = { color:"#fff", textShadow:`-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000` };
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
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');
.clip-root { font-family:'Syne',system-ui,sans-serif; }
.clip-title { font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:16px; letter-spacing:-.2px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa 55%,#5b8ef8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.clip-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; align-items:start; margin-top:12px; }
.clip-card {
  padding:10px; border-radius:16px; text-align:left; cursor:pointer;
  background:rgba(124,92,252,.05); border:1px solid rgba(124,92,252,.10);
  transition:border-color 140ms, background 140ms;
}
.clip-card:hover { border-color:rgba(124,92,252,.24); background:rgba(124,92,252,.09); }
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
      <span className="clip-title">Clips</span>
      <div style={{ marginTop:6, fontSize:12, color:"rgba(167,139,250,.60)" }}>Clips du stream (lecture en popup). Tri par date ou popularité.</div>
      <div style={{ marginTop:10, display:"flex", gap:10, flexWrap:"wrap" }}>
        <button type="button" className={sort === "recent" ? "btnPrimarySmall" : "btnGhostSmall"} disabled={loading} onClick={() => setSort("recent")}>Récents</button>
        <button type="button" className={sort === "top" ? "btnPrimarySmall" : "btnGhostSmall"} disabled={loading} onClick={() => setSort("top")}>Populaires</button>
        <button type="button" className="btnGhostSmall" disabled={loading} onClick={() => loadMore(true)}>Reset</button>
      </div>
      {error ? <div style={{ marginTop:10, fontSize:12, color:"rgba(252,165,165,.90)" }}>{error}</div> : null}
      {loading ? <div style={{ marginTop:10, fontSize:13, color:"rgba(196,181,253,.65)" }}>Chargement…</div> : null}
      {showEmpty ? <div style={{ marginTop:10, fontSize:13, color:"rgba(167,139,250,.60)" }}>Aucun clip pour l'instant.</div> : null}
      {clips.length ? (
        <div className="clip-grid">
          {clips.map(c => (
            <button key={c.id} type="button" className="clip-card" onClick={() => setOpenClip(c)}>
              <div style={{ borderRadius:14, overflow:"hidden", border:"1px solid rgba(124,92,252,.14)", background:"rgba(0,0,0,.35)", aspectRatio:"16/9", position:"relative" }}>
                {c.thumbUrl ? <img src={c.thumbUrl} alt="" loading="lazy" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} /> : null}
                <div style={{ position:"absolute", left:10, bottom:10, padding:"6px 10px", borderRadius:10, background:"rgba(0,0,0,.45)", fontWeight:800, ...whiteStroke }}>
                  {fmtDuration(c.durationSec)}
                </div>
                <div style={{ position:"absolute", right:10, bottom:10, padding:"6px 10px", borderRadius:10, background:"rgba(0,0,0,.45)", fontWeight:800, ...whiteStroke, display:"inline-flex", gap:6, alignItems:"center" }} title="Likes">
                  ❤️ {Number(c.likesCount || 0)}
                </div>
              </div>
              <div style={{ marginTop:10, fontWeight:800, lineHeight:1.25, fontSize:14, ...whiteStroke }}>{c.title || "(sans titre)"}</div>
              <div style={{ marginTop:6, fontSize:11, color:"rgba(167,139,250,.60)" }}>{timeAgo(c.createdAtMs)}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap" }}>
        {hasNext ? <button type="button" className="btnPrimarySmall" disabled={loading} onClick={() => loadMore(false)}>{loading ? "…" : "Charger plus"}</button> : null}
      </div>
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

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const clipUrl = String((clip as any).clipUrl || "").trim();
    if (clipUrl) {
      video.src = clipUrl;
      const onMeta = () => { video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", onMeta);
      return () => { video.removeEventListener("loadedmetadata", onMeta); video.pause(); video.removeAttribute("src"); video.load(); };
    }
    const url = clip.vodUrl;
    if (!url) return;
    let hls: Hls | null = null;
    const seekTo = Math.max(0, Math.floor(clip.startSec || 0));
    const trySeek = () => { try { if (Number.isFinite(seekTo) && seekTo > 0) video.currentTime = seekTo; } catch {} };
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      const onMeta = () => { trySeek(); video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", onMeta);
      return () => { video.removeEventListener("loadedmetadata", onMeta); video.pause(); video.removeAttribute("src"); video.load(); };
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
      return () => { video.removeEventListener("loadedmetadata", onMeta); };
    }
    return () => { try { hls?.destroy(); } catch {} if (video) { video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [clip]);

  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex:80 }}>
      <div className="chatSheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth:980 }}>
        <div className="chatSheetTop" style={{ gap:10 }}>
          <div style={{ fontWeight:800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Syne',system-ui,sans-serif" }}>{clip.title || "Clip"}</div>
          <div style={{ display:"inline-flex", gap:8, alignItems:"center" }}>
            <button type="button" className="btnGhostSmall" onClick={() => { if (!token) return onRequireLogin(); onToggleLike(); }} disabled={busy} title={!token ? "Connecte-toi pour liker" : "Like"}
              style={{ display:"inline-flex", alignItems:"center", gap:8, fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
              <span>{clip.myLiked ? "❤️" : "🤍"}</span><span>{Number(clip.likesCount || 0)}</span>
            </button>
            {isOwner ? (
              <button type="button" className="btnGhostSmall" onClick={onDelete} disabled={busy}
                style={{ background:"rgba(255,70,70,.14)", border:"1px solid rgba(255,70,70,.28)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }} title="Supprimer le clip">
                {busy ? "…" : "Supprimer"}
              </button>
            ) : null}
            <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">✕</button>
          </div>
        </div>
        <div className="chatSheetBody" style={{ padding:14 }}>
          {!(clip as any).clipUrl && !clip.vodUrl ? (
            <div style={{ fontSize:12, color:"rgba(167,139,250,.60)" }}>Vidéo indisponible (VOD pas prête).</div>
          ) : (
            <video ref={videoRef} controls playsInline style={{ width:"100%", borderRadius:16, background:"black", border:"1px solid rgba(124,92,252,.14)" }} />
          )}
          <div style={{ marginTop:10, fontSize:11, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>
            Durée: <strong style={{ color:"rgba(235,232,255,.88)" }}>{fmtDuration(clip.durationSec)}</strong> • Publié: <strong style={{ color:"rgba(235,232,255,.88)" }}>{timeAgo(clip.createdAtMs)}</strong> • Source: <strong style={{ color:"rgba(235,232,255,.88)" }}>{(clip as any).clipUrl ? "MP4" : "VOD"}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}