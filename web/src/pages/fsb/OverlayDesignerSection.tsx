import * as React from "react";
import { io as ioConnect } from "socket.io-client";
import { BG_PRESETS, OverlayBgAnimation } from "./OverlayBgAnimations";
import {
  type SponsorConfig, defaultSponsor,
  SPONSOR_BANNER_STYLES, SPONSOR_ANIM_STYLES,
  SponsorBanner,
} from "./SponsorBanner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlayMode = "solo" | "double" | "triple";

export type ZoneRect = {
  x: number; // % of canvas width (0–100)
  y: number; // % of canvas height (0–100)
  w: number;
  h: number;
};

export type CamZoneConfig = ZoneRect & {
  enabled: boolean;
  greenscreen: boolean; // true = transparent, no frame
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  label: string;
  mirror?: boolean;
};

export type SlotZoneConfig = ZoneRect & {
  enabled: boolean;
  showFrame: boolean;
  frameColor: string;
  frameWidth: number;
  borderRadius: number;
  label: string;
  /** Bordure premium animée (gradient violet qui pulse autour du slot). */
  animatedBorder?: boolean;
};

export type StatsZoneConfig = ZoneRect & {
  enabled: boolean;
  bgColor: string;
  bgOpacity: number;
  textColor: string;
  // Éléments affichés (tous optionnels)
  showTimer: boolean;        // durée du stream
  showClock: boolean;        // heure actuelle HH:MM
  showTitle: boolean;
  titleText: string;
  showViewers: boolean;
  viewersText: string;
  showFollowers: boolean;
  followersText: string;
  showCommands: boolean;     // commandes !razed !discord etc.
  commands: string[];        // ex: ["!razed", "!discord", "!site"]
  separatorChar: string;     // "·" | "|" | "/" | "•"
  fontSize: number;          // px de base
  borderRadius: number;
};

export type ChatZoneConfig = ZoneRect & {
  enabled: boolean;
  chatUrl: string;
  fontSize: number;    // taille police messages (px) → ?font=
  maxMessages: number; // nb max messages affichés → ?max=
  scale: number;       // scale global du widget chat → ?scale= (0.1–2)
  align: "left" | "center" | "right"; // alignement des messages → ?align=
  msgBgOpacity: number; // opacité fond messages (0–1) → ?msgbg=
  compact: boolean;    // mode overlay compact (avatars réduits, no timestamp) → ?compact=1
  bgOpacity: number;
  borderRadius: number;
};

export type PromoZoneConfig = ZoneRect & {
  enabled: boolean;
  imageUrl: string;
  borderRadius: number;
  objectFit: "contain" | "cover" | "fill";
};

export type BackgroundConfig = {
  enabled: boolean;
  imageUrl: string;          // URL directe ou uploadée
  opacity: number;           // 0–100
  animated: boolean;
  animationType: "zoom" | "drift" | "breathe";
  animationSpeed: number;    // durée cycle en secondes
  animPreset?: string;       // fond animé canvas (ex: "particles_blue")
};

export type OverlayConfig = {
  mode: OverlayMode;
  background: BackgroundConfig;
  cams: CamZoneConfig[];
  slot: SlotZoneConfig;
  stats: StatsZoneConfig;
  chat: ChatZoneConfig;
  promo: PromoZoneConfig;
  sponsor: SponsorConfig;
};

// ─── Presets ──────────────────────────────────────────────────────────────────

// Layout reference (% of 1920x1080) — triple cam:
//
//  ┌────────────────────────────────────────────────────────────────┐
//  │                    STATS (100% × 5%)                          │
//  ├──────────────────────────────────────┬─────────────────────────┤
//  │                                      │  CAM 2 (29% × 22%)     │
//  │         SLOT (71% × 88%)             ├─────────────────────────┤
//  │                                      │  CHAT  (29% × 37%)     │
//  │                       ┌──────────────┤                         │
//  │  CAM 1 (17% × 28%)    │  PROMO       ├─────────────────────────┤
//  │  [bas-gauche / top]   │  (54% × 15%) │  CAM 3 (29% × 29%)     │
//  └───────────────────────┴──────────────┴─────────────────────────┘

function defaultCam(x: number, y: number, w: number, h: number, label: string): CamZoneConfig {
  return {
    enabled: true, greenscreen: false,
    // Thème dark premium : bordure qui suit le fond (indigo profond),
    // accent violet subtil par-dessus pour la cohérence visuelle.
    borderColor: "#1a2340", borderWidth: 2, borderRadius: 14,
    label, x, y, w, h,
  };
}

function defaultStats(w = 100): StatsZoneConfig {
  return {
    enabled: true, x: 0, y: 0, w, h: 5,
    bgColor: "#0a1628", bgOpacity: 92, textColor: "#dde8ff",
    showTimer: true, showClock: true,
    showTitle: true, titleText: "LunaLive",
    showViewers: true, viewersText: "—",
    showFollowers: false, followersText: "—",
    showCommands: true, commands: ["!razed", "!discord", "!site"],
    separatorChar: "·", fontSize: 13,
    borderRadius: 0,
  };
}

function defaultBackground(): BackgroundConfig {
  return {
    enabled: false,
    imageUrl: "",
    opacity: 100,
    animated: true,
    animationType: "zoom",
    animationSpeed: 30,
  };
}

const PRESETS: Record<OverlayMode, Omit<OverlayConfig, "mode">> = {
  // ── SOLO: cam principale bas-gauche (sur le slot), chat droit, promo bas-centre
  // Tout couvre 100% du canvas (stats 5% + zones 95% = 100%)
  solo: {
    background: defaultBackground(),
    cams: [defaultCam(0, 65, 17, 35, "Cam principale")],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 95 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 5,  w: 29, h: 95, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, align: "center", msgBgOpacity: 0.92, compact: true, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 22, imageUrl: "", borderRadius: 0, objectFit: "contain" },
    sponsor: defaultSponsor(),
  },

  double: {
    background: defaultBackground(),
    cams: [
      defaultCam(0,  65, 17, 35, "Cam principale"),
      defaultCam(71,  5, 29, 22, "Cam 2"),
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 95 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 27, w: 29, h: 73, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, align: "center", msgBgOpacity: 0.92, compact: true, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 22, imageUrl: "", borderRadius: 0, objectFit: "contain" },
    sponsor: defaultSponsor(),
  },

  triple: {
    background: defaultBackground(),
    cams: [
      defaultCam(0,  65, 17, 35, "Cam principale"),
      defaultCam(71,  5, 29, 22, "Cam 2"),
      defaultCam(71, 64, 29, 36, "Cam 3"),
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 95 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 27, w: 29, h: 37, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, align: "center", msgBgOpacity: 0.92, compact: true, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 22, imageUrl: "", borderRadius: 0, objectFit: "contain" },
    sponsor: defaultSponsor(),
  },
};

// ─── Slot auto-resize helper (quand cam principale toggle greenscreen) ────────

export function autoResizeSlot(config: OverlayConfig, cam0Greenscreen: boolean): Partial<SlotZoneConfig> {
  const statsBottom = config.stats.y + config.stats.h; // bas de la barre infos
  if (cam0Greenscreen) {
    // Slot s'étend sur toute la hauteur restante (cam GS = pas de cadre, streamer par-dessus)
    return { y: statsBottom, h: 100 - statsBottom };
  } else {
    // Slot s'arrête au-dessus de la cam 1
    const cam0 = config.cams[0];
    return { y: statsBottom, h: Math.max(cam0.y - statsBottom, 10) };
  }
}

export function defaultConfig(mode: OverlayMode): OverlayConfig {
  return { mode, ...structuredClone(PRESETS[mode]) };
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

export function encodeConfig(cfg: OverlayConfig): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  } catch {
    return "";
  }
}

export function decodeConfig(raw: string): OverlayConfig | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as OverlayConfig;
  } catch {
    return null;
  }
}

// ─── Zone color map ───────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  fond:  { bg: "rgba(15,23,42,.6)",    border: "#475569", label: "#94a3b8" },
  cam:   { bg: "rgba(99,102,241,.18)",  border: "#6366f1", label: "#a5b4fc" },
  slot:  { bg: "rgba(168,85,247,.18)",  border: "#a855f7", label: "#c084fc" },
  stats: { bg: "rgba(245,158,11,.18)",  border: "#f59e0b", label: "#fbbf24" },
  chat:  { bg: "rgba(34,211,238,.18)",  border: "#22d3ee", label: "#67e8f9" },
  promo: { bg: "rgba(16,185,129,.18)",  border: "#10b981", label: "#34d399" },
};

