// web/src/pages/streamer/components/ChestModal.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — ChestModal
//  Refonte UX : sections claires, états visuels, progression animée
// ══════════════════════════════════════════════════════════════
import type { ChestState } from "../hooks/useChest";

const CM_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes cm-fade-in {
  from { opacity:0; }
  to { opacity:1; }
}
@keyframes cm-slide-up {
  from { opacity:0; transform:translateY(24px) scale(.96); }
  to { opacity:1; transform:translateY(0) scale(1); }
}
@keyframes cm-progress {
  from { width:0%; }
}

.cm-modal {
  position:fixed; inset:0; z-index:998;
  background:rgba(0,0,0,.68);
  backdrop-filter:blur(10px);
  display:flex; align-items:center; justify-content:center; padding:16px;
  animation:cm-fade-in 180ms ease;
}

.cm-panel {
  width:min(560px,96vw);
  border-radius:22px;
  background:rgba(11,9,22,.97);
  border:1px solid rgba(124,92,252,.24);
  box-shadow:0 32px 90px rgba(0,0,0,.70);
  position:relative; overflow:hidden;
  animation:cm-slide-up 220ms ease both;
}

.cm-panel::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  pointer-events:none; z-index:3;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.24) 62%,transparent);
}

.cm-header {
  padding:16px 18px;
  border-bottom:1px solid rgba(124,92,252,.14);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  position:relative; z-index:2;
}

.cm-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:17px; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.cm-body {
  padding:20px;
  position:relative; z-index:1;
}

.cm-section {
  margin-bottom:18px;
  padding:16px;
  border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
}

.cm-section-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:12px; letter-spacing:.03em;
  text-transform:uppercase;
  color:rgba(167,139,250,.60);
  margin-bottom:10px;
}

.cm-balance {
  display:flex; align-items:baseline; gap:10px;
  font-family:'Syne',system-ui,sans-serif;
}

