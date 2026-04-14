import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { decodeConfig, type OverlayConfig, type ZoneRect } from "./fsb/OverlayDesignerSection";

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useStreamTimer() {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ─── Zone position helper ─────────────────────────────────────────────────────

function rect(z: ZoneRect): React.CSSProperties {
  return {
    position: "absolute",
    left: `${z.x}%`,
    top: `${z.y}%`,
    width: `${z.w}%`,
    height: `${z.h}%`,
    boxSizing: "border-box",
  };
}

// ─── Cam zone ─────────────────────────────────────────────────────────────────

function CamZone({ cam, isPreview }: {
  cam: OverlayConfig["cams"][number];
  isPreview?: boolean;
}) {
  if (!cam.enabled) return null;

  const base: React.CSSProperties = { ...rect(cam), overflow: "hidden" };

  if (cam.greenscreen) {
    // Transparent area — no border, nothing rendered
    return isPreview ? (
      <div style={{
        ...base,
        border: "2px dashed rgba(99,102,241,.4)",
        borderRadius: cam.borderRadius,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "clamp(8px, 1.5vw, 13px)", color: "rgba(148,178,232,.5)", fontWeight: 700 }}>
          ⬜ Greenscreen
        </span>
      </div>
    ) : null;
  }

  return (
    <div style={{
      ...base,
      border: `${cam.borderWidth}px solid ${cam.borderColor}`,
      borderRadius: cam.borderRadius,
      background: "transparent",
    }} />
  );
}

// ─── Slot zone ────────────────────────────────────────────────────────────────

function SlotZone({ slot }: { slot: OverlayConfig["slot"] }) {
  if (!slot.enabled) return null;
  return (
    <div style={{
      ...rect(slot),
      border: slot.showFrame ? `${slot.frameWidth}px solid ${slot.frameColor}` : "none",
      borderRadius: slot.borderRadius,
      background: "transparent",
    }} />
  );
}

// ─── Stats zone ───────────────────────────────────────────────────────────────

function StatsZone({ stats }: { stats: OverlayConfig["stats"] }) {
  const timer = useStreamTimer();
  if (!stats.enabled) return null;

  const bg = stats.bgColor || "#0a1628";
  const opacity = (stats.bgOpacity ?? 80) / 100;
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const bgRgba = `rgba(${r},${g},${b},${opacity})`;

  const items: { icon: string; text: string }[] = [];
  if (stats.showTimer) items.push({ icon: "⏱", text: timer });
  if (stats.showTitle && stats.titleText) items.push({ icon: "🎮", text: stats.titleText });
  if (stats.showViewers && stats.viewersText) items.push({ icon: "👁", text: stats.viewersText });
  if (stats.showFollowers && stats.followersText) items.push({ icon: "❤️", text: stats.followersText });

  return (
    <div style={{
      ...rect(stats),
      background: bgRgba,
      borderRadius: stats.borderRadius,
      display: "flex",
      alignItems: "center",
      gap: "clamp(8px, 1.5vw, 20px)",
      padding: "0 clamp(8px, 1.5vw, 18px)",
      overflow: "hidden",
    }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "rgba(255,255,255,.2)", fontSize: "clamp(10px, 1.2vw, 16px)" }}>·</span>}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "clamp(3px, .5vw, 6px)",
            color: stats.textColor || "#dde8ff",
            fontSize: "clamp(9px, 1.2vw, 15px)",
            fontWeight: 700,
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            whiteSpace: "nowrap",
          }}>
            <span style={{ fontSize: "clamp(9px, 1vw, 13px)" }}>{item.icon}</span>
            {item.text}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Chat zone ────────────────────────────────────────────────────────────────

function ChatZone({ chat }: { chat: OverlayConfig["chat"] }) {
  if (!chat.enabled || !chat.chatUrl) return null;

  const opacity = (chat.bgOpacity ?? 0) / 100;

  return (
    <div style={{
      ...rect(chat),
      borderRadius: chat.borderRadius,
      background: opacity > 0 ? `rgba(0,0,0,${opacity})` : "transparent",
      overflow: "hidden",
    }}>
      <iframe
        src={chat.chatUrl}
        style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
        title="Chat"
        allow="autoplay"
      />
    </div>
  );
}

// ─── Promo zone ───────────────────────────────────────────────────────────────

function PromoZone({ promo }: { promo: OverlayConfig["promo"] }) {
  if (!promo.enabled || !promo.imageUrl) return null;

  return (
    <div style={{
      ...rect(promo),
      borderRadius: promo.borderRadius,
      overflow: "hidden",
    }}>
      <img
        src={promo.imageUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: promo.objectFit || "contain",
          display: "block",
        }}
      />
    </div>
  );
}

// ─── Overlay renderer ─────────────────────────────────────────────────────────

function OverlayRenderer({ config, isPreview }: { config: OverlayConfig; isPreview?: boolean }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "transparent",
    }}>
      {config.cams.map((cam, i) => (
        <CamZone key={i} cam={cam} isPreview={isPreview} />
      ))}
      <SlotZone slot={config.slot} />
      <StatsZone stats={config.stats} />
      <ChatZone chat={config.chat} />
      <PromoZone promo={config.promo} />
    </div>
  );
}

// ─── Error / empty states ─────────────────────────────────────────────────────

function OverlayError({ message }: { message: string }) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.85)", fontFamily: "monospace", color: "#fc8181", fontSize: 14,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div>{message}</div>
        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,.4)" }}>
          Verifier le parametre cfg= dans l URL
        </div>
      </div>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function OverlayPage() {
  const [params] = useSearchParams();
  const raw = params.get("cfg");
  const isPreview = params.get("preview") === "1";

  const config = React.useMemo(() => {
    if (!raw) return null;
    return decodeConfig(raw);
  }, [raw]);

  // Page-level styles: fullscreen, transparent background for OBS
  React.useEffect(() => {
    document.title = "LunaLive Overlay";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      document.body.style.margin = "";
      document.body.style.padding = "";
      document.body.style.overflow = "";
    };
  }, []);

  if (!raw) {
    return <OverlayError message="Aucune configuration fournie." />;
  }

  if (!config) {
    return <OverlayError message="Configuration invalide ou corrompue." />;
  }

  return (
    <>
      {/* Preview mode: grid + zone labels overlay */}
      {isPreview && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)",
          backgroundSize: "10% 10%",
        }} />
      )}

      <div style={{
        position: "fixed",
        inset: 0,
        background: isPreview ? "#07101f" : "transparent",
      }}>
        <OverlayRenderer config={config} isPreview={isPreview} />
      </div>

      {/* Preview badge */}
      {isPreview && (
        <div style={{
          position: "fixed", top: 10, right: 10, zIndex: 10000,
          background: "rgba(99,102,241,.9)", color: "#fff",
          fontSize: 11, fontWeight: 800, padding: "4px 10px",
          borderRadius: 999, letterSpacing: ".05em",
          fontFamily: "system-ui, sans-serif",
        }}>
          MODE PREVIEW
        </div>
      )}
    </>
  );
}
