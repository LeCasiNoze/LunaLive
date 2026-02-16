// web/src/components/SubModal.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — SubModal
//  Refonte UX : hiérarchie claire, espacement généreux, actions évidentes
// ══════════════════════════════════════════════════════════════
import * as React from "react";

const SUB_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.sub-backdrop {
  position:fixed; inset:0; z-index:90;
  background:rgba(0,0,0,.68);
  backdrop-filter:blur(10px);
  display:grid; place-items:center; padding:16px;
  animation:sub-fade-in 180ms ease;
}

@keyframes sub-fade-in {
  from { opacity:0; }
  to { opacity:1; }
}

.sub-panel {
  width:min(540px,96vw);
  border-radius:22px;
  border:1px solid rgba(124,92,252,.24);
  background:rgba(11,9,22,.96);
  backdrop-filter:blur(20px);
  box-shadow:0 32px 90px rgba(0,0,0,.65);
  position:relative;
  overflow:hidden;
  animation:sub-slide-up 220ms ease both;
}

@keyframes sub-slide-up {
  from { opacity:0; transform:translateY(20px) scale(.97); }
  to { opacity:1; transform:translateY(0) scale(1); }
}

.sub-panel::before {
  content:"";
  position:absolute; top:0; left:8%; right:8%; height:1px;
  pointer-events:none; z-index:3;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.24) 62%,transparent);
}

.sub-header {
  padding:16px 18px;
  border-bottom:1px solid rgba(124,92,252,.14);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  position:relative; z-index:2;
}

.sub-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:17px; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd 0%,#a78bfa 50%,#5b8ef8 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.sub-body {
  padding:20px;
  position:relative; z-index:1;
}

/* Tabs */
.sub-tabs {
  display:grid; grid-template-columns:1fr 1fr; gap:10px;
  margin-bottom:20px;
}

.sub-tab {
  padding:12px 16px; border-radius:14px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.05);
  color:rgba(196,181,253,.65);
  cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:14px;
  text-align:center;
  transition:all 150ms ease;
}

.sub-tab:hover {
  border-color:rgba(124,92,252,.28);
  background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.88);
}

.sub-tab.active {
  border-color:rgba(124,92,252,.42);
  background:linear-gradient(90deg,rgba(124,92,252,.24),rgba(59,77,200,.18),rgba(91,142,248,.16));
  color:rgba(235,232,255,.95);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

/* Info card */
.sub-card {
  padding:16px;
  border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
  margin-bottom:16px;
}

.sub-card-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:12px; letter-spacing:.03em;
  text-transform:uppercase;
  color:rgba(167,139,250,.60);
  margin-bottom:10px;
}

.sub-card-value {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:20px;
  color:rgba(235,232,255,.92);
}

.sub-card-sub {
  font-family:'Syne',system-ui,sans-serif;
  font-size:13px; font-weight:600;
  color:rgba(167,139,250,.65);
  margin-top:8px;
  line-height:1.4;
}

/* Balance display */
.sub-balance {
  display:flex; gap:10px; align-items:baseline;
  margin-top:12px;
}

