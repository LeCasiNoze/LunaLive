// web/src/pages/fsb/StreamControlPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../auth/AuthProvider";
import RumbleStreamPlayer from "../../components/RumbleStreamPlayer";
import RumbleEmbedPlayer from "../../components/RumbleEmbedPlayer";
import { DlivePlayer } from "../../components/DlivePlayer";
import { ChatPanel } from "../../components/ChatPanel";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

const FSB_ALLOWED_IDS = new Set([4, 15, 71]);
const FSB_SLUGS = ["fabiozsis", "samyyzsis", "lecasinoze"];
const SLOT_LABELS = ["Cam 1", "Cam 2", "Cam 3"];

// Exact mapping username→slug pour éviter les collisions WebRTC
// (avant, le fallback FSB_SLUGS[0] faisait que LeCasiNoze s'enregistrait comme "fabiozsis")
function slugFromUsername(username: string): string {
  const u = String(username || "").trim().toLowerCase();
  if (FSB_SLUGS.includes(u)) return u;
  return u; // on préfère l'username réel plutôt que FSB_SLUGS[0] (qui causait des collisions)
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type CamFilters = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  zoom: number;   // 100–300%
  panX: number;   // -50–+50%
  panY: number;   // -50–+50%
  chromaKey: boolean;         // fond vert actif
  chromaSimilarity: number;   // 0–100 — sensibilité au vert (défaut 80)
  chromaSpill: number;        // 0–100 — suppression du halo vert (défaut 30)
};

const DEFAULT_FILTERS: CamFilters = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0,
  zoom: 100, panX: 0, panY: 0,
  chromaKey: false, chromaSimilarity: 80, chromaSpill: 30,
};

// Remote broadcaster entry
type RemoteEntry = {
  slug: string;
  slot: number;  // 1-based slot from server
  stream: MediaStream | null;
  filters: CamFilters;
  socketId: string;
};

// Slot card data for rendering — derived, not stored
type SlotCardData = {
  slug: string;     // "" if empty
  isMe: boolean;
  active: boolean;
  stream: MediaStream | null;
  filters: CamFilters;
};

function filterCss(f: CamFilters): string {
  return `brightness(${f.brightness / 100}) contrast(${f.contrast / 100}) saturate(${f.saturation / 100}) hue-rotate(${f.hue}deg)`;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSocket(): Socket | null {
  const [socket, setSocket] = React.useState<Socket | null>(null);
  React.useEffect(() => {
    const s = io(LUNA_API_BASE, { transports: ["websocket", "polling"] });
    setSocket(s);
    return () => { s.disconnect(); };
  }, []);
  return socket;
}

function useStreamTimer() {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60), s = elapsed % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

type StreamInfo = {
  isLive: boolean;
  platform: "rumble" | "dlive" | null;
  rumbleEmbedUrl: string | null;
  rumbleHlsUrl: string | null;
  rumbleThumbnailUrl: string | null;
  channelSlug: string | null;
  channelUsername: string | null;
  title: string | null;
  viewers: number;
};

const EMPTY_STREAM: StreamInfo = {
  isLive: false, platform: null, rumbleEmbedUrl: null, rumbleHlsUrl: null,
  rumbleThumbnailUrl: null, channelSlug: null, channelUsername: null, title: null, viewers: 0,
};

// Toujours le stream de fabiozsis — même logique que sa page streamer
function useStreamInfo() {
  const [info, setInfo] = React.useState<StreamInfo>(EMPTY_STREAM);

  React.useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(`${LUNA_API_BASE}/streamers/fabiozsis`);
        const j = await r.json().catch(() => null);
        if (!j) return;
        // Détecter la plateforme — même logique que useStreamerData
        let platform: "rumble" | "dlive" | null = null;
        if (j.streamProvider === "rumble" || j.platform === "rumble" || j.rumbleConnection?.username) {
          platform = "rumble";
        } else if (j.dliveConnection?.enabled || j.channelSlug || j.channelUsername) {
          platform = "dlive";
        }
        console.log("[StreamInfo] fabiozsis isLive:", !!j.isLive, "platform:", platform,
          "rumbleEmbedUrl:", j.rumbleEmbedUrl, "channelSlug:", j.channelSlug);
        setInfo({
          isLive: !!j.isLive,
          platform,
          rumbleEmbedUrl: j.rumbleEmbedUrl ?? null,
          rumbleHlsUrl: j.rumbleHlsUrl ?? null,
          rumbleThumbnailUrl: j.rumbleThumbnailUrl ?? null,
          channelSlug: j.channelSlug ?? null,
          channelUsername: j.channelUsername ?? null,
          title: j.title ?? null,
          viewers: j.viewers ?? 0,
        });
      } catch (e) {
        console.error("[StreamInfo] fetch error:", e);
      }
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  return info;
}

