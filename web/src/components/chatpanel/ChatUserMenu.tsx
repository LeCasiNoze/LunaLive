// web/src/components/chatpanel/ChatUserMenu.tsx
import * as React from "react";
import type { ChatMsg, JoinAck } from "./chatpanel.helpers";

export type ChatMenuState = {
  open: boolean;
  x: number;
  y: number;
  msg: ChatMsg | null;

  modLoading?: boolean;
  isTargetMod?: boolean | null;

  timeoutLoading?: boolean;
  targetTimeoutUntil?: string | null;

  subLoading?: boolean;
  isTargetSub?: boolean | null;
  giftSubLoading?: boolean;
};

export function ChatUserMenu(props: {
  menu: ChatMenuState;
  setMenu: React.Dispatch<React.SetStateAction<ChatMenuState>>;
  closeMenu: () => void;

  isAuthed: boolean;
  myId: number | null;
  perms?: JoinAck["perms"];
  targetIsSelf: boolean;
  targetIsTimedOut: boolean;

  onGoProfile: (msg: ChatMsg) => void;
  onGiftSub: (msg: ChatMsg) => void;
  onSetMod: (msg: ChatMsg, enabled: boolean) => void;
  onDelete: (msg: ChatMsg) => void;
  onUnmute: (msg: ChatMsg) => void;
  onBan: (msg: ChatMsg) => void;
  onTimeout: (msg: ChatMsg, seconds: number) => void;
}) {
  const {
    menu,
    setMenu,
    closeMenu,
    isAuthed,
    perms,
    targetIsSelf,
    targetIsTimedOut,
    onGoProfile,
    onGiftSub,
    onSetMod,
    onDelete,
    onUnmute,
    onBan,
    onTimeout,
  } = props;

  if (!menu.open || !menu.msg) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 90,
        minWidth: 260,
        maxWidth: 320,
        borderRadius: 16,
        background: "rgba(18,14,26,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 70px rgba(0,0,0,0.60)",
        overflow: "hidden",
        transform: "translate(6px, 6px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header draggable */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();

          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = menu.x;
          const startTop = menu.y;

          const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            const nextX = startLeft + dx;
            const nextY = startTop + dy;

            const w = 320;
            const h = 420;
            const maxX = window.innerWidth - 20;
            const maxY = window.innerHeight - 20;

            setMenu((m) => ({
              ...m,
              x: clamp(nextX, 8, maxX - w),
              y: clamp(nextY, 8, maxY - h),
            }));
          };

          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "linear-gradient(135deg, rgba(124,77,255,0.22), rgba(80,200,255,0.10))",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          cursor: "grab",
          userSelect: "none",
        }}
        title="Glisse pour déplacer"
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 950, fontSize: 13, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>
            {menu.msg.username}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 800, marginTop: 2 }}>Actions utilisateur</div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeMenu();
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontWeight: 950,
            cursor: "pointer",
          }}
          aria-label="Fermer"
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        <button
          onClick={() => onGoProfile(menu.msg!)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            textAlign: "left",
            fontWeight: 950,
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          👤 Voir le profil
        </button>

        {!targetIsSelf && menu.isTargetSub !== true ? (
          <button
            onClick={() => onGiftSub(menu.msg!)}
            disabled={!!menu.giftSubLoading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(80,255,160,0.12)",
              color: "white",
              textAlign: "left",
              fontWeight: 950,
              cursor: "pointer",
              marginBottom: 10,
              opacity: menu.giftSubLoading ? 0.75 : 1,
            }}
            title="Offrir un sub"
          >
            {menu.giftSubLoading ? "🎁 Offre en cours…" : "🎁 Offrir un sub"}
          </button>
        ) : null}

        {!targetIsSelf && isAuthed && menu.subLoading ? (
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>Vérification sub…</div>
        ) : null}

        {!targetIsSelf && isAuthed && menu.isTargetSub === true ? (
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>Déjà abonné ✅</div>
        ) : null}

        {(perms?.canManageMods || perms?.canDelete || perms?.canTimeout || perms?.canBan) ? (
          <div
            style={{
              marginTop: 6,
              marginBottom: 10,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>Modération</div>

            {perms?.canManageMods ? (
              <button
                onClick={() => onSetMod(menu.msg!, !(menu.isTargetMod === true))}
                disabled={!!menu.modLoading || menu.isTargetMod == null}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(80,200,255,0.12)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 950,
                  cursor: "pointer",
                  marginBottom: 10,
                  opacity: menu.isTargetMod == null ? 0.7 : 1,
                }}
              >
                {menu.modLoading ? "Chargement…" : menu.isTargetMod ? "🛡️ Retirer des modérateurs" : "🛡️ Mettre modérateur"}
              </button>
            ) : null}

            {perms?.canDelete ? (
              <button
                onClick={() => onDelete(menu.msg!)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,120,150,0.10)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 900,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                🗑️ Supprimer le message
              </button>
            ) : null}

            {perms?.canTimeout && !targetIsSelf && targetIsTimedOut ? (
              <button
                onClick={() => onUnmute(menu.msg!)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(124,77,255,0.14)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 950,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                🔊 Démute (untimeout)
              </button>
            ) : null}

            {perms?.canBan && !targetIsSelf ? (
              <button
                onClick={() => onBan(menu.msg!)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,60,90,0.20)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 1000,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                ⛔ Bannir
              </button>
            ) : null}

            {perms?.canTimeout && !targetIsSelf ? (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>Timeout</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "10s", sec: 10 },
                    { label: "1m", sec: 60 },
                    { label: "10m", sec: 600 },
                    { label: "1h", sec: 3600 },
                    { label: "24h", sec: 86400 },
                  ].map((x) => (
                    <button
                      key={x.sec}
                      onClick={() => onTimeout(menu.msg!, x.sec)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(124,77,255,0.14)",
                        color: "white",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
