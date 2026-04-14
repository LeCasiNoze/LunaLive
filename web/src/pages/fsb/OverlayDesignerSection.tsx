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
  showTimer: boolean;
  showTitle: boolean;
  titleText: string;
  showViewers: boolean;
  viewersText: string;
  showFollowers: boolean;
  followersText: string;
  borderRadius: number;
};

export type ChatZoneConfig = ZoneRect & {
  enabled: boolean;
  chatUrl: string;
  bgOpacity: number;
  borderRadius: number;
};

export type PromoZoneConfig = ZoneRect & {
  enabled: boolean;
  imageUrl: string;
  borderRadius: number;
  objectFit: "contain" | "cover" | "fill";
};

export type OverlayConfig = {
  mode: OverlayMode;
  cams: CamZoneConfig[];
  slot: SlotZoneConfig;
  stats: StatsZoneConfig;
  chat: ChatZoneConfig;
  promo: PromoZoneConfig;
};

// ─── Presets ──────────────────────────────────────────────────────────────────

// Layout reference (% of 1920x1080) — from wireframe:
//
//  ┌──────────────────────────────────────────────────────────────┐
//  │                    INFOS (100% × 6%)                        │
//  ├────────────────────────────────────────┬─────────────────────┤
//  │                                        │  CAM 2 (28% × 22%) │
//  │         SLOT (72% × 94%)               ├─────────────────────┤
//  │   [slot s'étend si cam principale GS]  │  CHAT  (28% × 37%) │
//  ├──────────┬─────────────────────────────┤                     │
//  │ CAM1(GS) │   PUB (52% × 48%)          ├─────────────────────┤
//  │ 20% × 48%│                             │  CAM 3 (28% × 35%) │
//  └──────────┴─────────────────────────────┴─────────────────────┘

function defaultCam(x: number, y: number, w: number, h: number, label: string, greenscreen = false): CamZoneConfig {
  return {
    enabled: true, greenscreen,
    borderColor: "#6366f1", borderWidth: 3, borderRadius: 12,
    label, x, y, w, h,
  };
}

function defaultStats(w = 100): StatsZoneConfig {
  return {
    enabled: true, x: 0, y: 0, w, h: 6,
    bgColor: "#0a1628", bgOpacity: 88, textColor: "#dde8ff",
    showTimer: true, showTitle: true, titleText: "LunaLive",
    showViewers: true, viewersText: "—",
    showFollowers: false, followersText: "—",
    borderRadius: 0,
  };
}

const PRESETS: Record<OverlayMode, Omit<OverlayConfig, "mode">> = {
  // ── SOLO: cam principale en GS bas-gauche, slot pleine hauteur gauche, chat droit
  solo: {
    cams: [defaultCam(0, 52, 20, 48, "Cam principale", true)],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 6,  w: 72, h: 94 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 72, y: 6,  w: 28, h: 94, chatUrl: "", bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 20, y: 52, w: 52, h: 48, imageUrl: "", borderRadius: 0, objectFit: "contain" },
  },

  // ── DOUBLE: cam principale GS bas-gauche + cam 2 haut-droite, chat droite milieu, promo bas-centre
  double: {
    cams: [
      defaultCam(0, 52, 20, 48, "Cam principale", true),
      defaultCam(72, 6, 28, 22, "Cam 2"),
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 6,  w: 72, h: 94 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 72, y: 28, w: 28, h: 72, chatUrl: "", bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 20, y: 52, w: 52, h: 48, imageUrl: "", borderRadius: 0, objectFit: "contain" },
  },

  // ── TRIPLE: cam principale GS bas-gauche + cam 2 haut-droite + cam 3 bas-droite
  //    → layout wireframe exact
  triple: {
    cams: [
      defaultCam(0,  52, 20, 48, "Cam principale", true), // GS, bas-gauche
      defaultCam(72,  6, 28, 22, "Cam 2"),                 // haut-droite (face streamer)
      defaultCam(72, 65, 28, 35, "Cam 3"),                 // bas-droite
    ],
    slot:  { enabled: true, showFrame: false, frameColor: "#334155", frameWidth: 2, borderRadius: 0, label: "Slot",  x: 0,  y: 6,  w: 72, h: 94 },
    stats: defaultStats(),
    chat:  { enabled: true,  x: 72, y: 28, w: 28, h: 37, chatUrl: "", bgOpacity: 0, borderRadius: 0 },
    promo: { enabled: true,  x: 20, y: 52, w: 52, h: 48, imageUrl: "", borderRadius: 0, objectFit: "contain" },
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
  cam:   { bg: "rgba(99,102,241,.18)",  border: "#6366f1", label: "#a5b4fc" },
  slot:  { bg: "rgba(168,85,247,.18)",  border: "#a855f7", label: "#c084fc" },
  stats: { bg: "rgba(245,158,11,.18)",  border: "#f59e0b", label: "#fbbf24" },
  chat:  { bg: "rgba(34,211,238,.18)",  border: "#22d3ee", label: "#67e8f9" },
  promo: { bg: "rgba(16,185,129,.18)",  border: "#10b981", label: "#34d399" },
};