function useFollowers() {
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    const fetch_ = async () => {
      try {
        const token = localStorage.getItem("lunalive_token_v1") || "";
        const r = await fetch(`${LUNA_API_BASE}/me/overlay/followers?slug=fabiozsis`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json().catch(() => null);
        if (j?.ok) setCount(j.count ?? null);
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => clearInterval(id);
  }, []);
  return count;
}

// ─── WebRTC broadcaster ───────────────────────────────────────────────────────

function useBroadcaster(
  socket: Socket | null,
  stream: MediaStream | null,
  slug: string,
  slot: number,
  _filters: CamFilters,
  active: boolean,
  onInitialFilters?: (f: Partial<CamFilters>) => void,
) {
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const onInitRef = React.useRef(onInitialFilters);
  onInitRef.current = onInitialFilters;

  React.useEffect(() => {
    if (!socket || !active || !slug) return;
    console.log("[Broadcaster] registering", slug, "at slot", slot);
    socket.emit(
      "cam:register",
      { slug, slot },
      (ack: { ok?: boolean; filters?: Partial<CamFilters> | null }) => {
        if (ack?.ok && ack.filters && onInitRef.current) {
          console.log("[Broadcaster] received persisted filters for", slug);
          onInitRef.current(ack.filters);
        }
      }
    );
    return () => {
      console.log("[Broadcaster] leaving", slug);
      socket.emit("cam:leave");
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [socket, active, slug, slot]);

  // Note: les filter-updates sont émis par handleFiltersChange côté parent
  // (une seule source d'émission pour éviter les boucles de feedback).

  React.useEffect(() => {
    if (!socket || !active || !stream) return;

    const handleRequest = async ({ viewerId }: { viewerId: string }) => {
      console.log("[Broadcaster] cam:request from viewer", viewerId, "→ creating offer");
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(viewerId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit("cam:ice", { to: viewerId, candidate }); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close(); peersRef.current.delete(viewerId);
        }
      };
      const offer = await pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      socket.emit("cam:offer", { to: viewerId, sdp: offer });
    };
    const handleAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    };
    const handleIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };
    socket.on("cam:request", handleRequest);
    socket.on("cam:answer", handleAnswer);
    socket.on("cam:ice", handleIce);
    return () => {
      socket.off("cam:request", handleRequest);
      socket.off("cam:answer", handleAnswer);
      socket.off("cam:ice", handleIce);
    };
  }, [socket, active, stream]);
}

// ─── Stable WebRTC viewer ────────────────────────────────────────────────────
// IMPORTANT: uses mySlugRef (a ref) instead of a reactive mySlug prop.
// This means the effect NEVER re-runs when myCamActive changes — preventing
// the bug where activating your own cam destroyed all remote streams.

