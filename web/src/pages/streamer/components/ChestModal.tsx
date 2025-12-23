// web/src/pages/streamer/components/ChestModal.tsx
import * as React from "react";
import type { ChestState } from "../hooks/useChest";

export function ChestModal(props: {
  open: boolean;
  onClose: () => void;

  chestLoading: boolean;
  chestBalance: number;
  chest: ChestState | null;

  opening: ChestState["opening"];
  remainingSec: number;
  progress: number;

  error: string | null;

  onRefresh: () => void;

  // viewer join
  isOwner: boolean;
  openingId: string | null;
  alreadyJoined: boolean;
  joinLoading: boolean;
  onJoin: () => void;

  // owner open (2 min)
  isLive: boolean;
  chestHasOpen: boolean;
  ownerLoading: boolean;
  onOpen: () => void;

  // owner deposit
  depositAmount: string;
  setDepositAmount: (v: string) => void;
  depositNote: string;
  setDepositNote: (v: string) => void;
  depositLoading: boolean;
  onDeposit: () => void;
}) {
  const {
    open,
    onClose,
    chestLoading,
    chestBalance,
    chest,
    opening,
    remainingSec,
    progress,
    error,
    onRefresh,
    isOwner,
    openingId,
    alreadyJoined,
    joinLoading,
    onJoin,
    isLive,
    chestHasOpen,
    ownerLoading,
    onOpen,
    depositAmount,
    setDepositAmount,
    depositNote,
    setDepositNote,
    depositLoading,
    onDeposit,
  } = props;

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 998,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100%",
          borderRadius: 18,
          background: "rgba(17,10,23,0.96)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 18px 80px rgba(0,0,0,0.55)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>🎁 Coffre du streamer</div>
          <button className="iconBtn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Montant :</div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>{chestLoading ? "…" : chestBalance}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>rubis</div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Sortie max du coffre : <strong>0.20</strong> (cap sécurité).
        </div>

        {opening ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontWeight: 900 }}>Coffre ouvert</div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Participants : <strong>{Number(opening.participantsCount || 0)}</strong> • Watch min :{" "}
              <strong>{Number(opening.minWatchMinutes || 5)} min</strong>
            </div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Fermeture auto dans : <strong>{remainingSec}s</strong>
            </div>

            <div
              style={{
                marginTop: 10,
                height: 8,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(255,255,255,0.10)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(progress * 100)}%`,
                  background: "rgba(140,90,255,0.85)",
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>Aucun coffre ouvert actuellement.</div>
        )}

        {/* breakdown */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.9 }}>Répartition (poids → rubis)</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {chest?.breakdown && Object.keys(chest.breakdown).length ? (
              Object.entries(chest.breakdown)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([w, a]) => (
                  <div
                    key={w}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 12,
                    }}
                  >
                    <strong>{(Number(w) / 10_000).toFixed(2)}</strong> → {Number(a)}
                  </div>
                ))
            ) : (
              <div style={{ fontSize: 12, opacity: 0.75 }}>—</div>
            )}
          </div>
        </div>

        {error ? <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="btnGhostSmall" onClick={onRefresh} disabled={chestLoading}>
            {chestLoading ? "…" : "Rafraîchir"}
          </button>

          {/* Viewer: join */}
          {!isOwner && openingId ? (
            <button type="button" className="btnPrimarySmall" onClick={onJoin} disabled={joinLoading || alreadyJoined}>
              {alreadyJoined ? "Déjà inscrit" : joinLoading ? "…" : "Participer"}
            </button>
          ) : null}

          {/* Owner: open only (NO close) */}
          {isOwner && !chestHasOpen ? (
            <button
              type="button"
              className="btnPrimarySmall"
              onClick={onOpen}
              disabled={ownerLoading || !isLive}
              title={!isLive ? "Stream offline" : "Ouvre 2 minutes (fermeture auto)"}
            >
              {ownerLoading ? "…" : "Ouvrir coffre (2 min)"}
            </button>
          ) : null}
        </div>

        {/* Owner: deposit block */}
        {isOwner ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontWeight: 900 }}>Déposer des rubis dans le coffre</div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                inputMode="numeric"
                placeholder="Montant"
                style={{
                  width: 140,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "white",
                  outline: "none",
                }}
              />

              <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("50")}>
                +50
              </button>
              <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("100")}>
                +100
              </button>
              <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("250")}>
                +250
              </button>
              <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("500")}>
                +500
              </button>
            </div>

            <input
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              placeholder="Note (optionnel)"
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button type="button" className="btnPrimarySmall" onClick={onDeposit} disabled={depositLoading}>
                {depositLoading ? "…" : "Déposer"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
