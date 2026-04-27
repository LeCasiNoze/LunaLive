import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { decodeConfig, injectPremiumKeyframes, type OverlayConfig, type ZoneRect, type CallZoneConfig } from "./fsb/OverlayDesignerSection";
import { OverlayBgAnimation } from "./fsb/OverlayBgAnimations";
import { SponsorBanner, defaultSponsor } from "./fsb/SponsorBanner";
import { useScreenViewer } from "./fsb/StreamControlPage";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

function extractSlugFromChatUrl(chatUrl: string): string | null {
  try { return new URL(chatUrl).searchParams.get("slug"); } catch { return null; }
}

/** Extrait l'URL du serveur API depuis le paramètre ?api= de la chatUrl.
 *  Si absent, essaie window.location.origin (même serveur que la page),
 *  puis fallback sur LUNA_API_BASE. */
function resolveSocketBase(chatUrl: string): string {
  try {
    const api = new URL(chatUrl).searchParams.get("api");
    if (api) {
      const u = new URL(api);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    }
  } catch {}
  // Si la page est servie par le serveur Express (pas localhost dev),
  // connecter le socket au même origin évite les problèmes cross-service
  try {
    const origin = window.location.origin;
    if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return origin;
    }
  } catch {}
  return LUNA_API_BASE;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type CamFilters = {
  brightness: number; contrast: number; saturation: number; hue: number;
  zoom?: number; panX?: number; panY?: number;
  chromaKey?: boolean;
  chromaSimilarity?: number;
  chromaSpill?: number;
};
type CamStreamEntry = { stream: MediaStream | null; slot: number; filters: CamFilters | null; slug: string };

function filterCss(f: CamFilters | null): string {
  if (!f) return "none";
  return `brightness(${f.brightness / 100}) contrast(${f.contrast / 100}) saturate(${f.saturation / 100}) hue-rotate(${f.hue}deg)`;
}

/** Crée et gère le socket partagé pour obs:config + WebRTC cam */
function useOverlaySocket(baseConfig: OverlayConfig) {
  const [liveConfig, setLiveConfig] = React.useState<OverlayConfig | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState(0);
  const [socket, setSocket] = React.useState<ReturnType<typeof io> | null>(null);
  const [searchParams] = useSearchParams();

  const slug =
    extractSlugFromChatUrl(baseConfig.chat.chatUrl) ||
    searchParams.get("slug") ||
    null;

  const socketBase = resolveSocketBase(baseConfig.chat?.chatUrl ?? "");

  React.useEffect(() => {
    if (!slug) return;
    const s = io(socketBase, { transports: ["websocket", "polling"] });

    s.on("connect", () => {
      s.emit("obs:subscribe", { slug }, (ack: any) => {
        console.log("[Overlay] obs:subscribe ack:", ack);
      });
      // Also join cam viewer room
      s.emit("cam:viewer-join", {});
    });

    s.on("obs:config", (data: any) => {
      if (data?.config) {
        setLiveConfig(data.config as OverlayConfig);
        setLastUpdate(Date.now());
      }
    });

    s.on("connect_error", (err: any) => {
      console.error("[Overlay] socket connect_error:", err?.message);
    });

    setSocket(s);
    return () => { s.disconnect(); setSocket(null); };
  }, [slug, socketBase]);

  return { config: liveConfig ?? baseConfig, lastUpdate, socket };
}

