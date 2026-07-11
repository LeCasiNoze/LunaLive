// web/src/components/events/EventAvatar.tsx
import * as React from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

// Miroir de DEFAULT_AVATARS (api/src/routes/auth.ts) — l'avatar par défaut
// est déterministe (userId % 18), on peut donc résoudre le fallback côté
// front sans toucher aux réponses API. Fichiers statiques web/public/Avatar/.
const DEFAULT_AVATARS = [
  "/Avatar/avatar_alien.png",
  "/Avatar/avatar_bleu.png",
  "/Avatar/avatar_chat.png",
  "/Avatar/avatar_chevalier.png",
  "/Avatar/avatar_clown.png",
  "/Avatar/avatar_demon.png",
  "/Avatar/avatar_ghost.png",
  "/Avatar/avatar_mage.png",
  "/Avatar/avatar_ninja.png",
  "/Avatar/avatar_orange.png",
  "/Avatar/avatar_panda.png",
  "/Avatar/avatar_phara.png",
  "/Avatar/avatar_renard.png",
  "/Avatar/avatar_robot.png",
  "/Avatar/avatar_rose.png",
  "/Avatar/avatar_sam.png",
  "/Avatar/avatar_santa.png",
  "/Avatar/avatar_scient.png",
];

function initialsOf(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

// Avatar rond : upload perso via /avatars/u/{userId} (404 si aucun upload)
// → avatar par défaut du site (déterministe par userId) → initiales en
// ultime secours (fichier manquant / userId invalide).
export function EventAvatar({
  userId,
  username,
  size = 44,
  className,
}: {
  userId: number;
  username: string;
  size?: number;
  className?: string;
}) {
  // 0 = upload perso, 1 = défaut du site, 2 = initiales
  // userId absent/invalide (ex. API pas encore déployée) → initiales direct.
  const [stage, setStage] = React.useState(userId > 0 ? 0 : 2);
  React.useEffect(() => setStage(userId > 0 ? 0 : 2), [userId]);
  const src =
    stage === 0
      ? `${API_BASE}/avatars/u/${userId}?v=${Math.floor(Date.now() / 60000)}`
      : DEFAULT_AVATARS[((userId % DEFAULT_AVATARS.length) + DEFAULT_AVATARS.length) % DEFAULT_AVATARS.length];

  return (
    <div
      className={`evAvatar${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {stage < 2 ? (
        <img src={src} alt={username} loading="lazy" onError={() => setStage((s) => s + 1)} />
      ) : (
        <span>{initialsOf(username)}</span>
      )}
    </div>
  );
}
