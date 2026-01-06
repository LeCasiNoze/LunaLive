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
};

type DlState = {
  status?: "idle" | "starting" | "running" | "done" | "error" | "not_ready";
  error?: string | null;
  message?: string | null;
  job?: string;
  percent?: number; // (soft)
  downloading?: boolean;
};

type DlMap = Record<number, DlState>;

function safeTitle(v: any) {
  return String(v || "no-title").replace(/[^a-z0-9-_]+/gi, "_");
}

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

  // ⚠️ si tu reçois de l'HTML (fallback SPA), on veut le voir direct
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

async function apiBlob(token: string, url: string): Promise<Blob> {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const r = await fetch(fullUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`file_${r.status}${txt ? `:${txt.slice(0, 60)}` : ""}`);
  }

  return await r.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function ClipsModule({
  token,
  onReload,
}: {
  token: string;
  onReload?: () => void;
}) {
  const [items, setItems] = React.useState<ClipItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [dl, setDl] = React.useState<DlMap>({});

  const missingVod = React.useMemo(
    () => items.some((c) => !c.vod_url),
    [items]
  );

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const j = await apiJson<{ ok: true; items: ClipItem[] }>(
        token,
        "/me/bot/clips/list?limit=200",
        { method: "GET" }
      );
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
      await apiJson(token, "/me/bot/clips/delete", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || "delete_failed"));
    }
  }

  async function handleDownload(clip: ClipItem) {
    const cid = clip.id;
    const cur = dl[cid];
    if (cur?.status === "starting" || cur?.status === "running") return;

    setDl((m) => ({
      ...m,
      [cid]: {
        status: "starting",
        error: null,
        message: "Préparation…",
        percent: 3,
      },
    }));

    let job = "";

    try {
      // START
      const start = await apiJson<{ ok: true; job: string; started: boolean }>(
        token,
        "/me/bot/clips/download/start",
        {
          method: "POST",
          body: JSON.stringify({ id: cid }),
        }
      );

      job = String(start.job || "");
      if (!job) throw new Error("job_missing");

      setDl((m) => ({
        ...m,
        [cid]: { ...(m[cid] || {}), status: "running", job, percent: 5, message: "Extraction…" },
      }));

      // Sans SSE (Authorization header obligatoire) => on “soft-progress” + retries file
      const maxAttempts = 40; // ~40s
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // tente fichier
        try {
          const dlname = encodeURIComponent(`clip-${clip.id}-${safeTitle(clip.title)}.mp4`);
          const blob = await apiBlob(token, `/me/bot/clips/download/file?job=${encodeURIComponent(job)}&dlname=${dlname}`);

          setDl((m) => ({
            ...m,
            [cid]: { ...(m[cid] || {}), status: "done", percent: 100, downloading: true, message: "Téléchargement…" },
          }));

          downloadBlob(blob, `clip-${clip.id}-${safeTitle(clip.title)}.mp4`);

          setDl((m) => ({
            ...m,
            [cid]: { ...(m[cid] || {}), status: "done", percent: 100, downloading: false, message: "Terminé ✓" },
          }));

          return;
        } catch (e: any) {
          const msg = String(e?.message || "");
          // 409 => pas prêt (le backend renvoie JSON 409; ici on a fetch text => "file_409...")
          const isNotReady = msg.includes("file_409") || msg.includes("not_ready") || msg.includes("409");

          if (!isNotReady) throw e;

          // soft-progress
          setDl((m) => {
            const p = Math.min(95, Math.max(5, Number(m[cid]?.percent || 5) + (attempt < 10 ? 2 : 1)));
            return {
              ...m,
              [cid]: { ...(m[cid] || {}), status: "running", percent: p, message: "Extraction…" },
            };
          });

          await new Promise((r) => setTimeout(r, attempt < 5 ? 500 : 900));
        }
      }

      setDl((m) => ({
        ...m,
        [cid]: { ...(m[cid] || {}), status: "error", error: "file_not_ready_timeout", message: "Timeout" },
      }));
    } catch (e: any) {
      const reason = String(e?.message || "error");
      setDl((m) => ({
        ...m,
        [cid]: { ...(m[cid] || {}), status: reason === "vod_not_ready" ? "not_ready" : "error", error: reason },
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
          </div>
        </div>

        <button className="btnGhostInline" onClick={() => void refresh()} disabled={loading} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}>
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
                      </div>

                      {st && (st.status === "starting" || st.status === "running" || st.status === "done" || st.status === "error" || st.status === "not_ready") ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: "rgba(60, 240, 180, 0.70)" }} />
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {st.status === "starting" ? "Préparation…" : null}
                            {st.status === "running" ? `${st.message || "Extraction…"} ${pct}%` : null}
                            {st.status === "not_ready" ? "VOD pas encore disponible (réessayer plus tard)" : null}
                            {st.status === "done" ? (st.downloading ? "Téléchargement…" : "Terminé ✓") : null}
                            {st.status === "error" ? `Erreur: ${String(st.error || "échec")}` : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <button
                        className="btnGhostInline"
                        onClick={() => void handleDownload(c)}
                        disabled={st?.status === "starting" || st?.status === "running" || !c.vod_url}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          fontWeight: 950,
                          opacity: !c.vod_url ? 0.6 : 1,
                        }}
                        title={!c.vod_url ? "VOD pas encore prête" : "Télécharger le clip"}
                      >
                        Télécharger
                      </button>

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
                        Voir
                        </button>
                    </a>
                    ) : c.vod_permlink ? (
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
                            background: "rgba(59, 130, 246, 0.18)",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                        }}
                        >
                        Voir
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
        Note: le téléchargement passe par <b>fetch</b> (JWT header), donc le navigateur ne peut pas faire un “download natif”
        sans passer par le blob.
      </div>
    </div>
  );
}