/** Reçoit les flux WebRTC des cams depuis les broadcasters FSB */
function useCamStreams(socket: ReturnType<typeof io> | null): Map<number, CamStreamEntry> {
  const [streams, setStreams] = React.useState<Map<number, CamStreamEntry>>(new Map());
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());

  const connectToBc = React.useCallback(
    (bc: { slug: string; slot: number; socketId: string; filters: CamFilters | null }) => {
      if (!socket || peersRef.current.has(bc.slug)) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(bc.slug, pc);

      // Pré-enregistre le slot dès la connexion pour que les filter updates fonctionnent
      // même avant que le stream vidéo soit reçu
      setStreams((prev) => {
        const next = new Map(prev);
        if (!next.has(bc.slot)) {
          next.set(bc.slot, { stream: null, slot: bc.slot, filters: bc.filters, slug: bc.slug });
        }
        return next;
      });

      pc.ontrack = ({ streams: s }) => {
        const stream = s[0] ?? null;
        if (!stream) return;
        setStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(bc.slot);
          next.set(bc.slot, { stream, slot: bc.slot, filters: existing?.filters ?? bc.filters, slug: bc.slug });
          return next;
        });
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("cam:ice", { to: bc.socketId, candidate });
      };

      const handleOffer = async ({ from: offerId, slug, sdp }: { from: string; slug: string; sdp: RTCSessionDescriptionInit }) => {
        if (slug !== bc.slug) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("cam:answer", { to: offerId, sdp: answer });
      };

      const handleIce = async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
        if (!peersRef.current.has(bc.slug)) return;
        const myPc = peersRef.current.get(bc.slug);
        if (!myPc) return;
        try { await myPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      };

      socket.on("cam:offer", handleOffer);
      socket.on("cam:ice", handleIce);

      socket.emit("cam:request", { fromSlug: bc.slug });
    },
    [socket],
  );

  React.useEffect(() => {
    if (!socket) return;

    socket.emit("cam:viewer-join", {}, (ack: { ok: boolean; active: any[] }) => {
      for (const bc of (ack?.active ?? [])) connectToBc(bc);
    });

    const onRegistered = (bc: any) => connectToBc(bc);
    const onLeft = ({ slug }: { slug: string }) => {
      peersRef.current.get(slug)?.close();
      peersRef.current.delete(slug);
      setStreams((prev) => {
        const next = new Map(prev);
        for (const [slot, entry] of next) {
          if ((entry as any).slug === slug) next.delete(slot);
        }
        return next;
      });
    };
    const onFilterUpdate = ({ slug, filters }: { slug: string; filters: CamFilters }) => {
      setStreams((prev) => {
        const next = new Map(prev);
        for (const [slot, entry] of next) {
          if (entry.slug === slug) next.set(slot, { ...entry, filters });
        }
        return next;
      });
    };

    socket.on("cam:registered", onRegistered);
    socket.on("cam:left", onLeft);
    socket.on("cam:filter-update", onFilterUpdate);

    return () => {
      socket.off("cam:registered", onRegistered);
      socket.off("cam:left", onLeft);
      socket.off("cam:filter-update", onFilterUpdate);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setStreams(new Map());
    };
  }, [socket, connectToBc]);

  return streams;
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

  const hasAnim = !!(bg.animPreset && bg.animPreset !== "none");
  if (!bg.enabled || (!bg.imageUrl && !hasAnim)) return null;

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
      {hasAnim && (
        <OverlayBgAnimation preset={bg.animPreset!} opacity={bg.opacity} />
      )}
      {bg.imageUrl && (
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
      )}
    </div>
  );
}

// ─── Chroma key canvas ────────────────────────────────────────────────────────

function applyChromaKeyPixels(data: Uint8ClampedArray, similarity: number, spill: number) {
  const sim = Math.max(0.01, similarity / 100);
  const spillStrength = spill / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const excess = g - (r + b) * 0.5;
    if (excess > 0) {
      const threshold = Math.max(0.01, 1 - sim);
      if (excess >= threshold) {
        data[i + 3] = 0;
      } else {
        data[i + 3] = Math.round(data[i + 3] * (1 - excess / threshold));
      }
      if (spillStrength > 0 && data[i + 3] > 0) {
        const deSpillG = Math.max(r, b) * 255;
        data[i + 1] = Math.round(data[i + 1] * (1 - spillStrength) + deSpillG * spillStrength);
      }
    }
  }
}

