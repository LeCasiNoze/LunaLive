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

  // ✅ tickets (sub_ticket)
  mySubTickets = 0,
  // ✅ si true: interdit d'utiliser un ticket pour "pour moi" (ex: owner de la chaîne)
  disableSelfTicket = false,

  // ✅ NEW (self mode)
  onPaySelf,

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

  // legacy (rubis)
  onPayRubis: () => void;

  onGoShop: () => void;
  loading?: boolean;
  error?: string | null;

  // ✅ tickets
  mySubTickets?: number;
  disableSelfTicket?: boolean;

  // ✅ self: "rubis" | "ticket"
  onPaySelf?: (mode: "rubis" | "ticket") => void;

  // gift: on peut passer le nb de tickets à consommer
  onPayGiftSubs?: (count: number, useTickets?: number) => void;
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

  const tickets = Math.max(0, Math.floor(Number(mySubTickets || 0)));

  // ──────────────────────────────────────────
  // SELF
  // ──────────────────────────────────────────
  const selfTicketUsable = tickets > 0 && !disableSelfTicket;
  const canPaySelf = selfTicketUsable || myRubis >= priceRubis;

  // ──────────────────────────────────────────
  // GIFT
  // ──────────────────────────────────────────
  const giftCountInt = Math.max(0, Math.min(100, Math.floor(Number(giftCount || 0))));
  const giftTotal = giftCountInt * priceRubis;

  // 1 ticket = 1 sub => réduit priceRubis par ticket utilisé
  const giftTicketsUsable = Math.min(tickets, giftCountInt);
  const giftRubisNeeded = Math.max(0, giftTotal - giftTicketsUsable * priceRubis);
  const canPayGift = giftCountInt > 0 && myRubis >= giftRubisNeeded;

  function ticketsSuffix(n: number) {
    if (n <= 0) return "";
    return n === 1 ? "1 ticket" : `${n} tickets`;
  }

  function formatPayLabel(rubisNeeded: number, ticketsUsed: number) {
    const parts: string[] = [];
    parts.push(String(rubisNeeded.toLocaleString()));
    if (ticketsUsed > 0) parts.push(ticketsSuffix(ticketsUsed));
    return parts.join(" + ");
  }

  const showTicketsInline = tickets > 0;

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
                  {showTicketsInline ? <span style={{ opacity: 0.85 }}> ({ticketsSuffix(tickets)})</span> : null}
                </div>

                {disableSelfTicket && tickets > 0 ? (
                  <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.9 }}>
                    ⚠️ Tu ne peux pas utiliser un ticket pour te sub à ta propre chaîne.
                  </div>
                ) : null}

                {selfTicketUsable ? (
                  <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.9 }}>
                    ✅ Un ticket est disponible : coût en rubis = <strong>0</strong>
                  </div>
                ) : null}
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
                  onClick={() => {
                    if (selfTicketUsable) {
                      if (onPaySelf) return onPaySelf("ticket");
                      return onPayRubis();
                    }
                    if (onPaySelf) return onPaySelf("rubis");
                    return onPayRubis();
                  }}
                  title={!canPaySelf ? "Solde insuffisant" : selfTicketUsable ? "Utiliser ton ticket" : "Payer en rubis"}
                  style={{ flex: 1 }}
                >
                  {loading ? "…" : selfTicketUsable ? "Utiliser ton ticket" : `Payer en rubis (${priceRubis})`}
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
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                      {formatPayLabel(giftRubisNeeded, giftTicketsUsable)}
                    </strong>{" "}
                    rubis
                    {giftTicketsUsable > 0 ? (
                      <span style={{ opacity: 0.85 }}> (au lieu de {giftTotal.toLocaleString()})</span>
                    ) : null}
                  </div>
                </div>

                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Ton solde :{" "}
                  <strong style={{ color: "rgba(255,255,255,0.9)" }}>{myRubis.toLocaleString()}</strong>
                  {showTicketsInline ? <span style={{ opacity: 0.85 }}> ({ticketsSuffix(tickets)})</span> : null}
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
                  disabled={giftLoading || !canPayGift || !onPayGiftSubs || giftCountInt <= 0}
                  onClick={() => onPayGiftSubs?.(giftCountInt, giftTicketsUsable)}
                  title={!canPayGift ? "Solde insuffisant" : "Payer le pack"}
                  style={{ flex: 1 }}
                >
                  {giftLoading ? "…" : `Payer (${formatPayLabel(giftRubisNeeded, giftTicketsUsable)})`}
                </button>

                <button type="button" className="btnGhostSmall" disabled={giftLoading} onClick={onGoShop} style={{ flex: 1 }}>
                  Acheter des rubis
                </button>
              </div>

              {!canPayGift ? <div className="mutedSmall" style={{ marginTop: 10 }}>Solde insuffisant pour ce pack.</div> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
