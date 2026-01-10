// web/src/components/botmenu/BotMenu.tsx
import * as React from "react";
import { CallTab } from "./CallTab";
import { HuntTabs } from "./HuntTabs";
import { WheelTab } from "./WheelTab";

export function BotMenu({
  open,
  onClose,
  slug,
  token,
  role,
  canMod,
  onRequireLogin,
  sendBang,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  token: string | null;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;
  onRequireLogin: () => void;
  sendBang: (text: string) => void;
}) {
  const [tab, setTab] = React.useState<"call" | "hunt" | "wheel">("call");

  React.useEffect(() => {
    if (!open) return;
    setTab("call");
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(18,14,26,0.98)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 950 }}>🤖 LunaBot</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {(["call", "hunt", "wheel"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: tab === k ? "rgba(124,77,255,0.20)" : "rgba(255,255,255,0.05)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {k === "call" ? "Call" : k === "hunt" ? "Hunt" : "Roue"}
            </button>
          ))}

          {!canMod ? (
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75, fontWeight: 800, alignSelf: "center" }}>
              {role ? `Rôle: ${role}` : ""}
            </div>
          ) : null}
        </div>

        {tab === "call" ? (
          <CallTab
            token={token}
            slug={slug}
            canMod={canMod}
            onClose={onClose}
            onRequireLogin={onRequireLogin}
            sendBang={sendBang}
          />
        ) : null}

        {tab === "hunt" ? (
          <HuntTabs token={token ?? ""} streamerSlug={slug} canModerate={canMod} />
        ) : null}

        {tab === "wheel" ? (
          <WheelTab
            token={token}
            slug={slug}
            canMod={canMod}
            onClose={onClose}
            onRequireLogin={onRequireLogin}
          />
        ) : null}

        </div>
      </div>
  );
}
