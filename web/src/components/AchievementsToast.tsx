import * as React from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getMyAchievements, type ApiAchievement } from "../lib/api";

type ToastItem = {
  id: string;
  icon: string;
  name: string;
  rewardPreview?: string | null;
};

const SHOW_MS = 5000;       // tu voulais 5s -> ok
const POLL_MS = 25000;      // check toutes les 25s (léger + assez réactif)

export function AchievementsToast() {
  const { token } = useAuth() as any;
  const location = useLocation();

  const seenUnlocked = React.useRef<Set<string>>(new Set());
  const didInit = React.useRef(false);

  const queue = React.useRef<ToastItem[]>([]);
  const [current, setCurrent] = React.useState<ToastItem | null>(null);
  const timer = React.useRef<number | null>(null);

  const pump = React.useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (current) return;

    const next = queue.current.shift() ?? null;
    if (!next) return;

    setCurrent(next);
    timer.current = window.setTimeout(() => {
      setCurrent(null);
    }, SHOW_MS);
  }, [current]);

  // quand current retombe à null -> afficher le suivant
  React.useEffect(() => {
    if (!current) pump();
  }, [current, pump]);

  const check = React.useCallback(async () => {
    if (!token) return;

    const r = await getMyAchievements(token);
    const list: ApiAchievement[] = r?.achievements ?? [];

    const unlockedNow = list.filter((a) => a.unlocked);

    // 1ère fois : on initialise l’état “vu” sans spammer de toasts
    if (!didInit.current) {
      for (const a of unlockedNow) seenUnlocked.current.add(a.id);
      didInit.current = true;
      return;
    }

    // détecte les nouveaux unlocked
    const newly: ToastItem[] = [];
    for (const a of unlockedNow) {
      if (!seenUnlocked.current.has(a.id)) {
        seenUnlocked.current.add(a.id);
        newly.push({
          id: a.id,
          icon: a.icon || "🏆",
          name: a.name || "Succès",
          rewardPreview: a.rewardPreview ?? null,
        });
      }
    }

    if (newly.length) {
      queue.current.push(...newly);
      pump();
    }
  }, [token, pump]);

  // reset quand on change de user/token
  React.useEffect(() => {
    didInit.current = false;
    seenUnlocked.current = new Set();
    queue.current = [];
    setCurrent(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;

    if (token) {
      // init immédiat
      check().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // poll + refresh à la navigation + au focus
  React.useEffect(() => {
    if (!token) return;

    const id = window.setInterval(() => {
      check().catch(() => {});
    }, POLL_MS);

    const onFocus = () => check().catch(() => {});
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, check]);

  React.useEffect(() => {
    if (!token) return;
    check().catch(() => {});
  }, [location.pathname, token, check]);

  if (!current) return null;

  const rewardText =
    current.rewardPreview && String(current.rewardPreview).trim().length
      ? current.rewardPreview
      : "À définir";

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 18,
        bottom: `calc(18px + env(safe-area-inset-bottom))`,
        zIndex: 2147483646,
        maxWidth: "min(420px, calc(100vw - 36px))",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "12px 14px",
          borderRadius: 16,
          background: "rgba(11,11,16,0.96)", // opaque
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1 }}>{current.icon}</div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>
            Bien joué, succès terminé !
          </div>

          <div
            style={{
              marginTop: 2,
              fontWeight: 900,
              opacity: 0.95,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={current.name}
          >
            {current.name}
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            🎁 Récompense : <span style={{ opacity: 0.95 }}>{rewardText}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