// ─── Preview canvas ───────────────────────────────────────────────────────────

/** Mesure la largeur du conteneur en px (pour scaler les éléments réels) */
function useContainerWidth(ref: React.RefObject<HTMLDivElement>) {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(ref.current);
    setWidth(ref.current.offsetWidth);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Injection CSS animations pour la preview stats */
function useStatsAnimations() {
  React.useEffect(() => {
    const id = "overlay-stats-anim";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes pLiveDot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.25;transform:scale(.55)} }
      @keyframes pCmdGlow  { 0%,100%{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.28)} 50%{background:rgba(99,102,241,.22);border-color:rgba(99,102,241,.55)} }
      @keyframes pClockSpin{ 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      @keyframes pViewerPing{ 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} 50%{box-shadow:0 0 8px 2px rgba(99,102,241,.35)} }
    `;
    document.head.appendChild(s);
  }, []);
}

/** Rendu réel de la barre stats dans la preview — scaled selon la largeur du canvas */
function PreviewStatsBar({ stats, scale }: { stats: StatsZoneConfig; scale: number }) {
  useStatsAnimations();

  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const sec = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const timer = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;

  const [clock, setClock] = React.useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  React.useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const bgHex = stats.bgColor || "#0a1628";
  const op = (stats.bgOpacity ?? 80) / 100;
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const bgRgba = `rgba(${r},${g},${b},${op})`;

  const tc = stats.textColor || "#dde8ff";
  const fs = Math.max(4, (stats.fontSize ?? 13) * scale);
  const monoFont = "'Courier New', monospace";
  const sansFont = "'Inter', 'Segoe UI', system-ui, sans-serif";

  const commands = (stats.showCommands ? stats.commands ?? [] : []).filter(Boolean);

  return (
    <div style={{
      position: "absolute",
      left: `${stats.x}%`, top: `${stats.y}%`,
      width: `${stats.w}%`, height: `${stats.h}%`,
      background: bgRgba,
      borderRadius: stats.borderRadius * scale,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `0 ${12 * scale}px`,
      overflow: "hidden",
      boxSizing: "border-box",
    }}>

      {/* GAUCHE : titre (coin) + timer juste après */}
      <div style={{ display: "flex", alignItems: "center", gap: `${5 * scale}px`, flexShrink: 0 }}>
        {stats.showTitle && stats.titleText && (
          <span style={{ color: tc, fontSize: `${fs}px`, fontFamily: sansFont, fontWeight: 700, opacity: 0.85 }}>
            {stats.titleText}
          </span>
        )}
        {stats.showTitle && stats.titleText && stats.showTimer && (
          <span style={{ color: "rgba(255,255,255,.2)", fontSize: `${fs}px`, padding: `0 ${2 * scale}px` }}>|</span>
        )}
        {stats.showTimer && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: `${3 * scale}px`, color: tc, fontSize: `${fs}px`, fontFamily: monoFont, fontWeight: 800 }}>
            <span style={{
              display: "inline-block",
              width: `${fs * 0.5}px`, height: `${fs * 0.5}px`,
              borderRadius: "50%", background: "#6366f1",
              boxShadow: `0 0 ${4 * scale}px #6366f1`,
              animation: "pLiveDot 1.8s ease-in-out infinite", flexShrink: 0,
            }} />
            {timer}
          </span>
        )}
      </div>

      {/* CENTRE : commandes */}
      {commands.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: `${4 * scale}px`,
          position: "absolute", left: "50%", transform: "translateX(-50%)",
        }}>
          {commands.map((cmd, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center",
              padding: `${1 * scale}px ${5 * scale}px`,
              borderRadius: "999px",
              border: `${Math.max(1, scale)}px solid rgba(99,102,241,.28)`,
              background: "rgba(99,102,241,.1)",
              color: "#c7d2fe",
              fontSize: `${fs * 1.08}px`,
              letterSpacing: ".02em",
              fontFamily: monoFont, fontWeight: 800,
              whiteSpace: "nowrap",
              animation: `pCmdGlow ${3 + i * 0.7}s ease-in-out infinite`,
            }}>{cmd}</span>
          ))}
        </div>
      )}

      {/* DROITE : horloge + viewers/followers (viewers en coin) */}
      <div style={{ display: "flex", alignItems: "center", gap: `${5 * scale}px`, flexShrink: 0 }}>
        {stats.showClock && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: `${3 * scale}px`, color: tc, fontSize: `${fs}px`, fontFamily: monoFont, fontWeight: 800 }}>
            <span style={{ display: "inline-block", animation: "pClockSpin 12s linear infinite", transformOrigin: "center", lineHeight: 1 }}>◷</span>
            {clock}
          </span>
        )}
        {stats.showClock && (stats.showViewers || stats.showFollowers) && (
          <span style={{ color: "rgba(255,255,255,.2)", fontSize: `${fs}px`, padding: `0 ${2 * scale}px` }}>|</span>
        )}
        {stats.showFollowers && stats.followersText && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: `${3 * scale}px`, color: tc, fontSize: `${fs}px`, fontFamily: sansFont, fontWeight: 700 }}>
            <span style={{ color: "#f472b6" }}>♥</span>
            {stats.followersText}
          </span>
        )}
        {stats.showFollowers && stats.followersText && stats.showViewers && stats.viewersText && (
          <span style={{ color: "rgba(255,255,255,.2)", fontSize: `${fs}px`, padding: `0 ${2 * scale}px` }}>|</span>
        )}
        {stats.showViewers && stats.viewersText && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: `${3 * scale}px`,
            color: tc, fontSize: `${fs}px`, fontFamily: sansFont, fontWeight: 700,
            animation: "pViewerPing 3s ease-in-out infinite",
            borderRadius: `${4 * scale}px`, padding: `${1 * scale}px ${3 * scale}px`,
          }}>
            <span style={{ color: "#818cf8" }}>●</span>
            {stats.viewersText}
            <span style={{ opacity: 0.6, fontSize: `${fs * 0.88}px` }}>viewers</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Keyframes premium partagées (preview + OBS overlay). Injectées une seule fois. */
export function injectPremiumKeyframes() {
  const id = "lunalive-premium-keyframes";
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = `
    @keyframes slotBorderSweep {
      0%   { background-position: 0%   50%; }
      100% { background-position: 300% 50%; }
    }
    @keyframes slotBorderGlow {
      0%, 100% { box-shadow: 0 0 0 rgba(139,92,246,0), inset 0 0 0 rgba(139,92,246,0); }
      50%      { box-shadow: 0 0 22px rgba(139,92,246,.25), inset 0 0 14px rgba(139,92,246,.1); }
    }
  `;
  document.head.appendChild(s);
}

/** Rendu du slot dans la preview avec support bordure premium animée. */
function PreviewSlotZone({ slot }: { slot: SlotZoneConfig }) {
  React.useEffect(() => { injectPremiumKeyframes(); }, []);
  const { enabled, showFrame, animatedBorder, frameColor, frameWidth, borderRadius, label, x, y, w, h } = slot;

  const basePos: React.CSSProperties = {
    position: "absolute",
    left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
    boxSizing: "border-box",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  };

  if (!enabled) {
    return (
      <div style={{
        ...basePos,
        background: ZONE_COLORS.slot.bg, border: `1.5px dashed ${ZONE_COLORS.slot.border}`,
        borderRadius: 6, opacity: 0.4,
      }}>
        <span style={{ fontSize: "clamp(7px,1.6vw,11px)", fontWeight: 700, color: ZONE_COLORS.slot.label, background: "rgba(0,0,0,.45)", padding: "2px 5px", borderRadius: 4 }}>
          {label || "Slot"}
        </span>
      </div>
    );
  }

  // Bordure premium animée : gradient conique/linéaire qui sweep tout autour
  if (showFrame && animatedBorder) {
    const pad = Math.max(1, frameWidth || 2);
    return (
      <div style={{
        ...basePos,
        padding: pad,
        background: "linear-gradient(120deg,#3b3473,#6d5ecc,#a855f7,#6d5ecc,#3b3473)",
        backgroundSize: "300% 100%",
        animation: "slotBorderSweep 6s linear infinite, slotBorderGlow 3.4s ease-in-out infinite",
        borderRadius: borderRadius + pad,
      }}>
        <div style={{
          width: "100%", height: "100%",
          borderRadius: borderRadius,
          background: ZONE_COLORS.slot.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "clamp(7px,1.6vw,11px)", fontWeight: 700, color: ZONE_COLORS.slot.label, background: "rgba(0,0,0,.45)", padding: "2px 5px", borderRadius: 4 }}>
            {label || "Slot"}
          </span>
        </div>
      </div>
    );
  }

  // Bordure classique
  return (
    <div style={{
      ...basePos,
      background: ZONE_COLORS.slot.bg,
      border: showFrame ? `${frameWidth}px solid ${frameColor}` : `1.5px solid ${ZONE_COLORS.slot.border}`,
      borderRadius: Math.max(6, borderRadius),
    }}>
      <span style={{ fontSize: "clamp(7px,1.6vw,11px)", fontWeight: 700, color: ZONE_COLORS.slot.label, background: "rgba(0,0,0,.45)", padding: "2px 5px", borderRadius: 4 }}>
        {label || "Slot"}
      </span>
    </div>
  );
}

