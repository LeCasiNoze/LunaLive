import * as React from "react";
import Hls from "hls.js";
import { getStreamerVods, type ApiVod } from "../../../lib/api_streamer_tabs";

const whiteStroke = {
  color: "#fff",
  textShadow: `
    -1px -1px 0 #000,
     1px -1px 0 #000,
    -1px  1px 0 #000,
     1px  1px 0 #000
  `,
};

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

export function VodTab({ slug }: { slug: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [vods, setVods] = React.useState<ApiVod[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasNext, setHasNext] = React.useState(false);

  const [openVod, setOpenVod] = React.useState<ApiVod | null>(null);

  async function loadMore(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const r = await getStreamerVods(slug, reset ? null : cursor, 24);
      // si tu as gardé tes logs:
      // console.log("[VodTab] api result:", r);

      if (!r?.ok) throw new Error(String(r?.error || "Erreur"));

      const list = Array.isArray(r.vods) ? r.vods : [];
      setVods((p) => (reset ? list : [...p, ...list]));
      setCursor(r?.pageInfo?.endCursor ?? null);
      setHasNext(!!r?.pageInfo?.hasNextPage);
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setVods([]);
    setCursor(null);
    setHasNext(false);
    setOpenVod(null);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const showEmpty = !loading && !error && vods.length === 0;

  return (
    <div>
      <div className="panelTitle">VOD</div>
      <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
        Replays DLive (lecture directe en popup, sans stockage).
      </div>

      {error ? (
        <div className="mutedSmall" style={{ marginTop: 10, color: "rgba(255,90,90,0.95)" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
          Chargement…
        </div>
      ) : null}

      {showEmpty ? (
        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
          Aucune VOD trouvée (compte DLive non détecté, ou aucune rediff dispo).
        </div>
      ) : null}

      {vods.length ? (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {vods.map((v) => (
            <button
              key={v.permlink}
              type="button"
              className="panel"
              onClick={() => setOpenVod(v)}
              style={{
                padding: 10,
                borderRadius: 16,
                textAlign: "left",
                cursor: "pointer",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.35)",
                  aspectRatio: "16 / 9",
                  position: "relative",
                }}
              >
                {v.thumbnailUrl ? (
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : null}

                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 10,
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.45)",
                    fontWeight: 900,
                    ...whiteStroke,
                  }}
                >
                  {fmtDuration(v.lengthSec)}
                </div>
              </div>

                <div
                  style={{
                    marginTop: 10,
                    fontWeight: 950,
                    lineHeight: 1.25,
                    fontSize: "0.95rem",
                    ...whiteStroke,
                  }}
                >
                  {v.title || "(sans titre)"}
                </div>
              <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.85 }}>
                {timeAgo(v.createdAtMs)}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btnGhostSmall" disabled={loading} onClick={() => loadMore(true)}>
          Reset
        </button>

        {hasNext ? (
          <button type="button" className="btnPrimarySmall" disabled={loading} onClick={() => loadMore(false)}>
            {loading ? "…" : "Charger plus"}
          </button>
        ) : null}
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

    const url = vod.bestHlsUrl;
    if (!url) return;

    let hls: Hls | null = null;

    // Safari iOS/macOS HLS natif
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
      return () => {};
    }

    if (Hls.isSupported()) {
      hls = new Hls({});
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = url;
    }

    return () => {
      try {
        hls?.destroy();
      } catch {}
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [vod]);

  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex: 80 }}>
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 980 }}
      >
        <div className="chatSheetTop">
          <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {vod.title || "VOD"}
          </div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="chatSheetBody" style={{ padding: 14 }}>
          {!vod.bestHlsUrl ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Aucune URL de lecture trouvée.
            </div>
          ) : (
            <video
              ref={videoRef}
              controls
              playsInline
              style={{
                width: "100%",
                borderRadius: 16,
                background: "black",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
