// web/src/components/SubModal.tsx
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

  // ✅ NEW: afficher tickets (sub_ticket)
  mySubTickets,

  // ✅ NEW (gift pool)
  onPayGiftSubs,
  giftLoading,
  giftError,
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

  // ✅ NEW: tickets disponibles (si > 0 on affiche)
  mySubTickets?: number | null;

  onPayGiftSubs?: (count: number) => void;
  giftLoading?: boolean;
  giftError?: string | null;
}) {
  const [tab, setTab] = React.useState<"self" | "gift">("self");
  const [giftCount, setGiftCount] = React.useState<number>(5);

  React.useEffect(() => {
    if (!open) return;
    setTab("self");
    setGiftCount(5);
  }, [open]);

  if (!open) return null;

  const canPaySelf = myRubis >= priceRubis;

  const giftTotal = Math.max(0, Math.floor(giftCount || 0)) * priceRubis;
  const canPayGift = giftTotal > 0 && myRubis >= giftTotal;

  const tickets = Math.max(0, Math.floor(Number(mySubTickets ?? 0) || 0));
  const showTickets = tickets > 0;
  const ticketLabel = tickets === 1 ? "ticket" : "tickets";

  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex: 50 }}>
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 520 }}
      >
        <div className="chatSheetTop">
          <div style={{ fontWeight: 950 }}>{tab === "self" ? "S’abonner" : "Offrir des subs"}</div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="chatSheetBody" style={{ padding: 16 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              className={tab === "self" ? "btnPrimarySmall" : "btnGhostSmall"}
              onClick={() => setTab("self")}
              style={{ flex: 1 }}
            >
              Pour moi
            </button>
            <button
              type="button"
              className={tab === "gift" ? "btnPrimarySmall" : "btnGhostSmall"}
              onClick={() => setTab("gift")}
              style={{ flex: 1 }}
            >
              Offrir des subs
            </button>
          </div>

          {tab === "self" ? (
            <>
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
                <div style={{ fontWeight: 950, fontSize: 18 }}>{priceRubis.toLocaleString()} rubis</div>

                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  Ton solde :{" "}
                  <strong style={{ color: "rgba(255,255,255,0.9)" }}>{myRubis.toLocaleString()}</strong>
                  {showTickets ? (
                    <span style={{ opacity: 0.9 }}>
                      {" "}
                      ({tickets.toLocaleString()} {ticketLabel})
                    </span>
                  ) : null}
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
                  disabled={loading || !canPaySelf}
                  onClick={onPayRubis}
                  title={!canPaySelf ? "Solde insuffisant" : "Payer en rubis"}
                  style={{ flex: 1 }}
                >
                  {loading ? "…" : `Payer en rubis (${priceRubis})`}
                </button>

                <button type="button" className="btnGhostSmall" disabled={loading} onClick={onGoShop} style={{ flex: 1 }}>
                  Acheter des rubis
                </button>
              </div>

              {!canPaySelf ? (
                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Solde insuffisant. Tu peux acheter des rubis (shop branché plus tard).
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 950, fontSize: 16 }}>
                Offre des subs sur <span style={{ opacity: 0.95 }}>{streamerName}</span>
              </div>

              <div className="mutedSmall" style={{ marginTop: 8, lineHeight: 1.4 }}>
                Tu payes un pack, et des viewers pourront <strong>claim</strong> un sub tant qu’il en reste.
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall">Nombre de subs</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={giftCount}
                    onChange={(e) => setGiftCount(Number(e.target.value))}
                    style={{
                      width: 120,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      fontWeight: 800,
                    }}
                  />
                  <div className="mutedSmall" style={{ opacity: 0.9 }}>
                    Total :{" "}
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>{giftTotal.toLocaleString()}</strong> rubis
                  </div>
                </div>

                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Ton solde :{" "}
                  <strong style={{ color: "rgba(255,255,255,0.9)" }}>{myRubis.toLocaleString()}</strong>
                  {showTickets ? (
                    <span style={{ opacity: 0.9 }}>
                      {" "}
                      ({tickets.toLocaleString()} {ticketLabel})
                    </span>
                  ) : null}
                </div>
              </div>

              {giftError ? (
                <div className="mutedSmall" style={{ marginTop: 10, color: "rgba(255,90,90,0.95)" }}>
                  {giftError}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={giftLoading || !canPayGift || !onPayGiftSubs}
                  onClick={() => onPayGiftSubs?.(Math.max(1, Math.min(100, Math.floor(giftCount || 0))))}
                  title={!canPayGift ? "Solde insuffisant" : "Payer le pack"}
                  style={{ flex: 1 }}
                >
                  {giftLoading ? "…" : `Payer (${giftTotal.toLocaleString()})`}
                </button>

                <button type="button" className="btnGhostSmall" disabled={giftLoading} onClick={onGoShop} style={{ flex: 1 }}>
                  Acheter des rubis
                </button>
              </div>

              {!canPayGift ? (
                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Solde insuffisant pour ce pack.
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