function ChromaKeyCanvas({ stream, filters, style }: {
  stream: MediaStream; filters: CamFilters; style: React.CSSProperties;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number>(0);
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  React.useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    function tick() {
      if (video!.readyState >= 2) {
        const w = video!.videoWidth || 640;
        const h = video!.videoHeight || 360;
        if (canvas!.width !== w || canvas!.height !== h) {
          canvas!.width = w; canvas!.height = h;
        }
        ctx!.drawImage(video!, 0, 0, w, h);
        const imageData = ctx!.getImageData(0, 0, w, h);
        applyChromaKeyPixels(imageData.data, filtersRef.current.chromaSimilarity ?? 80, filtersRef.current.chromaSpill ?? 30);
        ctx!.putImageData(imageData, 0, 0);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <>
      <video ref={videoRef} style={{ display: "none" }} muted playsInline autoPlay />
      <canvas ref={canvasRef} style={style} />
    </>
  );
}

// ─── Cam zone ─────────────────────────────────────────────────────────────────

function CamZone({ cam, stream, filters }: {
  cam: OverlayConfig["cams"][number];
  stream?: MediaStream | null;
  filters?: CamFilters | null;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) { v.srcObject = stream; v.play().catch(() => {}); }
    else { v.srcObject = null; }
  }, [stream]);

  if (!cam.enabled) return null;

  const chromaKey = filters?.chromaKey ?? false;

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    width: `${filters?.zoom ?? 100}%`,
    height: `${filters?.zoom ?? 100}%`,
    top: `${50 + (filters?.panY ?? 0)}%`,
    left: `${50 + (filters?.panX ?? 0)}%`,
    transform: `translate(-50%, -50%)${cam.mirror ? " scaleX(-1)" : ""}`,
    objectFit: "cover" as const,
    filter: filterCss(filters ?? null),
  };

  return (
    <div style={{
      ...rect(cam),
      overflow: "hidden",
      border: chromaKey ? "none" : `${cam.borderWidth}px solid ${cam.borderColor}`,
      borderRadius: chromaKey ? 0 : cam.borderRadius,
      background: "transparent",
    }}>
      {stream && (
        chromaKey
          ? <ChromaKeyCanvas stream={stream} filters={filters!} style={mediaStyle} />
          : (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={mediaStyle}
            />
          )
      )}
    </div>
  );
}

// ─── Slot zone ────────────────────────────────────────────────────────────────

function SlotZone({
  slot, screenStream,
}: {
  slot: OverlayConfig["slot"];
  screenStream?: MediaStream | null;
}) {
  React.useEffect(() => { injectPremiumKeyframes(); }, []);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (screenStream) { v.srcObject = screenStream; v.play().catch(() => {}); }
    else { v.srcObject = null; }
  }, [screenStream]);

  if (!slot.enabled) return null;

  // Structure stable : même conteneur dans tous les cas (bordure animée ou pas).
  // Le toggle de bordure n'unmount plus le <video> → le flux reste branché.
  // La bordure premium est rendue via une couche ::overlay en position absolute
  // avec CSS mask pour n'afficher QUE le padding (vraie bordure, pas un fill).
  const radius = Math.max(0, slot.borderRadius || 0);
  const premium = !!(slot.showFrame && slot.animatedBorder);
  const pad = premium ? Math.max(1, slot.frameWidth || 2) : 0;
  const staticBorder = !premium && slot.showFrame
    ? `${slot.frameWidth}px solid ${slot.frameColor}`
    : "none";

  return (
    <div style={{
      ...rect(slot),
      border: staticBorder,
      borderRadius: radius,
      background: "transparent",
      overflow: "hidden",
    }}>
      {screenStream && (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{
            width: "100%", height: "100%",
            objectFit: "contain",
            background: "transparent",
            display: "block",
          }}
        />
      )}
      {premium && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            padding: pad,
            borderRadius: radius,
            background: "linear-gradient(120deg,#3b3473,#6d5ecc,#a855f7,#6d5ecc,#3b3473)",
            backgroundSize: "300% 100%",
            animation: "slotBorderSweep 6s linear infinite, slotBorderGlow 3.4s ease-in-out infinite",
            pointerEvents: "none",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      )}
    </div>
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

