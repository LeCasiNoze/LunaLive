// web/src/pages/fsb/StreamControlPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../auth/AuthProvider";
import RumbleStreamPlayer from "../../components/RumbleStreamPlayer";
import { ChatPanel } from "../../components/ChatPanel";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

const FSB_ALLOWED_IDS = new Set([4, 15, 71]);
const FSB_SLUGS = ["fabiozsis", "lecasinoze", "samyyzsis"];
const SLOT_LABELS = ["Cam 1", "Cam 2", "Cam 3"];

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
  chromaKey: boolean; // fond vert actif → pas de bordure
};

const DEFAULT_FILTERS: CamFilters = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0,
  zoom: 100, panX: 0, panY: 0, chromaKey: false,
};

type SlotState = {
  slug: string;          // qui est dans ce slot
  filters: CamFilters;
  stream: MediaStream | null;
  socketId: string | null; // socket du broadcaster, null si vide
};

function emptySlot(slug: string): SlotState {
  return { slug, filters: { ...DEFAULT_FILTERS }, stream: null, socketId: null };
}

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

function useStreamInfo() {
  const [info, setInfo] = React.useState<{ isLive: boolean; hlsUrl: string | null; thumbUrl: string | null; viewers: number }>({
    isLive: false, hlsUrl: null, thumbUrl: null, viewers: 0,
  });
  React.useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(`${LUNA_API_BASE}/streamers/lecasinoze`);
        const j = await r.json().catch(() => null);
        if (j) setInfo({ isLive: !!j.isLive, hlsUrl: j.hlsUrl ?? null, thumbUrl: j.thumbUrl ?? j.thumbUrlDb ?? null, viewers: j.viewers ?? 0 });
      } catch {}
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
        const r = await fetch(`${LUNA_API_BASE}/me/overlay/followers?slug=fabiozsis`);
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
  filters: CamFilters,
  active: boolean,
) {
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());

  React.useEffect(() => {
    if (!socket || !active || !slug) return;
    socket.emit("cam:register", { slug, slot });
    return () => {
      socket.emit("cam:leave");
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [socket, active, slug, slot]);

  React.useEffect(() => {
    if (!socket || !active || !slug) return;
    socket.emit("cam:filter-update", { slug, filters });
  }, [socket, active, slug, filters]);

  React.useEffect(() => {
    if (!socket || !active || !stream) return;

    const handleRequest = async ({ viewerId }: { viewerId: string }) => {
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

// ─── WebRTC viewer for remote slots ─────────────────────────────────────────

function useViewer(
  socket: Socket | null,
  mySlug: string,
  onSlotUpdate: (update: { slug: string; slot: number; socketId: string; stream?: MediaStream; filters?: CamFilters | null }) => void,
  onSlotLeft: (slug: string) => void,
) {
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());

  const connect = React.useCallback((bc: { slug: string; slot: number; socketId: string; filters: CamFilters | null }) => {
    if (!socket || bc.slug === mySlug || peersRef.current.has(bc.slug)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(bc.slug, pc);

    onSlotUpdate({ slug: bc.slug, slot: bc.slot, socketId: bc.socketId, filters: bc.filters });

    pc.ontrack = ({ streams }) => {
      onSlotUpdate({ slug: bc.slug, slot: bc.slot, socketId: bc.socketId, stream: streams[0] });
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit("cam:ice", { to: bc.socketId, candidate }); };

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
    socket.emit("cam:request", { fromSlug: bc.slug });
  }, [socket, mySlug, onSlotUpdate]);

  React.useEffect(() => {
    if (!socket) return;
    socket.emit("cam:viewer-join", {}, (ack: { ok: boolean; active: any[] }) => {
      for (const bc of (ack?.active ?? [])) connect(bc);
    });
    const onRegistered = (bc: any) => connect(bc);
    const onLeft = ({ slug }: { slug: string }) => {
      peersRef.current.get(slug)?.close();
      peersRef.current.delete(slug);
      onSlotLeft(slug);
    };
    const onFilterUpdate = ({ slug, filters }: { slug: string; filters: CamFilters }) => {
      onSlotUpdate({ slug, slot: -1, socketId: "", filters });
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
    };
  }, [socket, connect, onSlotUpdate, onSlotLeft]);
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

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
      {stream ? (
        <video
          ref={ref}
          muted={muted}
          playsInline
          autoPlay
          style={{
            position: "absolute",
            width: `${filters.zoom}%`,
            height: `${filters.zoom}%`,
            top: `${50 + filters.panY}%`,
            left: `${50 + filters.panX}%`,
            transform: "translate(-50%, -50%)",
            objectFit: "cover",
            filter: filterCss(filters),
          }}
        />
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
  slotIndex, state, mySlug, myCamActive, localStream,
  onActivate, onDeactivate, onFiltersChange, onSlugChange,
}: {
  slotIndex: number;
  state: SlotState;
  mySlug: string;
  myCamActive: boolean;
  localStream: MediaStream | null;
  onActivate: () => void;
  onDeactivate: () => void;
  onFiltersChange: (f: Partial<CamFilters>) => void;
  onSlugChange: (slug: string) => void;
}) {
  const isMe = state.slug === mySlug && myCamActive;
  const [open, setOpen] = React.useState(false);

  const stream = isMe ? localStream : state.stream;
  const active = isMe ? myCamActive : !!state.socketId;

  const chromaKey = state.filters.chromaKey;

  return (
    <div style={{ ...S.camCard, ...(chromaKey ? { border: "2px dashed rgba(34,197,94,.35)", background: "transparent" } : {}) }}>
      {/* Header */}
      <div style={S.camCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8" }}>{SLOT_LABELS[slotIndex]}</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 999, fontWeight: 700,
            background: active ? "rgba(34,197,94,.12)" : "rgba(100,116,139,.08)",
            color: active ? "#4ade80" : "#475569",
          }}>
            {active ? `● ${state.slug}` : "○ vide"}
          </span>
          {isMe && <span style={{ fontSize: 9, color: "#6366f1", fontWeight: 700 }}>MOI</span>}
        </div>
        <button onClick={() => setOpen((v) => !v)} style={S.toggleBtn}>
          {open ? "▲ fermer" : "▼ régler"}
        </button>
      </div>

      {/* Video preview */}
      <div style={{ aspectRatio: "16/9" }}>
        <CamVideo stream={stream} filters={state.filters} muted={isMe} />
      </div>

      {/* Controls */}
      {open && (
        <div style={S.camControls}>
          {/* Assignation du slot */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: ".08em", marginBottom: 5, textTransform: "uppercase" }}>
              Streamer assigné
            </div>
            <select
              value={state.slug}
              onChange={(e) => onSlugChange(e.target.value)}
              style={{ ...S.select, width: "100%" }}
            >
              {FSB_SLUGS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* My cam: activate/deactivate */}
          {state.slug === mySlug && (
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
          <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase" }}>
            Couleur
          </div>
          <Slider label="Luminosité" value={state.filters.brightness} min={50} max={150} onChange={(v) => onFiltersChange({ brightness: v })} />
          <Slider label="Contraste" value={state.filters.contrast} min={50} max={200} onChange={(v) => onFiltersChange({ contrast: v })} />
          <Slider label="Saturation" value={state.filters.saturation} min={0} max={200} onChange={(v) => onFiltersChange({ saturation: v })} />
          <Slider label="Teinte" value={state.filters.hue} min={-180} max={180} onChange={(v) => onFiltersChange({ hue: v })} />

          <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "8px 0" }} />
          <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase" }}>
            Zoom / Recadrage
          </div>
          <Slider label="Zoom %" value={state.filters.zoom} min={100} max={300} onChange={(v) => onFiltersChange({ zoom: v })} />
          <Slider label="Pan X" value={state.filters.panX} min={-50} max={50} onChange={(v) => onFiltersChange({ panX: v })} />
          <Slider label="Pan Y" value={state.filters.panY} min={-50} max={50} onChange={(v) => onFiltersChange({ panY: v })} />

          <div style={{ height: 1, background: "rgba(255,255,255,.05)", margin: "8px 0" }} />

          {/* Chroma key */}
          <button
            onClick={() => onFiltersChange({ chromaKey: !state.filters.chromaKey })}
            style={{
              ...S.btn,
              width: "100%",
              padding: "6px 0",
              marginBottom: 6,
              background: state.filters.chromaKey
                ? "rgba(34,197,94,.2)"
                : "rgba(255,255,255,.04)",
              border: `1px solid ${state.filters.chromaKey ? "rgba(34,197,94,.4)" : "rgba(255,255,255,.07)"}`,
              color: state.filters.chromaKey ? "#4ade80" : "#64748b",
              fontSize: 10,
            }}
          >
            {state.filters.chromaKey ? "🟢 Fond vert ON" : "⬜ Fond vert"}
          </button>

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

  // Default my slug from username
  const defaultSlug = FSB_SLUGS.find(s => s.toLowerCase().includes(user.username.toLowerCase())) ?? FSB_SLUGS[0];

  // Slots: index 0=Cam1, 1=Cam2, 2=Cam3
  const [slots, setSlots] = React.useState<SlotState[]>([
    emptySlot("fabiozsis"),
    emptySlot("samyyzsis"),
    emptySlot("lecasinoze"),
  ]);

  // Filtres par slug — chaque streamer a ses propres paramètres,
  // indépendamment du slot auquel il est assigné
  const [filtersPerSlug, setFiltersPerSlug] = React.useState<Record<string, CamFilters>>(
    () => Object.fromEntries(FSB_SLUGS.map(s => [s, { ...DEFAULT_FILTERS }]))
  );

  // Vue dérivée : slot avec les filtres de son slug courant
  const slotsWithFilters: SlotState[] = slots.map(slot => ({
    ...slot,
    filters: filtersPerSlug[slot.slug] ?? { ...DEFAULT_FILTERS },
  }));

  // My cam settings
  const [mySlug, setMySlug] = React.useState(defaultSlug);
  const [mySlot, setMySlot] = React.useState(0);
  const [myCamActive, setMyCamActive] = React.useState(false);
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [camError, setCamError] = React.useState<string | null>(null);
  const [msgCount, setMsgCount] = React.useState(0);

  // Keep slot identity in sync with assignment
  React.useEffect(() => {
    setSlots((prev) => prev.map((s, i) => i === mySlot ? { ...s, slug: mySlug } : s));
  }, [mySlug, mySlot]);

  // Count chat messages via socket
  React.useEffect(() => {
    if (!socket) return;
    const onMsg = () => setMsgCount((n) => n + 1);
    socket.on("chat:message", onMsg);
    return () => { socket.off("chat:message", onMsg); };
  }, [socket]);

  const onSlotUpdate = React.useCallback((update: { slug: string; slot: number; socketId: string; stream?: MediaStream; filters?: CamFilters | null }) => {
    // Mettre à jour slot (stream + socketId)
    setSlots((prev) => {
      const next = [...prev];
      let idx = update.slot > 0 ? update.slot - 1 : next.findIndex(s => s.slug === update.slug);
      if (idx < 0 || idx > 2) idx = next.findIndex(s => s.slug === update.slug);
      if (idx < 0) return prev;
      next[idx] = {
        ...next[idx],
        slug: update.slug || next[idx].slug,
        socketId: update.socketId !== undefined ? update.socketId : next[idx].socketId,
        ...(update.stream !== undefined ? { stream: update.stream } : {}),
      };
      return next;
    });
    // Mettre à jour les filtres par slug (profil du streamer)
    if (update.filters != null && update.slug) {
      setFiltersPerSlug((prev) => ({
        ...prev,
        [update.slug]: { ...DEFAULT_FILTERS, ...update.filters! },
      }));
    }
  }, []);

  const onSlotLeft = React.useCallback((slug: string) => {
    setSlots((prev) => prev.map(s => s.slug === slug ? { ...s, stream: null, socketId: null } : s));
  }, []);

  useViewer(socket, myCamActive ? mySlug : "", onSlotUpdate, onSlotLeft);
  useBroadcaster(socket, localStream, mySlug, mySlot + 1, filtersPerSlug[mySlug] ?? DEFAULT_FILTERS, myCamActive);

  const activateCam = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      setLocalStream(stream);
      setMyCamActive(true);
    } catch (e: any) {
      setCamError(e?.message ?? "Accès caméra refusé");
    }
  };

  const deactivateCam = () => {
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setMyCamActive(false);
  };

  React.useEffect(() => () => { localStream?.getTracks().forEach(t => t.stop()); }, [localStream]);

  const handleFiltersChange = (slotIdx: number, patch: Partial<CamFilters>) => {
    const slug = slots[slotIdx].slug;
    setFiltersPerSlug((prev) => {
      const current = prev[slug] ?? { ...DEFAULT_FILTERS };
      const newFilters = { ...current, ...patch } as CamFilters;
      if (socket) socket.emit("cam:filter-update", { slug, filters: newFilters });
      return { ...prev, [slug]: newFilters };
    });
  };

  const handleSlugChange = (slotIdx: number, slug: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = { ...next[slotIdx], slug };
      return next;
    });
    // Broadcaster les filtres du nouveau slug immédiatement
    if (socket) {
      const filters = filtersPerSlug[slug] ?? { ...DEFAULT_FILTERS };
      socket.emit("cam:filter-update", { slug, filters });
    }
    if (slotIdx === mySlot) setMySlug(slug);
  };

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
            {myCamActive ? "● EN DIRECT" : "○ HORS LIGNE"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* My cam quick assignment */}
          <select value={mySlug} onChange={e => setMySlug(e.target.value)} style={S.select} title="Mon identité">
            {FSB_SLUGS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={mySlot} onChange={e => setMySlot(Number(e.target.value))} style={S.select} title="Mon slot">
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
        {slotsWithFilters.map((slot, i) => (
          <CamCard
            key={i}
            slotIndex={i}
            state={slot}
            mySlug={mySlug}
            myCamActive={myCamActive}
            localStream={localStream}
            onActivate={activateCam}
            onDeactivate={deactivateCam}
            onFiltersChange={(patch) => handleFiltersChange(i, patch)}
            onSlugChange={(slug) => handleSlugChange(i, slug)}
          />
        ))}
      </div>

      {/* ── Bas : rediff + chat ── */}
      <div style={S.bottomRow}>
        {/* Stream + stats */}
        <div style={{ flex: "0 0 55%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...S.card, flex: "1 1 0", minHeight: 0, padding: 0, overflow: "hidden" }}>
            <RumbleStreamPlayer hlsUrl={streamInfo.hlsUrl} thumbnailUrl={streamInfo.thumbUrl} isLive={streamInfo.isLive} />
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
    height: 460,
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
