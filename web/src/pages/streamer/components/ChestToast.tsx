// web/src/pages/streamer/components/ChestToast.tsx
import * as React from "react";

export function ChestToast(props: {
  toast: null | { openingId: string; minWatchMinutes?: number };
  isOwner: boolean;
  canJoinNow: boolean;
  alreadyJoined: boolean;
  joinLoading: boolean;
  onJoin: () => void;
  onView: () => void;
  error: string | null;
  onClose: () => void;
}) {
  const { toast, isOwner, canJoinNow, alreadyJoined, error } = props;

  const lastKeyRef = React.useRef<string | null>(null);

  // Toast "coffre ouvert" (10s, bas, son)
  React.useEffect(() => {
    if (!toast || isOwner) return;

    const openingId = String(toast.openingId || "");
    if (!openingId) return;

    const key = `chest_open:${openingId}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    const minW = Number(toast.minWatchMinutes ?? 5);
    const canJoin = !!canJoinNow && !alreadyJoined;

    window.dispatchEvent(
      new CustomEvent("ui:toast", {
        detail: {
          kind: "info",
          slot: "bottom",
          sound: "chest",
          title: "🎁 Coffre ouvert !",
          message: `Conditions : être sur le live + ${minW} min de watchtime.`,
          durationMs: 10_000,
          dismissible: true,
          action: canJoin
            ? {
                label: "Participer",
                event: "ui:chest_join",
                detail: { openingId },
                dismissOnClick: true,
              }
            : undefined,
        },
      })
    );
  }, [toast?.openingId, toast?.minWatchMinutes, isOwner, canJoinNow, alreadyJoined]);

  // Erreur coffre (5s, bas, son error, pas de bouton)
  React.useEffect(() => {
    if (!error) return;
    const msg = String(error || "").trim();
    if (!msg) return;

    window.dispatchEvent(
      new CustomEvent("ui:toast", {
        detail: {
          kind: "error",
          slot: "bottom",
          sound: "error",
          title: "Erreur coffre",
          message: msg,
          durationMs: 5000,
          dismissible: true,
        },
      })
    );
  }, [error]);

  return null;
}
