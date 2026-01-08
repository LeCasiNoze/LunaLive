// web/src/components/botmenu/QueueTab.tsx
import * as React from "react";
import { SlotThumb } from "./SlotThumb";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl?: string | null;
};

export function QueueTab({
  token,
  slug,
  canMod,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onRequireLogin: () => void;
}) {
  const [calls, setCalls] = React.useState<CallItem[]>([]);
  const [callsLoading, setCallsLoading] = React.useState(false);

  async function loadQueue() {
    if (!token) return;
    setCallsLoading(true);
    try {
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/list?limit=80`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j?.ok) setCalls(j.items || []);
      else setCalls([]);
    } catch {
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }

  async function doReset() {
    if (!token) return onRequireLogin();
    const ok = window.confirm("Reset la file de calls ?");
    if (!ok) return;

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "success", title: "Calls reset ✅" } }));
      await loadQueue();
    } else {
      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: r?.error || "reset_failed" } })
      );
    }
  }

  async function doDelete(id: string) {
    if (!token) return onRequireLogin();

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/item/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      await loadQueue();
    } else {
      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: r?.error || "delete_failed" } })
      );
    }
  }

  React.useEffect(() => {
    if (canMod && token) void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMod, token]);

  if (!canMod) {
    return <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>Accès réservé aux modérateurs / streamer / admin.</div>;
  }
  if (!token) {
    return <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>Connecte-toi pour accéder à la file.</div>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => loadQueue()}
          style={{
            flex: 1,
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
        <button
          type="button"
          onClick={() => doReset()}
          style={{
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,120,150,0.12)",
            color: "white",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {callsLoading ? (
        <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Chargement…</div>
      ) : !calls.length ? (
        <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucun call.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {calls.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <SlotThumb url={c.imageUrl} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.pos}. {c.slotName}
                    {c.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {c.provider}</span> : null}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>@ {c.username}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => doDelete(c.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,120,150,0.12)",
                  color: "white",
                  fontWeight: 950,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
