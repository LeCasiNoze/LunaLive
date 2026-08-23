// Bouton flottant LunaBot + menu dock, DÉTACHÉ du chat (décision Lucas
// 11 juil) : monté au niveau de la page streamer → accessible depuis
// n'importe quel onglet, pas seulement la section chat. Établit sa propre
// connexion socket légère (uniquement pour sendBang = commandes !call ;
// les autres onglets du bot sont en HTTP pur).
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { Bot, Move } from "lucide-react";
import { BotMenu } from "./BotMenu";

// ⚠ MÊME base que ChatPanel (VITE_API_BASE, fallback onrender). PAS
// lib/http apiBase() (VITE_API_URL, fallback localhost) qui empêchait le
// socket de se connecter en prod → call cassé.
function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

const FAB_SIZE = 56;
const FAB_MARGIN = 10;
const FAB_POSITION_KEY = "lunalive:floating-bot-position:v2";

type FabPosition = { x: number; y: number };

function clampFabPosition(position: FabPosition): FabPosition {
  if (typeof window === "undefined") return position;
  return {
    x: Math.max(FAB_MARGIN, Math.min(window.innerWidth - FAB_SIZE - FAB_MARGIN, position.x)),
    y: Math.max(FAB_MARGIN, Math.min(window.innerHeight - FAB_SIZE - FAB_MARGIN, position.y)),
  };
}

function defaultFabPosition(): FabPosition {
  if (typeof window === "undefined") return { x: FAB_MARGIN, y: FAB_MARGIN };
  return clampFabPosition({
    x: window.innerWidth - FAB_SIZE - 16,
    y: window.innerHeight - FAB_SIZE - 96,
  });
}