function PreviewZone({
  rect, color, name, disabled,
}: {
  rect: ZoneRect;
  color: { bg: string; border: string; label: string };
  name: string;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.x}%`, top: `${rect.y}%`,
        width: `${rect.w}%`, height: `${rect.h}%`,
        background: disabled ? "rgba(255,255,255,.03)" : color.bg,
        border: `1.5px ${disabled ? "dashed" : "solid"} ${color.border}`,
        borderRadius: 6,
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        transition: "all .2s",
      }}
    >
      <span style={{
        fontSize: "clamp(7px, 1.6vw, 11px)",
        fontWeight: 700,
        color: color.label,
        background: "rgba(0,0,0,.45)",
        padding: "2px 5px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "90%",
      }}>
        {name}
      </span>
    </div>
  );
}

/** Contenu intérieur du canvas (réutilisé inline + fullscreen) */
function PreviewCanvasContent({ config, scale, chatIframeRef }: {
  config: OverlayConfig;
  scale: number;
  chatIframeRef?: React.RefObject<HTMLIFrameElement>;
}) {
  return (
    <>
      {/* Fond animé CSS */}
      {config.background.enabled && config.background.animPreset && config.background.animPreset !== "none" && (
        <OverlayBgAnimation preset={config.background.animPreset} opacity={config.background.opacity} />
      )}
      {/* Fond image */}
      {config.background.enabled && config.background.imageUrl && (
        <img
          src={config.background.imageUrl}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: (config.background.opacity ?? 100) / 100,
            pointerEvents: "none",
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      {config.background.enabled && !config.background.imageUrl && (!config.background.animPreset || config.background.animPreset === "none") && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(30,41,59,.5)",
          border: "1.5px dashed #475569",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: `${12 * scale}px`, color: "#94a3b8", fontWeight: 700 }}>
            🖼 Fond activé — pas d'image
          </span>
        </div>
      )}
      {/* Slot */}
      <PreviewSlotZone slot={config.slot} />
      {/* Stats — rendu réel si activé */}
      {config.stats.enabled && scale > 0
        ? <PreviewStatsBar stats={config.stats} scale={scale} />
        : <PreviewZone rect={config.stats} color={ZONE_COLORS.stats} name="Stats" disabled={!config.stats.enabled} />
      }
      {/* Chat — iframe réelle si URL branchée, sinon zone colorée */}
      {config.chat.enabled && config.chat.chatUrl
        ? (
          <div style={{
            position: "absolute",
            left: `${config.chat.x}%`, top: `${config.chat.y}%`,
            width: `${config.chat.w}%`, height: `${config.chat.h}%`,
            borderRadius: config.chat.borderRadius,
            overflow: "hidden",
            border: `1.5px solid ${ZONE_COLORS.chat.border}`,
            boxSizing: "border-box",
          }}>
            <iframe
              ref={chatIframeRef}
              key={stableChatKey(config.chat.chatUrl)}
              src={config.chat.chatUrl}
              style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
              title="Chat preview"
              allow="autoplay"
            />
          </div>
        )
        : <PreviewZone rect={config.chat} color={ZONE_COLORS.chat} name="Chat — pas d'URL" disabled={!config.chat.enabled} />
      }
      {/* Promo */}
      <PreviewZone rect={config.promo} color={ZONE_COLORS.promo} name={config.promo.imageUrl ? "Promo ✓" : "Promo"} disabled={!config.promo.enabled} />
      {/* Sponsor */}
      {config.sponsor?.enabled
        ? <SponsorBanner config={config.sponsor} />
        : <PreviewZone rect={config.sponsor ?? { x:5, y:87, w:90, h:11 }} color={{ bg:"rgba(251,191,36,.12)", border:"#f59e0b", label:"#fbbf24" }} name="Sponsor (OFF)" disabled />
      }
      {/* Cams — par-dessus */}
      {config.cams.map((cam, i) => (
        <PreviewZone key={`cam-${i}`} rect={cam} color={ZONE_COLORS.cam} name={cam.label} disabled={!cam.enabled} />
      ))}
      {/* Grid hint */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
        backgroundSize: "10% 10%",
      }} />
    </>
  );
}

/** Canvas standalone avec son propre ref + scale (utilisé dans le modal fullscreen) */
function PreviewCanvasStandalone({ config, borderRadius = 12 }: { config: OverlayConfig; borderRadius?: number }) {
  const ref = React.useRef<HTMLDivElement>(null!);
  const w = useContainerWidth(ref);
  const scale = w > 0 ? w / 1920 : 1;
  return (
    <div ref={ref} style={{
      position: "relative", width: "100%", aspectRatio: "16/9",
      background: "repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%, transparent 0% 50%) 0 0 / 24px 24px, #060d1c",
      borderRadius, border: "1px solid rgba(60,95,175,.28)", overflow: "hidden",
    }}>
      <PreviewCanvasContent config={config} scale={scale} />
    </div>
  );
}

/** Modal fullscreen */
function FullscreenPreviewModal({ config, onClose }: { config: OverlayConfig; onClose: () => void }) {
  // Fermer sur Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(3,8,18,.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16, padding: 24,
        backdropFilter: "blur(6px)",
      }}
    >
      {/* Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 1400, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#dde8ff", letterSpacing: "-.01em" }}>
            Preview plein écran — 1920 × 1080
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: "rgba(148,178,232,.5)" }}>
            Appuie sur Échap ou clique en dehors pour fermer
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: "1px solid rgba(239,68,68,.3)", borderRadius: 8,
            background: "rgba(239,68,68,.08)", color: "#f87171",
            padding: "6px 14px", cursor: "pointer", font: "inherit",
            fontSize: 13, fontWeight: 700,
          }}
        >✕ Fermer</button>
      </div>

      {/* Canvas */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 1400 }}
      >
        <PreviewCanvasStandalone config={config} borderRadius={8} />
      </div>

      {/* Légende */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}
      >
        {Object.entries(ZONE_COLORS).map(([key, c]) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(148,178,232,.7)" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}`, display: "inline-block" }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

