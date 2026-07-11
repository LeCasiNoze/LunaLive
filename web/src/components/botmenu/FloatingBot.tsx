// Bouton flottant LunaBot + menu dock, DÉTACHÉ du chat (décision Lucas
// 11 juil) : monté au niveau de la page streamer → accessible depuis
// n'importe quel onglet, pas seulement la section chat. Établit sa propre
// connexion socket légère (uniquement pour sendBang = commandes !call ;
// les autres onglets du bot sont en HTTP pur).
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { BotMenu } from "./BotMenu";

// ⚠ MÊME base que ChatPanel (VITE_API_BASE, fallback onrender). PAS
// lib/http apiBase() (VITE_API_URL, fallback localhost) qui empêchait le
// socket de se connecter en prod → call cassé.
function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
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
  const sockRef = React.useRef<Socket | null>(null);

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
          right: 14px;
          bottom: calc(96px + env(safe-area-inset-bottom));
          z-index: 130;
          width: 52px; height: 52px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.20);
          background: linear-gradient(135deg, #7c4dff, #38bdf8);
          box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 3px rgba(124,77,255,0.16);
          font-size: 24px; line-height: 1; color: white; cursor: pointer;
          animation: llBotFabBreath 3s ease-in-out infinite;
        }
        .llBotFab:active{ transform: scale(0.94); }
        @keyframes llBotFabBreath{
          0%, 100% { box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 3px rgba(124,77,255,0.16); }
          50% { box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 7px rgba(124,77,255,0.26); }
        }
        @media (prefers-reduced-motion: reduce){ .llBotFab{ animation: none; } }
      `}</style>

      <button
        type="button"
        className="llBotFab"
        onClick={(e) => {
          e.stopPropagation();
          onClickFab();
        }}
        title="LunaBot"
        aria-label="Ouvrir le menu LunaBot"
      >
        🤖
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