export function FloatingBot({
  slug,
  token,
  role,
  canMod,
  onRequireLogin,
}: {
  slug: string;
  token: string | null;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;
  onRequireLogin: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [fabPosition, setFabPosition] = React.useState<FabPosition | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const sockRef = React.useRef<Socket | null>(null);
  const dragRef = React.useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>(null);
  const suppressClickRef = React.useRef(false);

  React.useEffect(() => {
    const restorePosition = () => {
      try {
        const raw = window.localStorage.getItem(FAB_POSITION_KEY);
        if (!raw) return defaultFabPosition();
        const parsed = JSON.parse(raw) as { xRatio?: number; yRatio?: number };
        const maxX = Math.max(1, window.innerWidth - FAB_SIZE - FAB_MARGIN * 2);
        const maxY = Math.max(1, window.innerHeight - FAB_SIZE - FAB_MARGIN * 2);
        if (!Number.isFinite(parsed.xRatio) || !Number.isFinite(parsed.yRatio)) return defaultFabPosition();
        return clampFabPosition({
          x: FAB_MARGIN + Math.max(0, Math.min(1, Number(parsed.xRatio))) * maxX,
          y: FAB_MARGIN + Math.max(0, Math.min(1, Number(parsed.yRatio))) * maxY,
        });
      } catch {
        return defaultFabPosition();
      }
    };

    setFabPosition(restorePosition());
    const onResize = () => setFabPosition((current) => clampFabPosition(current || restorePosition()));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const persistFabPosition = React.useCallback((position: FabPosition) => {
    try {
      const maxX = Math.max(1, window.innerWidth - FAB_SIZE - FAB_MARGIN * 2);
      const maxY = Math.max(1, window.innerHeight - FAB_SIZE - FAB_MARGIN * 2);
      window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({
        xRatio: Math.max(0, Math.min(1, (position.x - FAB_MARGIN) / maxX)),
        yRatio: Math.max(0, Math.min(1, (position.y - FAB_MARGIN) / maxY)),
      }));
    } catch {
      // Le bouton reste déplaçable même si le stockage navigateur est indisponible.
    }
  }, []);

  // Socket établi au MONTAGE (pas à l'ouverture du menu) et gardé jusqu'au
  // démontage du composant. ⚠ Bug corrigé : CallTab ferme le menu juste
  // après sendBang ; si le socket se fermait à la fermeture du menu, l'emit
  // du !call n'avait pas le temps de partir (call perdu).
  React.useEffect(() => {
    if (!slug) return;

    const socket = io(apiBase(), {
      transports: ["websocket", "polling"],
      withCredentials: false,
      auth: token ? { token } : {},
    });
    sockRef.current = socket;
    // (re)join à chaque connexion — pas requis pour envoyer, mais garde le
    // socket propre côté serveur
    socket.on("connect", () => socket.emit("chat:join", { slug, mode: "public" }, () => {}));

    return () => {
      try {
        socket.disconnect();
      } catch {
        /* déjà fermé */
      }
      sockRef.current = null;
    };
  }, [slug, token]);

  const sendBang = React.useCallback(
    (text: string) => {
      const s = sockRef.current;
      if (!s) return;
      // socket.io bufferise si pas encore connecté → l'emit part à la connexion
      s.emit("chat:send", { slug, body: text }, (ack: any) => {
        if (ack && ack.ok === false) {
          window.dispatchEvent(
            new CustomEvent("ui:toast", {
              detail: { kind: "error", slot: "bottom", durationMs: 2600, title: `Bot : ${ack.error || "échec"}` },
            })
          );
        }
      });
    },
    [slug]
  );

  const onClickFab = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!token) return onRequireLogin();
    setOpen(true);
  };

  return (
    <>
      <style>{`
        .llBotFab{
          position: fixed;
          z-index: 141;
          width: ${FAB_SIZE}px; height: ${FAB_SIZE}px;
          display: grid; place-items: center;
          padding: 0;
          border-radius: 18px;
          border: 1px solid rgba(196,181,253,.36);
          background: linear-gradient(145deg, rgba(139,92,246,.98), rgba(74,52,166,.98));
          box-shadow: 0 18px 42px rgba(4,2,15,.56), 0 0 0 4px rgba(139,92,246,.10), inset 0 1px 0 rgba(255,255,255,.18);
          color: white; cursor: grab;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          transition: border-radius 160ms ease, box-shadow 160ms ease, transform 160ms ease;
          animation: llBotFabBreath 3.4s ease-in-out infinite;
        }
        .llBotFab::before{
          content:"";
          position:absolute; inset:5px;
          border:1px solid rgba(255,255,255,.11);
          border-radius:14px;
          pointer-events:none;
        }
        .llBotFab:hover{ transform: translateY(-2px); box-shadow:0 22px 48px rgba(4,2,15,.62),0 0 0 5px rgba(139,92,246,.14),inset 0 1px 0 rgba(255,255,255,.18); }
        .llBotFab.isDragging{ cursor:grabbing; transform:scale(.96); animation:none; border-radius:22px; }
        .llBotFab.isOpen{ border-color:rgba(196,181,253,.52); }
        .llBotFabIcon{ position:relative; z-index:1; filter:drop-shadow(0 4px 8px rgba(20,8,61,.35)); pointer-events:none; }
        .llBotFabMove{
          position:absolute; right:-5px; top:-5px; z-index:2;
          width:19px; height:19px; display:grid; place-items:center;
          border:1px solid rgba(196,181,253,.28); border-radius:7px;
          background:#171025; color:#b9a8e5;
          box-shadow:0 5px 12px rgba(0,0,0,.38);
          pointer-events:none;
        }
        @keyframes llBotFabBreath{
          0%,100%{ box-shadow:0 18px 42px rgba(4,2,15,.56),0 0 0 4px rgba(139,92,246,.10),inset 0 1px 0 rgba(255,255,255,.18); }
          50%{ box-shadow:0 18px 42px rgba(4,2,15,.56),0 0 0 7px rgba(139,92,246,.16),inset 0 1px 0 rgba(255,255,255,.18); }
        }
        @media(max-width:600px){ .llBotFab{ width:52px; height:52px; border-radius:17px; } }
        @media (prefers-reduced-motion: reduce){ .llBotFab{ animation: none; } }
      `}</style>

      <button
        type="button"
        className={`llBotFab${dragging ? " isDragging" : ""}${open ? " isOpen" : ""}`}
        style={{
          left: fabPosition?.x ?? FAB_MARGIN,
          top: fabPosition?.y ?? FAB_MARGIN,
          opacity: fabPosition ? 1 : 0,
        }}
        onPointerDown={(event) => {
          if (!fabPosition || event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: fabPosition.x,
            originY: fabPosition.y,
            moved: false,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (!drag.moved && Math.hypot(dx, dy) > 5) {
            drag.moved = true;
            setDragging(true);
          }
          if (!drag.moved) return;
          event.preventDefault();
          setFabPosition(clampFabPosition({ x: drag.originX + dx, y: drag.originY + dy }));
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setDragging(false);
          try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
          if (drag.moved) {
            suppressClickRef.current = true;
            setFabPosition((current) => {
              const next = clampFabPosition(current || defaultFabPosition());
              persistFabPosition(next);
              return next;
            });
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onClickFab();
        }}
        title="Glisse pour déplacer · clique pour ouvrir LunaBot"
        aria-label="Ouvrir le menu LunaBot. Ce bouton peut être déplacé."
        aria-expanded={open}
      >
        <Bot className="llBotFabIcon" size={25} strokeWidth={2.2} aria-hidden="true" />
        <span className="llBotFabMove"><Move size={10} aria-hidden="true" /></span>
      </button>

      <BotMenu
        open={open}
        onClose={() => setOpen(false)}
        slug={slug}
        token={token}
        role={role}
        canMod={canMod}
        onRequireLogin={onRequireLogin}
        sendBang={sendBang}
        variant="dock"
      />
    </>
  );
}