function OverlayPreview({ config }: { config: OverlayConfig }) {
  const canvasRef = React.useRef<HTMLDivElement>(null!);
  const chatIframeRef = React.useRef<HTMLIFrameElement>(null!);
  const canvasWidth = useContainerWidth(canvasRef);
  const scale = canvasWidth > 0 ? canvasWidth / 1920 : 1;
  const [fullscreen, setFullscreen] = React.useState(false);

  // Envoie postMessage à l'iframe chat quand les params visuels changent (sans reload)
  const chat = config.chat;
  React.useEffect(() => {
    const iframe = chatIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: "obs-chat-update",
      font:  chat.fontSize ?? 14,
      max:   chat.maxMessages ?? 8,
      scale: chat.scale ?? 1,
      align: chat.align ?? "center",
      msgbg: chat.msgBgOpacity ?? 0.92,
    }, "*");
  }, [chat.fontSize, chat.maxMessages, chat.scale, chat.align, chat.msgBgOpacity]);

  return (
    <>
      {fullscreen && <FullscreenPreviewModal config={config} onClose={() => setFullscreen(false)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(148,178,232,.62)" }}>
            Preview 16:9
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(148,178,232,.5)" }}>1920 × 1080</span>
            <button
              onClick={() => setFullscreen(true)}
              title="Ouvrir en plein écran"
              style={{
                border: "1px solid rgba(99,102,241,.3)", borderRadius: 7,
                background: "rgba(99,102,241,.08)", color: "#a5b4fc",
                padding: "3px 10px", cursor: "pointer", font: "inherit",
                fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              ⛶ Plein écran
            </button>
          </div>
        </div>

        <div
          ref={canvasRef}
          style={{
            position: "relative", width: "100%", aspectRatio: "16/9",
            background: "repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%, transparent 0% 50%) 0 0 / 24px 24px, #060d1c",
            borderRadius: 12, border: "1px solid rgba(60,95,175,.28)", overflow: "hidden",
          }}
        >
          <PreviewCanvasContent config={config} scale={scale} chatIframeRef={chatIframeRef} />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(ZONE_COLORS).map(([key, c]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(148,178,232,.7)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}`, display: "inline-block" }} />
              {key}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Shared form atoms ────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  label:  { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "rgba(148,178,232,.62)", display: "block", marginBottom: 5 },
  field:  { display: "grid", gap: 6 },
  row2:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  row4:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 },
  input:  { width: "100%", boxSizing: "border-box" as const, borderRadius: 8, border: "1px solid rgba(60,95,175,.22)", background: "rgba(14,29,56,.9)", color: "#dde8ff", font: "inherit", fontSize: 13, padding: "7px 10px", outline: "none" },
  toggle: { display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, color: "#dde8ff", cursor: "pointer" },
  section:{ background: "rgba(14,29,56,.6)", border: "1px solid rgba(60,95,175,.18)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" as const, gap: 12 },
  sep:    { border: "none", borderTop: "1px solid rgba(255,255,255,.05)", margin: "4px 0" },
};

function NumInput({ label, value, onChange, min = 0, max = 100, step = 0.5 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <input
        style={S.input}
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <input
        style={S.input}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 32, border: "1px solid rgba(60,95,175,.22)", borderRadius: 8, background: "none", cursor: "pointer", padding: 2 }} />
        <input style={{ ...S.input, flex: 1 }} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label style={S.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#6366f1" }} />
      {label}
    </label>
  );
}

function RectInputs({ value, onChange }: {
  value: ZoneRect; onChange: (patch: Partial<ZoneRect>) => void;
}) {
  return (
    <div style={S.row4}>
      <NumInput label="X %" value={value.x} onChange={(v) => onChange({ x: v })} />
      <NumInput label="Y %" value={value.y} onChange={(v) => onChange({ y: v })} />
      <NumInput label="W %" value={value.w} onChange={(v) => onChange({ w: v })} />
      <NumInput label="H %" value={value.h} onChange={(v) => onChange({ h: v })} />
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

function Panel({
  id, activeId, setActiveId, title, badge, badgeColor, children,
}: {
  id: string; activeId: string | null; setActiveId: (id: string | null) => void;
  title: string; badge?: string; badgeColor?: string;
  children: React.ReactNode;
}) {
  const open = activeId === id;
  return (
    <div style={{
      border: `1px solid ${open ? "rgba(99,102,241,.32)" : "rgba(60,95,175,.18)"}`,
      borderRadius: 12,
      overflow: "hidden",
      transition: "border-color .15s",
    }}>
      <button
        onClick={() => setActiveId(open ? null : id)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 14px", background: open ? "rgba(99,102,241,.08)" : "rgba(14,29,56,.7)",
          border: "none", cursor: "pointer", font: "inherit", color: "#dde8ff", fontWeight: 700, fontSize: 13,
          transition: "background .15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
              background: badgeColor || "rgba(99,102,241,.2)",
              color: badgeColor ? "#fff" : "#a5b4fc",
              border: "1px solid rgba(99,102,241,.2)",
            }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: "rgba(148,178,232,.5)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: 14, background: "rgba(10,22,40,.9)", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Zone panels ──────────────────────────────────────────────────────────────

function CamPanel({
  cam, onChange, panelId, activeId, setActiveId,
}: {
  cam: CamZoneConfig;
  onChange: (patch: Partial<CamZoneConfig>) => void;
  panelId: string; activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  return (
    <Panel
      id={panelId} activeId={activeId} setActiveId={setActiveId}
      title={`📷 ${cam.label}`}
      badge={cam.enabled ? "ON" : "OFF"}
      badgeColor={cam.enabled ? "#10b981" : undefined}
    >
      <Toggle label="Activer" checked={cam.enabled} onChange={(v) => onChange({ enabled: v })} />
      <Toggle label="Miroir (inverser gauche/droite)" checked={!!cam.mirror} onChange={(v) => onChange({ mirror: v })} />
      <hr style={S.sep} />
      <div style={S.row2}>
        <ColorInput label="Couleur bordure" value={cam.borderColor} onChange={(v) => onChange({ borderColor: v })} />
        <NumInput label="Epaisseur (px)" value={cam.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} max={20} step={1} />
      </div>
      <NumInput label="Border radius (px)" value={cam.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={60} step={1} />
      <TextInput label="Label" value={cam.label} onChange={(v) => onChange({ label: v })} />
      <hr style={S.sep} />
      <RectInputs value={cam} onChange={onChange} />
    </Panel>
  );
}

function SlotPanel({
  slot, onChange, activeId, setActiveId,
}: {
  slot: SlotZoneConfig;
  onChange: (patch: Partial<SlotZoneConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  return (
    <Panel id="slot" activeId={activeId} setActiveId={setActiveId}
      title="🎰 Zone Slot"
      badge={slot.enabled ? "ON" : "OFF"}
      badgeColor={slot.enabled ? "#a855f7" : undefined}
    >
      <Toggle label="Activer" checked={slot.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />
      <Toggle label="Afficher un cadre" checked={slot.showFrame} onChange={(v) => onChange({ showFrame: v })} />
      {slot.showFrame && (
        <>
          <Toggle
            label="Bordure premium animée (gradient violet)"
            checked={slot.animatedBorder ?? false}
            onChange={(v) => onChange({ animatedBorder: v })}
          />
          <div style={S.row2}>
            <ColorInput label="Couleur cadre" value={slot.frameColor} onChange={(v) => onChange({ frameColor: v })} />
            <NumInput label="Epaisseur (px)" value={slot.frameWidth} onChange={(v) => onChange({ frameWidth: v })} min={0} max={20} step={1} />
          </div>
        </>
      )}
      <div style={S.row2}>
        <NumInput label="Border radius (px)" value={slot.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
        <TextInput label="Label" value={slot.label} onChange={(v) => onChange({ label: v })} />
      </div>
      <hr style={S.sep} />
      <RectInputs value={slot} onChange={onChange} />
    </Panel>
  );
}

function StatsPanel({
  stats, onChange, activeId, setActiveId,
}: {
  stats: StatsZoneConfig;
  onChange: (patch: Partial<StatsZoneConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  const commands = stats.commands ?? [];

  function addCommand() {
    onChange({ commands: [...commands, "!cmd"] });
  }

  function updateCommand(i: number, val: string) {
    const next = commands.map((c, idx) => idx === i ? val : c);
    onChange({ commands: next });
  }

  function removeCommand(i: number) {
    onChange({ commands: commands.filter((_, idx) => idx !== i) });
  }

  return (
    <Panel id="stats" activeId={activeId} setActiveId={setActiveId}
      title="📊 Barre Stats"
      badge={stats.enabled ? "ON" : "OFF"}
      badgeColor={stats.enabled ? "#f59e0b" : undefined}
    >
      <Toggle label="Activer" checked={stats.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />

      {/* Apparence */}
      <div style={S.row2}>
        <ColorInput label="Fond" value={stats.bgColor} onChange={(v) => onChange({ bgColor: v })} />
        <NumInput label="Opacite fond (%)" value={stats.bgOpacity} onChange={(v) => onChange({ bgOpacity: v })} min={0} max={100} step={5} />
      </div>
      <div style={S.row2}>
        <ColorInput label="Couleur texte" value={stats.textColor} onChange={(v) => onChange({ textColor: v })} />
        <NumInput label="Taille police (px)" value={stats.fontSize ?? 13} onChange={(v) => onChange({ fontSize: v })} min={8} max={24} step={1} />
      </div>
      <div style={S.row2}>
        <div style={S.field}>
          <span style={S.label}>Séparateur</span>
          <select style={S.input} value={stats.separatorChar ?? "·"} onChange={(e) => onChange({ separatorChar: e.target.value })}>
            <option value="·">· (point médian)</option>
            <option value="|">| (barre)</option>
            <option value="/">/ (slash)</option>
            <option value="•">• (puce)</option>
            <option value="—">— (tiret)</option>
          </select>
        </div>
        <NumInput label="Border radius (px)" value={stats.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
      </div>
      <hr style={S.sep} />

      {/* Éléments */}
      <span style={{ ...S.label, display: "block", marginBottom: 8 }}>Éléments affichés</span>

      <Toggle label="Durée du stream (timer)" checked={stats.showTimer} onChange={(v) => onChange({ showTimer: v })} />
      <Toggle label="Heure actuelle (horloge)" checked={stats.showClock ?? false} onChange={(v) => onChange({ showClock: v })} />

      <Toggle label="Titre du stream" checked={stats.showTitle} onChange={(v) => onChange({ showTitle: v })} />
      {stats.showTitle && (
        <TextInput label="Texte titre" value={stats.titleText} onChange={(v) => onChange({ titleText: v })} placeholder="ex: LunaLive — Session Bonus" />
      )}

      <Toggle label="Viewers" checked={stats.showViewers} onChange={(v) => onChange({ showViewers: v })} />
      {stats.showViewers && (
        <TextInput label="Texte viewers (statique)" value={stats.viewersText} onChange={(v) => onChange({ viewersText: v })} placeholder="ex: 420" />
      )}

      <Toggle label="Followers" checked={stats.showFollowers} onChange={(v) => onChange({ showFollowers: v })} />
      {stats.showFollowers && (
        <TextInput label="Texte followers (statique)" value={stats.followersText} onChange={(v) => onChange({ followersText: v })} placeholder="ex: 12 500" />
      )}

      <Toggle label="Commandes chat" checked={stats.showCommands ?? false} onChange={(v) => onChange({ showCommands: v })} />
      {(stats.showCommands ?? false) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {commands.map((cmd, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input
                style={{ ...S.input, flex: 1, fontFamily: "monospace" }}
                value={cmd}
                onChange={(e) => updateCommand(i, e.target.value)}
                placeholder="!commande"
              />
              <button
                onClick={() => removeCommand(i)}
                style={{ border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, background: "rgba(239,68,68,.08)", color: "#f87171", padding: "0 10px", cursor: "pointer", font: "inherit", fontSize: 13 }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={addCommand}
            style={{ border: "1px dashed rgba(99,102,241,.3)", borderRadius: 8, background: "transparent", color: "#a5b4fc", padding: "7px 0", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700 }}
          >+ Ajouter une commande</button>
        </div>
      )}

      <hr style={S.sep} />
      <RectInputs value={stats} onChange={onChange} />
    </Panel>
  );
}

// ─── Background Panel ─────────────────────────────────────────────────────────

function BackgroundPanel({
  bg, onChange, activeId, setActiveId,
}: {
  bg: BackgroundConfig;
  onChange: (patch: Partial<BackgroundConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("lunalive_token_v1") || "";
      const res = await fetch(`${LUNA_API_BASE}/me/overlay/bg/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setUploadErr(json?.error || "Erreur upload");
      } else {
        onChange({ imageUrl: json.url, enabled: true });
      }
    } catch {
      setUploadErr("Erreur réseau");
    } finally {
      setUploading(false);
    }
  }

  const hasImage = !!bg.imageUrl;

  return (
    <Panel id="background" activeId={activeId} setActiveId={setActiveId}
      title="🖼 Fond d'overlay"
      badge={bg.enabled && hasImage ? "Image OK" : bg.enabled ? "Vide" : "OFF"}
      badgeColor={bg.enabled && hasImage ? "#10b981" : undefined}
    >
      <Toggle label="Activer le fond" checked={bg.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />

      {/* URL ou upload */}
      <TextInput
        label="URL de l'image / GIF"
        value={bg.imageUrl}
        onChange={(v) => onChange({ imageUrl: v })}
        placeholder="https://... ou coller URL après upload"
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1, border: "1px dashed rgba(99,102,241,.4)", borderRadius: 8,
            background: "rgba(99,102,241,.06)", color: "#a5b4fc",
            padding: "8px 0", cursor: uploading ? "wait" : "pointer",
            font: "inherit", fontSize: 12, fontWeight: 700,
          }}
        >
          {uploading ? "Upload en cours…" : "📁 Upload image depuis le PC"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {uploadErr && (
        <p style={{ margin: 0, fontSize: 11, color: "#f87171", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, padding: "6px 10px" }}>
          ✕ {uploadErr}
        </p>
      )}

      {hasImage && (
        <img
          src={bg.imageUrl}
          alt="Preview fond"
          style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(60,95,175,.2)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}

      <hr style={S.sep} />
      <NumInput label="Opacité (%)" value={bg.opacity} onChange={(v) => onChange({ opacity: v })} min={10} max={100} step={5} />
      <Toggle label="Animation (image)" checked={bg.animated} onChange={(v) => onChange({ animated: v })} />
      {bg.animated && (
        <div style={S.row2}>
          <div style={S.field}>
            <span style={S.label}>Type d'animation</span>
            <select style={S.input} value={bg.animationType} onChange={(e) => onChange({ animationType: e.target.value as BackgroundConfig["animationType"] })}>
              <option value="zoom">Zoom lent (Ken Burns)</option>
              <option value="drift">Dérive (panoramique)</option>
              <option value="breathe">Respiration (pulse)</option>
            </select>
          </div>
          <NumInput label="Durée cycle (s)" value={bg.animationSpeed} onChange={(v) => onChange({ animationSpeed: v })} min={10} max={120} step={5} />
        </div>
      )}

      <hr style={S.sep} />
      <div style={S.field}>
        <span style={S.label}>🎨 Fond animé CSS (sans image)</span>
        <select
          style={S.input}
          value={bg.animPreset ?? "none"}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "none") onChange({ animPreset: undefined });
            else onChange({ animPreset: val, enabled: true });
          }}
        >
          {BG_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      {bg.animPreset && bg.animPreset !== "none" && (
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(60,95,175,.2)", background: "#020a18" }}>
          <OverlayBgAnimation preset={bg.animPreset} opacity={bg.opacity} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 11, color: "rgba(200,220,255,.4)", fontWeight: 700 }}>PREVIEW</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

// Streamers LunaLive avec chat disponible
const LUNA_CHAT_SLUGS = ["fabiozsis", "lecasinoze"];

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

const SITE_BASE = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "").replace(/\/$/, "")
  || window.location.origin;

/** Clé stable pour l'iframe chat — identique à chatIframeKey dans OverlayPage.
 *  Ignore les params visuels (font/scale/align/etc.) pour éviter le rechargement. */
function stableChatKey(chatUrl: string): string {
  try {
    const u = new URL(chatUrl);
    const slug  = u.searchParams.get("slug")  ?? "";
    const token = u.searchParams.get("token") ?? "";
    const api   = u.searchParams.get("api")   ?? "";
    return `${u.origin}${u.pathname}|${slug}|${token}|${api}`;
  } catch {
    return chatUrl;
  }
}

function lunaChatUrl(slug: string, fontSize = 14, maxMessages = 8, scale = 1, align: ChatZoneConfig["align"] = "center", msgBgOpacity = 0.92, compact = true) {
  const base = `${SITE_BASE}/overlay/obs/chat.html`;
  const params = new URLSearchParams({
    slug,
    api: LUNA_API_BASE,
    font: String(fontSize),
    max: String(maxMessages),
    scale: String(Math.round(scale * 100) / 100),
    align,
    msgbg: String(Math.round(msgBgOpacity * 100) / 100),
  });
  if (compact) params.set("compact", "1");
  return `${base}?${params.toString()}`;
}

/** Injecte/écrase les paramètres de rendu dans n'importe quelle URL de chat */
export function chatUrlWithParams(url: string, opts: { fontSize?: number; maxMessages?: number; scale?: number; zoneWidthPct?: number }): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (opts.fontSize != null) u.searchParams.set("font", String(Math.round(opts.fontSize)));
    if (opts.maxMessages != null) u.searchParams.set("max", String(Math.round(opts.maxMessages)));
    if (opts.scale != null) u.searchParams.set("scale", String(Math.round(opts.scale * 100) / 100));
    if (opts.zoneWidthPct != null) {
      const mw = Math.round((opts.zoneWidthPct / 100) * 1920);
      u.searchParams.set("mw", String(mw));
    }
    return u.toString();
  } catch {
    return url;
  }
}

