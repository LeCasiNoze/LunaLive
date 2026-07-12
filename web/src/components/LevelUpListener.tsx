// web/src/components/LevelUpListener.tsx
// Écoute GLOBALE du passage de niveau : monté au niveau App, une socket
// authentifiée rejoint la room user:{id} (côté serveur) et reçoit "xp:levelup"
// → affiche la pop-up d'animation N'IMPORTE OÙ sur le site.
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";
import { LevelUpPopup, type LevelUpData } from "./LevelUpPopup";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

export function LevelUpListener() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<LevelUpData | null>(null);

  React.useEffect(() => {
    if (!token) return;
    const socket: Socket = io(apiBase(), {
      transports: ["websocket", "polling"],
      withCredentials: false,
      auth: { token },
    });
    socket.on("xp:levelup", (p: any) => {
      if (!p || p.level == null) return;
      setData({ level: Number(p.level), title: p.title ?? null, tier: Number(p.tier ?? 0) });
      setOpen(false);
      requestAnimationFrame(() => setOpen(true));
    });
    return () => { try { socket.disconnect(); } catch {} };
  }, [token]);

  return <LevelUpPopup open={open} data={data} onClose={() => setOpen(false)} />;
}

export default LevelUpListener;