function useRemoteCams(
  socket: Socket | null,
  mySlugRef: React.MutableRefObject<string>,
) {
  const [entries, setEntries] = React.useState<Map<string, RemoteEntry>>(new Map());
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  // Track des handlers par slug pour les off() proprement lors d'une reconnexion
  const handlersRef = React.useRef<Map<string, { offer: any; ice: any }>>(new Map());

  const connect = React.useCallback((bc: { slug: string; slot: number; socketId: string; filters: any }) => {
    if (!socket) return;
    if (bc.slug === mySlugRef.current) {
      console.log("[RemoteCams] skip self:", bc.slug);
      return;
    }
    // Si un ancien PC existe pour ce slug (re-registration broadcaster après
    // refresh/kick), on le ferme et on reconnecte. Sinon on resterait bloqué
    // sur une PC obsolète => écran noir.
    const stale = peersRef.current.get(bc.slug);
    if (stale) {
      console.log("[RemoteCams] re-registration for", bc.slug, "→ closing stale PC");
      try { stale.close(); } catch {}
      peersRef.current.delete(bc.slug);
      const staleH = handlersRef.current.get(bc.slug);
      if (staleH) {
        socket.off("cam:offer", staleH.offer);
        socket.off("cam:ice", staleH.ice);
        handlersRef.current.delete(bc.slug);
      }
    }
    console.log("[RemoteCams] connecting to broadcaster:", bc.slug, "slot:", bc.slot, "socketId:", bc.socketId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(bc.slug, pc);

    // Pre-register so filter updates work before video arrives
    setEntries(prev => {
      const next = new Map(prev);
      next.set(bc.slug, {
        slug: bc.slug, slot: bc.slot, stream: null,
        filters: { ...DEFAULT_FILTERS, ...(bc.filters ?? {}) },
        socketId: bc.socketId,
      });
      return next;
    });

    pc.ontrack = ({ streams: s }) => {
      const stream = s[0] ?? null;
      console.log("[RemoteCams] ontrack for", bc.slug, "stream:", stream?.id ?? "null");
      if (!stream) return;
      setEntries(prev => {
        const next = new Map(prev);
        const ex = next.get(bc.slug);
        if (ex) next.set(bc.slug, { ...ex, stream });
        return next;
      });
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("cam:ice", { to: bc.socketId, candidate });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        peersRef.current.delete(bc.slug);
        setEntries(prev => {
          const next = new Map(prev);
          const ex = next.get(bc.slug);
          if (ex) next.set(bc.slug, { ...ex, stream: null });
          return next;
        });
      }
    };

    const handleOffer = async ({ from: offerId, slug, sdp }: { from: string; slug: string; sdp: RTCSessionDescriptionInit }) => {
      if (slug !== bc.slug) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("cam:answer", { to: offerId, sdp: answer });
    };
    const handleIce = async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const myPc = peersRef.current.get(bc.slug);
      if (myPc) try { await myPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };
    socket.on("cam:offer", handleOffer);
    socket.on("cam:ice", handleIce);
    handlersRef.current.set(bc.slug, { offer: handleOffer, ice: handleIce });

    // Request stream from this broadcaster
    socket.emit("cam:request", { fromSlug: bc.slug });
  }, [socket, mySlugRef]);

  React.useEffect(() => {
    if (!socket) return;

    // Get currently active broadcasters
    socket.emit("cam:viewer-join", {}, (ack: { ok: boolean; active: any[] }) => {
      console.log("[RemoteCams] cam:viewer-join ack, active broadcasters:", ack?.active?.length ?? 0, ack?.active?.map((b: any) => `${b.slug}@slot${b.slot}`));
      for (const bc of (ack?.active ?? [])) connect(bc);
    });

    const onRegistered = (bc: any) => {
      console.log("[RemoteCams] cam:registered", bc.slug, "slot:", bc.slot);
      connect(bc);
    };

    const onLeft = ({ slug }: { slug: string }) => {
      console.log("[RemoteCams] cam:left", slug);
      peersRef.current.get(slug)?.close();
      peersRef.current.delete(slug);
      const h = handlersRef.current.get(slug);
      if (h) {
        socket.off("cam:offer", h.offer);
        socket.off("cam:ice", h.ice);
        handlersRef.current.delete(slug);
      }
      setEntries(prev => { const next = new Map(prev); next.delete(slug); return next; });
    };

    const onFilterUpdate = ({ slug, filters }: { slug: string; filters: CamFilters }) => {
      if (slug === mySlugRef.current) return; // skip own echo
      setEntries(prev => {
        const next = new Map(prev);
        const ex = next.get(slug);
        if (ex) next.set(slug, { ...ex, filters: { ...DEFAULT_FILTERS, ...filters } });
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
      handlersRef.current.forEach((h) => {
        socket.off("cam:offer", h.offer);
        socket.off("cam:ice", h.ice);
      });
      handlersRef.current.clear();
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      setEntries(new Map());
    };
  }, [socket, connect, mySlugRef]);

  const updateFilters = React.useCallback((slug: string, filters: CamFilters) => {
    setEntries(prev => {
      const next = new Map(prev);
      const ex = next.get(slug);
      if (ex) next.set(slug, { ...ex, filters });
      return next;
    });
  }, []);

  return { entries, updateFilters };
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
        const alpha = Math.round(data[i + 3] * (1 - excess / threshold));
        data[i + 3] = alpha;
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
        applyChromaKeyPixels(imageData.data, filtersRef.current.chromaSimilarity, filtersRef.current.chromaSpill);
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

// ─── Video element ────────────────────────────────────────────────────────────

function CamVideo({ stream, filters, muted = true }: { stream: MediaStream | null; filters: CamFilters; muted?: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (stream) { v.srcObject = stream; v.play().catch(() => {}); }
    else { v.srcObject = null; }
  }, [stream]);

  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    width: `${filters.zoom}%`,
    height: `${filters.zoom}%`,
    top: `${50 + filters.panY}%`,
    left: `${50 + filters.panX}%`,
    transform: "translate(-50%, -50%)",
    objectFit: "cover" as const,
    filter: filterCss(filters),
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: filters.chromaKey ? "transparent" : "#000" }}>
      {stream ? (
        filters.chromaKey
          ? <ChromaKeyCanvas stream={stream} filters={filters} style={mediaStyle} />
          : (
            <video
              ref={ref}
              muted={muted}
              playsInline
              autoPlay
              style={mediaStyle}
            />
          )
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, opacity: 0.15 }}>📷</span>
        </div>
      )}
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#6366f1", cursor: "pointer", height: 3 }}
      />
    </div>
  );
}

