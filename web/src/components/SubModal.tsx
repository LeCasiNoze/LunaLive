import * as React from "react";

export function SubModal({
  open,
  onClose,
  streamerName,
  priceRubis,
  myRubis,
  onPayRubis,
  onGoShop,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  streamerName: string;
  priceRubis: number;
  myRubis: number;
  onPayRubis: () => void;
  onGoShop: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  if (!open) return null;

  const canPay = myRubis >= priceRubis;

  return (
    <div
      className="chatSheetBackdrop"
      onClick={onClose}
      role="presentation"
      style={{ zIndex: 50 }}
    >
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 520 }}
      >
        <div className="chatSheetTop">
          <div style={{ fontWeight: 950 }}>S’abonner</div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="chatSheetBody" style={{ padding: 16 }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>
            Deviens sub de <span style={{ opacity: 0.95 }}>{streamerName}</span>
          </div>

          <div className="mutedSmall" style={{ marginTop: 8, lineHeight: 1.4 }}>
            Avantages (MVP) :
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              <li>Badge sub dans le chat</li>
              <li>Accès à des emotes / cosmetic (plus tard)</li>
              <li>Support direct au streamer (pondéré selon tes rubis)</li>
            </ul>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall">Prix</div>
            <div style={{ fontWeight: 950, fontSize: 18 }}>
              {priceRubis.toLocaleString()} rubis
            </div>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Ton solde : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{myRubis.toLocaleString()}</strong>
            </div>
          </div>

          {error ? (
            <div className="mutedSmall" style={{ marginTop: 10, color: "rgba(255,90,90,0.95)" }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              type="button"
              className="btnPrimarySmall"
              disabled={loading || !canPay}
              onClick={onPayRubis}
              title={!canPay ? "Solde insuffisant" : "Payer en rubis"}
              style={{ flex: 1 }}
            >
              {loading ? "…" : `Payer en rubis (${priceRubis})`}
            </button>

            <button
              type="button"
              className="btnGhostSmall"
              disabled={loading}
              onClick={onGoShop}
              style={{ flex: 1 }}
            >
              Acheter des rubis
            </button>
          </div>

          {!canPay ? (
            <div className="mutedSmall" style={{ marginTop: 10 }}>
              Solde insuffisant. Tu peux acheter des rubis (shop branché plus tard).
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