.cm-balance-value {
  font-weight:800; font-size:28px;
  background:linear-gradient(135deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.cm-balance-unit {
  font-weight:600; font-size:14px;
  color:rgba(167,139,250,.70);
}

.cm-stat {
  display:flex; justify-content:space-between; align-items:center;
  padding:8px 0;
  border-bottom:1px solid rgba(124,92,252,.08);
  font-family:'Syne',system-ui,sans-serif;
  font-size:13px;
}

.cm-stat:last-child { border-bottom:none; }

.cm-stat-label {
  color:rgba(167,139,250,.65);
  font-weight:600;
}

.cm-stat-value {
  color:rgba(235,232,255,.90);
  font-weight:800;
}

.cm-progress-bar {
  margin-top:12px;
  height:10px; border-radius:999px;
  overflow:hidden;
  background:rgba(124,92,252,.12);
  position:relative;
}

.cm-progress-fill {
  height:100%;
  background:linear-gradient(90deg,rgba(167,139,250,.85),rgba(124,92,252,.75));
  border-radius:999px;
  transition:width 800ms ease;
  animation:cm-progress 1.2s ease-in-out;
}

.cm-chip-grid {
  display:flex; flex-wrap:wrap; gap:8px;
  margin-top:10px;
}

.cm-chip {
  padding:7px 12px; border-radius:999px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:11px;
  color:rgba(196,181,253,.85);
}

.cm-input {
  width:100%;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:14px;
  outline:none;
  transition:border-color 140ms, box-shadow 140ms;
}

.cm-input:focus {
  border-color:rgba(124,92,252,.42);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.cm-input::placeholder { color:rgba(167,139,250,.45); }

.cm-actions {
  display:flex; gap:10px; flex-wrap:wrap;
  margin-top:18px;
}

.cm-actions > button {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800;
}

.cm-error {
  margin-top:14px;
  padding:12px 14px; border-radius:12px;
  border:1px solid rgba(239,68,68,.28);
  background:rgba(239,68,68,.08);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:600; font-size:13px;
  color:rgba(252,165,165,.92);
}

.cm-empty {
  padding:16px;
  text-align:center;
  font-family:'Syne',system-ui,sans-serif;
  font-size:13px;
  color:rgba(167,139,250,.55);
}
`;

export function ChestModal(props: {
  open: boolean; onClose: () => void;
  chestLoading: boolean; chestBalance: number; chest: ChestState | null;
  opening: ChestState["opening"]; remainingSec: number; progress: number; error: string | null; onRefresh: () => void;
  isOwner: boolean; openingId: string | null; alreadyJoined: boolean; joinLoading: boolean; onJoin: () => void;
  isLive: boolean; chestHasOpen: boolean; ownerLoading: boolean; onOpen: () => void;
  depositAmount: string; setDepositAmount: (v: string) => void; depositNote: string; setDepositNote: (v: string) => void;
  depositLoading: boolean; onDeposit: () => void;
}) {
  if (!props.open) return null;

  return (
    <div role="presentation" onClick={props.onClose} className="cm-modal">
      <style>{CM_STYLES}</style>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} className="cm-panel">
        
        {/* Header */}
        <div className="cm-header">
          <span className="cm-title">🎁 Coffre du streamer</span>
          <button className="iconBtn" type="button" onClick={props.onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="cm-body">
          
          {/* Balance section */}
          <div className="cm-section">
            <div className="cm-section-title">Montant du coffre</div>
            <div className="cm-balance">
              <span className="cm-balance-value">{props.chestLoading ? "…" : props.chestBalance}</span>
              <span className="cm-balance-unit">rubis</span>
            </div>
            <div style={{ marginTop:10, fontSize:11, color:"rgba(167,139,250,.55)", fontFamily:"'Syne',system-ui,sans-serif" }}>
              Sortie max du coffre : <strong style={{ color:"rgba(196,181,253,.85)" }}>0.20</strong> (cap sécurité)
            </div>
          </div>

          {/* Opening status */}
          {props.opening ? (
            <div className="cm-section" style={{ borderColor:"rgba(52,211,153,.20)", background:"rgba(52,211,153,.06)" }}>
              <div className="cm-section-title" style={{ color:"rgba(110,231,183,.80)" }}>✅ Coffre ouvert</div>
              
              <div className="cm-stat">
                <span className="cm-stat-label">Participants</span>
                <span className="cm-stat-value">{Number(props.opening.participantsCount || 0)}</span>
              </div>
              
              <div className="cm-stat">
                <span className="cm-stat-label">Watch min requis</span>
                <span className="cm-stat-value">{Number(props.opening.minWatchMinutes || 5)} min</span>
              </div>
              
              <div className="cm-stat">
                <span className="cm-stat-label">Fermeture auto</span>
                <span className="cm-stat-value">{props.remainingSec}s</span>
              </div>

              <div className="cm-progress-bar">
                <div className="cm-progress-fill" style={{ width:`${Math.round(props.progress * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className="cm-empty">Aucun coffre ouvert actuellement.</div>
          )}

          {/* Breakdown */}
          <div className="cm-section">
            <div className="cm-section-title">Répartition (poids → rubis)</div>
            {props.chest?.breakdown && Object.keys(props.chest.breakdown).length ? (
              <div className="cm-chip-grid">
                {Object.entries(props.chest.breakdown).sort((a,b)=>Number(b[0])-Number(a[0])).map(([w,a])=>(
                  <div key={w} className="cm-chip">
                    <strong>{(Number(w)/10_000).toFixed(2)}</strong> → {Number(a)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop:8, fontSize:12, color:"rgba(167,139,250,.50)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                Aucune répartition définie
              </div>
            )}
          </div>

          {/* Error */}
          {props.error ? <div className="cm-error">{props.error}</div> : null}

          {/* Actions — Viewer */}
          {!props.isOwner ? (
            <div className="cm-actions">
              <button type="button" className="btnGhostSmall" onClick={props.onRefresh} disabled={props.chestLoading}>
                {props.chestLoading ? "…" : "↻ Rafraîchir"}
              </button>
              {props.openingId ? (
                <button type="button" className="btnPrimarySmall" onClick={props.onJoin}
                  disabled={props.joinLoading || props.alreadyJoined} style={{ flex:1 }}>
                  {props.alreadyJoined ? "✅ Déjà inscrit" : props.joinLoading ? "…" : "Participer au tirage"}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Actions — Owner */}
          {props.isOwner ? (
            <>
              <div className="cm-actions">
                <button type="button" className="btnGhostSmall" onClick={props.onRefresh} disabled={props.chestLoading}>
                  {props.chestLoading ? "…" : "↻ Rafraîchir"}
                </button>
                {!props.chestHasOpen ? (
                  <button type="button" className="btnPrimarySmall" onClick={props.onOpen}
                    disabled={props.ownerLoading || !props.isLive}
                    title={!props.isLive ? "Stream offline" : "Ouvre 2 minutes (fermeture auto)"}
                    style={{ flex:1 }}>
                    {props.ownerLoading ? "…" : "Ouvrir coffre (2 min)"}
                  </button>
                ) : null}
              </div>

              {/* Owner deposit section */}
              <div className="cm-section" style={{ marginTop:18 }}>
                <div className="cm-section-title">Déposer des rubis</div>
                
                <div style={{ display:"flex", gap:10, marginTop:12, flexWrap:"wrap", alignItems:"center" }}>
                  <input className="cm-input" value={props.depositAmount}
                    onChange={e => props.setDepositAmount(e.target.value)}
                    inputMode="numeric" placeholder="Montant"
                    style={{ width:140, flex:"0 0 auto" }} />
                  
                  {[50,100,250,500].map(n => (
                    <button key={n} type="button" className="btnGhostSmall"
                      onClick={() => props.setDepositAmount(String(n))}>
                      +{n}
                    </button>
                  ))}
                </div>

                <input className="cm-input" value={props.depositNote}
                  onChange={e => props.setDepositNote(e.target.value)}
                  placeholder="Note (optionnel)" style={{ marginTop:10 }} />

                <button type="button" className="btnPrimarySmall" onClick={props.onDeposit}
                  disabled={props.depositLoading}
                  style={{ marginTop:12, width:"100%" }}>
                  {props.depositLoading ? "…" : "💎 Déposer"}
                </button>
              </div>
            </>
          ) : null}

        </div>
      </div>
    </div>
  );
}