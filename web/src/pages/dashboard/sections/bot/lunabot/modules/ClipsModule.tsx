// web/src/pages/dashboard/sections/bot/modules/ClipsModule.tsx
import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type ClipItem = {
  id: number;
  streamer_id: number;
  title: string | null;
  author: string | null;
  at_sec: number;
  pre_sec: number;
  post_sec: number;
  created_ts: number;

  vod_url: string | null;
  vod_permlink: string | null;
  vod_created_ts: number | null;

  vod_link: string | null;
  timecode_str: string;

  mp4_key?: string | null;
  mp4_url?: string | null;
  mp4_ready_ts?: number | null;
  mp4_size?: number | null;
  mp4_error?: string | null;
  mp4_rendering?: boolean;
};

type DlState = {
  status?: "idle" | "starting" | "running" | "done" | "error" | "not_ready";
  error?: string | null;
  message?: string | null;
  job?: string;
  percent?: number;
  publicUrl?: string | null;
};

type DlMap = Record<number, DlState>;

function buildDliveVodPage(permlink: string, atSec: number) {
  const p = encodeURIComponent(permlink);
  const t = Math.max(0, Math.floor(atSec || 0));
  return `https://dlive.tv/p/${p}?t=${t}s`;
}

async function apiJson<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const r = await fetch(fullUrl, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": (init?.headers as any)?.["Content-Type"] || "application/json",
    },
  });

  const text = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`bad_json_${r.status}`);
  }

  if (!r.ok || (j && j.ok === false)) {
    const reason = (j && (j.reason || j.error)) || `http_${r.status}`;
    throw new Error(String(reason));
  }

  return j as T;
}

/**
 * SSE via fetch streaming (EventSource ne supporte pas Authorization)
 * On lit "event: tick" + "data: {...}"
 */