// ─── Cam card ─────────────────────────────────────────────────────────────────

function CamCard({
  slotIndex, data, myCamActive,
  onActivate, onDeactivate, onFiltersChange,
}: {
  slotIndex: number;
  data: SlotCardData;
  myCamActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onFiltersChange: (f: Partial<CamFilters>) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div style={{ ...S.camCard, ...(data.filters.chromaKey ? { border: "2px dashed rgba(34,197,94,.35)", background: "transparent" } : {}) }}>
      {/* Header */}
      <div style={S.camCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8" }}>{SLOT_LABELS[slotIndex]}</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 999, fontWeight: 700,
            background: data.active ? "rgba(34,197,94,.12)" : "rgba(100,116,139,.08)",
            color: data.active ? "#4ade80" : "#475569",
          }}>
            {data.slug ? `${data.active ? "●" : "○"} ${data.slug}` : "○ vide"}
          </span>
          {data.isMe && <span style={{ fontSize: 9, color: "#6366f1", fontWeight: 700 }}>MOI</span>}
        </div>
        <button onClick={() => setOpen(v => !v)} style={S.toggleBtn}>
          {open ? "▲ fermer" : "▼ régler"}
        </button>
      </div>

      {/* Video preview */}
      <div style={{ aspectRatio: "16/9" }}>
        <CamVideo stream={data.stream} filters={data.filters} muted={data.isMe} />
      </div>

      {/* Controls */}
      {open && (
        <div style={S.camControls}>
          {/* My cam: activate/deactivate */}
          {data.isMe && (
            <div style={{ marginBottom: 10 }}>
              {!myCamActive ? (
                <button onClick={onActivate} style={{ ...S.btn, background: "rgba(99,102,241,.8)", fontSize: 11, width: "100%", padding: "6px 0" }}>
                  ● Activer ma caméra
                </button>
              ) : (
                <button onClick={onDeactivate} style={{ ...S.btn, background: "rgba(239,68,68,.7)", fontSize: 11, width: "100%", padding: "6px 0" }}>
                  ■ Désactiver
                </button>
              )}
            </div>
          )}

          <div style={{ height: 1, background: "rgba(255,255,255,.05)", marginBottom: 8 }} />

          {/* Filters */}
          <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase" }}>Couleur</div>
          <Slider label="Luminosité" value={data.filters.brightness} min={50} max={150} onChange={v => onFiltersChange({ brightness: v })} />
          <Slider label="Contraste" value={data.filters.contrast} min={50} max={200} onChange={v => onFiltersChange({ contrast: v })} />
          <Slider label="Saturation" value={data.filters.saturation} min={0} max={200} onChange={v => onFiltersChange({ saturation: v })} />
          <Slider label="Teinte" value={data.filters.hue} min={-180} max={180} onChange={v => onFiltersChange({ hue: v })} />

          <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "8px 0" }} />
          <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase" }}>Zoom / Recadrage</div>
          <Slider label="Zoom %" value={data.filters.zoom} min={100} max={300} onChange={v => onFiltersChange({ zoom: v })} />
          <Slider label="Pan X" value={data.filters.panX} min={-50} max={50} onChange={v => onFiltersChange({ panX: v })} />
          <Slider label="Pan Y" value={data.filters.panY} min={-50} max={50} onChange={v => onFiltersChange({ panY: v })} />

          <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "8px 0" }} />

          {/* Chroma key */}
          <button
            onClick={() => onFiltersChange({ chromaKey: !data.filters.chromaKey })}
            style={{
              ...S.btn, width: "100%", padding: "6px 0", marginBottom: 6,
              background: data.filters.chromaKey ? "rgba(34,197,94,.2)" : "rgba(255,255,255,.04)",
              border: `1px solid ${data.filters.chromaKey ? "rgba(34,197,94,.4)" : "rgba(255,255,255,.07)"}`,
              color: data.filters.chromaKey ? "#4ade80" : "#64748b",
              fontSize: 10,
            }}
          >
            {data.filters.chromaKey ? "🟢 Fond vert ON" : "⬜ Fond vert"}
          </button>
          {data.filters.chromaKey && (
            <div style={{ background: "rgba(34,197,94,.05)", border: "1px solid rgba(34,197,94,.15)", borderRadius: 6, padding: "8px 8px 4px", marginBottom: 6 }}>
              <Slider label="Sensibilité (similarity)" value={data.filters.chromaSimilarity} min={10} max={100}
                onChange={v => onFiltersChange({ chromaSimilarity: v })} />
              <Slider label="Anti-halo (spill)" value={data.filters.chromaSpill} min={0} max={100}
                onChange={v => onFiltersChange({ chromaSpill: v })} />
            </div>
          )}

          <button
            onClick={() => onFiltersChange({ ...DEFAULT_FILTERS })}
            style={{ ...S.btn, background: "transparent", border: "1px solid rgba(255,255,255,.07)", fontSize: 10, color: "#475569", padding: "4px 0", width: "100%" }}
          >
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page guard ───────────────────────────────────────────────────────────────