.sub-balance-item {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 12px; border-radius:999px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(124,92,252,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:12px;
  color:rgba(196,181,253,.85);
}

/* Benefits list */
.sub-benefits {
  margin:16px 0;
  padding-left:0;
  list-style:none;
}

.sub-benefits li {
  padding:10px 0;
  display:flex; align-items:center; gap:10px;
  font-family:'Syne',system-ui,sans-serif;
  font-weight:600; font-size:13px;
  color:rgba(196,181,253,.75);
  border-bottom:1px solid rgba(124,92,252,.08);
}

.sub-benefits li:last-child { border-bottom:none; }

.sub-benefits li::before {
  content:"✓";
  display:inline-flex; align-items:center; justify-content:center;
  width:20px; height:20px; flex-shrink:0;
  border-radius:6px;
  background:rgba(124,92,252,.18);
  color:rgba(196,181,253,.95);
  font-weight:800; font-size:12px;
}

/* Gift input */
.sub-input-group {
  display:flex; gap:10px; align-items:center;
  margin-bottom:14px;
}

.sub-input {
  flex:1;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:15px;
  outline:none;
  transition:border-color 140ms, box-shadow 140ms;
}

.sub-input:focus {
  border-color:rgba(124,92,252,.42);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.sub-input::placeholder { color:rgba(167,139,250,.45); }

/* Actions */
.sub-actions {
  display:flex; gap:10px; margin-top:18px;
}

.sub-actions > button {
  flex:1;
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800;
}

/* Error */
.sub-error {
  margin-top:12px;
  padding:12px 14px; border-radius:12px;
  border:1px solid rgba(239,68,68,.28);
  background:rgba(239,68,68,.08);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:600; font-size:13px;
  color:rgba(252,165,165,.92);
}

/* Warning badge */
.sub-warning {
  margin-top:10px;
  padding:10px 12px; border-radius:10px;
  border:1px solid rgba(251,191,36,.22);
  background:rgba(251,191,36,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:600; font-size:12px;
  color:rgba(253,230,138,.85);
  display:flex; align-items:center; gap:8px;
}

.sub-warning::before {
  content:"⚠️"; font-size:14px;
}

/* Ticket badge */
.sub-ticket-badge {
  margin-top:12px;
  padding:10px 12px; border-radius:10px;
  border:1px solid rgba(52,211,153,.24);
  background:rgba(52,211,153,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:12px;
  color:rgba(110,231,183,.90);
  display:flex; align-items:center; gap:8px;
}

.sub-ticket-badge::before {
  content:"✅"; font-size:14px;
}

/* Gift summary */
.sub-gift-summary {
  margin-top:14px;
  padding:12px;
  border-radius:12px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(124,92,252,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-size:13px;
  color:rgba(196,181,253,.80);
}

.sub-gift-summary strong {
  color:rgba(235,232,255,.95);
  font-weight:800;
}
`;

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
  mySubTickets = 0,
  disableSelfTicket = false,
  onPaySelf,
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
  mySubTickets?: number;
  disableSelfTicket?: boolean;
  onPaySelf?: (mode: "rubis" | "ticket") => void;
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
  const selfTicketUsable = tickets > 0 && !disableSelfTicket;
  const canPaySelf = selfTicketUsable || myRubis >= priceRubis;

  const giftCountInt = Math.max(0, Math.min(100, Math.floor(Number(giftCount || 0))));
  const giftTotal = giftCountInt * priceRubis;
  const giftTicketsUsable = Math.min(tickets, giftCountInt);
  const giftRubisNeeded = Math.max(0, giftTotal - giftTicketsUsable * priceRubis);
  const canPayGift = giftCountInt > 0 && myRubis >= giftRubisNeeded;

  function ticketsSuffix(n: number) {
    if (n <= 0) return "";
    return n === 1 ? "1 ticket" : `${n} tickets`;
  }

  function formatPayLabel(rubisNeeded: number, ticketsUsed: number) {
    const parts: string[] = [];
    if (rubisNeeded > 0) parts.push(`${rubisNeeded.toLocaleString()} 💎`);
    if (ticketsUsed > 0) parts.push(`${ticketsUsed} 🎟️`);
    return parts.join(" + ") || "0";
  }

  const showTicketsInline = tickets > 0;

  return (
    <div className="sub-backdrop" onClick={onClose} role="presentation">
      <style>{SUB_STYLES}</style>
      <div className="sub-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        
        {/* Header */}
        <div className="sub-header">
          <span className="sub-title">{tab === "self" ? "S'abonner" : "Offrir des subs"}</span>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">✕</button>
        </div>

        <div className="sub-body">
          
          {/* Tabs */}
          <div className="sub-tabs">
            <button type="button" className={`sub-tab${tab === "self" ? " active" : ""}`} onClick={() => setTab("self")}>
              Pour moi
            </button>
            <button type="button" className={`sub-tab${tab === "gift" ? " active" : ""}`} onClick={() => setTab("gift")}>
              Offrir des subs
            </button>
          </div>

          {/* ════════════════════════════════════════════
              TAB: SELF
          ════════════════════════════════════════════ */}
          {tab === "self" ? (
            <>
              {/* Streamer name */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, fontSize:14, color:"rgba(167,139,250,.65)", marginBottom:6 }}>
                  Tu deviens sub de
                </div>
                <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, fontSize:22, letterSpacing:-.3,
                  background:"linear-gradient(90deg,#c4b5fd,#a78bfa)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
                  {streamerName}
                </div>
              </div>

              {/* Benefits */}
              <div className="sub-card">
                <div className="sub-card-title">Avantages</div>
                <ul className="sub-benefits">
                  <li>Badge sub dans le chat</li>
                  <li>Accès emotes exclusives (à venir)</li>
                  <li>Soutien direct au streamer</li>
                </ul>
              </div>

              {/* Price + balance */}
              <div className="sub-card">
                <div className="sub-card-title">Prix</div>
                <div className="sub-card-value">{priceRubis.toLocaleString()} 💎</div>
                
                <div className="sub-balance">
                  <div className="sub-balance-item">
                    💎 {myRubis.toLocaleString()}
                  </div>
                  {showTicketsInline ? (
                    <div className="sub-balance-item">
                      🎟️ {ticketsSuffix(tickets)}
                    </div>
                  ) : null}
                </div>

                {/* Warnings / badges */}
                {disableSelfTicket && tickets > 0 ? (
                  <div className="sub-warning">
                    Tu ne peux pas utiliser un ticket pour te sub à ta propre chaîne.
                  </div>
                ) : null}

                {selfTicketUsable ? (
                  <div className="sub-ticket-badge">
                    Un ticket est disponible : coût en rubis = <strong>0</strong>
                  </div>
                ) : null}
              </div>

              {/* Error */}
              {error ? <div className="sub-error">{error}</div> : null}

              {/* Actions */}
              <div className="sub-actions">
                <button type="button" className="btnGhostSmall" disabled={loading} onClick={onGoShop}>
                  Acheter des rubis
                </button>
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
                  title={!canPaySelf ? "Solde insuffisant" : selfTicketUsable ? "Utiliser ton ticket" : "Payer en rubis"}>
                  {loading ? "…" : selfTicketUsable ? "Utiliser mon ticket" : `Payer ${priceRubis} 💎`}
                </button>
              </div>

              {!canPaySelf ? (
                <div style={{ marginTop:12, fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif", textAlign:"center" }}>
                  Solde insuffisant. Tu peux acheter des rubis dans la boutique.
                </div>
              ) : null}
            </>
          ) : null}

          {/* ════════════════════════════════════════════
              TAB: GIFT
          ════════════════════════════════════════════ */}
          {tab === "gift" ? (
            <>
              {/* Streamer name */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, fontSize:14, color:"rgba(167,139,250,.65)", marginBottom:6 }}>
                  Offrir des subs sur
                </div>
                <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, fontSize:22, letterSpacing:-.3,
                  background:"linear-gradient(90deg,#c4b5fd,#a78bfa)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
                  {streamerName}
                </div>
              </div>

              {/* Explanation */}
              <div className="sub-card">
                <div className="sub-card-sub">
                  Tu payes un pack, et des viewers pourront <strong>claim</strong> un sub tant qu'il en reste.
                </div>
              </div>

              {/* Count input */}
              <div className="sub-card">
                <div className="sub-card-title">Nombre de subs à offrir</div>
                <div className="sub-input-group">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={giftCount}
                    onChange={e => setGiftCount(Number(e.target.value))}
                    className="sub-input"
                    placeholder="5"
                  />
                </div>

                {/* Summary */}
                <div className="sub-gift-summary">
                  Coût total : <strong>{formatPayLabel(giftRubisNeeded, giftTicketsUsable)}</strong>
                  {giftTicketsUsable > 0 ? (
                    <span style={{ opacity:.75 }}> (au lieu de {giftTotal.toLocaleString()} 💎)</span>
                  ) : null}
                </div>

                {/* Balance */}
                <div className="sub-balance">
                  <div className="sub-balance-item">
                    💎 {myRubis.toLocaleString()}
                  </div>
                  {showTicketsInline ? (
                    <div className="sub-balance-item">
                      🎟️ {ticketsSuffix(tickets)}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Error */}
              {giftError ? <div className="sub-error">{giftError}</div> : null}

              {/* Actions */}
              <div className="sub-actions">
                <button type="button" className="btnGhostSmall" disabled={giftLoading} onClick={onGoShop}>
                  Acheter des rubis
                </button>
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={giftLoading || !canPayGift || !onPayGiftSubs || giftCountInt <= 0}
                  onClick={() => onPayGiftSubs?.(giftCountInt, giftTicketsUsable)}
                  title={!canPayGift ? "Solde insuffisant" : "Payer le pack"}>
                  {giftLoading ? "…" : `Payer ${formatPayLabel(giftRubisNeeded, giftTicketsUsable)}`}
                </button>
              </div>

              {!canPayGift ? (
                <div style={{ marginTop:12, fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif", textAlign:"center" }}>
                  Solde insuffisant pour ce pack.
                </div>
              ) : null}
            </>
          ) : null}

        </div>
      </div>
    </div>
  );
}