import * as React from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";

export default function ChatPopupPage() {
  const { slug } = useParams();
  const s = String(slug || "").trim();

  React.useEffect(() => {
    document.title = "LunaLive • Chat";
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background:
          "radial-gradient(1200px 600px at 20% 0%, rgba(124,77,255,0.22), rgba(0,0,0,0) 60%), rgba(8,6,12,1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontWeight: 950, color: "white", fontSize: 13, opacity: 0.95 }}>Chat pop-up</div>
        <div style={{ fontSize: 12, opacity: 0.65, color: "white", marginTop: 2 }}>Chaîne: {s || "—"}</div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {s ? (
          <ChatPanel
            slug={s}
            compact={false}
            autoFocus={true}
            visualMode="popup"
            botMenuVariant="dock"   // ✅ important: bot menu décalé/draggable
            onRequireLogin={() => {
              window.dispatchEvent(
                new CustomEvent("ui:toast", {
                  detail: { kind: "info", title: "Connexion", message: "Connecte-toi dans la fenêtre principale." },
                })
              );
            }}
          />
        ) : (
          <div style={{ padding: 12, color: "white", opacity: 0.75 }}>Slug manquant.</div>
        )}
      </div>
    </div>
  );
}
