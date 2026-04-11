// web/src/components/botmenu/BotMenu.tsx
import * as React from "react";
import { CallTab } from "./CallTab";
import { HuntTabs } from "./HuntTabs";
import { WheelTab } from "./WheelTab";
import { RainTab } from "./RainTab";
import { PredictionsTab } from "./PredictionsTab";
import { trackFeatureEvent } from "../../lib/feature_events";

export function BotMenu({
  open,
  onClose,
  slug,
  token,
  role,
  canMod,
  onRequireLogin,
  sendBang,

  variant = "modal",

  // ✅ NEW
  dockWidth,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  token: string | null;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;
  onRequireLogin: () => void;
  sendBang: (text: string) => void;

  variant?: "modal" | "dock";

  // ✅ NEW (uniquement utilisé en dock)
  dockWidth?: number;
}) {


  // 👇 marque explicitement role comme “lu”
  void role;

  const [tab, setTab] = React.useState<
    "call" | "hunt" | "wheel" | "rain" | "predictions"
  >("call");

  React.useEffect(() => {
    if (!open) return;
    setTab("call");
  }, [open]);

  React.useEffect(() => {
    if (!open || !token || !slug) return;
    void trackFeatureEvent(token, { kind: "bot_tab", subject: `${slug}|${tab}` });
  }, [open, slug, tab, token]);

  const [dockPos, setDockPos] = React.useState({ x: 16, y: 16 });

  React.useEffect(() => {
    if (!open) return;
    if (variant !== "dock") return;

    // position par défaut: en haut à droite, avec marge
    const x = Math.max(8, window.innerWidth - panelW - 16);

    const y = Math.max(8, 16);
    setDockPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant]);

  if (!open) return null;

  const panelW = Math.max(320, Math.min(520, Number(dockWidth ?? 360))); // ✅ ex: 420/440 en popup
  const panelH = 520;

  const PanelInner = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: variant === "dock" ? panelW : 560,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(18,14,26,0.98)",
        boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
    >
      {/* Header (draggable en dock) */}
      <div
        onMouseDown={(e) => {
          if (variant !== "dock") return;

          e.preventDefault();
          e.stopPropagation();

          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = dockPos.x;
          const startTop = dockPos.y;

          const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            const nextX = startLeft + dx;
            const nextY = startTop + dy;

            const maxX = window.innerWidth - 8;
            const maxY = window.innerHeight - 8;

            setDockPos({
              x: clamp(nextX, 8, maxX - panelW),
              y: clamp(nextY, 8, maxY - panelH),
            });
          };

          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          cursor: variant === "dock" ? "grab" : "default",
          userSelect: "none",
          background: "linear-gradient(135deg, rgba(124,77,255,0.22), rgba(80,200,255,0.10))",
        }}
        title={variant === "dock" ? "Glisse pour déplacer" : undefined}
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
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexWrap: "wrap",
        }}
      >
        {(["call", "hunt", "wheel", "rain", "predictions"] as const).map((k) => (
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
            {k === "call"
              ? "Call"
              : k === "hunt"
              ? "Hunt"
              : k === "wheel"
              ? "Roue"
              : k === "rain"
              ? "Rain"
              : "Prédictions"}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "call" && (
        <CallTab
          token={token}
          slug={slug}
          canMod={canMod}
          onClose={onClose}
          onRequireLogin={onRequireLogin}
          sendBang={sendBang}
        />
      )}

      {tab === "hunt" && <HuntTabs token={token ?? ""} streamerSlug={slug} canModerate={canMod} />}

      {tab === "wheel" && (
        <WheelTab token={token} slug={slug} canMod={canMod} onClose={onClose} onRequireLogin={onRequireLogin} />
      )}

      {tab === "rain" && <RainTab token={token} slug={slug} onRequireLogin={onRequireLogin} />}

      {tab === "predictions" && (
        <PredictionsTab token={token} slug={slug} canMod={canMod} onRequireLogin={onRequireLogin} />
      )}
    </div>
  );

  if (variant === "dock") {
    return (
      <div
        style={{
          position: "fixed",
          left: dockPos.x,
          top: dockPos.y,
          width: panelW,
          maxWidth: "calc(100vw - 16px)",
          zIndex: 140,
        }}
      >
        {PanelInner}
      </div>
    );
  }

  // modal (comportement actuel)
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
      {PanelInner}
    </div>
  );

}
