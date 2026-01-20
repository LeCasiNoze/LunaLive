// web/src/components/AchievementsToast.tsx
import * as React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getMyAchievements, type ApiAchievement } from "../lib/api";

type ToastItem = {
  id: string;
  icon: string;
  name: string;
  rewardPreview?: string | null;
};

const SHOW_MS = 5000;
const POLL_MS = 25000;

export function AchievementsToast() {
  const { token } = useAuth() as any;
  const location = useLocation();

  const seenUnlocked = React.useRef<Set<string>>(new Set());
  const didInit = React.useRef(false);

  function dispatchAchievementToast(item: ToastItem) {
    const rewardText =
      item.rewardPreview && String(item.rewardPreview).trim().length ? item.rewardPreview : "À définir";

    window.dispatchEvent(
      new CustomEvent("ui:toast", {
        detail: {
          kind: "info",
          slot: "top",
          sound: "achievement",
          durationMs: SHOW_MS,
          dismissible: true,
          title: "Succès terminé !",
          message: `${item.icon || "🏆"} ${item.name || "Succès"} — 🎁 ${rewardText}`,
          action: {
            label: "Voir",
            event: "ui:achievements_open",
            detail: { achievementId: item.id },
            dismissOnClick: true,
          },
        },
      })
    );
  }

  const check = React.useCallback(async () => {
    if (!token) return;

    const r = await getMyAchievements(token);
    const list: ApiAchievement[] = r?.achievements ?? [];
    const unlockedNow = list.filter((a) => a.unlocked);

    // 1ère fois : on initialise sans spam
    if (!didInit.current) {
      for (const a of unlockedNow) seenUnlocked.current.add(a.id);
      didInit.current = true;
      return;
    }

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
      // on envoie tout, CallsToast queue derrière
      for (const it of newly) dispatchAchievementToast(it);
    }
  }, [token]);

  // reset quand on change de user/token
  React.useEffect(() => {
    didInit.current = false;
    seenUnlocked.current = new Set();
    if (token) check().catch(() => {});
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

  return null;
}
