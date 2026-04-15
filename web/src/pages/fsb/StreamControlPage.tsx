// web/src/pages/fsb/StreamControlPage.tsx
// Page de contrôle stream FSB — cam WebRTC + chat + stats
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../auth/AuthProvider";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

const FSB_CHAT_URL =
  `${window.location.origin}/overlay/obs/chat.html?slug=fabiozsis&api=${encodeURIComponent(LUNA_API_BASE)}&font=14&max=30&scale=1&align=left&msgbg=0.88`;

const FSB_ALLOWED_IDS = new Set([4, 15, 71]);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Slugs connus pour les menus
const FSB_SLUGS = ["fabiozsis", "lecasinoze", "samyyzsis"];
const SLOT_LABELS = ["Cam 1", "Cam 2", "Cam 3"];

// ─── Types ────────────────────────────────────────────────────────────────────

type CamFilters = {
  brightness: number;   // 50–150
  contrast: number;     // 50–150
  saturation: number;   // 0–200
  hue: number;          // -180–180
};

const DEFAULT_FILTERS: CamFilters = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };

type ActiveCam = {
  slug: string;
  slot: number;
  socketId: string;
  stream: MediaStream | null;
  filters: CamFilters | null;
};

// ─── CSS filter string ────────────────────────────────────────────────────────

function filterCss(f: CamFilters | null): string {
  if (!f) return "none";
  return `brightness(${f.brightness / 100}) contrast(${f.contrast / 100}) saturate(${f.saturation / 100}) hue-rotate(${f.hue}deg)`;
}

// ─── Stream timer ─────────────────────────────────────────────────────────────

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

// ─── Socket singleton ─────────────────────────────────────────────────────────

function useSocket(): Socket | null {
  const [socket, setSocket] = React.useState<Socket | null>(null);
  React.useEffect(() => {
    const s = io(LUNA_API_BASE, { transports: ["websocket", "polling"] });
    setSocket(s);
    return () => { s.disconnect(); };
  }, []);
  return socket;
}

// ─── WebRTC broadcaster hook ──────────────────────────────────────────────────

function useWebRTCBroadcaster(
  socket: Socket | null,
  stream: MediaStream | null,
  slug: string,
  slot: number,
  filters: CamFilters,
  active: boolean,
) {
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());

  // Register/unregister with server
  React.useEffect(() => {
    if (!socket || !active || !slug) return;
    socket.emit("cam:register", { slug, slot });
    return () => {
      socket.emit("cam:leave");
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [socket, active, slug, slot]);

  // Push filter updates
  React.useEffect(() => {
    if (!socket || !active || !slug) return;
    socket.emit("cam:filter-update", { slug, filters });
  }, [socket, active, slug, filters]);

  // Handle incoming viewer requests
  React.useEffect(() => {
    if (!socket || !active || !stream) return;

    const handleRequest = async ({ viewerId }: { viewerId: string }) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(viewerId, pc);

      // Add local tracks
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("cam:ice", { to: viewerId, candidate });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          peersRef.current.delete(viewerId);
        }
      };

      const offer = await pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      socket.emit("cam:offer", { to: viewerId, sdp: offer });
    };

    const handleAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    };

    const handleIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
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

// ─── WebRTC viewer hook ───────────────────────────────────────────────────────

