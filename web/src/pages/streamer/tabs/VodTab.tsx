// web/src/pages/streamer/tabs/VodTab.tsx
import * as React from "react";

function isDliveVodUrl(u: string) {
  const s = String(u || "").trim();
  return /^https?:\/\/(www\.)?dlive\.tv\/p\//i.test(s);
}

export function VodTab({
  slug,
  streamerDisplay,
}: {
  slug: string;
  streamerDisplay: string;
}) {
  const storageKey = `lunalive_vod_url_${String(slug || "").toLowerCase()}`;
  const [url, setUrl] = React.useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });

  const [appliedUrl, setAppliedUrl] = React.useState<string>(url);
  const [error, setError] = React.useState<string | null>(null);

  function apply() {
    const s = String(url || "").trim();
    if (!s) {
      setAppliedUrl("");
      setError(null);
      try { localStorage.removeItem(storageKey); } catch {}
      return;
    }
    if (!isDliveVodUrl(s)) {
      setError("URL invalide. Colle une URL DLive de replay qui ressemble à: https://dlive.tv/p/username+vod_id");
      return;
    }
    setError(null);
    setAppliedUrl(s);
    try { localStorage.setItem(storageKey, s); } catch {}
  }

  return (
    <div>
      <div className="panelTitle">VOD</div>
      <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.9 }}>
        MVP : on peut ouvrir une redif DLive <strong>dans LunaLive</strong> via embed.
        <br />
        (Plus tard : on branchera la liste automatique des replays + sélection.)
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Colle l’URL d’un replay DLive (https://dlive.tv/p/...)"
          style={{
            flex: 1,
            minWidth: 260,
            padding: "12px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            fontWeight: 800,
          }}
        />
        <button type="button" className="btnPrimarySmall" onClick={apply}>
          Ouvrir
        </button>
        <button
          type="button"
          className="btnGhostSmall"
          onClick={() => {
            setUrl("");
            setAppliedUrl("");
            setError(null);
            try { localStorage.removeItem(storageKey); } catch {}
          }}
        >
          Reset
        </button>
      </div>

      {error ? (
        <div className="mutedSmall" style={{ marginTop: 10, color: "rgba(255,90,90,0.95)" }}>
          {error}
        </div>
      ) : null}

      {appliedUrl ? (
        <div className="panel" style={{ padding: 0, marginTop: 12, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="mutedSmall" style={{ opacity: 0.9 }}>
              Replay : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{streamerDisplay}</strong>
            </div>
            <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.8 }}>
              Si DLive bloque l’iframe un jour, on basculera sur une lecture HLS (extraction playbackUrl côté backend).
            </div>
          </div>

          <div style={{ aspectRatio: "16/9", background: "rgba(0,0,0,0.55)" }}>
            <iframe
              src={appliedUrl}
              title="DLive VOD"
              style={{ width: "100%", height: "100%", border: 0 }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="mutedSmall" style={{ marginTop: 12, opacity: 0.85 }}>
          Colle une URL replay DLive pour l’afficher ici.
        </div>
      )}
    </div>
  );
}
