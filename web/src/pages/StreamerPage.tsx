import * as React from "react";
import { useParams } from "react-router-dom";
import { getStreamer, type ApiStreamerPage } from "../lib/api";
import { DlivePlayer } from "../components/DlivePlayer";

export default function StreamerPage() {
  const { slug = "" } = useParams();
  const [s, setS] = React.useState<ApiStreamerPage | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let on = true;
    setErr(null);
    setS(null);

    getStreamer(String(slug))
      .then((r) => on && setS(r))
      .catch((e) => on && setErr(String(e?.message || e)));

    return () => {
      on = false;
    };
  }, [slug]);

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>{s ? s.displayName : "…"}</h1>
        {s && (
          <p className="muted">
            {s.isLive ? "🔴 LIVE" : "⚪ OFFLINE"} — viewers: <b>{s.viewers}</b>
          </p>
        )}
        {err && <p className="hint">⚠️ {err}</p>}
      </div>

      {s && <DlivePlayer channelSlug={s.channelSlug ?? null} isLive={s.isLive} />}

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Chat</div>
        <div className="mutedSmall">Placeholder (plus tard).</div>
      </div>
    </main>
  );
}
