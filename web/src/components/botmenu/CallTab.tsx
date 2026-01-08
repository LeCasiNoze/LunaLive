// web/src/components/botmenu/CallTab.tsx
import * as React from "react";
import { SlotThumb } from "./SlotThumb";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type SlotItem = { name: string; provider: string | null; imageUrl?: string | null };

export function CallTab({
  token,
  onClose,
  onRequireLogin,
  sendBang,
}: {
  token: string | null;
  onClose: () => void;
  onRequireLogin: () => void;
  sendBang: (text: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<SlotItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const isAuthed = !!token;

  async function fetchSuggestions(text: string) {
    const s = String(text || "").trim();
    if (s.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=10`);
      const j = await r.json();
      if (j?.ok) setItems(j.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      fetchSuggestions(q).catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <>
      {!isAuthed ? (
        <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", opacity: 0.9 }}>
          <div style={{ fontWeight: 950 }}>Connecte-toi pour utiliser le bot</div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequireLogin();
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(124,77,255,0.22)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            Se connecter
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 8 }}>Choisis une machine :</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tape le nom…"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              outline: "none",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              fontWeight: 800,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const text = q.trim();
                if (!text) return;
                sendBang(`!call ${text}`);
                onClose();
              }
            }}
          />

          <div style={{ marginTop: 10 }}>
            {loading ? <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Suggestions…</div> : null}

            {items.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {items.map((it) => (
                  <button
                    key={`${it.name}|${it.provider || ""}`}
                    type="button"
                    onClick={() => {
                      sendBang(`!call ${it.name}`);
                      onClose();
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      textAlign: "left",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <SlotThumb url={it.imageUrl} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 950,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.name}
                          {it.provider ? (
                            <span style={{ opacity: 0.75, fontWeight: 800 }}> — {it.provider}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : q.trim().length >= 2 ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucune suggestion.</div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => sendBang("!listec")}
              style={{
                flex: 1,
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Voir la liste (!listec)
            </button>
          </div>
        </>
      )}
    </>
  );
}