function ChatPanel({
  chat, onChange, activeId, setActiveId,
}: {
  chat: ChatZoneConfig;
  onChange: (patch: Partial<ChatZoneConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {

  return (
    <Panel id="chat" activeId={activeId} setActiveId={setActiveId}
      title="💬 Zone Chat"
      badge={chat.enabled ? "ON" : "OFF"}
      badgeColor={chat.enabled ? "#22d3ee" : undefined}
    >
      <Toggle label="Activer" checked={chat.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />

      {/* Branchement rapide LunaLive */}
      <div style={S.field}>
        <span style={S.label}>Brancher chat LunaLive</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LUNA_CHAT_SLUGS.map((slug) => {
            const isActive = chat.chatUrl.includes(`slug=${slug}`);
            return (
              <button
                key={slug}
                onClick={() => onChange({ chatUrl: lunaChatUrl(slug, chat.fontSize ?? 14, chat.maxMessages ?? 8, chat.scale ?? 1, chat.align ?? "center", chat.msgBgOpacity ?? 0.92, chat.compact ?? true), enabled: true })}
                style={{
                  border: `1px solid ${isActive ? "rgba(34,211,238,.5)" : "rgba(34,211,238,.2)"}`,
                  borderRadius: 8,
                  background: isActive ? "rgba(34,211,238,.12)" : "rgba(34,211,238,.04)",
                  color: isActive ? "#67e8f9" : "rgba(103,232,249,.6)",
                  padding: "5px 12px", cursor: "pointer", font: "inherit",
                  fontSize: 12, fontWeight: 700,
                }}
              >
                {slug}
              </button>
            );
          })}
        </div>
      </div>

      <TextInput
        label="Ou URL personnalisée (Twitch popout, Kick…)"
        value={chat.chatUrl}
        onChange={(v) => onChange({ chatUrl: v })}
        placeholder="https://www.twitch.tv/popout/.../chat?popout="
      />
      <div style={S.row2}>
        <NumInput label="Police (px)" value={chat.fontSize ?? 14} onChange={(v) => onChange({ fontSize: v })} min={8} max={48} step={1} />
        <NumInput label="Nb messages max" value={chat.maxMessages ?? 8} onChange={(v) => onChange({ maxMessages: v })} min={1} max={30} step={1} />
      </div>

      {/* Scale */}
      <div style={S.field}>
        <span style={S.label}>Scale (taille globale : 0.3 = mini · 1 = normal · 2 = grand)</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="range" min={0.1} max={2} step={0.05}
            value={chat.scale ?? 1}
            onChange={(e) => onChange({ scale: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#22d3ee" }}
          />
          <span style={{ color: "#dde8ff", fontWeight: 800, fontSize: 13, minWidth: 36, textAlign: "right" }}>
            ×{(chat.scale ?? 1).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Alignement */}
      <div style={S.field}>
        <span style={S.label}>Alignement des messages</span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => onChange({ align: a })}
              style={{
                flex: 1, border: `1px solid ${(chat.align ?? "center") === a ? "rgba(34,211,238,.5)" : "rgba(60,95,175,.2)"}`,
                borderRadius: 8, background: (chat.align ?? "center") === a ? "rgba(34,211,238,.1)" : "rgba(14,29,56,.6)",
                color: (chat.align ?? "center") === a ? "#67e8f9" : "rgba(148,178,232,.6)",
                padding: "6px 0", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700,
              }}
            >{a === "left" ? "← Gauche" : a === "center" ? "Centré" : "Droite →"}</button>
          ))}
        </div>
      </div>

      {/* Fond des messages */}
      <div style={S.field}>
        <span style={S.label}>Opacité fond messages (0 = transparent · 1 = plein)</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="range" min={0} max={1} step={0.05}
            value={chat.msgBgOpacity ?? 0.92}
            onChange={(e) => onChange({ msgBgOpacity: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#22d3ee" }}
          />
          <span style={{ color: "#dde8ff", fontWeight: 800, fontSize: 13, minWidth: 32, textAlign: "right" }}>
            {Math.round((chat.msgBgOpacity ?? 0.92) * 100)}%
          </span>
        </div>
      </div>

      <Toggle
        label="Mode compact (avatars réduits, sans timestamp)"
        checked={chat.compact ?? true}
        onChange={(v) => onChange({ compact: v })}
      />
      <NumInput label="Opacite zone (fond iframe %)" value={chat.bgOpacity} onChange={(v) => onChange({ bgOpacity: v })} min={0} max={100} step={5} />
      <NumInput label="Border radius (px)" value={chat.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
      <hr style={S.sep} />
      <RectInputs value={chat} onChange={onChange} />
    </Panel>
  );
}

function PromoPanel({
  promo, onChange, activeId, setActiveId,
}: {
  promo: PromoZoneConfig;
  onChange: (patch: Partial<PromoZoneConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  return (
    <Panel id="promo" activeId={activeId} setActiveId={setActiveId}
      title="🖼 Zone Promo"
      badge={promo.enabled ? (promo.imageUrl ? "Image OK" : "Vide") : "OFF"}
      badgeColor={promo.enabled && promo.imageUrl ? "#10b981" : undefined}
    >
      <Toggle label="Activer" checked={promo.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />
      <TextInput
        label="URL de l image / GIF"
        value={promo.imageUrl}
        onChange={(v) => onChange({ imageUrl: v })}
        placeholder="https://... (jpg, png, gif, webp)"
      />
      {promo.imageUrl && (
        <img
          src={promo.imageUrl}
          alt="Preview promo"
          style={{ width: "100%", maxHeight: 120, objectFit: "contain", borderRadius: 8, border: "1px solid rgba(60,95,175,.2)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div style={S.row2}>
        <NumInput label="Border radius (px)" value={promo.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
        <div style={S.field}>
          <span style={S.label}>Ajustement image</span>
          <select
            style={S.input}
            value={promo.objectFit}
            onChange={(e) => onChange({ objectFit: e.target.value as PromoZoneConfig["objectFit"] })}
          >
            <option value="contain">Contenu (contain)</option>
            <option value="cover">Remplir (cover)</option>
            <option value="fill">Etirer (fill)</option>
          </select>
        </div>
      </div>
      <hr style={S.sep} />
      <RectInputs value={promo} onChange={onChange} />
    </Panel>
  );
}

// ─── Sponsor Panel ───────────────────────────────────────────────────────────

function SponsorPanel({
  sponsor, onChange, activeId, setActiveId,
}: {
  sponsor: SponsorConfig;
  onChange: (patch: Partial<SponsorConfig>) => void;
  activeId: string | null; setActiveId: (id: string | null) => void;
}) {
  const [msgDraft, setMsgDraft] = React.useState(sponsor.messages.join("\n"));

  return (
    <Panel id="sponsor" activeId={activeId} setActiveId={setActiveId}
      title="🎯 Zone Sponsor"
      badge={sponsor.enabled ? "ON" : "OFF"}
      badgeColor={sponsor.enabled ? "#10b981" : undefined}
    >
      <Toggle label="Activer" checked={sponsor.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />

      {/* Commande */}
      <div style={S.row2}>
        <TextInput label="Commande" value={sponsor.command}
          onChange={(v) => onChange({ command: v })} placeholder="!BONUS" />
        <TextInput label="Label au-dessus" value={sponsor.commandLabel}
          onChange={(v) => onChange({ commandLabel: v })} placeholder="Fait cette commande dans le chat" />
      </div>

      {/* Messages tournants */}
      <div style={S.field}>
        <span style={S.label}>Messages (1 par ligne)</span>
        <textarea
          style={{ ...S.input, height: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          value={msgDraft}
          onChange={(e) => {
            setMsgDraft(e.target.value);
            const lines = e.target.value.split("\n").map(l => l.trim()).filter(Boolean);
            if (lines.length > 0) onChange({ messages: lines });
          }}
        />
      </div>
      <NumInput label="Durée par message (s)" value={sponsor.interval}
        onChange={(v) => onChange({ interval: v })} min={1} max={30} step={1} />

      <hr style={S.sep} />

      {/* Style bannière */}
      <div style={S.field}>
        <span style={S.label}>Style bannière</span>
        <select style={S.input} value={sponsor.bannerStyle}
          onChange={(e) => onChange({ bannerStyle: e.target.value as SponsorConfig["bannerStyle"] })}>
          {SPONSOR_BANNER_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Style animation */}
      <div style={S.field}>
        <span style={S.label}>Animation du texte</span>
        <select style={S.input} value={sponsor.animStyle}
          onChange={(e) => onChange({ animStyle: e.target.value as SponsorConfig["animStyle"] })}>
          {SPONSOR_ANIM_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <hr style={S.sep} />

      {/* Tailles */}
      <div style={S.row2}>
        <NumInput label="Texte principal (px)" value={sponsor.textSize ?? 40}
          onChange={(v) => onChange({ textSize: v })} min={8} max={120} step={1} />
        <NumInput label="Largeur gauche (px)" value={sponsor.leftWidth ?? 160}
          onChange={(v) => onChange({ leftWidth: v })} min={60} max={400} step={4} />
      </div>
      <div style={S.row2}>
        <NumInput label="Bouton commande (px)" value={sponsor.commandSize ?? 16}
          onChange={(v) => onChange({ commandSize: v })} min={8} max={48} step={1} />
        <NumInput label="Label au-dessus (px)" value={sponsor.labelSize ?? 11}
          onChange={(v) => onChange({ labelSize: v })} min={6} max={24} step={1} />
      </div>
      <NumInput label="Espacement (px)" value={sponsor.gap ?? 20}
        onChange={(v) => onChange({ gap: v })} min={4} max={60} step={2} />

      <hr style={S.sep} />
      <RectInputs value={sponsor} onChange={onChange} />
    </Panel>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MODES: { value: OverlayMode; label: string; icon: string }[] = [
  { value: "solo",   label: "Solo",   icon: "👤" },
  { value: "double", label: "Double cam", icon: "👥" },
  { value: "triple", label: "Triple cam", icon: "🎥" },
];

const STORAGE_KEY = "lunalive-overlay-designer-v3"; // v3: align + msgBgOpacity + no grouping
// v4: persistance par mode — chaque mode (solo/double/triple) garde ses propres réglages
// indépendamment. Switch de mode ne réinitialise plus rien, juste recharge la config
// du mode cible (ou preset par défaut au premier switch).
const STORAGE_KEY_BY_MODE = "lunalive-overlay-designer-v4-by-mode";
const STORAGE_KEY_ACTIVE_MODE = "lunalive-overlay-designer-v4-active-mode";

type ConfigByMode = Partial<Record<OverlayMode, OverlayConfig>>;

function loadByModeFromStorage(): ConfigByMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BY_MODE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as ConfigByMode;
    }
  } catch {}
  return {};
}

function saveByModeToStorage(byMode: ConfigByMode) {
  try { localStorage.setItem(STORAGE_KEY_BY_MODE, JSON.stringify(byMode)); } catch {}
}

function loadActiveModeFromStorage(): OverlayMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_MODE);
    if (raw === "solo" || raw === "double" || raw === "triple") return raw;
  } catch {}
  return null;
}

/** Push la config vers l'OBS overlay via le backend (socket) + persiste en DB */
async function pushConfigToObs(config: OverlayConfig) {
  const token = localStorage.getItem("lunalive_token_v1") || "";
  if (!token) return;
  try {
    await fetch(`${LUNA_API_BASE}/me/overlay/push-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ config }),
    });
  } catch {
    // silencieux — pas critique
  }
}

/** Charge la config partagée depuis le serveur */
async function loadConfigFromDb(): Promise<OverlayConfig | null> {
  const token = localStorage.getItem("lunalive_token_v1") || "";
  if (!token) return null;
  try {
    const r = await fetch(`${LUNA_API_BASE}/me/overlay/fsb-config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (r.ok && j?.ok && j.config && typeof j.config === "object") {
      return j.config as OverlayConfig;
    }
  } catch {}
  return null;
}

/** Regénère le chatUrl si c'est une URL LunaLive avec de nouveaux params */
function rebuildChatUrlIfLuna(chat: ChatZoneConfig): string {
  const url = chat.chatUrl;
  if (!url || !url.includes("/overlay/obs/chat.html")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("font",  String(Math.round(chat.fontSize ?? 14)));
    u.searchParams.set("max",   String(Math.round(chat.maxMessages ?? 8)));
    u.searchParams.set("scale", String(Math.round((chat.scale ?? 1) * 100) / 100));
    u.searchParams.set("align", chat.align ?? "center");
    u.searchParams.set("msgbg", String(Math.round((chat.msgBgOpacity ?? 0.92) * 100) / 100));
    if (chat.compact) u.searchParams.set("compact", "1");
    else u.searchParams.delete("compact");
    return u.toString();
  } catch {
    return url;
  }
}

export function OverlayDesignerSection() {
  // byModeRef = source de vérité pour les configs de chaque mode (solo/double/triple).
  // On garde un ref au lieu d'un state pour éviter les re-renders à chaque persist ;
  // la synchro localStorage suffit, et setConfig déclenche déjà le re-render.
  const byModeRef = React.useRef<ConfigByMode>(loadByModeFromStorage());

  const [config, setConfig] = React.useState<OverlayConfig>(() => {
    // Priorité : byMode[activeMode] → legacy v3 storage → preset par défaut
    const activeMode = loadActiveModeFromStorage() ?? "triple";
    const byMode = byModeRef.current;
    if (byMode[activeMode]) return byMode[activeMode]!;

    // Migration depuis v3 (une seule OverlayConfig sans séparation par mode)
    try {
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as OverlayConfig;
        if (parsed?.mode) {
          byModeRef.current = { ...byMode, [parsed.mode]: parsed };
          saveByModeToStorage(byModeRef.current);
          return parsed;
        }
      }
    } catch {}

    return defaultConfig(activeMode);
  });
  const [activePanel, setActivePanel] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [pushed, setPushed] = React.useState(false);
  const [syncedBy, setSyncedBy] = React.useState<string | null>(null);
  const pushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag pour éviter de re-push la config chargée depuis DB au mount
  const isInitialLoad = React.useRef(true);
  // Flag pour éviter de re-push la config reçue depuis un autre user via socket
  const isRemoteUpdate = React.useRef(false);

  // Chargement initial depuis DB (priorité sur localStorage)
  React.useEffect(() => {
    loadConfigFromDb().then((dbConfig) => {
      if (dbConfig) {
        isInitialLoad.current = true;
        setConfig((current) => {
          // Préserver le chatUrl depuis l'état local si le DB n'en a pas
          // (évite le reset si le push DB n'avait pas encore persisté)
          const merged: OverlayConfig = { ...dbConfig };
          if (!dbConfig.chat?.chatUrl && current.chat?.chatUrl) {
            merged.chat = { ...dbConfig.chat, chatUrl: current.chat.chatUrl };
          }
          // bgOpacity toujours 0 si non défini (fond transparent overlay)
          if (!merged.chat.bgOpacity) {
            merged.chat = { ...merged.chat, bgOpacity: 0 };
          }
          // Hydrate le slot de mode correspondant pour que byModeRef reste source de vérité
          byModeRef.current = { ...byModeRef.current, [merged.mode]: merged };
          saveByModeToStorage(byModeRef.current);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket pour la sync en temps réel entre les users FSB (quand quelqu'un d'autre modifie)
  React.useEffect(() => {
    const s = ioConnect(LUNA_API_BASE, { transports: ["websocket", "polling"] });
    s.on("connect", () => {
      s.emit("fsb:designer-join");
    });
    s.on("obs:config", (data: any) => {
      if (data?.config && typeof data.config === "object") {
        isRemoteUpdate.current = true;
        setSyncedBy("sync");
        setTimeout(() => setSyncedBy(null), 2000);
        setConfig((current) => {
          const remote = data.config as OverlayConfig;
          // Préserver chatUrl local si le remote n'en a pas
          const merged: OverlayConfig = { ...remote };
          if (!remote.chat?.chatUrl && current.chat?.chatUrl) {
            merged.chat = { ...remote.chat, chatUrl: current.chat.chatUrl };
          }
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
    });
    return () => { s.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save localStorage + push live vers OBS + persist DB à chaque modification
  React.useEffect(() => {
    // Sauvegarde locale immédiate — dans le slot par mode (v4) ET legacy v3 (compat)
    byModeRef.current = { ...byModeRef.current, [config.mode]: config };
    saveByModeToStorage(byModeRef.current);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
    try { localStorage.setItem(STORAGE_KEY_ACTIVE_MODE, config.mode); } catch {}
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);

    // Skip le push initial (chargement depuis DB)
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return () => clearTimeout(t);
    }

    // Skip si c'est une mise à jour distante (pas besoin de re-pusher ce qu'on vient de recevoir)
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return () => clearTimeout(t);
    }

    // Push debounced vers OBS + DB (600ms après la dernière modif)
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushConfigToObs(config).then(() => {
        setPushed(true);
        setTimeout(() => setPushed(false), 1500);
      });
    }, 600);

    return () => {
      clearTimeout(t);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [config]);

  const obsUrl = React.useMemo(() => {
    const encoded = encodeConfig(config);
    return `${SITE_BASE}/overlay?cfg=${encoded}`;
  }, [config]);

  function changeMode(mode: OverlayMode) {
    // 1. Sauvegarde la config actuelle dans son slot de mode avant de switch
    setConfig((current) => {
      byModeRef.current = { ...byModeRef.current, [current.mode]: current };
      saveByModeToStorage(byModeRef.current);

      // 2. Charge la config précédemment sauvée pour le mode cible, sinon preset par défaut
      const saved = byModeRef.current[mode];
      return saved ?? defaultConfig(mode);
    });
    try { localStorage.setItem(STORAGE_KEY_ACTIVE_MODE, mode); } catch {}
    setActivePanel(null);
  }

  function updateCam(index: number, patch: Partial<CamZoneConfig>) {
    setConfig((c) => {
      const cams = c.cams.map((cam, i) => i === index ? { ...cam, ...patch } : cam);
      return { ...c, cams };
    });
  }

  function updateBackground(patch: Partial<BackgroundConfig>) {
    setConfig((c) => ({ ...c, background: { ...c.background, ...patch } }));
  }

  function updateSlot(patch: Partial<SlotZoneConfig>) {
    setConfig((c) => ({ ...c, slot: { ...c.slot, ...patch } }));
  }

  function updateStats(patch: Partial<StatsZoneConfig>) {
    setConfig((c) => ({ ...c, stats: { ...c.stats, ...patch } }));
  }

  function updateChat(patch: Partial<ChatZoneConfig>) {
    setConfig((c) => {
      const merged = { ...c.chat, ...patch };
      // Si c'est une URL LunaLive, regénérer avec les nouveaux params (scale/font/max)
      const chatUrl = rebuildChatUrlIfLuna(merged);
      return { ...c, chat: { ...merged, chatUrl } };
    });
  }

  function updatePromo(patch: Partial<PromoZoneConfig>) {
    setConfig((c) => ({ ...c, promo: { ...c.promo, ...patch } }));
  }

  function updateSponsor(patch: Partial<SponsorConfig>) {
    setConfig((c) => ({ ...c, sponsor: { ...(c.sponsor ?? defaultSponsor()), ...patch } }));
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(obsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-.04em", color: "#dde8ff" }}>
              🎬 Overlay Designer
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: saved ? "rgba(16,185,129,.15)" : "transparent",
              color: saved ? "#34d399" : "transparent",
              border: `1px solid ${saved ? "rgba(16,185,129,.3)" : "transparent"}`,
              transition: "all .3s",
            }}>✓ Sauvegardé</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: pushed ? "rgba(99,102,241,.15)" : "transparent",
              color: pushed ? "#a5b4fc" : "transparent",
              border: `1px solid ${pushed ? "rgba(99,102,241,.3)" : "transparent"}`,
              transition: "all .3s",
            }}>⚡ OBS live</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: syncedBy ? "rgba(34,197,94,.12)" : "transparent",
              color: syncedBy ? "#4ade80" : "transparent",
              border: `1px solid ${syncedBy ? "rgba(34,197,94,.3)" : "transparent"}`,
              transition: "all .3s",
            }}>⟳ Synchro</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(148,178,232,.62)", lineHeight: 1.5 }}>
            Configure ton overlay OBS. Chaque zone est positionnee en % du canvas 1920×1080.
          </p>
        </div>
        {/* Mode selector */}
        <div style={{ display: "flex", gap: 5, background: "rgba(14,29,56,.8)", border: "1px solid rgba(60,95,175,.2)", borderRadius: 12, padding: 4 }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => changeMode(m.value)}
              style={{
                borderRadius: 9, border: "1px solid transparent", font: "inherit", fontSize: 13,
                fontWeight: 700, cursor: "pointer", padding: "7px 14px", display: "inline-flex",
                alignItems: "center", gap: 6, transition: "all .15s",
                background: config.mode === m.value
                  ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                  : "transparent",
                color: config.mode === m.value ? "#fff" : "rgba(148,178,232,.7)",
                boxShadow: config.mode === m.value ? "0 4px 16px rgba(99,102,241,.35)" : "none",
              }}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid: panels left, preview right */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left: zone panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BackgroundPanel bg={config.background} onChange={updateBackground} activeId={activePanel} setActiveId={setActivePanel} />
          {config.cams.map((cam, i) => (
            <CamPanel
              key={i}
              cam={cam}
              onChange={(patch) => updateCam(i, patch)}
              panelId={`cam-${i}`}
              activeId={activePanel}
              setActiveId={setActivePanel}
            />
          ))}
          <SlotPanel slot={config.slot} onChange={updateSlot} activeId={activePanel} setActiveId={setActivePanel} />
          <StatsPanel stats={config.stats} onChange={updateStats} activeId={activePanel} setActiveId={setActivePanel} />
          <ChatPanel chat={config.chat} onChange={updateChat} activeId={activePanel} setActiveId={setActivePanel} />
          <PromoPanel promo={config.promo} onChange={updatePromo} activeId={activePanel} setActiveId={setActivePanel} />
          <SponsorPanel sponsor={config.sponsor ?? defaultSponsor()} onChange={updateSponsor} activeId={activePanel} setActiveId={setActivePanel} />
        </div>

        {/* Right: preview + OBS URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 20 }}>
          <OverlayPreview config={config} />

          {/* OBS export */}
          <div style={{
            background: "rgba(14,29,56,.8)",
            border: "1px solid rgba(60,95,175,.2)",
            borderRadius: 14,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#dde8ff" }}>Lien OBS Browser Source</span>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={obsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    borderRadius: 9, border: "1px solid rgba(60,95,175,.25)", font: "inherit",
                    fontSize: 12, fontWeight: 700, padding: "6px 12px", color: "#dde8ff",
                    background: "rgba(255,255,255,.04)", cursor: "pointer", textDecoration: "none",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  ↗ Ouvrir
                </a>
                <button
                  onClick={copyUrl}
                  style={{
                    borderRadius: 9, border: "1px solid rgba(99,102,241,.4)", font: "inherit",
                    fontSize: 12, fontWeight: 700, padding: "6px 14px",
                    background: copied ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "#fff", cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(99,102,241,.3)",
                    transition: "all .2s",
                  }}
                >
                  {copied ? "✓ Copie !" : "Copier"}
                </button>
              </div>
            </div>
            <input
              style={{
                ...S.input,
                fontSize: 11,
                color: "rgba(148,178,232,.6)",
                fontFamily: "monospace",
                cursor: "text",
                wordBreak: "break-all",
              }}
              readOnly
              value={obsUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <p style={{ margin: 0, fontSize: 11, color: "rgba(148,178,232,.45)", lineHeight: 1.5 }}>
              Dans OBS : Ajouter une source → <strong style={{ color: "rgba(148,178,232,.7)" }}>Navigateur</strong> → coller ce lien. Taille recommandee : <strong style={{ color: "rgba(148,178,232,.7)" }}>1920 × 1080</strong>. Cocher <em>Fond transparent</em>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