function useWebRTCViewer(socket: Socket | null, mySlug: string): Map<string, ActiveCam> {
  const [cams, setCams] = React.useState<Map<string, ActiveCam>>(new Map());
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());

  const connectToBroadcaster = React.useCallback(
    (bc: { slug: string; slot: number; socketId: string; filters: CamFilters | null }) => {
      if (!socket || bc.slug === mySlug) return; // don't connect to yourself
      if (peersRef.current.has(bc.slug)) return;  // already connected

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(bc.slug, pc);

      pc.ontrack = ({ streams }) => {
        const stream = streams[0] ?? null;
        setCams((prev) => {
          const next = new Map(prev);
          const existing = next.get(bc.slug);
          next.set(bc.slug, { ...bc, stream, filters: existing?.filters ?? bc.filters });
          return next;
        });
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("cam:ice", { to: bc.socketId, candidate });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          peersRef.current.delete(bc.slug);
        }
      };

      // Receive offer from broadcaster
      const handleOffer = async ({ from, slug, sdp }: { from: string; slug: string; sdp: RTCSessionDescriptionInit }) => {
        if (slug !== bc.slug) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("cam:answer", { to: from, sdp: answer });
      };

      const handleIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
        if (from !== bc.socketId && !peersRef.current.has(bc.slug)) return;
        const myPc = peersRef.current.get(bc.slug);
        if (!myPc) return;
        try { await myPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      };

      socket.on("cam:offer", handleOffer);
      socket.on("cam:ice", handleIce);

      // Add entry without stream yet
      setCams((prev) => {
        const next = new Map(prev);
        next.set(bc.slug, { slug: bc.slug, slot: bc.slot, socketId: bc.socketId, stream: null, filters: bc.filters });
        return next;
      });

      // Request the stream
      socket.emit("cam:request", { fromSlug: bc.slug });
    },
    [socket, mySlug],
  );

  React.useEffect(() => {
    if (!socket) return;

    // Join viewer room + get active broadcasters
    socket.emit("cam:viewer-join", {}, (ack: { ok: boolean; active: any[] }) => {
      if (!ack?.ok) return;
      for (const bc of (ack.active ?? [])) connectToBroadcaster(bc);
    });

    const handleRegistered = (bc: { slug: string; slot: number; socketId: string; filters: CamFilters | null }) => {
      connectToBroadcaster(bc);
    };

    const handleLeft = ({ slug }: { slug: string }) => {
      peersRef.current.get(slug)?.close();
      peersRef.current.delete(slug);
      setCams((prev) => {
        const next = new Map(prev);
        next.delete(slug);
        return next;
      });
    };

    const handleFilterUpdate = ({ slug, filters }: { slug: string; filters: CamFilters }) => {
      setCams((prev) => {
        const next = new Map(prev);
        const existing = next.get(slug);
        if (existing) next.set(slug, { ...existing, filters });
        return next;
      });
    };

    socket.on("cam:registered", handleRegistered);
    socket.on("cam:left", handleLeft);
    socket.on("cam:filter-update", handleFilterUpdate);

    return () => {
      socket.off("cam:registered", handleRegistered);
      socket.off("cam:left", handleLeft);
      socket.off("cam:filter-update", handleFilterUpdate);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setCams(new Map());
    };
  }, [socket, connectToBroadcaster]);

  return cams;
}

// ─── Stats hook ───────────────────────────────────────────────────────────────

type Stats = { viewers: number | null; followers: number | null; messages: number };

function useStats(socket: Socket | null) {
  const [stats, setStats] = React.useState<Stats>({ viewers: null, followers: null, messages: 0 });

  // Count chat messages
  React.useEffect(() => {
    if (!socket) return;
    const onMsg = () => setStats((s) => ({ ...s, messages: s.messages + 1 }));
    socket.on("chat:message", onMsg);
    return () => { socket.off("chat:message", onMsg); };
  }, [socket]);

  // Poll followers
  React.useEffect(() => {
    const fetchFollowers = async () => {
      try {
        const r = await fetch(`${LUNA_API_BASE}/me/overlay/followers?slug=fabiozsis`);
        const j = await r.json().catch(() => null);
        if (j?.ok) setStats((s) => ({ ...s, followers: j.count ?? null }));
      } catch {}
    };
    fetchFollowers();
    const id = setInterval(fetchFollowers, 60_000);
    return () => clearInterval(id);
  }, []);

  return stats;
}

// ─── Video element component ──────────────────────────────────────────────────

function StreamVideo({
  stream,
  filters,
  style,
  muted = true,
}: {
  stream: MediaStream | null;
  filters?: CamFilters | null;
  style?: React.CSSProperties;
  muted?: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    } else {
      v.srcObject = null;
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      muted={muted}
      playsInline
      autoPlay
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        background: "#000",
        filter: filterCss(filters ?? null),
        ...style,
      }}
    />
  );
}

// ─── Slider component ─────────────────────────────────────────────────────────

function FilterSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#6366f1", cursor: "pointer" }}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StreamControlPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // FSB auth guard
  if (!user || !FSB_ALLOWED_IDS.has(user.id)) {
    return (
      <div style={S.forbidden}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ color: "#fc8181", fontWeight: 700 }}>Accès réservé FSB</div>
      </div>
    );
  }

  return <StreamControlInner />;
}

function StreamControlInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const timer = useStreamTimer();
  const stats = useStats(socket);

  // My cam state
  const [camActive, setCamActive] = React.useState(false);
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [selectedSlug, setSelectedSlug] = React.useState<string>(() => {
    // Default to current user's slug
    const u = user as any;
    return FSB_SLUGS.find(s => s.toLowerCase().includes((u?.username ?? "").toLowerCase())) ?? FSB_SLUGS[0];
  });
  const [selectedSlot, setSelectedSlot] = React.useState(0); // 0=Cam1, 1=Cam2, 2=Cam3
  const [filters, setFilters] = React.useState<CamFilters>(DEFAULT_FILTERS);
  const [camError, setCamError] = React.useState<string | null>(null);

  // Other cams received via WebRTC
  const remoteCams = useWebRTCViewer(socket, camActive ? selectedSlug : "");

  // Broadcast my cam
  useWebRTCBroadcaster(socket, localStream, selectedSlug, selectedSlot + 1, filters, camActive);

  // Activate cam
  const activateCam = React.useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
      setLocalStream(stream);
      setCamActive(true);
    } catch (e: any) {
      setCamError(e?.message ?? "Accès caméra refusé");
    }
  }, []);

  const deactivateCam = React.useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setCamActive(false);
  }, [localStream]);

  // Cleanup on unmount
  React.useEffect(() => () => {
    localStream?.getTracks().forEach((t) => t.stop());
  }, [localStream]);

  const updateFilter = (key: keyof CamFilters, val: number) =>
    setFilters((f) => ({ ...f, [key]: val }));

  // Cam slots: build array of 3, assign remote cams by slot number
  const slotCams: (ActiveCam | null)[] = [null, null, null];
  remoteCams.forEach((cam) => {
    const idx = cam.slot - 1;
    if (idx >= 0 && idx < 3) slotCams[idx] = cam;
  });
  // My local cam in its selected slot (for the overview)
  if (camActive && localStream) {
    slotCams[selectedSlot] = {
      slug: selectedSlug,
      slot: selectedSlot + 1,
      socketId: "local",
      stream: localStream,
      filters,
    };
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#dde8ff", letterSpacing: "-.04em" }}>
            🎮 Stream Control
          </span>
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
            background: camActive ? "rgba(34,197,94,.15)" : "rgba(100,116,139,.1)",
            color: camActive ? "#4ade80" : "#64748b",
          }}>
            {camActive ? "● EN DIRECT" : "○ HORS LIGNE"}
          </span>
        </div>
        <button onClick={() => navigate("/FSB_Board")} style={S.backBtn}>
          ← FSB Board
        </button>
      </div>

      {/* Layout: 3 colonnes */}
      <div style={S.layout}>

        {/* ── COLONNE GAUCHE : Ma cam + filtres ── */}
        <div style={S.leftCol}>
          <div style={S.card}>
            <div style={S.cardTitle}>📹 MA CAMÉRA</div>

            {/* Preview local */}
            <div style={S.camPreviewBox}>
              {camActive && localStream ? (
                <StreamVideo stream={localStream} filters={filters} muted />
              ) : (
                <div style={S.camPlaceholder}>
                  <span style={{ fontSize: 36, opacity: 0.3 }}>📷</span>
                  <span style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>Cam inactive</span>
                </div>
              )}
            </div>

            {camError && (
              <div style={{ fontSize: 11, color: "#fc8181", marginBottom: 8 }}>{camError}</div>
            )}

            {/* Qui / quel slot */}
            <div style={S.row}>
              <label style={S.label}>Identité</label>
              <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)} style={S.select}>
                {FSB_SLUGS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={S.row}>
              <label style={S.label}>Slot</label>
              <select value={selectedSlot} onChange={(e) => setSelectedSlot(Number(e.target.value))} style={S.select}>
                {SLOT_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
              </select>
            </div>

            {/* Bouton activer */}
            {!camActive ? (
              <button onClick={activateCam} style={{ ...S.btn, background: "rgba(99,102,241,.85)" }}>
                ● Activer ma caméra
              </button>
            ) : (
              <button onClick={deactivateCam} style={{ ...S.btn, background: "rgba(239,68,68,.7)" }}>
                ■ Désactiver
              </button>
            )}

            {/* Filtres */}
            {camActive && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "14px 0 12px" }} />
                <div style={S.cardTitle}>🎨 FILTRES CAMÉRA</div>
                <FilterSlider label="Luminosité" value={filters.brightness} min={50} max={150} onChange={(v) => updateFilter("brightness", v)} />
                <FilterSlider label="Contraste" value={filters.contrast} min={50} max={200} onChange={(v) => updateFilter("contrast", v)} />
                <FilterSlider label="Saturation" value={filters.saturation} min={0} max={200} onChange={(v) => updateFilter("saturation", v)} />
                <FilterSlider label="Teinte (hue)" value={filters.hue} min={-180} max={180} onChange={(v) => updateFilter("hue", v)} />
                <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ ...S.btn, background: "transparent", border: "1px solid rgba(255,255,255,.1)", fontSize: 11, padding: "4px 0", color: "#64748b" }}>
                  Réinitialiser filtres
                </button>
              </>
            )}
          </div>

          {/* Stats */}
          <div style={S.card}>
            <div style={S.cardTitle}>📊 STATS STREAM</div>
            <div style={S.statRow}><span>⏱ Durée</span><span style={S.statVal}>{timer}</span></div>
            <div style={S.statRow}><span>👁 Viewers</span><span style={S.statVal}>{stats.viewers ?? "—"}</span></div>
            <div style={S.statRow}><span>❤ Follows</span><span style={S.statVal}>{stats.followers != null ? stats.followers.toLocaleString("fr-FR") : "—"}</span></div>
            <div style={S.statRow}><span>💬 Messages</span><span style={S.statVal}>{stats.messages}</span></div>
          </div>
        </div>

        {/* ── COLONNE CENTRE : Chat ── */}
        <div style={S.centerCol}>
          <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
            <div style={{ ...S.cardTitle, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              💬 CHAT FABIOZSIS
            </div>
            <iframe
              src={FSB_CHAT_URL}
              style={{ flex: 1, border: "none", background: "transparent", minHeight: 400 }}
              title="Chat FSB"
              allow="autoplay"
              allowTransparency={true}
            />
          </div>
        </div>

        {/* ── COLONNE DROITE : Cams connectées ── */}
        <div style={S.rightCol}>
          <div style={S.card}>
            <div style={S.cardTitle}>📷 CAMS CONNECTÉES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slotCams.map((cam, i) => (
                <div key={i} style={S.camSlotBox}>
                  <div style={S.camSlotHeader}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{SLOT_LABELS[i]}</span>
                    {cam ? (
                      <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 700 }}>● {cam.slug}{cam.socketId === "local" ? " (moi)" : ""}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#475569" }}>○ vide</span>
                    )}
                  </div>
                  <div style={{ aspectRatio: "16/9", background: "#0a0a14", borderRadius: 6, overflow: "hidden" }}>
                    {cam?.stream ? (
                      <StreamVideo
                        stream={cam.stream}
                        filters={cam.filters}
                        muted={cam.socketId === "local"}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 20, opacity: 0.15 }}>📷</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "14px 0 12px" }} />
            <div style={S.cardTitle}>🔗 LIENS RAPIDES</div>
            <a href="/s/fabiozsis" target="_blank" rel="noreferrer" style={S.linkBtn}>
              📺 Page stream Fabiozsis
            </a>
            <a href={`/overlay?cfg=`} target="_blank" rel="noreferrer" style={{ ...S.linkBtn, opacity: 0.5, pointerEvents: "none" }}>
              🖥 Overlay OBS (copier depuis le designer)
            </a>
          </div>
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
    padding: "16px 20px",
    boxSizing: "border-box",
  },
  forbidden: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#07101f",
    color: "#94a3b8",
    fontFamily: "system-ui",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  backBtn: {
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.08)",
    color: "#94a3b8",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "260px 1fr 280px",
    gap: 16,
    alignItems: "start",
  },
  leftCol: { display: "flex", flexDirection: "column", gap: 12 },
  centerCol: { display: "flex", flexDirection: "column", height: "calc(100vh - 110px)" },
  rightCol: { display: "flex", flexDirection: "column", gap: 12 },
  card: {
    background: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".1em",
    color: "#475569",
    textTransform: "uppercase" as const,
    marginBottom: 12,
  },
  camPreviewBox: {
    aspectRatio: "16/9",
    background: "#0a0a14",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  camPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  label: { fontSize: 12, color: "#64748b" },
  select: {
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.08)",
    color: "#dde8ff",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btn: {
    width: "100%",
    padding: "8px 0",
    borderRadius: 8,
    border: "none",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    marginTop: 4,
    fontFamily: "inherit",
    letterSpacing: ".02em",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
    borderBottom: "1px solid rgba(255,255,255,.04)",
    fontSize: 12,
    color: "#64748b",
  },
  statVal: { color: "#dde8ff", fontWeight: 700, fontFamily: "monospace" },
  camSlotBox: { background: "rgba(255,255,255,.02)", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.05)" },
  camSlotHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" },
  linkBtn: {
    display: "block",
    padding: "7px 10px",
    background: "rgba(255,255,255,.03)",
    border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 8,
    color: "#6366f1",
    fontSize: 12,
    textDecoration: "none",
    marginBottom: 6,
  },
};
