import * as React from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { LoginModal } from "../components/LoginModal";

export default function ChatPopupPage() {
  const { slug } = useParams();
  const s = String(slug || "").trim();
  const [loginOpen, setLoginOpen] = React.useState(false);

  React.useEffect(() => {
    const previousTitle = document.title;
    document.title = `LunaLive • Chat ${s}`;
    return () => { document.title = previousTitle; };
  }, [s]);

  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(1200px 600px at 20% 0%, rgba(124,77,255,0.22), rgba(0,0,0,0) 60%), rgba(8,6,12,1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: 10, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
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
          botMenuVariant="dock"
          botMenuDockWidth={380}
          showBotFab={true}
          onRequireLogin={() => setLoginOpen(true)}
        />
        ) : (
          <div style={{ padding: 12, color: "white", opacity: 0.75 }}>Slug manquant.</div>
        )}
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