async function consumeSseTicks(
  token: string,
  url: string,
  onTick: (payload: any) => void,
  signal: AbortSignal
) {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const r = await fetch(fullUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    signal,
  });

  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    throw new Error(`sse_${r.status}${txt ? `:${txt.slice(0, 80)}` : ""}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder("utf-8");

  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += dec.decode(value, { stream: true });

    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      let eventName = "";
      let dataLine = "";

      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }

      if (eventName === "tick" && dataLine) {
        try {
          const payload = JSON.parse(dataLine);
          onTick(payload);
        } catch {}
      }

      idx = buf.indexOf("\n\n");
    }
  }
}

function openMp4ViaApi(clipId: number) {
  // ✅ IMPORTANT: on passe par l'API (même origin que le site), qui redirect vers R2
  // => pas de blob, pas de CORS, téléchargement natif
  window.open(`${API_BASE}/clips/${clipId}/mp4`, "_blank", "noopener,noreferrer");
}

function clipMp4Url(clipId: number) {
  // ✅ utilisé pour <video> (pas besoin d'Authorization)
  return `${API_BASE}/clips/${clipId}/mp4`;
}

function copyText(text: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ClipViewerModal({
  clip,
  onClose,
}: {
  clip: ClipItem;
  onClose: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mp4Ready = !!String(clip.mp4_key || "").trim();
    const mp4 = mp4Ready ? clipMp4Url(clip.id) : null;
    const hlsUrl = clip.vod_url ? String(clip.vod_url) : null;

    // fenêtre clip
    const start = Math.max(0, Math.floor((clip.at_sec || 0) - (clip.pre_sec || 105)));
    const duration = Math.max(1, Math.floor((clip.pre_sec || 105) + (clip.post_sec || 15)));
    const end = start + duration;
    const EPS = 0.25;

    let hls: Hls | null = null;

    const cleanup = () => {
      try {
        video.pause();
      } catch {}
      try {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("seeking", onSeeking);
        video.removeEventListener("loadedmetadata", onLoadedMeta);
      } catch {}
      try {
        hls?.destroy();
      } catch {}
      hls = null;
      try {
        video.removeAttribute("src");
        video.load();
      } catch {}
    };

    const onTimeUpdate = () => {
      try {
        if (video.currentTime >= end - EPS) {
          video.pause();
          video.currentTime = end - EPS;
        }
      } catch {}
    };

    const onSeeking = () => {
      try {
        if (video.currentTime < start - EPS) video.currentTime = start;
        if (video.currentTime > end - EPS) video.currentTime = end - EPS;
      } catch {}
    };

    const onLoadedMeta = () => {
      try {
        // si HLS fallback, on se place sur le start
        if (!mp4) video.currentTime = start;
      } catch {}
      video.play().catch(() => {});
    };

    // IMPORTANT: éviter de précharger trop
    video.preload = "metadata";

    // ✅ MP4 ready -> lecture directe
    if (mp4) {
      video.src = mp4;
      video.addEventListener("loadedmetadata", onLoadedMeta);
      return () => cleanup();
    }

    // ✅ fallback HLS (si VOD dispo)
    if (!hlsUrl) return () => cleanup();

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);

    // Safari iOS/macOS HLS natif
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("loadedmetadata", onLoadedMeta);
      return () => cleanup();
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        autoStartLoad: false,
        startPosition: start,
        maxBufferLength: 30,
        backBufferLength: 0,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        try {
          hls?.startLoad(start);
        } catch {}
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        try {
          video.currentTime = start;
        } catch {}
        video.play().catch(() => {});
      });

      return () => cleanup();
    }

    // fallback basique
    video.src = hlsUrl;
    video.addEventListener("loadedmetadata", onLoadedMeta);
    return () => cleanup();
  }, [clip]);

  const mp4Ready = !!String(clip.mp4_key || "").trim();
  const duration = Math.max(1, Math.floor((clip.pre_sec || 105) + (clip.post_sec || 15)));

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "rgba(0,0,0,0.62)",
        display: "grid",
        placeItems: "center",
        padding: 18,
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(980px, 100%)",
          maxHeight: "min(92vh, 860px)",
          overflow: "hidden",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(30,30,40,0.85), rgba(10,10,14,0.92))",
          boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 1100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clip.title || "Clip"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>
                Durée: <b style={{ opacity: 0.95 }}>{fmtDuration(duration)}</b>
              </span>
              <span style={{ opacity: 0.7 }}>•</span>
              <span>{mp4Ready ? "MP4" : clip.vod_url ? "HLS (fallback VOD)" : "Indisponible"}</span>
              {clip.author ? (
                <>
                  <span style={{ opacity: 0.7 }}>•</span>
                  <span>
                    par <b style={{ opacity: 0.95 }}>@{clip.author}</b>
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.92)",
              cursor: "pointer",
              fontWeight: 1100,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 14, overflow: "auto", maxHeight: "calc(92vh - 60px)" }}>
          {!mp4Ready && !clip.vod_url ? (
            <div style={{ fontSize: 12, opacity: 0.85 }}>Vidéo indisponible (VOD pas prête).</div>
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

export function ClipsModule({ token, onReload }: { token: string; onReload?: () => void }) {
  const [items, setItems] = React.useState<ClipItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [dl, setDl] = React.useState<DlMap>({});

  // ✅ NEW: viewer modal
  const [openClip, setOpenClip] = React.useState<ClipItem | null>(null);

  const missingVod = React.useMemo(() => items.some((c) => !c.vod_url), [items]);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const j = await apiJson<{ ok: true; items: ClipItem[] }>(token, "/me/bot/clips/list?limit=200", { method: "GET" });
      setItems(Array.isArray(j.items) ? j.items : []);
      onReload?.();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  React.useEffect(() => {
    if (!missingVod) return;
    const it = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingVod, token]);

  async function handleDelete(id: number) {
    try {
      await apiJson(token, "/me/bot/clips/delete", { method: "POST", body: JSON.stringify({ id }) });
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || "delete_failed"));
    }
  }

  async function handleRenderAndDownload(clip: ClipItem) {
    const cid = clip.id;
    const cur = dl[cid];
    if (cur?.status === "starting" || cur?.status === "running") return;

    // déjà prêt => open direct
    const mp4Key = String(clip.mp4_key || "").trim();
    if (mp4Key) {
      openMp4ViaApi(cid);
      return;
    }

    setDl((m) => ({
      ...m,
      [cid]: { status: "starting", error: null, message: "Démarrage…", percent: 2, publicUrl: null },
    }));

    try {
      const start = await apiJson<any>(token, "/me/bot/clips/download/start", {
        method: "POST",
        body: JSON.stringify({ id: cid }),
      });

      if (start?.already) {
        setDl((m) => ({ ...m, [cid]: { status: "done", percent: 100, message: "Prêt ✓" } }));
        openMp4ViaApi(cid);
        await refresh();
        return;
      }

      const job = String(start?.job || "");
      if (!job) throw new Error("job_missing");

      setDl((m) => ({
        ...m,
        [cid]: { ...(m[cid] || {}), status: "running", job, percent: 5, message: "Extraction…" },
      }));

      const ac = new AbortController();
      const stop = () => {
        try {
          ac.abort();
        } catch {}
      };

      await consumeSseTicks(
        token,
        `/me/bot/clips/download/progress?job=${encodeURIComponent(job)}`,
        (payload) => {
          const status = String(payload?.status || "");
          const pct = Math.max(0, Math.min(100, Number(payload?.percent || 0)));
          const msg = String(payload?.message || "");
          const errMsg = payload?.error ? String(payload.error) : null;

          if (status === "error") {
            setDl((m) => ({
              ...m,
              [cid]: { ...(m[cid] || {}), status: "error", error: errMsg || "error", message: msg, percent: pct },
            }));
            stop();
            return;
          }

          if (status === "done") {
            setDl((m) => ({
              ...m,
              [cid]: { ...(m[cid] || {}), status: "done", message: "Prêt ✓", percent: 100 },
            }));
            stop();
            return;
          }

          setDl((m) => ({
            ...m,
            [cid]: { ...(m[cid] || {}), status: "running", message: msg || "Rendu…", percent: pct },
          }));
        },
        ac.signal
      ).catch((e) => {
        const msg = String((e as any)?.message || "");
        if (!msg.includes("aborted")) {
          setDl((m) => ({ ...m, [cid]: { ...(m[cid] || {}), status: "error", error: msg || "sse_failed" } }));
        }
      });

      // mp4 prêt => open
      openMp4ViaApi(cid);
      await refresh();
    } catch (e: any) {
      const reason = String(e?.message || "error");
      setDl((m) => ({
        ...m,
        [cid]: {
          ...(m[cid] || {}),
          status: reason === "vod_not_ready" ? "not_ready" : "error",
          error: reason,
          message: null,
        },
      }));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 13 }}>Clips</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Commande chat: <b>!clip</b> + titre optionnel. Fenêtre: <b>1m45 avant</b> / <b>15s après</b>.
            <span style={{ opacity: 0.9 }}> • MP4 (≈2 min) stocké sur R2</span>
          </div>
        </div>

        <button
          className="btnGhostInline"
          onClick={() => void refresh()}
          disabled={loading}
          style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
        >
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {err ? (
        <div className="hint" style={{ marginTop: 12 }}>
          ⚠️ {err}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Aucun clip pour l’instant.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((c) => {
              const st = dl[c.id];
              const pct = Math.max(0, Math.min(100, Number(st?.percent || 0)));

              const mp4Key = String(c.mp4_key || "").trim();
              const mp4Ready = !!mp4Key;

              return (
                <div
                  key={c.id}
                  className="panel"
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.10)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.1 }}>
                        {c.title ? c.title : <span className="muted">Sans titre</span>}
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {c.author ? (
                          <>
                            par <b>@{c.author}</b> •{" "}
                          </>
                        ) : null}
                        timecode <b>{c.timecode_str || ""}</b>
                        {!c.vod_url ? <span> • VOD en préparation…</span> : null}
                        {c.vod_url && !mp4Ready ? <span> • MP4 pas encore rendu</span> : null}
                        {mp4Ready ? <span> • MP4 prêt ✅</span> : null}
                      </div>

                      {c.mp4_error ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 6, color: "rgba(255,90,90,0.95)" }}>
                          Render error: {String(c.mp4_error).slice(0, 160)}
                        </div>
                      ) : null}

                      {st &&
                      (st.status === "starting" ||
                        st.status === "running" ||
                        st.status === "done" ||
                        st.status === "error" ||
                        st.status === "not_ready") ? (
                        <div style={{ marginTop: 10 }}>
                          <div
                            style={{
                              height: 6,
                              borderRadius: 999,
                              overflow: "hidden",
                              background: "rgba(255,255,255,0.08)",
                            }}
                          >
                            <div style={{ height: "100%", width: `${pct}%`, background: "rgba(60, 240, 180, 0.70)" }} />
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {st.status === "starting" ? "Démarrage…" : null}
                            {st.status === "running" ? `${st.message || "Rendu…"} ${pct}%` : null}
                            {st.status === "not_ready" ? "VOD pas encore disponible (réessayer plus tard)" : null}
                            {st.status === "done" ? "Prêt ✓" : null}
                            {st.status === "error" ? `Erreur: ${String(st.error || "échec")}` : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* ✅ CHANGEMENT: Télécharger => lance le download du clip (render si besoin) */}
                      <button
                        className="btnGhostInline"
                        onClick={() => void handleRenderAndDownload(c)}
                        disabled={(!c.vod_url && !mp4Ready) || st?.status === "starting" || st?.status === "running"}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          fontWeight: 950,
                          opacity: !c.vod_url && !mp4Ready ? 0.6 : 1,
                        }}
                        title={
                          !c.vod_url && !mp4Ready
                            ? "VOD pas encore prête"
                            : mp4Ready
                            ? "Télécharger le MP4"
                            : "Rendre le MP4 puis télécharger"
                        }
                      >
                        Télécharger
                      </button>

                      {/* ✅ CHANGEMENT: Voir => visionnage dans une modale */}
                      <button
                        className="btnGhostInline"
                        onClick={() => setOpenClip(c)}
                        disabled={!mp4Ready && !c.vod_url}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          fontWeight: 950,
                          background: "rgba(59, 130, 246, 0.18)",
                          border: "1px solid rgba(59, 130, 246, 0.35)",
                          opacity: !mp4Ready && !c.vod_url ? 0.6 : 1,
                        }}
                        title={mp4Ready ? "Voir le clip (MP4)" : c.vod_url ? "Voir (fallback VOD)" : "Indisponible"}
                      >
                        Voir
                      </button>

                      {/* optionnel: copier lien direct */}
                      {mp4Ready ? (
                        <button
                          className="btnGhostInline"
                          onClick={() => copyText(`${API_BASE}/clips/${c.id}/mp4`)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            fontWeight: 950,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                          }}
                          title="Copier le lien API (redirect)"
                        >
                          Copier lien
                        </button>
                      ) : null}

                      {/* fallback: si pas de mp4 et tu veux encore un accès DLive direct (garde-le discret) */}
                      {!mp4Ready && c.vod_permlink ? (
                        <a
                          href={buildDliveVodPage(c.vod_permlink, c.at_sec)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          <button
                            className="btnGhostInline"
                            style={{
                              padding: "10px 12px",
                              borderRadius: 14,
                              fontWeight: 950,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              opacity: 0.9,
                            }}
                            title="Ouvrir la page DLive (fallback)"
                          >
                            DLive
                          </button>
                        </a>
                      ) : null}

                      <button
                        className="btnGhostInline"
                        onClick={() => void handleDelete(c.id)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          fontWeight: 950,
                          background: "rgba(255, 70, 70, 0.14)",
                          border: "1px solid rgba(255, 70, 70, 0.28)",
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        Note: téléchargement <b>natif</b> via <b>/clips/:id/mp4</b> (redirect vers R2). Pas de blob, pas de stockage Render.
      </div>

      {/* ✅ MODALE "VOIR" */}
      {openClip ? <ClipViewerModal clip={openClip} onClose={() => setOpenClip(null)} /> : null}
    </div>
  );
}
