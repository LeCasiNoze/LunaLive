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

  const panelW = Math.max(380, Math.min(560, Number(dockWidth ?? 480)));

  const PanelInner = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: variant === "dock" ? panelW : 600,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(18,14,26,0.98)",
        boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
        overflow: "hidden",
        // le contenu long SCROLLE dans le panel (header/tabs restent
        // visibles → le ✕ est toujours accessible) — fix retour Lucas
        maxHeight: "min(90dvh, 760px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header (draggable en dock — Pointer Events = souris ET tactile) */}
      <div
        onPointerDown={(e) => {
          if (variant !== "dock") return;
          // ne pas capturer le clic du bouton ✕
          if ((e.target as HTMLElement).closest("button")) return;

          e.preventDefault();
          e.stopPropagation();

          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = dockPos.x;
          const startTop = dockPos.y;

          const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

          const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            const nextX = startLeft + dx;
            const nextY = startTop + dy;

            const maxX = window.innerWidth - 8;
            const maxY = window.innerHeight - 8;

            setDockPos({
              x: clamp(nextX, 8, Math.max(8, maxX - panelW)),
              y: clamp(nextY, 8, Math.max(8, maxY - 120)),
            });
          };

          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        }}
        style={{
          touchAction: "none",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          cursor: variant === "dock" ? "grab" : "default",
          userSelect: "none",
          background: "linear-gradient(135deg, rgba(124,77,255,0.22), rgba(80,200,255,0.10))",
          flexShrink: 0,
        }}
        title={variant === "dock" ? "Glisse pour déplacer" : undefined}
      >
        <div style={{ fontWeight: 950, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.55, fontSize: 12 }}>⠿</span> 🤖 LunaBot
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontWeight: 900,
            fontSize: 12,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs — compacts (retour Lucas : plus propre et petit) */}
      <div
        style={{
          display: "flex",
          gap: 5,
          padding: "8px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        {(["call", "hunt", "wheel", "rain", "predictions"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              padding: "6px 2px",
              borderRadius: 10,
              border: `1px solid ${tab === k ? "rgba(124,77,255,0.45)" : "rgba(255,255,255,0.08)"}`,
              background: tab === k ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.04)",
              color: tab === k ? "#fff" : "rgba(230,230,245,0.72)",
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontSize: 15, lineHeight: 1 }}>
              {k === "call" ? "🎰" : k === "hunt" ? "🎯" : k === "wheel" ? "🎡" : k === "rain" ? "🌧" : "🔮"}
            </div>
            <div style={{ fontSize: 9, marginTop: 2, opacity: 0.9 }}>
              {k === "call" ? "Call" : k === "hunt" ? "Hunt" : k === "wheel" ? "Roue" : k === "rain" ? "Rain" : "Prédi."}
            </div>
          </button>
        ))}
      </div>

      {/* Content — zone scrollable (le panel est plafonné en hauteur) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
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
