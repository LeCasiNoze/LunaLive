import * as React from "react";

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
};

export type SlotZoneConfig = ZoneRect & {
  enabled: boolean;
  showFrame: boolean;
  frameColor: string;
  frameWidth: number;
  borderRadius: number;
  label: string;
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
  scale: number;       // scale global du widget chat → ?scale= (0.3–2)
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
};

export type OverlayConfig = {
  mode: OverlayMode;
  background: BackgroundConfig;
  cams: CamZoneConfig[];
  slot: SlotZoneConfig;
  stats: StatsZoneConfig;
  chat: ChatZoneConfig;
  promo: PromoZoneConfig;
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
    borderColor: "#6366f1", borderWidth: 3, borderRadius: 12,
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
  solo: {
    background: defaultBackground(),
    cams: [defaultCam(0, 65, 17, 28, "Cam principale")],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 88 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 5,  w: 29, h: 88, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 15, imageUrl: "", borderRadius: 0, objectFit: "contain" },
  },

  // ── DOUBLE: cam principale bas-gauche + cam 2 haut-droite, chat droite milieu, promo bas-centre
  double: {
    background: defaultBackground(),
    cams: [
      defaultCam(0,  65, 17, 28, "Cam principale"),
      defaultCam(71,  5, 29, 22, "Cam 2"),
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 88 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 27, w: 29, h: 66, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 15, imageUrl: "", borderRadius: 0, objectFit: "contain" },
  },

  // ── TRIPLE: cam principale bas-gauche (sur slot) + cam 2 haut-droite + cam 3 bas-droite
  triple: {
    background: defaultBackground(),
    cams: [
      defaultCam(0,  65, 17, 28, "Cam principale"),
      defaultCam(71,  5, 29, 22, "Cam 2"),
      defaultCam(71, 64, 29, 29, "Cam 3"),
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 5,  w: 71, h: 88 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 71, y: 27, w: 29, h: 37, chatUrl: "", fontSize: 14, maxMessages: 8, scale: 1, bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 17, y: 78, w: 54, h: 15, imageUrl: "", borderRadius: 0, objectFit: "contain" },
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
function PreviewCanvasContent({ config, scale }: { config: OverlayConfig; scale: number }) {
  return (
    <>
      {/* Fond */}
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
      {config.background.enabled && !config.background.imageUrl && (
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
      <PreviewZone rect={config.slot} color={ZONE_COLORS.slot} name={config.slot.label || "Slot"} disabled={!config.slot.enabled} />
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
              key={config.chat.chatUrl}
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
  const canvasWidth = useContainerWidth(canvasRef);
  const scale = canvasWidth > 0 ? canvasWidth / 1920 : 1;
  const [fullscreen, setFullscreen] = React.useState(false);

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
          <PreviewCanvasContent config={config} scale={scale} />
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
        <div style={S.row2}>
          <ColorInput label="Couleur cadre" value={slot.frameColor} onChange={(v) => onChange({ frameColor: v })} />
          <NumInput label="Epaisseur (px)" value={slot.frameWidth} onChange={(v) => onChange({ frameWidth: v })} min={0} max={20} step={1} />
        </div>
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
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/me/overlay/bg/upload", {
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
      <Toggle label="Animation" checked={bg.animated} onChange={(v) => onChange({ animated: v })} />
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
    </Panel>
  );
}

// Streamers LunaLive avec chat disponible
const LUNA_CHAT_SLUGS = ["fabiozsis", "lecasinoze"];

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

function lunaChatUrl(slug: string, fontSize = 14, maxMessages = 8, scale = 1) {
  const base = `${window.location.origin}/overlay/obs/chat.html`;
  const params = new URLSearchParams({
    slug,
    api: LUNA_API_BASE,
    font: String(fontSize),
    max: String(maxMessages),
    scale: String(Math.round(scale * 100) / 100),
  });
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
                onClick={() => onChange({ chatUrl: lunaChatUrl(slug, chat.fontSize ?? 14, chat.maxMessages ?? 8, chat.scale ?? 1), enabled: true })}
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
      {/* Avertissement : les changements de taille s'appliquent en re-cliquant sur le slug */}
      <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "rgba(251,191,36,.8)" }}>
        Après avoir changé la taille, re-clique sur le slug pour recharger le chat.
      </div>
      <div style={S.row2}>
        <NumInput label="Police (px)" value={chat.fontSize ?? 14} onChange={(v) => onChange({ fontSize: v })} min={8} max={48} step={1} />
        <NumInput label="Nb messages max" value={chat.maxMessages ?? 8} onChange={(v) => onChange({ maxMessages: v })} min={1} max={30} step={1} />
      </div>
      <div style={S.field}>
        <span style={S.label}>Scale global du chat (0.3 = très petit · 1 = normal · 1.5 = grand)</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="range" min={0.3} max={2} step={0.05}
            value={chat.scale ?? 1}
            onChange={(e) => onChange({ scale: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#22d3ee" }}
          />
          <span style={{ color: "#dde8ff", fontWeight: 800, fontSize: 13, minWidth: 36, textAlign: "right" }}>
            ×{(chat.scale ?? 1).toFixed(2)}
          </span>
        </div>
      </div>
      <NumInput label="Opacite fond (%)" value={chat.bgOpacity} onChange={(v) => onChange({ bgOpacity: v })} min={0} max={100} step={5} />
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

// ─── Main component ───────────────────────────────────────────────────────────

const MODES: { value: OverlayMode; label: string; icon: string }[] = [
  { value: "solo",   label: "Solo",   icon: "👤" },
  { value: "double", label: "Double cam", icon: "👥" },
  { value: "triple", label: "Triple cam", icon: "🎥" },
];

const STORAGE_KEY = "lunalive-overlay-designer-v1";

export function OverlayDesignerSection() {
  const [config, setConfig] = React.useState<OverlayConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as OverlayConfig;
    } catch {}
    return defaultConfig("triple");
  });
  const [activePanel, setActivePanel] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Auto-save à chaque modification
  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [config]);

  const obsUrl = React.useMemo(() => {
    const encoded = encodeConfig(config);
    return `${window.location.origin}/overlay?cfg=${encoded}`;
  }, [config]);

  function changeMode(mode: OverlayMode) {
    setConfig(defaultConfig(mode));
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
    setConfig((c) => ({ ...c, chat: { ...c.chat, ...patch } }));
  }

  function updatePromo(patch: Partial<PromoZoneConfig>) {
    setConfig((c) => ({ ...c, promo: { ...c.promo, ...patch } }));
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
