// web/src/pages/dashboard/sections/bot/modules/ClipsModule.tsx
import * as React from "react";

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

function copyText(text: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function ClipsModule({ token, onReload }: { token: string; onReload?: () => void }) {
  const [items, setItems] = React.useState<ClipItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [dl, setDl] = React.useState<DlMap>({});

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
        [cid]: { ...(m[cid] || {}), status: reason === "vod_not_ready" ? "not_ready" : "error", error: reason, message: null },
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

              const clipStartSec = Math.max(0, Math.floor((c.at_sec || 0) - (c.pre_sec || 105)));
              const directVodUrl = c.vod_url ? `${c.vod_url}#t=${clipStartSec}` : null;

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

                      {st && (st.status === "starting" || st.status === "running" || st.status === "done" || st.status === "error" || st.status === "not_ready") ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
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
                      <button
                        className="btnGhostInline"
                        onClick={() => {
                          if (mp4Ready) openMp4ViaApi(c.id);
                          else void handleRenderAndDownload(c);
                        }}
                        disabled={(!c.vod_url && !mp4Ready) || st?.status === "starting" || st?.status === "running"}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          fontWeight: 950,
                          opacity: !c.vod_url && !mp4Ready ? 0.6 : 1,
                        }}
                        title={!c.vod_url && !mp4Ready ? "VOD pas encore prête" : mp4Ready ? "Télécharger le MP4" : "Rendre + télécharger"}
                      >
                        {mp4Ready ? "Télécharger" : "Rendre + télécharger"}
                      </button>

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

                      {directVodUrl ? (
                        <a href={directVodUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <button
                            className="btnGhostInline"
                            style={{
                              padding: "10px 12px",
                              borderRadius: 14,
                              fontWeight: 950,
                              background: "rgba(59, 130, 246, 0.18)",
                              border: "1px solid rgba(59, 130, 246, 0.35)",
                            }}
                          >
                            Voir VOD
                          </button>
                        </a>
                      ) : c.vod_permlink ? (
                        <a href={buildDliveVodPage(c.vod_permlink, c.at_sec)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <button
                            className="btnGhostInline"
                            style={{
                              padding: "10px 12px",
                              borderRadius: 14,
                              fontWeight: 950,
                              background: "rgba(59, 130, 246, 0.18)",
                              border: "1px solid rgba(59, 130, 246, 0.35)",
                            }}
                          >
                            Voir VOD
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
    </div>
  );
}