// ─── Preview canvas ───────────────────────────────────────────────────────────

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

function OverlayPreview({ config }: { config: OverlayConfig }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(148,178,232,.62)" }}>
          Preview 16:9
        </span>
        <span style={{ fontSize: 11, color: "rgba(148,178,232,.5)" }}>1920 × 1080</span>
      </div>
      <div style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: "repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%, transparent 0% 50%) 0 0 / 24px 24px, #060d1c",
        borderRadius: 12,
        border: "1px solid rgba(60,95,175,.28)",
        overflow: "hidden",
      }}>
        {/* Cam zones */}
        {config.cams.map((cam, i) => (
          <PreviewZone
            key={`cam-${i}`}
            rect={cam}
            color={ZONE_COLORS.cam}
            name={cam.greenscreen ? `${cam.label} ⬜ GS` : cam.label}
            disabled={!cam.enabled}
          />
        ))}
        {/* Slot */}
        <PreviewZone rect={config.slot} color={ZONE_COLORS.slot} name={config.slot.label || "Slot"} disabled={!config.slot.enabled} />
        {/* Stats */}
        <PreviewZone rect={config.stats} color={ZONE_COLORS.stats} name="Stats" disabled={!config.stats.enabled} />
        {/* Chat */}
        <PreviewZone rect={config.chat} color={ZONE_COLORS.chat} name="Chat" disabled={!config.chat.enabled} />
        {/* Promo */}
        <PreviewZone rect={config.promo} color={ZONE_COLORS.promo} name={config.promo.imageUrl ? "Promo ✓" : "Promo"} disabled={!config.promo.enabled} />

        {/* Grid hint */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)", backgroundSize: "10% 10%", pointerEvents: "none" }} />
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
      badge={cam.enabled ? (cam.greenscreen ? "GS" : "ON") : "OFF"}
      badgeColor={cam.enabled ? (cam.greenscreen ? "#6366f1" : "#10b981") : undefined}
    >
      <Toggle label="Activer" checked={cam.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />
      <Toggle label="Fond vert (greenscreen — pas de cadre)" checked={cam.greenscreen} onChange={(v) => onChange({ greenscreen: v })} />
      {cam.greenscreen && (
        <p style={{ margin: 0, fontSize: 11, color: "rgba(34,211,238,.8)", lineHeight: 1.5, background: "rgba(34,211,238,.07)", border: "1px solid rgba(34,211,238,.18)", borderRadius: 8, padding: "8px 10px" }}>
          ✓ Mode fond vert actif — la zone Slot s'etend automatiquement sous la cam. Le streamer sera composite par OBS au-dessus du slot.
        </p>
      )}
      {!cam.greenscreen && (
        <>
          <hr style={S.sep} />
          <div style={S.row2}>
            <ColorInput label="Couleur bordure" value={cam.borderColor} onChange={(v) => onChange({ borderColor: v })} />
            <NumInput label="Epaisseur (px)" value={cam.borderWidth} onChange={(v) => onChange({ borderWidth: v })} min={0} max={20} step={1} />
          </div>
          <NumInput label="Border radius (px)" value={cam.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={60} step={1} />
          <TextInput label="Label" value={cam.label} onChange={(v) => onChange({ label: v })} />
        </>
      )}
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
  return (
    <Panel id="stats" activeId={activeId} setActiveId={setActiveId}
      title="📊 Zone Stats"
      badge={stats.enabled ? "ON" : "OFF"}
      badgeColor={stats.enabled ? "#f59e0b" : undefined}
    >
      <Toggle label="Activer" checked={stats.enabled} onChange={(v) => onChange({ enabled: v })} />
      <hr style={S.sep} />
      <div style={S.row2}>
        <ColorInput label="Fond" value={stats.bgColor} onChange={(v) => onChange({ bgColor: v })} />
        <NumInput label="Opacite fond (%)" value={stats.bgOpacity} onChange={(v) => onChange({ bgOpacity: v })} min={0} max={100} step={5} />
      </div>
      <div style={S.row2}>
        <ColorInput label="Couleur texte" value={stats.textColor} onChange={(v) => onChange({ textColor: v })} />
        <NumInput label="Border radius (px)" value={stats.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
      </div>
      <hr style={S.sep} />
      <Toggle label="Afficher timer (temps stream)" checked={stats.showTimer} onChange={(v) => onChange({ showTimer: v })} />
      <Toggle label="Afficher titre" checked={stats.showTitle} onChange={(v) => onChange({ showTitle: v })} />
      {stats.showTitle && <TextInput label="Texte titre" value={stats.titleText} onChange={(v) => onChange({ titleText: v })} placeholder="ex: LunaLive — Session Bonus" />}
      <Toggle label="Afficher viewers" checked={stats.showViewers} onChange={(v) => onChange({ showViewers: v })} />
      {stats.showViewers && <TextInput label="Texte viewers (statique)" value={stats.viewersText} onChange={(v) => onChange({ viewersText: v })} placeholder="ex: 420 viewers" />}
      <Toggle label="Afficher followers" checked={stats.showFollowers} onChange={(v) => onChange({ showFollowers: v })} />
      {stats.showFollowers && <TextInput label="Texte followers (statique)" value={stats.followersText} onChange={(v) => onChange({ followersText: v })} placeholder="ex: 12 500 followers" />}
      <hr style={S.sep} />
      <RectInputs value={stats} onChange={onChange} />
    </Panel>
  );
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
      <TextInput
        label="URL du chat (Twitch popout, Kick, etc.)"
        value={chat.chatUrl}
        onChange={(v) => onChange({ chatUrl: v })}
        placeholder="https://www.twitch.tv/popout/.../chat?popout="
      />
      <div style={S.row2}>
        <NumInput label="Opacite fond (%)" value={chat.bgOpacity} onChange={(v) => onChange({ bgOpacity: v })} min={0} max={100} step={5} />
        <NumInput label="Border radius (px)" value={chat.borderRadius} onChange={(v) => onChange({ borderRadius: v })} min={0} max={40} step={1} />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "rgba(148,178,232,.5)", lineHeight: 1.5 }}>
        Utilise l URL popout de la plateforme de chat. Le fond transparent est applique si l URL le supporte.
      </p>
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

export function OverlayDesignerSection() {
  const [config, setConfig] = React.useState<OverlayConfig>(() => defaultConfig("solo"));
  const [activePanel, setActivePanel] = React.useState<string | null>("cam-0");
  const [copied, setCopied] = React.useState(false);

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
      let next = { ...c, cams };
      // Auto-resize slot quand la cam principale (index 0) toggle greenscreen
      if (index === 0 && "greenscreen" in patch) {
        const slotPatch = autoResizeSlot(next, Boolean(patch.greenscreen));
        next = { ...next, slot: { ...next.slot, ...slotPatch } };
      }
      return next;
    });
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-.04em", color: "#dde8ff" }}>
            🎬 Overlay Designer
          </h2>
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
