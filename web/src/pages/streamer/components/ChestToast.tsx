// web/src/pages/streamer/components/ChestToast.tsx
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
  const { toast, isOwner, canJoinNow, alreadyJoined, joinLoading, onJoin, onView, error, onClose } = props;

  if (!toast || isOwner) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 999,
        width: 320,
        maxWidth: "calc(100vw - 32px)",
        padding: 12,
        borderRadius: 16,
        background: "rgba(17,10,23,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 950 }}>🎁 Coffre ouvert !</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.75)",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
        Conditions : être sur le live + {toast.minWatchMinutes ?? 5} min de watchtime.
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          className="btnPrimarySmall"
          disabled={joinLoading || alreadyJoined || !canJoinNow}
          onClick={(e) => {
            e.stopPropagation();
            onJoin();
          }}
          style={{ flex: 1 }}
        >
          {alreadyJoined ? "Déjà inscrit" : joinLoading ? "…" : "Participer"}
        </button>
        <button type="button" className="btnGhostSmall" onClick={onView} style={{ whiteSpace: "nowrap" }}>
          Voir
        </button>
      </div>

      {error ? <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{error}</div> : null}
    </div>
  );
}
