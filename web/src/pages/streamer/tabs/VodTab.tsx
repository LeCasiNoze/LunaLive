// web/src/pages/streamer/tabs/VodTab.tsx
// Purple Velvet
import * as React from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { CalendarDays, Clock3, Film, Play, RefreshCw, X } from "lucide-react";
import { getStreamerVodPlayback, getStreamerVods, type ApiVod } from "../../../lib/api_streamer_tabs";

// HLS proxy : toujours via Cloudflare Worker (Render Starter 512 MB OOM).
const HLS_WORKER_URL = "https://lunalive-hls.lunalive.workers.dev";
const _envHls = ((import.meta as any).env?.VITE_HLS_BASE as string | undefined);
const HLS_BASE = (_envHls && _envHls.length > 0 ? _envHls : HLS_WORKER_URL).replace(/\/$/, "");
function toProxied(url: string): string {
  if (!url) return url;
  if (/1a-1791\.com/i.test(url)) return url;
  // Proxify les URLs Rumble via notre backend HLS (CF Worker via VITE_HLS_BASE,
  // fallback hardcodé sur le Worker pour ne jamais retomber sur Render).
  if (/rumble\.com/i.test(url)) {
    return `${HLS_BASE}/hls?u=${encodeURIComponent(url)}`;
  }
  return url;
}

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
.vod-root { font-family:'Manrope',sans-serif; color:#f4f0fc; }
.vod-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
.vod-kicker { display:flex; align-items:center; gap:7px; color:#9388ab; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.vod-title { display:block; margin-top:5px; color:#f5f2ff; font-size:20px; font-weight:800; letter-spacing:-.045em; }
.vod-subtitle { margin-top:5px; color:#847b96; font-size:10px; font-weight:600; }
.vod-refresh { width:38px; height:38px; display:grid; place-items:center; border:1px solid rgba(167,139,250,.14); border-radius:11px; background:rgba(255,255,255,.03); color:#9b91ac; cursor:pointer; }
.vod-refresh:hover { border-color:rgba(167,139,250,.3); color:#e4ddf0; }
.vod-refresh:disabled { opacity:.45; cursor:wait; }
.vod-state { min-height:150px; display:grid; place-items:center; padding:24px; border:1px dashed rgba(167,139,250,.14); border-radius:17px; color:#81788f; font-size:11px; text-align:center; }
.vod-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:14px; align-items:start; }
.vod-card { padding:0; overflow:hidden; border:1px solid rgba(167,139,250,.12); border-radius:17px; background:rgba(255,255,255,.024); color:inherit; text-align:left; cursor:pointer; transition:transform 160ms,border-color 160ms,background 160ms; }
.vod-card:hover { transform:translateY(-3px); border-color:rgba(167,139,250,.3); background:rgba(139,92,246,.06); }
.vod-thumb { position:relative; overflow:hidden; aspect-ratio:16/9; background:linear-gradient(145deg,#171126,#08060f); }
.vod-thumb img { width:100%; height:100%; display:block; object-fit:cover; transition:transform 260ms ease; }
.vod-card:hover .vod-thumb img { transform:scale(1.025); }
.vod-thumb::after { content:""; position:absolute; inset:0; background:linear-gradient(to top,rgba(3,2,9,.75),transparent 58%); pointer-events:none; }
.vod-play { position:absolute; left:50%; top:50%; z-index:2; width:42px; height:42px; display:grid; place-items:center; transform:translate(-50%,-50%); border:1px solid rgba(255,255,255,.24); border-radius:50%; background:rgba(9,6,18,.62); color:#fff; backdrop-filter:blur(8px); }
.vod-duration { position:absolute; left:9px; bottom:9px; z-index:2; display:inline-flex; align-items:center; gap:5px; min-height:25px; padding:5px 8px; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:rgba(5,3,11,.72); color:#f7f4fd; font-size:9px; font-weight:800; }
.vod-card-body { padding:12px; }
.vod-card-title { overflow:hidden; color:#f0ecf8; font-size:12px; font-weight:750; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.vod-card-meta { display:flex; align-items:center; gap:6px; margin-top:7px; color:#776f85; font-size:9px; font-weight:650; }
.vod-more { margin-top:14px; display:flex; justify-content:center; }
.vod-more button { min-height:36px; padding:8px 13px; border:1px solid rgba(167,139,250,.3); border-radius:11px; background:rgba(139,92,246,.13); color:#e5def1; cursor:pointer; font:750 10px 'Manrope',sans-serif; }
.vod-viewer-backdrop { position:fixed; inset:0; z-index:100000; display:grid; place-items:center; padding:clamp(8px,2vw,24px); background:rgba(2,1,7,.92); }
.vod-viewer { width:min(1180px,100%); max-height:calc(100dvh - 16px); display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(196,181,253,.18); border-radius:22px; background:linear-gradient(155deg,rgba(21,15,37,.99),rgba(8,6,16,.99)); box-shadow:0 36px 120px rgba(0,0,0,.78); }
.vod-viewer-head { min-height:62px; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 14px 12px 18px; border-bottom:1px solid rgba(167,139,250,.11); }
.vod-viewer-kicker { color:#8b819d; font-size:8px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.vod-viewer-title { margin-top:3px; overflow:hidden; color:#f5f2ff; font-size:13px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.vod-viewer-close { width:36px; height:36px; display:grid; place-items:center; border:1px solid rgba(167,139,250,.14); border-radius:11px; background:rgba(255,255,255,.04); color:#c9c1d7; cursor:pointer; }
.vod-viewer-stage { min-height:0; display:grid; place-items:center; padding:clamp(8px,1.5vw,18px); background:#020204; }
.vod-viewer-stage video { width:100%; max-height:calc(100dvh - 130px); display:block; aspect-ratio:16/9; border-radius:13px; background:#000; }
.vod-viewer-state { width:100%; min-height:min(58dvh,560px); display:grid; place-items:center; padding:24px; color:#81788f; font-size:11px; font-weight:650; text-align:center; }
@media(max-width:620px){
  .vod-grid { grid-template-columns:1fr; }
  .vod-viewer-backdrop { padding:0; }
  .vod-viewer { height:100dvh; max-height:none; border:0; border-radius:0; }
  .vod-viewer-head { padding-top:calc(11px + env(safe-area-inset-top)); }
  .vod-viewer-stage { flex:1; }
  .vod-viewer-stage video { max-height:calc(100dvh - 90px); border-radius:8px; }
}
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
      <header className="vod-header">
        <div>
          <div className="vod-kicker"><Film size={13} /> Rediffusions</div>
          <span className="vod-title">Vidéos à la demande</span>
          <div className="vod-subtitle">Retrouve les précédents directs de la chaîne.</div>
        </div>
        <button type="button" className="vod-refresh" disabled={loading} onClick={() => loadMore(true)} aria-label="Actualiser les VOD"><RefreshCw size={14} /></button>
      </header>
      {error ? <div className="vod-state" role="alert">{error}</div> : null}
      {loading && !vods.length ? <div className="vod-state">Chargement des rediffusions…</div> : null}
      {showEmpty ? <div className="vod-state">Aucune rediffusion n’est disponible pour le moment.</div> : null}
      {vods.length ? (
        <div className="vod-grid">
          {vods.map((vod) => (
            <button key={vod.permlink} type="button" className="vod-card" onClick={() => setOpenVod(vod)}>
              <div className="vod-thumb">
                {vod.thumbnailUrl ? <img src={vod.thumbnailUrl} alt="" loading="lazy" /> : null}
                <span className="vod-play"><Play size={18} fill="currentColor" /></span>
                <span className="vod-duration"><Clock3 size={11} /> {fmtDuration(vod.lengthSec)}</span>
              </div>
              <div className="vod-card-body">
                <div className="vod-card-title">{vod.title || "Rediffusion sans titre"}</div>
                <div className="vod-card-meta"><CalendarDays size={11} /> Publiée il y a {timeAgo(vod.createdAtMs)}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {hasNext ? <div className="vod-more"><button type="button" disabled={loading} onClick={() => loadMore(false)}>{loading ? "Chargement…" : "Afficher plus de VOD"}</button></div> : null}
      {openVod ? <VodModal slug={slug} vod={openVod} onClose={() => setOpenVod(null)} /> : null}
    </div>
  );
}

function VodModal({ slug, vod, onClose }: { slug: string; vod: ApiVod; onClose: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [source, setSource] = React.useState<{ kind: "hls" | "mp4"; url: string } | null>(null);
  const [sourceLoading, setSourceLoading] = React.useState(true);
  const [sourceError, setSourceError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  React.useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceError(null);
    setSourceLoading(true);

    const resolve = async () => {
      try {
        if (vod.bestMp4Url) {
          if (!cancelled) setSource({ kind: "mp4", url: vod.bestMp4Url });
          return;
        }
        if (vod.bestHlsUrl && !vod.bestHlsUrl.includes("/live-hls-dvr/")) {
          if (!cancelled) setSource({ kind: "hls", url: vod.bestHlsUrl });
          return;
        }
        const result = await getStreamerVodPlayback(slug, vod.permlink);
        if (!result.ok || !result.url) throw new Error("source_unavailable");
        if (!cancelled) setSource({ kind: result.kind, url: result.url });
      } catch {
        if (!cancelled) setSourceError("Cette rediffusion n'est pas encore prête à être lue.");
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, [slug, vod]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    const url = source.kind === "hls" ? toProxied(source.url) : source.url;
    if (!url) return;
    let hls: Hls | null = null;
    if (source.kind === "mp4") {
      video.src = url;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls({});
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      video.src = url;
    }
    return () => { try { hls?.destroy(); } catch {} if (video) { video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [source]);

  return createPortal(
    <div className="vod-viewer-backdrop" onClick={onClose} role="presentation">
      <section
        className="vod-viewer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={vod.title || "Lecture de la rediffusion"}
      >
        <header className="vod-viewer-head">
          <div style={{ minWidth: 0 }}>
            <div className="vod-viewer-kicker">Rediffusion</div>
            <div className="vod-viewer-title">{vod.title || "Rediffusion sans titre"}</div>
          </div>
          <button className="vod-viewer-close" onClick={onClose} type="button" aria-label="Fermer le lecteur">
            <X size={17} />
          </button>
        </header>
        <div className="vod-viewer-stage">
          {sourceLoading ? <div className="vod-viewer-state">Préparation de la rediffusion…</div> : null}
          {sourceError ? <div className="vod-viewer-state">{sourceError}</div> : null}
          {source ? <video ref={videoRef} controls playsInline /> : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
