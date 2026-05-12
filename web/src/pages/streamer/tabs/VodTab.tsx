// web/src/pages/streamer/tabs/VodTab.tsx
// Purple Velvet
import * as React from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { getStreamerVods, type ApiVod } from "../../../lib/api_streamer_tabs";

// HLS proxy : Cloudflare Worker (offload Render, évite OOM sur Starter 512 MB).
const HLS_BASE = ((import.meta as any).env?.VITE_HLS_BASE ?? "https://lunalive-hls.lunalive.workers.dev").replace(/\/$/, "");
function toProxied(url: string): string {
  if (!url) return url;
  // Proxify les URLs Rumble via notre backend HLS (CF Worker via VITE_HLS_BASE,
  // fallback hardcodé sur le Worker pour ne jamais retomber sur Render).
  if (/rumble\.com|1a-1791\.com/i.test(url)) {
    return `${HLS_BASE}/hls?u=${encodeURIComponent(url)}`;
  }
  return url;
}

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

const VOD_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');
.vod-root { font-family:'Syne',system-ui,sans-serif; }
.vod-title { font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:16px; letter-spacing:-.2px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa 55%,#5b8ef8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.vod-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; align-items:start; margin-top:12px; }
.vod-card {
  padding:10px; border-radius:16px; text-align:left; cursor:pointer;
  background:rgba(124,92,252,.05); border:1px solid rgba(124,92,252,.10);
  transition:border-color 140ms, background 140ms;
}
.vod-card:hover { border-color:rgba(124,92,252,.24); background:rgba(124,92,252,.09); }
`;

export function VodTab({ slug }: { slug: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [vods, setVods] = React.useState<ApiVod[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasNext, setHasNext] = React.useState(false);
  const [openVod, setOpenVod] = React.useState<ApiVod | null>(null);

  async function loadMore(reset = false) {
    setLoading(true); setError(null);
    try {
      const r = await getStreamerVods(slug, reset ? null : cursor, 24);
      if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
      const list = Array.isArray(r.vods) ? r.vods : [];
      setVods(p => (reset ? list : [...p, ...list]));
      setCursor(r?.pageInfo?.endCursor ?? null);
      setHasNext(!!r?.pageInfo?.hasNextPage);
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { setVods([]); setCursor(null); setHasNext(false); setOpenVod(null); loadMore(true); /* eslint-disable-next-line */ }, [slug]);

  const showEmpty = !loading && !error && vods.length === 0;

  return (
    <div className="vod-root">
      <style>{VOD_STYLES}</style>
      <span className="vod-title">VOD</span>
      {error ? <div style={{ marginTop:10, fontSize:12, color:"rgba(252,165,165,.90)" }}>{error}</div> : null}
      {loading ? <div style={{ marginTop:10, fontSize:13, color:"rgba(196,181,253,.65)" }}>Chargement…</div> : null}
      {showEmpty ? (
        <div style={{ marginTop:10, fontSize:13, color:"rgba(167,139,250,.60)" }}>
          Aucune VOD trouvée (compte DLive non détecté, ou aucune rediff dispo).
        </div>
      ) : null}
      {vods.length ? (
        <div className="vod-grid">
          {vods.map(v => (
            <button key={v.permlink} type="button" className="vod-card" onClick={() => setOpenVod(v)}>
              <div style={{ borderRadius:14, overflow:"hidden", border:"1px solid rgba(124,92,252,.14)", background:"rgba(0,0,0,.35)", aspectRatio:"16/9", position:"relative" }}>
                {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} /> : null}
                <div style={{ position:"absolute", left:10, bottom:10, padding:"6px 10px", borderRadius:10, background:"rgba(0,0,0,.45)", fontWeight:800, ...whiteStroke }}>
                  {fmtDuration(v.lengthSec)}
                </div>
              </div>
              <div style={{ marginTop:10, fontWeight:800, lineHeight:1.25, fontSize:14, ...whiteStroke }}>{v.title || "(sans titre)"}</div>
              <div style={{ marginTop:6, fontSize:11, color:"rgba(167,139,250,.60)" }}>{timeAgo(v.createdAtMs)}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap" }}>
        <button type="button" className="btnGhostSmall" disabled={loading} onClick={() => loadMore(true)}>Reset</button>
        {hasNext ? <button type="button" className="btnPrimarySmall" disabled={loading} onClick={() => loadMore(false)}>{loading ? "…" : "Charger plus"}</button> : null}
      </div>
      {openVod ? <VodModal vod={openVod} onClose={() => setOpenVod(null)} /> : null}
    </div>
  );
}

function VodModal({ vod, onClose }: { vod: ApiVod; onClose: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = toProxied(vod.bestHlsUrl || "");
    if (!url) return;
    let hls: Hls | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
      return () => {};
    }
    if (Hls.isSupported()) {
      hls = new Hls({});
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
    } else {
      video.src = url;
    }
    return () => { try { hls?.destroy(); } catch {} if (video) { video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [vod]);

  return createPortal(
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position:"fixed", inset:0, zIndex:9999,
        background:"rgba(0,0,0,.85)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"clamp(8px,2vw,24px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true"
        style={{
          width:"min(1100px,100%)",
          maxHeight:"calc(100dvh - 24px)",
          display:"flex", flexDirection:"column",
          background:"rgba(17,10,23,.96)",
          border:"1px solid rgba(255,255,255,.12)",
          borderRadius:20,
          overflow:"hidden",
          boxShadow:"0 24px 80px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontWeight:800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'Syne',system-ui,sans-serif" }}>{vod.title || "VOD"}</div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">✕</button>
        </div>
        <div style={{ padding:14, background:"black" }}>
          {!vod.bestHlsUrl ? (
            <div style={{ fontSize:12, color:"rgba(167,139,250,.60)" }}>Aucune URL de lecture trouvée.</div>
          ) : (
            <video
              ref={videoRef}
              controls
              playsInline
              style={{ width:"100%", aspectRatio:"16/9", maxHeight:"calc(100dvh - 120px)", borderRadius:12, background:"black", display:"block" }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}