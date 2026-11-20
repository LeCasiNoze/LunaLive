import * as React from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { PopupLiveStats } from "../components/chat/PopupLiveStats";
import { LoginModal } from "../components/LoginModal";
import { useAuth } from "../auth/AuthProvider";
import { DetachedChatSettings, usePopupAlign, useQuickActions } from "../components/chat/DetachedChatTools";

export default function ChatPopupPage() {
  const { slug } = useParams();
  const s = String(slug || "").trim();
  const [loginOpen, setLoginOpen] = React.useState(false);
  const { token } = useAuth();
  const [role, setRole] = React.useState<string | null>(null);
  const [align, setAlign] = usePopupAlign(s);
  // Boutons rapides : réservés au streamer de la chaîne (ses commandes perso).
  const isOwner = role === "streamer" || role === "admin";
  const [quickActions, saveQuickActions] = useQuickActions(isOwner ? token : null);

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, color: "white", fontSize: 13, opacity: 0.95 }}>Chat détaché</div>
            <div style={{ fontSize: 12, opacity: 0.65, color: "white", marginTop: 2 }}>Chaîne : {s || "—"}</div>
          </div>
          {s ? (
            <DetachedChatSettings
              align={align}
              onAlign={setAlign}
              canEditActions={isOwner && !!token}
              token={token}
              actions={quickActions}
              onActions={(next) => void saveQuickActions(next)}
            />
          ) : null}
        </div>
        {s && <PopupLiveStats key={s} slug={s} />}
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
          popupAlign={align}
          quickActions={isOwner ? quickActions : undefined}
          onJoinRole={setRole}
        />
        ) : (
          <div style={{ padding: 12, color: "white", opacity: 0.75 }}>Slug manquant.</div>
        )}
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