export default function StreamControlPage() {
  const { user } = useAuth();
  if (!user || !FSB_ALLOWED_IDS.has(user.id)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#07101f", color: "#94a3b8", fontFamily: "system-ui" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ color: "#fc8181", fontWeight: 700 }}>Accès réservé FSB</div>
      </div>
    );
  }
  return <StreamControlInner user={user} />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function StreamControlInner({ user }: { user: { id: number; username: string } }) {
  const socket = useSocket();
  const timer = useStreamTimer();
  const streamInfo = useStreamInfo();
  const followers = useFollowers();

  // My identity — derived from username, stable (exact match, plus de fallback partagé)
  const mySlug = React.useMemo(() => slugFromUsername(user.username), [user.username]);
  // Ref so useRemoteCams never re-runs when myCamActive changes
  const mySlugRef = React.useRef(mySlug);
  mySlugRef.current = mySlug;

  const CAM_STATE_KEY = `lunalive-streamcontrol-cam-${mySlug}`;
  const [mySlot, setMySlot] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem(CAM_STATE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.slot === "number" && s.slot >= 0 && s.slot <= 2) return s.slot;
      }
    } catch {}
    return 0;
  });
  const [myCamActive, setMyCamActive] = React.useState(false);
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [myFilters, setMyFilters] = React.useState<CamFilters>({ ...DEFAULT_FILTERS });
  const [camError, setCamError] = React.useState<string | null>(null);
  const [msgCount, setMsgCount] = React.useState(0);

  // STABLE viewer — never tears down when myCamActive / mySlot changes
  const { entries: remoteEntries, updateFilters: updateRemoteFilters } = useRemoteCams(socket, mySlugRef);

  // Broadcaster — independent of viewer
  // Sur register, si des filtres sont persistés en DB pour ce slug, on les applique
  useBroadcaster(
    socket, localStream, mySlug, mySlot + 1, myFilters, myCamActive,
    React.useCallback((persisted: Partial<CamFilters>) => {
      setMyFilters((prev) => ({ ...prev, ...persisted }));
    }, []),
  );

  // Sync: si un autre user (ou un autre onglet) modifie MES filtres, applique localement
  // sans ré-émettre (sinon boucle infinie, car handleFiltersChange émet déjà sur edit user).
  React.useEffect(() => {
    if (!socket || !mySlug) return;
    const onOwnFilterUpdate = ({ slug, filters }: { slug: string; filters: Partial<CamFilters> }) => {
      if (slug !== mySlug) return;
      setMyFilters((prev) => ({ ...prev, ...filters }));
    };
    socket.on("cam:filter-update", onOwnFilterUpdate);
    return () => { socket.off("cam:filter-update", onOwnFilterUpdate); };
  }, [socket, mySlug]);

  // Deactivate when slot changes while active (1 cam per person)
  const prevMySlot = React.useRef(mySlot);
  React.useEffect(() => {
    if (prevMySlot.current !== mySlot && myCamActive) {
      console.log("[CamControl] slot changed while active → deactivating");
      localStream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setMyCamActive(false);
    }
    prevMySlot.current = mySlot;
  }, [mySlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle server kick (another device took the slot)
  React.useEffect(() => {
    if (!socket) return;
    const onKicked = ({ reason }: { reason?: string }) => {
      console.log("[CamControl] cam:kicked from server, reason:", reason);
      localStream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setMyCamActive(false);
      setCamError("Cam désactivée — un autre appareil a pris le slot");
      setTimeout(() => setCamError(null), 4000);
    };
    socket.on("cam:kicked", onKicked);
    return () => { socket.off("cam:kicked", onKicked); };
  }, [socket, localStream]);

  // Chat message counter
  React.useEffect(() => {
    if (!socket) return;
    const onMsg = () => setMsgCount(n => n + 1);
    socket.on("chat:message", onMsg);
    return () => { socket.off("chat:message", onMsg); };
  }, [socket]);

  // Cleanup stream on unmount
  React.useEffect(() => () => { localStream?.getTracks().forEach(t => t.stop()); }, [localStream]);

  const activateCam = React.useCallback(async () => {
    setCamError(null);
    console.log("[CamControl] activating cam for", mySlug, "slot", mySlot + 1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      setLocalStream(stream);
      setMyCamActive(true);
      try { localStorage.setItem(CAM_STATE_KEY, JSON.stringify({ active: true, slot: mySlot })); } catch {}
    } catch (e: any) {
      setCamError(e?.message ?? "Accès caméra refusé");
      try { localStorage.removeItem(CAM_STATE_KEY); } catch {}
    }
  }, [CAM_STATE_KEY, mySlot, mySlug]);

  const deactivateCam = () => {
    console.log("[CamControl] deactivating cam for", mySlug);
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setMyCamActive(false);
    try { localStorage.setItem(CAM_STATE_KEY, JSON.stringify({ active: false, slot: mySlot })); } catch {}
  };

  // Persiste le slot quand il change (même cam inactive)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CAM_STATE_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(CAM_STATE_KEY, JSON.stringify({ ...prev, slot: mySlot }));
    } catch {}
  }, [CAM_STATE_KEY, mySlot]);

  // Auto-réactivation au mount si la cam était active avant refresh/deploy
  // (getUserMedia réutilise l'autorisation déjà accordée par le navigateur, sans popup)
  const autoActivatedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoActivatedRef.current) return;
    try {
      const raw = localStorage.getItem(CAM_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s?.active === true) {
        autoActivatedRef.current = true;
        console.log("[CamControl] auto-activating cam (persisted state)");
        // petit délai pour laisser le socket se connecter avant cam:register
        const t = setTimeout(() => { activateCam(); }, 500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [CAM_STATE_KEY, activateCam]);

  const handleFiltersChange = React.useCallback((slug: string, patch: Partial<CamFilters>) => {
    if (!slug) return;
    if (slug === mySlug) {
      setMyFilters(prev => {
        const next = { ...prev, ...patch } as CamFilters;
        socket?.emit("cam:filter-update", { slug, filters: next });
        return next;
      });
    } else {
      const existing = remoteEntries.get(slug);
      if (existing) {
        const next = { ...existing.filters, ...patch } as CamFilters;
        updateRemoteFilters(slug, next);
        socket?.emit("cam:filter-update", { slug, filters: next });
      }
    }
  }, [socket, mySlug, remoteEntries, updateRemoteFilters]);

  // Build 3 display cards — derived, never stale
  const slotCards: SlotCardData[] = [0, 1, 2].map(i => {
    const slotNum = i + 1; // 1-based

    // My slot — always show it (active or not)
    if (i === mySlot) {
      return {
        slug: mySlug, isMe: true,
        active: myCamActive,
        stream: myCamActive ? localStream : null,
        filters: myFilters,
      };
    }

    // Remote cam registered at this slot position?
    for (const [slug, entry] of remoteEntries) {
      if (entry.slot === slotNum) {
        return { slug, isMe: false, active: true, stream: entry.stream, filters: entry.filters };
      }
    }

    // Empty
    return { slug: "", isMe: false, active: false, stream: null, filters: { ...DEFAULT_FILTERS } };
  });

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#dde8ff", letterSpacing: "-.03em" }}>🎮 Stream Control</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
            background: myCamActive ? "rgba(34,197,94,.15)" : "rgba(100,116,139,.1)",
            color: myCamActive ? "#4ade80" : "#64748b",
          }}>
            {myCamActive ? `● EN DIRECT (${mySlug} · Cam ${mySlot + 1})` : `○ ${mySlug} · HORS LIGNE`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select value={mySlot} onChange={e => setMySlot(Number(e.target.value))} style={S.select} title="Mon slot cam">
            {SLOT_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
          {!myCamActive
            ? <button onClick={activateCam} style={{ ...S.btn, background: "rgba(99,102,241,.8)", padding: "6px 14px" }}>● Activer ma cam</button>
            : <button onClick={deactivateCam} style={{ ...S.btn, background: "rgba(239,68,68,.7)", padding: "6px 14px" }}>■ Stop</button>
          }
          {camError && <span style={{ fontSize: 11, color: "#fc8181" }}>{camError}</span>}
          <Link to="/FSB_Board" style={{ ...S.btn, background: "transparent", border: "1px solid rgba(255,255,255,.08)", color: "#64748b", textDecoration: "none", padding: "6px 12px", fontSize: 12 }}>
            ← Board
          </Link>
        </div>
      </div>

      {/* ── Cams (en haut) ── */}
      <div style={S.camsRow}>
        {slotCards.map((data, i) => (
          <CamCard
            key={i}
            slotIndex={i}
            data={data}
            myCamActive={myCamActive}
            onActivate={activateCam}
            onDeactivate={deactivateCam}
            onFiltersChange={(patch) => handleFiltersChange(data.slug || mySlug, patch)}
          />
        ))}
      </div>

      {/* ── Bas : rediff + chat ── */}
      <div style={S.bottomRow}>
        {/* Stream + stats */}
        <div style={{ flex: "0 0 55%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...S.card, flex: "1 1 0", minHeight: 0, padding: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
            <div style={{ width: "100%", aspectRatio: "16/9", overflow: "hidden", position: "relative" }}>
              {streamInfo.isLive && streamInfo.platform === "rumble" && streamInfo.rumbleEmbedUrl ? (
                <RumbleEmbedPlayer embedUrl={streamInfo.rumbleEmbedUrl} title={streamInfo.title} isLive />
              ) : streamInfo.isLive && streamInfo.platform === "rumble" ? (
                <RumbleStreamPlayer hlsUrl={streamInfo.rumbleHlsUrl} thumbnailUrl={streamInfo.rumbleThumbnailUrl} isLive />
              ) : streamInfo.isLive && streamInfo.platform === "dlive" ? (
                <DlivePlayer channelSlug={streamInfo.channelSlug} channelUsername={streamInfo.channelUsername} isLive />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.25)" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Pas de stream</span>
                </div>
              )}
            </div>
          </div>
          {/* Stats bar */}
          <div style={{ ...S.card, padding: "10px 16px", display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
            {[
              { icon: "⏱", label: "Durée", value: timer },
              { icon: "👁", label: "Viewers", value: streamInfo.isLive ? String(streamInfo.viewers) : "—" },
              { icon: "❤", label: "Follows", value: followers != null ? followers.toLocaleString("fr-FR") : "—" },
              { icon: "💬", label: "Messages", value: String(msgCount) },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#dde8ff", fontFamily: "monospace" }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat — hauteur fixée par bottomRow, scroll interne */}
        <div style={{ ...S.card, flex: "1 1 0", minWidth: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
          <ChatPanel
            slug="fabiozsis"
            compact={false}
            autoFocus={false}
            visualMode="popup"
            botMenuVariant="dock"
            botMenuDockWidth={420}
            onRequireLogin={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#07101f",
    color: "#dde8ff",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "12px 16px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(255,255,255,.05)",
  },
  bottomRow: {
    display: "flex",
    gap: 12,
    alignItems: "stretch",
    height: 520,
    flexShrink: 0,
  },
  camsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
  },
  card: {
    background: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 10,
  },
  camCard: {
    background: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 10,
    overflow: "hidden",
  },
  camCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255,255,255,.04)",
  },
  camControls: {
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,.04)",
  },
  toggleBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,.07)",
    color: "#475569",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 10,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btn: {
    borderRadius: 8,
    border: "none",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: ".02em",
  },
  select: {
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.08)",
    color: "#dde8ff",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
