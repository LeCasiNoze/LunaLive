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

// STUN + TURN : credentials short-lived fetchés au runtime depuis le backend
// (GET /me/webrtc/ice-servers → Cloudflare Realtime TURN, 1 TB/mois free).
// Sans TURN, les NAT stricts (CGNAT, VPN corporate, symétriques) empêchent
// le P2P → stream arrive dans ontrack mais aucune frame ne transite.
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let iceServersCache: RTCIceServer[] = FALLBACK_ICE;
let iceServersSource: "fallback" | "cloudflare" = "fallback";
let iceServersFetchPromise: Promise<RTCIceServer[]> | null = null;
let iceServersFetchedAt = 0;
const ICE_CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20h — le backend mint à 24h TTL

async function ensureIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (iceServersSource === "cloudflare" && now - iceServersFetchedAt < ICE_CACHE_TTL_MS) {
    return iceServersCache;
  }
  if (iceServersFetchPromise) return iceServersFetchPromise;

  iceServersFetchPromise = (async () => {
    try {
      const token = localStorage.getItem("lunalive_token_v1") || "";
      const r = await fetch(`${LUNA_API_BASE}/me/webrtc/ice-servers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = await r.json().catch(() => null);
      if (j?.ok && Array.isArray(j.iceServers) && j.iceServers.length > 0) {
        iceServersCache = j.iceServers;
        iceServersSource = j.source === "cloudflare" ? "cloudflare" : "fallback";
        iceServersFetchedAt = Date.now();
        console.log(`[WebRTC] ICE servers loaded (source=${j.source}, count=${j.iceServers.length})`);
      } else {
        console.warn("[WebRTC] /me/webrtc/ice-servers returned no servers, using STUN fallback", j);
      }
    } catch (e) {
      console.warn("[WebRTC] ICE fetch failed, using STUN fallback:", e);
    } finally {
      iceServersFetchPromise = null;
    }
    return iceServersCache;
  })();

  return iceServersFetchPromise;
}

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

// Type of ICE candidate actually used by a negotiated PC (diagnostic badge)
type CandidateType = "host" | "srflx" | "prflx" | "relay" | null;

// Remote broadcaster entry
type RemoteEntry = {
  slug: string;
  slot: number;  // 1-based slot from server
  stream: MediaStream | null;
  filters: CamFilters;
  socketId: string;
  candidateType: CandidateType; // type du candidat local sur la paire ICE sélectionnée
};

// Slot card data for rendering — derived, not stored
type SlotCardData = {
  slug: string;     // "" if empty
  isMe: boolean;
  active: boolean;
  stream: MediaStream | null;
  filters: CamFilters;
  candidateType?: CandidateType;
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

// ─── WebRTC codec preference ──────────────────────────────────────────────────
// Force H264 en premier sur tous les transceivers vidéo. H264 a quasi toujours
// un encodeur hardware (Intel QSV, NVENC, AMF, Apple VT) tandis que VP8/VP9 par
// défaut tournent en software → CPU bound → drops + low fps + Chromium reporte
// faussement "bandwidth limitation". Ce changement seul élimine la majorité
// des problèmes "perte de qualité" sur des PC modestes.
function preferH264OnPc(pc: RTCPeerConnection): void {
  try {
    const caps = (RTCRtpSender as any).getCapabilities?.("video");
    if (!caps?.codecs) return;
    const codecs: Array<{ mimeType: string }> = caps.codecs;
    const h264 = codecs.filter((c) => /h264/i.test(c.mimeType));
    const others = codecs.filter((c) => !/h264/i.test(c.mimeType) && !/red|rtx|ulpfec/i.test(c.mimeType));
    const fec = codecs.filter((c) => /red|rtx|ulpfec/i.test(c.mimeType));
    if (h264.length === 0) return;
    const ordered = [...h264, ...others, ...fec];
    pc.getTransceivers().forEach((t) => {
      const kind = t.sender?.track?.kind || (t as any).receiver?.track?.kind;
      if (kind === "video" && typeof (t as any).setCodecPreferences === "function") {
        try { (t as any).setCodecPreferences(ordered); } catch {}
      }
    });
  } catch {}
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
  // Queue des ICE candidates arrivés AVANT setRemoteDescription, pour flush après
  // (fix race condition: "addIceCandidate failed: remote description was null")
  const pendingIceRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
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
      const iceServers = await ensureIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      peersRef.current.set(viewerId, pc);
      // Hint motion-heavy content + cap bitrate pour éviter pics qui laggent
      // les viewers en connexion limitée. Cam 720p → 1.2 Mbps suffit largement.
      stream.getTracks().forEach((t) => {
        if (t.kind === "video") { try { (t as any).contentHint = "motion"; } catch {} }
        const sender = pc.addTrack(t, stream);
        if (t.kind === "video") {
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            params.encodings[0].maxBitrate = 1_200_000; // 1.2 Mbps
            params.encodings[0].maxFramerate = 30;
            params.degradationPreference = "maintain-framerate";
            sender.setParameters(params).catch(() => {});
          } catch {}
        }
      });
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log("[Broadcaster] ICE →", viewerId, candidate.type, candidate.protocol, candidate.address);
          socket.emit("cam:ice", { to: viewerId, candidate });
        } else {
          console.log("[Broadcaster] ICE gathering complete for", viewerId);
        }
      };
      pc.oniceconnectionstatechange = () => {
        console.log("[Broadcaster] iceConnectionState →", pc.iceConnectionState, "for", viewerId);
      };
      pc.onconnectionstatechange = () => {
        console.log("[Broadcaster] connectionState →", pc.connectionState, "for", viewerId);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close(); peersRef.current.delete(viewerId);
          pendingIceRef.current.delete(viewerId);
        }
      };
      preferH264OnPc(pc);
      const offer = await pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      socket.emit("cam:offer", { to: viewerId, sdp: offer });
    };
    const handleAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush les candidats ICE queuées pendant qu'on attendait la answer
      const pending = pendingIceRef.current.get(from);
      if (pending && pending.length > 0) {
        console.log(`[Broadcaster] flushing ${pending.length} queued ICE for`, from);
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
          catch (e) { console.warn("[Broadcaster] queued addIceCandidate failed:", e); }
        }
        pendingIceRef.current.delete(from);
      }
    };
    const handleIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      const c = candidate as any;
      console.log("[Broadcaster] ICE ←", from, c?.candidate?.match(/typ (\w+)/)?.[1] ?? "?");
      // Si remoteDescription pas encore set => queue au lieu de jeter
      if (!pc.remoteDescription) {
        const q = pendingIceRef.current.get(from) ?? [];
        q.push(candidate);
        pendingIceRef.current.set(from, q);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn("[Broadcaster] addIceCandidate failed:", e); }
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

  // Expose peers pour le panneau de stats
  return React.useMemo(() => ({ getPeers: () => peersRef.current }), []);
}

// ─── Screen share broadcaster ─────────────────────────────────────────────────
// Un seul partage d'écran actif en global (contrainte serveur). Start =
// getDisplayMedia + screen:register. Si quelqu'un d'autre démarre, on reçoit
// screen:kicked et on coupe localement. Stop manuel = screen:leave.
function useScreenBroadcaster(socket: Socket | null, mySlug: string) {
  const [sharing, setSharing] = React.useState(false);
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const peersRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const start = React.useCallback(async () => {
    if (!socket || sharing) return;
    let stream: MediaStream;
    try {
      // 30 fps pour un slot animé (spins, FX). Pas de contrainte width/height —
      // laisse Chrome utiliser la résolution écran native, l'encodeur H264
      // hardware (forcé via setCodecPreferences) + maintain-framerate gèrent
      // l'auto-downscale si la BP n'est pas suffisante.
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
    } catch (e) {
      console.warn("[ScreenShare] getDisplayMedia rejected:", e);
      return;
    }
    // L'utilisateur peut arrêter via la barre "Stop sharing" native du navigateur
    stream.getVideoTracks()[0]?.addEventListener("ended", () => { stop(); });

    setLocalStream(stream);
    setSharing(true);
    socket.emit("screen:register", { slug: mySlug }, (ack: any) => {
      if (!ack?.ok) console.warn("[ScreenShare] register failed", ack);
    });
  }, [socket, sharing, mySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = React.useCallback(() => {
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setSharing(false);
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    socket?.emit("screen:leave");
  }, [socket, localStream]);

  // Si on est kické par un autre user, on coupe proprement côté local.
  React.useEffect(() => {
    if (!socket) return;
    const onKicked = () => {
      console.log("[ScreenShare] kicked by another user");
      localStream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
      setSharing(false);
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
    };
    socket.on("screen:kicked", onKicked);
    return () => { socket.off("screen:kicked", onKicked); };
  }, [socket, localStream]);

  // Gestion des viewers qui demandent le flux (identique à useBroadcaster).
  React.useEffect(() => {
    if (!socket || !sharing || !localStream) return;

    const handleRequest = async ({ viewerId }: { viewerId: string }) => {
      const iceServers = await ensureIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      peersRef.current.set(viewerId, pc);
      // Screen = contentHint "motion" (slot animé, spins, FX > texte statique).
      // maintain-framerate = on garde 30 fps coûte que coûte ; si la BP manque,
      // l'encodeur downscale en résolution (du 1080p → 720p reste très lisible
      // pour le rendu de l'overlay OBS qui consomme à ~1363×1026 px).
      // Cap 4 Mbps : on a 5+ Mbps dispo (testé), 30 fps en 1080p H264 a besoin
      // de ~3 Mbps pour rester net sur des animations.
      localStream.getTracks().forEach(t => {
        if (t.kind === "video") { try { (t as any).contentHint = "motion"; } catch {} }
        const sender = pc.addTrack(t, localStream);
        if (t.kind === "video") {
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            params.encodings[0].maxBitrate = 4_000_000; // 4 Mbps
            params.encodings[0].maxFramerate = 30;
            params.degradationPreference = "maintain-framerate";
            sender.setParameters(params).catch(() => {});
          } catch {}
        }
      });
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("screen:ice", { to: viewerId, candidate });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          peersRef.current.delete(viewerId);
          pendingIceRef.current.delete(viewerId);
        }
      };
      preferH264OnPc(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("screen:offer", { to: viewerId, sdp: offer });
    };
    const handleAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const pending = pendingIceRef.current.get(from);
      if (pending?.length) {
        for (const c of pending) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
        pendingIceRef.current.delete(from);
      }
    };
    const handleIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      if (!pc.remoteDescription) {
        const q = pendingIceRef.current.get(from) ?? [];
        q.push(candidate); pendingIceRef.current.set(from, q);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };
    socket.on("screen:request", handleRequest);
    socket.on("screen:answer", handleAnswer);
    socket.on("screen:ice", handleIce);
    return () => {
      socket.off("screen:request", handleRequest);
      socket.off("screen:answer", handleAnswer);
      socket.off("screen:ice", handleIce);
    };
  }, [socket, sharing, localStream]);

  // Expose un getter sur les peers pour le panneau de stats (pas un ref direct
  // → évite de fuite de référence interne, et le getter renvoie toujours la
  // Map à jour sans recréer le hook).
  const getPeers = React.useCallback(() => peersRef.current, []);
  return { sharing, localStream, start, stop, getPeers };
}

// ─── Screen share awareness (lightweight, no WebRTC) ─────────────────────────
// Pour StreamControlPage : on a juste besoin de SAVOIR qu'un partage est actif
// (afficher le bouton "Prendre la main"), PAS de recevoir le flux vidéo.
// Évite N PeerConnections + décodage GPU pour chaque viewer du stream-control.
export function useScreenAwareness(socket: Socket | null) {
  const [active, setActive] = React.useState<{ slug: string; socketId: string } | null>(null);
  React.useEffect(() => {
    if (!socket) return;
    socket.emit("screen:viewer-join", {}, (ack: { ok: boolean; active: Array<{ slug: string; socketId: string }> }) => {
      const bc = ack?.active?.[0];
      if (bc) setActive(bc);
    });
    const onRegistered = (bc: { slug: string; socketId: string }) => setActive(bc);
    const onLeft = ({ slug }: { slug: string }) => {
      setActive((cur) => (cur?.slug === slug ? null : cur));
    };
    socket.on("screen:registered", onRegistered);
    socket.on("screen:left", onLeft);
    return () => {
      socket.off("screen:registered", onRegistered);
      socket.off("screen:left", onLeft);
    };
  }, [socket]);
  return active;
}

// ─── Screen share viewer (full — WebRTC) ─────────────────────────────────────
// Reçoit le flux écran actuellement partagé. Utilisé UNIQUEMENT par OverlayPage
// (OBS) pour rendu dans la zone Slot. Le StreamControlPage ne consomme plus ce
// flux pour économiser bande passante + décodage GPU.
export function useScreenViewer(socket: Socket | null, mySlug: string) {
  const [entry, setEntry] = React.useState<{ slug: string; stream: MediaStream | null; socketId: string } | null>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = React.useRef<RTCIceCandidateInit[]>([]);
  const currentSlugRef = React.useRef<string | null>(null);

  const cleanup = React.useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
    currentSlugRef.current = null;
    setEntry(null);
  }, []);

  const connect = React.useCallback(async (bc: { slug: string; socketId: string }) => {
    if (!socket) return;
    // Skip si c'est moi qui partage (je n'ai pas besoin de recevoir mon propre flux).
    if (bc.slug === mySlug) return;
    // Si déjà connecté à ce slug, ne rien faire
    if (currentSlugRef.current === bc.slug && pcRef.current) return;

    cleanup();
    currentSlugRef.current = bc.slug;
    setEntry({ slug: bc.slug, socketId: bc.socketId, stream: null });

    const iceServers = await ensureIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.ontrack = ({ streams: s }) => {
      const stream = s[0] ?? null;
      if (!stream) return;
      setEntry(prev => prev && prev.slug === bc.slug ? { ...prev, stream } : prev);
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("screen:ice", { to: bc.socketId, candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") cleanup();
    };

    const handleOffer = async ({ slug, sdp, from }: { slug: string; sdp: RTCSessionDescriptionInit; from: string }) => {
      if (slug !== bc.slug || pcRef.current !== pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("screen:answer", { to: from, sdp: answer });
    };
    const handleIce = async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      if (pcRef.current !== pc) return;
      if (!pc.remoteDescription) { pendingIceRef.current.push(candidate); return; }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };
    socket.on("screen:offer", handleOffer);
    socket.on("screen:ice", handleIce);

    // On stocke ces handlers pour cleanup dans l'effet principal
    (pc as any)._screenHandlers = { handleOffer, handleIce };

    socket.emit("screen:request", { fromSlug: bc.slug });
  }, [socket, mySlug, cleanup]);

  React.useEffect(() => {
    if (!socket) return;
    socket.emit("screen:viewer-join", {}, (ack: { ok: boolean; active: Array<{ slug: string; socketId: string }> }) => {
      const bc = ack?.active?.[0];
      if (bc) connect(bc);
    });
    const onRegistered = (bc: { slug: string; socketId: string }) => connect(bc);
    const onLeft = ({ slug }: { slug: string }) => {
      if (currentSlugRef.current === slug) cleanup();
    };
    socket.on("screen:registered", onRegistered);
    socket.on("screen:left", onLeft);
    return () => {
      socket.off("screen:registered", onRegistered);
      socket.off("screen:left", onLeft);
      const h = pcRef.current && (pcRef.current as any)._screenHandlers;
      if (h) {
        socket.off("screen:offer", h.handleOffer);
        socket.off("screen:ice", h.handleIce);
      }
      cleanup();
    };
  }, [socket, connect, cleanup]);

  return entry;
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
  // Queue des ICE candidates arrivés avant setRemoteDescription (fix race condition)
  const pendingIceRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const connect = React.useCallback(async (bc: { slug: string; slot: number; socketId: string; filters: any }) => {
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
      pendingIceRef.current.delete(bc.slug);
      const staleH = handlersRef.current.get(bc.slug);
      if (staleH) {
        socket.off("cam:offer", staleH.offer);
        socket.off("cam:ice", staleH.ice);
        handlersRef.current.delete(bc.slug);
      }
    }
    console.log("[RemoteCams] connecting to broadcaster:", bc.slug, "slot:", bc.slot, "socketId:", bc.socketId);

    const iceServers = await ensureIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    peersRef.current.set(bc.slug, pc);

    // Pre-register so filter updates work before video arrives
    setEntries(prev => {
      const next = new Map(prev);
      next.set(bc.slug, {
        slug: bc.slug, slot: bc.slot, stream: null,
        filters: { ...DEFAULT_FILTERS, ...(bc.filters ?? {}) },
        socketId: bc.socketId,
        candidateType: null,
      });
      return next;
    });

    // Poll stats toutes les 2s pour extraire le candidate-type de la paire ICE
    // sélectionnée — diagnostic visuel "host / srflx / relay" dans le badge cam.
    const statsInterval = setInterval(async () => {
      if (pc.connectionState === "closed" || pc.connectionState === "failed") {
        clearInterval(statsInterval);
        return;
      }
      try {
        const stats = await pc.getStats();
        let selectedPairId: string | undefined;
        const candidates = new Map<string, any>();
        stats.forEach((r: any) => {
          if (r.type === "candidate-pair" && (r.selected || r.nominated) && r.state === "succeeded") {
            selectedPairId = r.localCandidateId;
          }
          if (r.type === "local-candidate") candidates.set(r.id, r);
        });
        const local = selectedPairId ? candidates.get(selectedPairId) : null;
        const t = (local?.candidateType as CandidateType) ?? null;
        if (t) {
          setEntries(prev => {
            const ex = prev.get(bc.slug);
            if (!ex || ex.candidateType === t) return prev;
            const next = new Map(prev);
            next.set(bc.slug, { ...ex, candidateType: t });
            return next;
          });
        }
      } catch {}
    }, 2000);

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
      if (candidate) {
        console.log("[RemoteCams] ICE →", bc.slug, candidate.type, candidate.protocol, candidate.address);
        socket.emit("cam:ice", { to: bc.socketId, candidate });
      } else {
        console.log("[RemoteCams] ICE gathering complete for", bc.slug);
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log("[RemoteCams] iceConnectionState →", pc.iceConnectionState, "for", bc.slug);
    };

    pc.onconnectionstatechange = () => {
      console.log("[RemoteCams] connectionState →", pc.connectionState, "for", bc.slug);
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
      // Flush candidats ICE queuées avant qu'on ait la remote description
      const pending = pendingIceRef.current.get(bc.slug);
      if (pending && pending.length > 0) {
        console.log(`[RemoteCams] flushing ${pending.length} queued ICE for`, bc.slug);
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
          catch (e) { console.warn("[RemoteCams] queued addIceCandidate failed:", e); }
        }
        pendingIceRef.current.delete(bc.slug);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("cam:answer", { to: offerId, sdp: answer });
    };
    const handleIce = async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const myPc = peersRef.current.get(bc.slug);
      if (!myPc) return;
      const c = candidate as any;
      console.log("[RemoteCams] ICE ←", bc.slug, c?.candidate?.match(/typ (\w+)/)?.[1] ?? "?");
      if (!myPc.remoteDescription) {
        const q = pendingIceRef.current.get(bc.slug) ?? [];
        q.push(candidate);
        pendingIceRef.current.set(bc.slug, q);
        return;
      }
      try { await myPc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn("[RemoteCams] addIceCandidate failed:", e); }
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
      pendingIceRef.current.delete(slug);
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
      pendingIceRef.current.clear();
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
          {!data.isMe && data.active && data.candidateType && (
            <span
              title={
                data.candidateType === "relay"
                  ? "Connexion via TURN (relay Cloudflare) — traverse NAT/VPN strict"
                  : data.candidateType === "srflx"
                  ? "Connexion directe via STUN (NAT traversable)"
                  : data.candidateType === "host"
                  ? "Connexion locale directe (même LAN)"
                  : "Peer-reflexive candidate"
              }
              style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 700,
                background:
                  data.candidateType === "relay" ? "rgba(251,191,36,.15)" :
                  data.candidateType === "host" ? "rgba(59,130,246,.15)" :
                  "rgba(34,197,94,.15)",
                color:
                  data.candidateType === "relay" ? "#fbbf24" :
                  data.candidateType === "host" ? "#60a5fa" :
                  "#4ade80",
              }}
            >
              {data.candidateType}
            </span>
          )}
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

// ─── WebRTC stats panel (diag) ────────────────────────────────────────────────
//
// Lit RTCPeerConnection.getStats() toutes les 1.5s pour chaque peer (cam +
// screen broadcaster) et produit une vue agrégée :
//  - bitrate up calculé via diff bytesSent (Mbps)
//  - fps réel envoyé (framesPerSecond)
//  - résolution réelle envoyée (frameWidth × frameHeight)
//  - qualityLimitationReason : raison qui PRINCIPALEMENT cause la baisse de
//      qualité ("cpu" | "bandwidth" | "other" | "none")
//  - packets lost reçus du remote (fractionLost %)
//  - RTT en ms
//  - availableOutgoingBitrate (estimation congestion control)

type RtcStreamStats = {
  label: string;          // ex: "Cam → 3 viewer(s)" ou "Screen → 2 viewer(s)"
  kind: "cam" | "screen";
  viewers: number;
  bitrateUpKbps: number;          // moyenne sur les viewers
  fpsAvg: number;
  width: number; height: number;
  qualityLimitation: string;      // pire cas parmi les peers
  packetsLostPct: number;         // moyenne %
  rttMs: number;                  // moyenne
  availableOutgoingKbps: number;  // moyenne
};

function useRtcBroadcastStats(
  getPeersList: Array<{ kind: "cam" | "screen"; getPeers: () => Map<string, RTCPeerConnection> }>,
  intervalMs = 1500,
) {
  const [stats, setStats] = React.useState<RtcStreamStats[]>([]);
  // Mémoire pour calculer le delta de bytes
  const lastBytesRef = React.useRef<Map<string, { bytes: number; t: number }>>(new Map());

  React.useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const out: RtcStreamStats[] = [];
      const now = performance.now();

      for (const entry of getPeersList) {
        const peers = entry.getPeers();
        if (!peers || peers.size === 0) continue;

        let totalBitrateKbps = 0;
        let totalFps = 0;
        let totalFractionLost = 0;
        let totalRttMs = 0;
        let totalAvailableKbps = 0;
        let bitrateSamples = 0;
        let fpsSamples = 0;
        let lossSamples = 0;
        let rttSamples = 0;
        let availSamples = 0;
        let widthMax = 0;
        let heightMax = 0;
        let worstLimitation: string = "none";
        let viewerCount = 0;

        for (const [peerId, pc] of peers.entries()) {
          if (pc.connectionState === "closed" || pc.connectionState === "failed") continue;
          viewerCount++;
          let report: RTCStatsReport;
          try { report = await pc.getStats(); } catch { continue; }

          report.forEach((r: any) => {
            if (r.type === "outbound-rtp" && r.kind === "video") {
              const key = `${entry.kind}:${peerId}:${r.ssrc ?? r.id}`;
              const prev = lastBytesRef.current.get(key);
              const bytes = Number(r.bytesSent || 0);
              if (prev) {
                const dt = (now - prev.t) / 1000;
                if (dt > 0) {
                  const kbps = ((bytes - prev.bytes) * 8) / 1000 / dt;
                  if (kbps >= 0 && kbps < 50_000) { totalBitrateKbps += kbps; bitrateSamples++; }
                }
              }
              lastBytesRef.current.set(key, { bytes, t: now });
              if (typeof r.framesPerSecond === "number") {
                totalFps += r.framesPerSecond; fpsSamples++;
              }
              if (typeof r.frameWidth === "number" && r.frameWidth > widthMax) widthMax = r.frameWidth;
              if (typeof r.frameHeight === "number" && r.frameHeight > heightMax) heightMax = r.frameHeight;
              if (r.qualityLimitationReason && r.qualityLimitationReason !== "none") {
                // priorité : bandwidth > cpu > other
                const order = { bandwidth: 3, cpu: 2, other: 1, none: 0 } as Record<string, number>;
                if ((order[r.qualityLimitationReason] ?? 0) > (order[worstLimitation] ?? 0)) {
                  worstLimitation = r.qualityLimitationReason;
                }
              }
            }
            if (r.type === "remote-inbound-rtp" && r.kind === "video") {
              if (typeof r.fractionLost === "number") {
                totalFractionLost += r.fractionLost; lossSamples++;
              }
              if (typeof r.roundTripTime === "number") {
                totalRttMs += r.roundTripTime * 1000; rttSamples++;
              }
            }
            if (r.type === "candidate-pair" && (r.selected || r.nominated || r.state === "succeeded")) {
              if (typeof r.availableOutgoingBitrate === "number") {
                totalAvailableKbps += r.availableOutgoingBitrate / 1000; availSamples++;
              }
              if (typeof r.currentRoundTripTime === "number" && rttSamples === 0) {
                totalRttMs += r.currentRoundTripTime * 1000; rttSamples++;
              }
            }
          });
        }

        if (viewerCount === 0) continue;

        out.push({
          label: entry.kind === "cam" ? `Cam → ${viewerCount} viewer${viewerCount > 1 ? "s" : ""}` : `Screen → ${viewerCount} viewer${viewerCount > 1 ? "s" : ""}`,
          kind: entry.kind,
          viewers: viewerCount,
          bitrateUpKbps: bitrateSamples > 0 ? totalBitrateKbps / bitrateSamples : 0,
          fpsAvg: fpsSamples > 0 ? totalFps / fpsSamples : 0,
          width: widthMax, height: heightMax,
          qualityLimitation: worstLimitation,
          packetsLostPct: lossSamples > 0 ? (totalFractionLost / lossSamples) * 100 : 0,
          rttMs: rttSamples > 0 ? totalRttMs / rttSamples : 0,
          availableOutgoingKbps: availSamples > 0 ? totalAvailableKbps / availSamples : 0,
        });
      }

      if (!cancelled) setStats(out);
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [getPeersList, intervalMs]);

  return stats;
}

function StatBadge({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const colors: Record<string, { fg: string; bg: string; border: string }> = {
    ok:      { fg: "#6ee7b7", bg: "rgba(16,185,129,.10)", border: "rgba(16,185,129,.28)" },
    warn:    { fg: "#fbbf24", bg: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.28)" },
    bad:     { fg: "#fca5a5", bg: "rgba(239,68,68,.10)",  border: "rgba(239,68,68,.32)" },
    neutral: { fg: "#dde8ff", bg: "rgba(255,255,255,.04)", border: "rgba(255,255,255,.08)" },
  };
  const c = colors[tone || "neutral"];
  return (
    <div style={{
      padding: "6px 10px", borderRadius: 8,
      background: c.bg, border: `1px solid ${c.border}`,
      display: "flex", flexDirection: "column", gap: 1, minWidth: 86,
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: c.fg, fontFamily: "monospace", lineHeight: 1.1 }}>{value}</span>
      {sub ? <span style={{ fontSize: 10, color: "#64748b", lineHeight: 1.1 }}>{sub}</span> : null}
    </div>
  );
}

function RtcStatsPanel({
  getCamPeers, getScreenPeers, isCamActive, isScreenActive,
}: {
  getCamPeers: () => Map<string, RTCPeerConnection>;
  getScreenPeers: () => Map<string, RTCPeerConnection>;
  isCamActive: boolean;
  isScreenActive: boolean;
}) {
  const peerList = React.useMemo(() => {
    const arr: Array<{ kind: "cam" | "screen"; getPeers: () => Map<string, RTCPeerConnection> }> = [];
    if (isCamActive) arr.push({ kind: "cam", getPeers: getCamPeers });
    if (isScreenActive) arr.push({ kind: "screen", getPeers: getScreenPeers });
    return arr;
  }, [isCamActive, isScreenActive, getCamPeers, getScreenPeers]);

  const stats = useRtcBroadcastStats(peerList, 1500);

  if (!isCamActive && !isScreenActive) {
    return (
      <div style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 10, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        color: "#64748b", fontSize: 12,
      }}>
        <span style={{ fontSize: 14 }}>📊</span>
        <span>Stats WebRTC : active ta cam ou démarre un partage d'écran pour voir les diagnostics live.</span>
      </div>
    );
  }

  return (
    <div style={{
      background: "linear-gradient(180deg,rgba(20,28,55,.6),rgba(11,17,34,.6))",
      border: "1px solid rgba(99,102,241,.25)",
      borderRadius: 12,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#dde8ff" }}>📊 Diagnostic WebRTC live</span>
        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>tick 1.5s · sources broadcast</span>
        <button
          onClick={() => {
            const codec = (() => {
              try {
                const caps = (RTCRtpSender as any).getCapabilities?.("video");
                const list = (caps?.codecs || []).map((c: any) => c.mimeType).join(",");
                return list || "n/a";
              } catch { return "n/a"; }
            })();
            const ua = navigator.userAgent;
            const dump = JSON.stringify({ ua, codecsAvailable: codec, stats }, null, 2);
            navigator.clipboard.writeText(dump).catch(() => {});
          }}
          style={{
            marginLeft: "auto",
            background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.35)",
            color: "#c7d2fe", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
          title="Copie un dump JSON des stats actuelles dans le presse-papier"
        >
          📋 Copier stats
        </button>
      </div>
      {stats.length === 0 ? (
        <div style={{ fontSize: 11, color: "#64748b" }}>
          Aucun viewer connecté pour le moment — les stats apparaîtront dès qu'OBS / un autre user reçoit le flux.
        </div>
      ) : null}
      {stats.map((s) => {
        const fpsTone: "ok" | "warn" | "bad" = s.fpsAvg >= 25 ? "ok" : s.fpsAvg >= 15 ? "warn" : "bad";
        const lossTone: "ok" | "warn" | "bad" = s.packetsLostPct < 1 ? "ok" : s.packetsLostPct < 5 ? "warn" : "bad";
        const rttTone: "ok" | "warn" | "bad" = s.rttMs < 80 ? "ok" : s.rttMs < 200 ? "warn" : "bad";
        const limitTone: "ok" | "warn" | "bad" = s.qualityLimitation === "none" ? "ok"
          : s.qualityLimitation === "bandwidth" ? "bad" : "warn";
        const limitLabel = s.qualityLimitation === "none" ? "OK"
          : s.qualityLimitation === "bandwidth" ? "Bande passante"
          : s.qualityLimitation === "cpu" ? "CPU encodeur"
          : s.qualityLimitation;
        return (
          <div key={s.kind} style={{
            display: "flex", flexDirection: "column", gap: 8,
            paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>{s.kind === "cam" ? "🎥" : "🖥️"}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#dde8ff" }}>{s.label}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <StatBadge label="Bitrate up" value={`${(s.bitrateUpKbps / 1000).toFixed(2)} Mbps`} tone="neutral" />
              <StatBadge label="FPS" value={s.fpsAvg.toFixed(0)} tone={fpsTone} />
              <StatBadge label="Résolution" value={`${s.width}×${s.height}`} tone="neutral" />
              <StatBadge label="Limitation" value={limitLabel} tone={limitTone} />
              <StatBadge label="Perte paquets" value={`${s.packetsLostPct.toFixed(1)}%`} tone={lossTone} />
              <StatBadge label="RTT" value={`${s.rttMs.toFixed(0)} ms`} tone={rttTone} />
              <StatBadge label="BP dispo" value={s.availableOutgoingKbps > 0 ? `${(s.availableOutgoingKbps / 1000).toFixed(2)} Mbps` : "—"}
                sub={s.availableOutgoingKbps > 0 && s.bitrateUpKbps > 0 ? `taux util. ${((s.bitrateUpKbps / s.availableOutgoingKbps) * 100).toFixed(0)}%` : undefined}
                tone="neutral" />
            </div>
          </div>
        );
      })}
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

  // ─── Camera device selection ───────────────────────────────────────────────
  // Certains users ont OBS Virtual Camera en défaut → pas de frames
  // + détection WebRTC bloqué (VPN killswitch, extension privacy)
  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const CAM_DEVICE_KEY = `lunalive-streamcontrol-device-${mySlug}`;
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string>(() => {
    try { return localStorage.getItem(CAM_DEVICE_KEY) || ""; } catch { return ""; }
  });
  const [webrtcBlocked, setWebrtcBlocked] = React.useState<boolean>(false);

  // Enumerate video devices (après première autorisation caméra, les labels deviennent visibles)
  React.useEffect(() => {
    const refresh = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter(d => d.kind === "videoinput"));
      } catch {}
    };
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => { navigator.mediaDevices.removeEventListener?.("devicechange", refresh); };
  }, []);

  // Détection WebRTC bloqué: à l'activation cam, on crée un PC de test vers STUN
  // et on attend >= 1 candidat. 0 candidat après 5s = VPN/extension bloquant
  React.useEffect(() => {
    const testPc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    testPc.createDataChannel("probe");
    let got = 0;
    testPc.onicecandidate = (e) => { if (e.candidate) got++; };
    testPc.createOffer().then(o => testPc.setLocalDescription(o)).catch(() => {});
    const timer = setTimeout(() => {
      if (got === 0) {
        console.error("[WebRTC probe] 0 candidats ICE gathered → VPN ou extension bloque WebRTC");
        setWebrtcBlocked(true);
      } else {
        console.log(`[WebRTC probe] ${got} candidats gathered → OK`);
        setWebrtcBlocked(false);
      }
      try { testPc.close(); } catch {}
    }, 5000);
    return () => { clearTimeout(timer); try { testPc.close(); } catch {} };
  }, []);

  // STABLE viewer — never tears down when myCamActive / mySlot changes
  const { entries: remoteEntries, updateFilters: updateRemoteFilters } = useRemoteCams(socket, mySlugRef);

  // Screen share : broadcaster (celui qui partage) + awareness lightweight (slug
  // seulement, pas de WebRTC) — pour afficher le bon label de bouton sans payer
  // le coût d'un PeerConnection + décodage GPU pour chaque viewer du stream-control.
  // Exclusif : un seul partage actif en global (garanti côté serveur).
  const { sharing: myScreenSharing, start: startScreenShare, stop: stopScreenShare, getPeers: getScreenPeers } =
    useScreenBroadcaster(socket, mySlug);
  const remoteScreenAware = useScreenAwareness(socket);
  // Quelqu'un d'autre partage actuellement (utile pour le bouton "Prendre la main")
  const remoteScreen = !myScreenSharing && remoteScreenAware && remoteScreenAware.slug !== mySlug
    ? remoteScreenAware
    : null;

  // Broadcaster — independent of viewer
  // Sur register, si des filtres sont persistés en DB pour ce slug, on les applique
  const camBcaster = useBroadcaster(
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
    console.log("[CamControl] activating cam for", mySlug, "slot", mySlot + 1, "device:", selectedDeviceId || "default");
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // Force 30 fps. Sans ça, beaucoup de cams logitech/intégrées plafonnent
        // à 15 fps en interne (mode économie / faible lumière).
        frameRate: { ideal: 30, min: 24 },
      };
      if (selectedDeviceId) {
        videoConstraints.deviceId = { exact: selectedDeviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      // Log track info (aide à détecter OBS Virtual Camera qui n'envoie rien)
      stream.getVideoTracks().forEach(t => {
        const settings = t.getSettings();
        console.log("[CamControl] video track:", t.label, "active:", t.enabled, "muted:", t.muted, "settings:", settings);
      });
      setLocalStream(stream);
      setMyCamActive(true);
      try { localStorage.setItem(CAM_STATE_KEY, JSON.stringify({ active: true, slot: mySlot })); } catch {}
      // Refresh devices to get labels (now authorized)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter(d => d.kind === "videoinput"));
      } catch {}
    } catch (e: any) {
      setCamError(e?.message ?? "Accès caméra refusé");
      try { localStorage.removeItem(CAM_STATE_KEY); } catch {}
    }
  }, [CAM_STATE_KEY, mySlot, mySlug, selectedDeviceId]);

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
        return { slug, isMe: false, active: true, stream: entry.stream, filters: entry.filters, candidateType: entry.candidateType };
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
          {videoDevices.length > 0 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedDeviceId(id);
                try { localStorage.setItem(CAM_DEVICE_KEY, id); } catch {}
                // Si la cam est déjà active, re-démarrer avec le nouveau device
                if (myCamActive) {
                  localStream?.getTracks().forEach(t => t.stop());
                  setLocalStream(null);
                  setMyCamActive(false);
                  setTimeout(() => activateCam(), 100);
                }
              }}
              style={{ ...S.select, maxWidth: 180 }}
              title="Caméra physique"
            >
              <option value="">Caméra (auto)</option>
              {videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Caméra ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          <select value={mySlot} onChange={e => setMySlot(Number(e.target.value))} style={S.select} title="Mon slot cam">
            {SLOT_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
          {!myCamActive
            ? <button onClick={activateCam} style={{ ...S.btn, background: "rgba(99,102,241,.8)", padding: "6px 14px" }}>● Activer ma cam</button>
            : <button onClick={deactivateCam} style={{ ...S.btn, background: "rgba(239,68,68,.7)", padding: "6px 14px" }}>■ Stop</button>
          }
          {/* Screen share — 1 seul partage actif. Le bouton change selon l'état global. */}
          {myScreenSharing ? (
            <button onClick={stopScreenShare} style={{ ...S.btn, background: "rgba(239,68,68,.7)", padding: "6px 14px" }}>
              ■ Arrêter partage
            </button>
          ) : remoteScreen ? (
            <button
              onClick={startScreenShare}
              title={`${remoteScreen.slug} partage actuellement son écran — cliquer pour prendre la main`}
              style={{ ...S.btn, background: "rgba(245,158,11,.7)", padding: "6px 14px" }}
            >
              🖥️ Prendre la main
            </button>
          ) : (
            <button onClick={startScreenShare} style={{ ...S.btn, background: "rgba(139,92,246,.75)", padding: "6px 14px" }}>
              🖥️ Partager écran
            </button>
          )}
          {camError && <span style={{ fontSize: 11, color: "#fc8181" }}>{camError}</span>}
          <Link to="/FSB_Board" style={{ ...S.btn, background: "transparent", border: "1px solid rgba(255,255,255,.08)", color: "#64748b", textDecoration: "none", padding: "6px 12px", fontSize: 12 }}>
            ← Board
          </Link>
        </div>
      </div>

      {/* Bannière WebRTC bloqué (VPN, extension privacy, firewall) */}
      {webrtcBlocked && (
        <div style={{
          background: "rgba(239,68,68,.12)",
          border: "1px solid rgba(239,68,68,.4)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#fecaca",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong style={{ color: "#fca5a5" }}>WebRTC bloqué</strong> — aucun candidat ICE n'a pu être récupéré après 5s.
            <br />
            <span style={{ fontSize: 11, color: "#fda4af" }}>
              Cause probable : <b>VPN actif</b> (NordVPN, Proton, Mullvad, CyberGhost…) ou extension anti-pistage (uBlock "WebRTC leak shield", Brave shields).
              Désactive-les pour LunaLive ou ajoute le domaine en exception. Sans ça, les autres ne te verront jamais.
            </span>
          </div>
        </div>
      )}

      {/* ── Stats WebRTC live (diagnostic) ── */}
      <RtcStatsPanel
        getCamPeers={camBcaster.getPeers}
        getScreenPeers={getScreenPeers}
        isCamActive={myCamActive}
        isScreenActive={myScreenSharing}
      />

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
    // Fond + bordure qui suivent la même famille de couleur que le fond (#07101f) :
    // indigo profond à peine décollé → fusionne avec le dark premium tout en gardant
    // une démarcation subtile grâce à l'accent violet de la bordure intérieure.
    background: "linear-gradient(180deg,rgba(19,26,52,.55),rgba(11,17,34,.55))",
    border: "1px solid rgba(99,102,241,.18)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.02), 0 4px 18px rgba(4,8,20,.35)",
  },
  camCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(99,102,241,.1)",
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
