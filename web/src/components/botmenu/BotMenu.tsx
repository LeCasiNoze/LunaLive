// web/src/components/botmenu/BotMenu.tsx
import * as React from "react";
import { CloudRain, Crosshair, Dices, GripHorizontal, RotateCw, Sparkles, X } from "lucide-react";
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
        borderRadius: 24,
        border: "1px solid rgba(196,181,253,0.20)",
        background: "linear-gradient(155deg, rgba(24,17,43,.99), rgba(10,7,21,.99) 68%)",
        boxShadow: "0 32px 100px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,.035)",
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
          minHeight: 58,
          padding: "10px 12px 10px 15px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(196,181,253,0.11)",
          cursor: variant === "dock" ? "grab" : "default",
          userSelect: "none",
          background: "linear-gradient(135deg, rgba(139,92,246,0.17), rgba(91,141,239,0.06))",
          flexShrink: 0,
        }}
        title={variant === "dock" ? "Glisse pour déplacer" : undefined}
      >
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <GripHorizontal size={16} style={{ color: "#8f82ae", flex: "0 0 auto" }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#f5f2ff", letterSpacing: "-.02em" }}>LunaBot</div>
            <div style={{ marginTop: 2, fontWeight: 700, fontSize: 8, color: "#817891", letterSpacing: ".1em", textTransform: "uppercase" }}>Commandes du live</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: 11,
            border: "1px solid rgba(196,181,253,0.14)",
            background: "rgba(255,255,255,0.045)",
            color: "#c9c1d9",
            fontWeight: 900,
            fontSize: 12,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Tabs — compacts (retour Lucas : plus propre et petit) */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px",
          borderBottom: "1px solid rgba(196,181,253,0.09)",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {(["call", "hunt", "wheel", "rain", "predictions"] as const).map((k) => {
          const Icon = k === "call" ? Dices : k === "hunt" ? Crosshair : k === "wheel" ? RotateCw : k === "rain" ? CloudRain : Sparkles;
          const label = k === "call" ? "Call" : k === "hunt" ? "Hunt" : k === "wheel" ? "Roue" : k === "rain" ? "Rain" : "Prédictions";
          return (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              flex: "1 0 72px",
              minHeight: 50,
              padding: "7px 6px",
              borderRadius: 12,
              border: `1px solid ${tab === k ? "rgba(167,139,250,0.34)" : "rgba(196,181,253,0.09)"}`,
              background: tab === k ? "linear-gradient(135deg,rgba(139,92,246,.22),rgba(91,141,239,.08))" : "rgba(255,255,255,0.028)",
              color: tab === k ? "#f5f2ff" : "#91889f",
              fontWeight: 850,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={16} style={{ display: "block", margin: "0 auto" }} />
            <div style={{ fontSize: 8, marginTop: 4, opacity: 0.95 }}>{label}</div>
          </button>
          );
        })}
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
