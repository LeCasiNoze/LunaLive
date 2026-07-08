// web/src/components/events/EventAvatar.tsx
import * as React from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function initialsOf(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

// Avatar rond via /avatars/u/{userId} (même endpoint que AvatarMenu.tsx /
// StreamerPage.tsx). Fallback initiales si l'image casse (404, réseau...).
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
  const [broken, setBroken] = React.useState(false);
  const src = `${API_BASE}/avatars/u/${userId}?v=${Math.floor(Date.now() / 60000)}`;

  return (
    <div
      className={`evAvatar${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {!broken ? (
        <img src={src} alt={username} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span>{initialsOf(username)}</span>
      )}
    </div>
  );
}
