import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { enablePushNotifications } from "../lib/push";

export function EnablePushButton() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        type="button"
        className="btnPrimarySmall"
        disabled={!token || loading}
        onClick={async () => {
          if (!token) return;
          setLoading(true);
          setMsg(null);
          try {
            await enablePushNotifications(token);
            setMsg("✅ Notifications activées !");
          } catch (e: any) {
            const m = String(e?.message || e || "");
            if (m.includes("permission_denied")) setMsg("❌ Permission refusée (à réactiver dans les réglages du navigateur).");
            else setMsg("❌ Impossible d’activer les notifications sur ce navigateur.");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "…" : "Activer les notifications"}
      </button>

      {msg ? <div className="mutedSmall">{msg}</div> : null}
    </div>
  );
}
