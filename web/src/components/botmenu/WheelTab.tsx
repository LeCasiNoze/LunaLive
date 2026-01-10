// web/src/components/botmenu/WheelTab.tsx
import * as React from "react";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

export function WheelTab({
  token,
  slug,
  canMod,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onClose: () => void;
  onRequireLogin: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [joined, setJoined] = React.useState(false);
  const [count, setCount] = React.useState(0);

  const isAuthed = !!token;

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_wheel/public?slug=${encodeURIComponent(slug)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const j = await r.json();
      if (j?.ok) {
        setEnrollOpen(!!j.cfg?.enroll_open);
        setJoined(!!j.me?.joined);
        setCount(Number(j.counts?.entries || 0));
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  async function doJoin() {
    if (!token) return onRequireLogin();

    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_wheel/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const j = await r.json();

      if (j?.ok) {
        if (j.status === "joined") {
          setJoined(true);
          setCount((n) => n + 1);
          window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "success", title: "Inscrit ✅" } }));
        } else {
          window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "info", title: "Déjà inscrit" } }));
        }
      } else {
        const e = String(j?.error || "join_failed");
        if (e === "closed") {
          window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "info", title: "Inscriptions fermées" } }));
        } else if (e === "unauthorized") {
          onRequireLogin();
        } else {
          window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: e } }));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function setOpen(next: boolean) {
    if (!token) return onRequireLogin();
    if (!canMod) return;

    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_wheel/enroll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ open: next }),
      });
      const j = await r.json();
      if (j?.ok) {
        setEnrollOpen(next);
        window.dispatchEvent(
          new CustomEvent("ui:toast", { detail: { kind: "success", title: next ? "Inscriptions ouvertes" : "Inscriptions fermées" } })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: j?.error || "enroll_failed" } })
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {!isAuthed ? (
        <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", opacity: 0.9 }}>
          <div style={{ fontWeight: 950 }}>Connecte-toi pour rejoindre la roue</div>
          <button
            type="button"
            onClick={onRequireLogin}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 950 }}>
              🎡 Roue —{" "}
              <span style={{ opacity: 0.85 }}>
                {enrollOpen ? "Inscriptions ouvertes" : "Inscriptions fermées"} • {count} inscrit(s)
              </span>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Rafraîchir
            </button>
          </div>

          <button
            type="button"
            disabled={loading || joined}
            onClick={() => void doJoin()}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: joined ? "rgba(255,255,255,0.06)" : "rgba(124,77,255,0.22)",
              color: "white",
              fontWeight: 950,
              cursor: joined ? "not-allowed" : "pointer",
              opacity: joined ? 0.8 : 1,
            }}
          >
            {joined ? "Déjà inscrit ✅" : "Rejoindre la roue"}
          </button>

          {!enrollOpen ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
              Les inscriptions sont fermées — tu peux toujours tenter via !join quand elles seront ouvertes.
            </div>
          ) : null}

          {canMod ? (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 8 }}>Modération</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void setOpen(true)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(124,77,255,0.22)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  Ouvrir
                </button>
                <button
                  type="button"
                  onClick={() => void setOpen(false)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,120,150,0.12)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                TODO: conditions d’inscription (follow-only / sub-only / etc.)
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
