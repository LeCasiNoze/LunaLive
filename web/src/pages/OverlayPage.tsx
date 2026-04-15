import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { decodeConfig, type OverlayConfig, type ZoneRect } from "./fsb/OverlayDesignerSection";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

function extractSlugFromChatUrl(chatUrl: string): string | null {
  try { return new URL(chatUrl).searchParams.get("slug"); } catch { return null; }
}

/** Écoute obs:config via socket et retourne la config live si disponible */
function useLiveConfig(baseConfig: OverlayConfig): OverlayConfig {
  const [liveConfig, setLiveConfig] = React.useState<OverlayConfig | null>(null);
  const slug = extractSlugFromChatUrl(baseConfig.chat.chatUrl);

  React.useEffect(() => {
    if (!slug) return;
    const socket = io(LUNA_API_BASE, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      socket.emit("stream:join", { slug });
    });
    socket.on("obs:config", (data: any) => {
      if (data?.config) setLiveConfig(data.config as OverlayConfig);
    });
    return () => { socket.disconnect(); };
  }, [slug]);

  return liveConfig ?? baseConfig;
}

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

function useClock() {
  const [time, setTime] = React.useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  React.useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ─── CSS animations (injectées une fois) ─────────────────────────────────────

const BG_STYLE_ID = "overlay-bg-anim";

function injectBgAnimations() {
  if (document.getElementById(BG_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = BG_STYLE_ID;
  s.textContent = `
    @keyframes bgZoom {
      0%   { transform: scale(1)    translate(0, 0); }
      33%  { transform: scale(1.08) translate(-1%, 0.5%); }
      66%  { transform: scale(1.05) translate(1%, -0.5%); }
      100% { transform: scale(1)    translate(0, 0); }
    }
    @keyframes bgDrift {
      0%   { transform: scale(1.1) translate(0, 0); }
      50%  { transform: scale(1.1) translate(-3%, -1.5%); }
      100% { transform: scale(1.1) translate(0, 0); }
    }
    @keyframes bgBreathe {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.04); }
    }
    @keyframes liveDot {
      0%, 100% { opacity: 1;   transform: scale(1); }
      50%      { opacity: 0.25; transform: scale(0.55); }
    }
    @keyframes cmdGlow {
      0%, 100% { background: rgba(99,102,241,.1); border-color: rgba(99,102,241,.28); color: #c7d2fe; }
      50%      { background: rgba(99,102,241,.22); border-color: rgba(99,102,241,.55); color: #e0e7ff; }
    }
    @keyframes timerFlash {
      0%  { opacity: 1; }
      8%  { opacity: 0.55; }
      16% { opacity: 1; }
    }
    @keyframes clockIcon {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes viewerPing {
      0%, 100% { box-shadow: 0 0 0   0   rgba(99,102,241,0); }
      50%      { box-shadow: 0 0 10px 3px rgba(99,102,241,.35); }
    }
  `;
  document.head.appendChild(s);
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

// ─── Background zone ──────────────────────────────────────────────────────────

function BackgroundZone({ bg }: { bg: OverlayConfig["background"] }) {
  React.useEffect(() => { injectBgAnimations(); }, []);

  if (!bg.enabled || !bg.imageUrl) return null;

  const animName = bg.animated
    ? bg.animationType === "zoom" ? "bgZoom"
      : bg.animationType === "drift" ? "bgDrift"
      : "bgBreathe"
    : "none";

  return (
    <div style={{
      position: "absolute", inset: 0,
      overflow: "hidden",
      zIndex: 0,
    }}>
      <img
        src={bg.imageUrl}
        alt=""
        style={{
          position: "absolute", inset: "-5%",
          width: "110%", height: "110%",
          objectFit: "cover",
          opacity: (bg.opacity ?? 100) / 100,
          animation: bg.animated
            ? `${animName} ${bg.animationSpeed ?? 30}s ease-in-out infinite`
            : "none",
          transformOrigin: "center center",
          pointerEvents: "none",
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

// ─── Cam zone ─────────────────────────────────────────────────────────────────

function CamZone({ cam }: {
  cam: OverlayConfig["cams"][number];
}) {
  if (!cam.enabled) return null;

  return (
    <div style={{
      ...rect(cam),
      overflow: "hidden",
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
  React.useEffect(() => { injectBgAnimations(); }, []);

  const timer = useStreamTimer();
  const clock = useClock();
  if (!stats.enabled) return null;

  const bgHex = stats.bgColor || "#0a1628";
  const op = (stats.bgOpacity ?? 80) / 100;
  const rr = parseInt(bgHex.slice(1, 3), 16);
  const gg = parseInt(bgHex.slice(3, 5), 16);
  const bb = parseInt(bgHex.slice(5, 7), 16);
  const bgRgba = `rgba(${rr},${gg},${bb},${op})`;

  const tc = stats.textColor || "#dde8ff";
  const fs = `clamp(9px, ${(stats.fontSize ?? 13) * 0.075}vw, ${stats.fontSize ?? 13}px)`;
  const fsMono: React.CSSProperties = { fontFamily: "'Courier New', 'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: ".04em" };
  const fsSans: React.CSSProperties = { fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", fontWeight: 700 };

  const commands = (stats.showCommands ? stats.commands ?? [] : []).filter(Boolean);

  return (
    <div style={{
      ...rect(stats),
      background: bgRgba,
      borderRadius: stats.borderRadius,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.2%",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>

      {/* ── GAUCHE : titre (coin) + timer juste après ── */}
      <div style={{ display: "flex", alignItems: "center", gap: ".6%", flexShrink: 0 }}>
        {stats.showTitle && stats.titleText && (
          <span style={{ color: tc, fontSize: fs, ...fsSans, opacity: 0.85 }}>
            {stats.titleText}
          </span>
        )}
        {stats.showTitle && stats.titleText && stats.showTimer && (
          <span style={{ color: "rgba(255,255,255,.18)", fontSize: fs, userSelect: "none", padding: "0 .2%" }}>|</span>
        )}
        {stats.showTimer && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".3%", color: tc, fontSize: fs, ...fsMono }}>
            <span style={{
              display: "inline-block",
              width: ".55em", height: ".55em",
              borderRadius: "50%",
              background: "#6366f1",
              boxShadow: "0 0 6px #6366f1",
              flexShrink: 0,
              animation: "liveDot 1.8s ease-in-out infinite",
            }} />
            <span style={{ animation: "timerFlash 2s steps(1) infinite" }}>{timer}</span>
          </span>
        )}
      </div>

      {/* ── CENTRE : commandes ── */}
      {commands.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: ".4%",
          position: "absolute", left: "50%", transform: "translateX(-50%)",
        }}>
          {commands.map((cmd, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center",
              padding: ".15em .65em",
              borderRadius: "999px",
              border: "1px solid rgba(99,102,241,.32)",
              background: "rgba(99,102,241,.12)",
              color: "#c7d2fe",
              fontSize: `calc(${fs} * 1.08)`,
              letterSpacing: ".02em",
              ...fsMono,
              cursor: "default",
              animation: `cmdGlow ${3 + i * 0.7}s ease-in-out infinite`,
            }}>{cmd}</span>
          ))}
        </div>
      )}

      {/* ── DROITE : horloge + viewers/followers (viewers en coin) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: ".6%", flexShrink: 0 }}>
        {stats.showClock && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".25%", color: tc, fontSize: fs, ...fsMono }}>
            <span style={{
              display: "inline-block", fontSize: "1em",
              animation: "clockIcon 12s linear infinite",
              transformOrigin: "center",
              lineHeight: 1,
            }}>◷</span>
            {clock}
          </span>
        )}
        {stats.showClock && (stats.showViewers || stats.showFollowers) && (
          <span style={{ color: "rgba(255,255,255,.18)", fontSize: fs, userSelect: "none", padding: "0 .2%" }}>|</span>
        )}
        {stats.showFollowers && stats.followersText && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".3%", color: tc, fontSize: fs, ...fsSans }}>
            <span style={{ color: "#f472b6", fontSize: ".9em" }}>♥</span>
            {stats.followersText}
          </span>
        )}
        {stats.showFollowers && stats.followersText && stats.showViewers && stats.viewersText && (
          <span style={{ color: "rgba(255,255,255,.18)", fontSize: fs, userSelect: "none", padding: "0 .2%" }}>|</span>
        )}
        {stats.showViewers && stats.viewersText && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: ".35%",
            color: tc, fontSize: fs, ...fsSans,
            animation: "viewerPing 3s ease-in-out infinite",
            borderRadius: "4px",
            padding: ".05em .3em",
          }}>
            <span style={{ color: "#818cf8", fontSize: ".85em", letterSpacing: "-.02em" }}>●</span>
            {stats.viewersText} <span style={{ opacity: 0.6, fontSize: ".9em" }}>viewers</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Chat zone ────────────────────────────────────────────────────────────────

function ChatZone({ chat }: { chat: OverlayConfig["chat"] }) {
  if (!chat.enabled || !chat.chatUrl) return null;

  const opacity = (chat.bgOpacity ?? 0) / 100;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Met à jour les params visuels via postMessage sans recharger l'iframe
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type:  "obs-chat-update",
      font:  chat.fontSize ?? 14,
      max:   chat.maxMessages ?? 8,
      scale: chat.scale ?? 1,
      align: chat.align ?? "center",
      msgbg: chat.msgBgOpacity ?? 0.92,
    }, "*");
  }, [chat.fontSize, chat.maxMessages, chat.scale, chat.align, chat.msgBgOpacity]);

  return (
    <div style={{
      ...rect(chat),
      borderRadius: chat.borderRadius,
      background: opacity > 0 ? `rgba(0,0,0,${opacity})` : "transparent",
      overflow: "hidden",
    }}>
      <iframe
        ref={iframeRef}
        key={chat.chatUrl}
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

function OverlayRenderer({ config }: { config: OverlayConfig }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "transparent",
    }}>
      {/* Fond en tout premier (derrière tout) */}
      <BackgroundZone bg={config.background} />
      {/* Zones principales */}
      <SlotZone slot={config.slot} />
      <StatsZone stats={config.stats} />
      <ChatZone chat={config.chat} />
      <PromoZone promo={config.promo} />
      {/* Cams en dernier = par-dessus le slot */}
      {config.cams.map((cam, i) => (
        <CamZone key={i} cam={cam} />
      ))}
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

  const baseConfig = React.useMemo(() => {
    if (!raw) return null;
    return decodeConfig(raw);
  }, [raw]);

  // Live config via socket (mis à jour par le designer en temps réel)
  const config = useLiveConfig(baseConfig ?? {} as OverlayConfig);
  const effectiveConfig = baseConfig ? config : null;

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

  if (!effectiveConfig) {
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
        <OverlayRenderer config={effectiveConfig} />
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