/** Clé stable pour l'iframe — ignore les params visuels (font/scale/align/etc.)
 *  pour éviter le rechargement (et la perte des messages) à chaque push de config.
 *  Seuls slug+token+api changent réellement l'identité du chat. */
function chatIframeKey(chatUrl: string): string {
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
      background: opacity > 0 ? `rgba(0,0,0,${opacity})` : "none",
      overflow: "hidden",
    }}>
      <iframe
        ref={iframeRef}
        key={chatIframeKey(chat.chatUrl)}
        src={chat.chatUrl}
        style={{ width: "100%", height: "100%", border: "none", background: "none", backgroundColor: "transparent" }}
        title="Chat"
        allow="autoplay"
        allowTransparency={true}
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

// ─── Call zone ────────────────────────────────────────────────────────────────

type CallItem = {
  id: string;
  slotName: string;
  slotKey?: string | null;
  provider?: string | null;
  username?: string | null;
  pos?: number;
  imageUrl?: string | null;
};

function useCallQueue(slug: string, socket: ReturnType<typeof io> | null, enabled: boolean) {
  const [head, setHead] = React.useState<CallItem | null>(null);
  const [next, setNext] = React.useState<CallItem | null>(null);
  const [count, setCount] = React.useState(0);

  const fetchOnce = React.useCallback(async () => {
    if (!enabled || !slug) return;
    try {
      const r = await fetch(`${LUNA_API_BASE}/api/public/calls/${encodeURIComponent(slug)}/queue`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (!j?.ok) return;
      setHead(j.head ?? null);
      setNext(j.next ?? null);
      setCount(Number(j.count || 0));
    } catch {}
  }, [enabled, slug]);

  // Initial + polling de sécurité (10s) au cas où le socket rate un event
  React.useEffect(() => {
    if (!enabled) return;
    void fetchOnce();
    const id = setInterval(() => { void fetchOnce(); }, 10000);
    return () => clearInterval(id);
  }, [enabled, fetchOnce]);

  // Refetch sur événement socket calls:changed
  React.useEffect(() => {
    if (!enabled || !socket) return;
    const handler = () => { void fetchOnce(); };
    socket.on("calls:changed", handler);
    // Joindre la room obs du slug-call (peut différer du slug overlay courant)
    if (slug) socket.emit("obs:subscribe", { slug }, () => {});
    return () => { socket.off("calls:changed", handler); };
  }, [enabled, socket, slug, fetchOnce]);

  return { head, next, count };
}

function CallCard({
  item, label, icon, accent, fontSize, isCurrent,
}: {
  item: CallItem | null;
  label: string;
  icon: string;
  accent: string;
  fontSize: number;
  isCurrent?: boolean;
}) {
  const hasItem = !!item;
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: "flex", flexDirection: "column",
      borderRadius: 14,
      background:
        "linear-gradient(180deg, rgba(20,18,40,0.92) 0%, rgba(36,22,58,0.92) 50%, rgba(58,22,42,0.94) 100%)",
      border: `1px solid ${isCurrent ? accent + "88" : "rgba(255,255,255,0.08)"}`,
      boxShadow: isCurrent
        ? `0 0 28px ${accent}55, 0 8px 22px rgba(0,0,0,0.45), inset 0 0 0 1px ${accent}33`
        : "0 6px 18px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Header banner */}
      <div style={{
        flexShrink: 0,
        padding: `${Math.max(4, fontSize * 0.32)}px ${fontSize * 0.6}px`,
        background:
          isCurrent
            ? `linear-gradient(90deg, rgba(40,15,28,0.95) 0%, rgba(80,18,42,0.95) 50%, rgba(40,15,28,0.95) 100%)`
            : `linear-gradient(90deg, rgba(28,20,46,0.95) 0%, rgba(52,28,76,0.95) 50%, rgba(28,20,46,0.95) 100%)`,
        borderBottom: `1px solid ${isCurrent ? "rgba(244,114,182,0.35)" : "rgba(168,85,247,0.32)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        position: "relative",
      }}>
        <span style={{ fontSize: fontSize * 0.95, lineHeight: 1, filter: "drop-shadow(0 0 4px rgba(255,255,255,.4))" }}>{icon}</span>
        <span style={{
          fontSize: fontSize * 0.78,
          fontWeight: 900,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: isCurrent ? "#fde2ec" : "#e9d5ff",
          textShadow: `0 0 10px ${isCurrent ? "rgba(244,114,182,0.6)" : "rgba(168,85,247,0.6)"}`,
          lineHeight: 1,
        }}>{label}</span>
      </div>

      {/* Caller @username */}
      <div style={{
        flexShrink: 0,
        padding: `${fontSize * 0.35}px ${fontSize * 0.6}px ${fontSize * 0.18}px`,
        textAlign: "center",
        fontSize: fontSize * 0.78,
        fontWeight: 800,
        color: "#fef3c7",
        letterSpacing: ".02em",
        textShadow: "0 0 10px rgba(251,191,36,0.55), 0 1px 2px rgba(0,0,0,0.6)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        lineHeight: 1.1,
      }}>
        {item?.username ? `${item.username}` : (hasItem ? "" : "—")}
      </div>

      {/* Slot image */}
      <div style={{
        flex: 1, minHeight: 0,
        margin: `${fontSize * 0.2}px ${fontSize * 0.5}px`,
        borderRadius: 10,
        overflow: "hidden",
        background: "rgba(0,0,0,0.55)",
        display: "grid", placeItems: "center",
        position: "relative",
        boxShadow: hasItem ? `inset 0 0 0 1px ${accent}33, 0 4px 14px rgba(0,0,0,0.45)` : "inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}>
        {item?.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", display: "block",
            }}
          />
        ) : (
          <div style={{ fontSize: fontSize * 2.2, opacity: 0.35 }}>🎰</div>
        )}
        {/* Glow overlay */}
        {hasItem ? (
          <div style={{
            position: "absolute", inset: 0,
            boxShadow: `inset 0 0 ${fontSize * 1.4}px ${accent}33`,
            pointerEvents: "none",
          }} />
        ) : null}
      </div>

      {/* Slot name */}
      <div style={{
        flexShrink: 0,
        padding: `${fontSize * 0.18}px ${fontSize * 0.5}px ${fontSize * 0.1}px`,
        textAlign: "center",
        fontSize: fontSize * 1.18,
        fontWeight: 900,
        letterSpacing: ".01em",
        color: "#fbbf24",
        textShadow: "0 0 14px rgba(251,191,36,0.55), 0 2px 4px rgba(0,0,0,0.7)",
        textTransform: "uppercase",
        lineHeight: 1.05,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        fontFamily: "'Bebas Neue', 'Oswald', system-ui, sans-serif",
      }}>
        {item?.slotName || (hasItem ? "—" : "En attente")}
      </div>

      {/* Provider */}
      <div style={{
        flexShrink: 0,
        padding: `0 ${fontSize * 0.5}px ${fontSize * 0.5}px`,
        textAlign: "center",
        fontSize: fontSize * 0.62,
        fontWeight: 700,
        color: "rgba(232,213,255,0.6)",
        letterSpacing: ".14em",
        textTransform: "uppercase",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        lineHeight: 1.1,
      }}>
        {item?.provider || (hasItem ? "" : "—")}
      </div>
    </div>
  );
}

function CallZone({ call, socket }: { call: CallZoneConfig | undefined; socket: ReturnType<typeof io> | null }) {
  const enabled = !!call?.enabled;
  const slug = String(call?.slug || "").trim().toLowerCase();
  const { head, next, count } = useCallQueue(slug, socket, enabled);
  if (!call || !enabled) return null;

  const fontSize = Math.max(10, Math.min(36, Number(call.fontSize) || 16));
  const accent = call.accentColor || "#a855f7";
  const showNext = call.showNext !== false;
  const nextLabel = count > 2 ? `CALL SUIVANT · +${count - 1}` : "CALL SUIVANT";

  return (
    <div style={{
      ...rect(call),
      borderRadius: call.borderRadius,
      display: "flex", alignItems: "stretch", gap: fontSize * 0.6,
      overflow: "visible",
      pointerEvents: "none",
    }}>
      <CallCard
        item={head}
        label="CALL EN COURS"
        icon="👑"
        accent={accent}
        fontSize={fontSize}
        isCurrent
      />
      {showNext ? (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: fontSize * 1.6, flexShrink: 0,
            color: accent,
            fontSize: fontSize * 1.8,
            fontWeight: 900,
            textShadow: `0 0 14px ${accent}aa, 0 2px 6px rgba(0,0,0,0.7)`,
            filter: "drop-shadow(0 0 8px " + accent + "66)",
          }}>
            ›
          </div>
          <CallCard
            item={next}
            label={nextLabel}
            icon="🎯"
            accent={accent}
            fontSize={fontSize}
          />
        </>
      ) : null}
    </div>
  );
}

// ─── Overlay renderer ─────────────────────────────────────────────────────────

function OverlayRenderer({
  config, camStreams, screenStream, socket,
}: {
  config: OverlayConfig;
  camStreams: Map<number, CamStreamEntry>;
  screenStream?: MediaStream | null;
  socket: ReturnType<typeof io> | null;
}) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "transparent",
    }}>
      <BackgroundZone bg={config.background} />
      <SlotZone slot={config.slot} screenStream={screenStream} />
      <StatsZone stats={config.stats} />
      <ChatZone chat={config.chat} />
      <PromoZone promo={config.promo} />
      <CallZone call={config.call} socket={socket} />
      <SponsorBanner config={config.sponsor ?? defaultSponsor()} />
      {config.cams.map((cam, i) => {
        const entry = camStreams.get(i + 1);
        return <CamZone key={i} cam={cam} stream={entry?.stream} filters={entry?.filters ?? null} />;
      })}
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

// ─── Debug flash (disparaît après 2s) ────────────────────────────────────────

function LiveFlash() {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div style={{
      position: "fixed", bottom: 16, right: 16, zIndex: 10000,
      background: "rgba(34,197,94,.9)", color: "#fff",
      fontSize: 11, fontWeight: 800, padding: "4px 10px",
      borderRadius: 999, letterSpacing: ".05em",
      fontFamily: "system-ui, sans-serif",
      pointerEvents: "none",
    }}>
      ✓ CONFIG UPDATED
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

  const { config, lastUpdate, socket } = useOverlaySocket(baseConfig ?? {} as OverlayConfig);
  const effectiveConfig = baseConfig ? config : null;
  const camStreams = useCamStreams(socket);
  // Overlay OBS est un viewer pur — il ne partage jamais lui-même.
  // On passe un mySlug vide pour qu'il n'ignore aucun broadcaster.
  const remoteScreen = useScreenViewer(socket, "");

  // Page-level styles: fullscreen, transparent background for OBS
  React.useEffect(() => {
    document.title = "LunaLive Overlay";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";

    // Supprime les pseudo-elements body (grain + glow ambiant) qui leakent sous OBS
    const styleEl = document.createElement("style");
    styleEl.id = "overlay-transparent-override";
    styleEl.textContent = `
      html, body { background: transparent !important; }
      body::before, body::after { display: none !important; }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      document.body.style.margin = "";
      document.body.style.padding = "";
      document.body.style.overflow = "";
      document.getElementById("overlay-transparent-override")?.remove();
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
        <OverlayRenderer config={effectiveConfig} camStreams={camStreams} screenStream={remoteScreen?.stream ?? null} socket={socket} />
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

      {/* Debug flash — visible 3s après chaque mise à jour socket */}
      {lastUpdate > 0 && (
        <LiveFlash key={lastUpdate} />
      )}
    </>
  );
}
