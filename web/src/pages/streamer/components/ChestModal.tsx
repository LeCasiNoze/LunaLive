import * as React from "react";
import { Eye, Gem, Gift, LockKeyhole, RefreshCw, Sparkles, Timer, Users, X } from "lucide-react";
import type { ChestState } from "../hooks/useChest";

const CM_STYLES = `
@keyframes cm-backdrop-in { from { opacity:0; } to { opacity:1; } }
@keyframes cm-panel-in { from { opacity:0; transform:translateY(18px) scale(.975); } to { opacity:1; transform:none; } }
@keyframes cm-shine { from { transform:translateX(-130%) rotate(16deg); } to { transform:translateX(260%) rotate(16deg); } }
.cm-modal { position:fixed; inset:0; z-index:998; display:grid; place-items:center; padding:clamp(12px,3vw,32px); background:rgba(4,2,12,.76); backdrop-filter:blur(14px) saturate(120%); animation:cm-backdrop-in 170ms ease both; }
.cm-panel { width:min(720px,100%); max-height:min(820px,calc(100dvh - 32px)); display:flex; flex-direction:column; overflow:hidden; position:relative; border:1px solid rgba(196,181,253,.22); border-radius:26px; background:linear-gradient(155deg,rgba(22,15,40,.985),rgba(10,7,21,.99) 62%); box-shadow:0 42px 120px rgba(0,0,0,.72),0 0 0 1px rgba(255,255,255,.03) inset; color:#f5f2ff; font-family:'Manrope',sans-serif; animation:cm-panel-in 220ms cubic-bezier(.2,.8,.2,1) both; font-variant-numeric:tabular-nums; }
.cm-panel::before { content:""; position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 4% 0%,rgba(139,92,246,.22),transparent 34%),radial-gradient(circle at 96% 4%,rgba(251,191,36,.12),transparent 28%); }
.cm-header { min-height:82px; display:flex; align-items:center; gap:13px; padding:16px 18px; flex:0 0 auto; position:relative; z-index:2; border-bottom:1px solid rgba(196,181,253,.12); }
.cm-header-icon { width:46px; height:46px; display:grid; place-items:center; flex:0 0 auto; border:1px solid rgba(251,191,36,.3); border-radius:15px; background:linear-gradient(145deg,rgba(251,191,36,.19),rgba(139,92,246,.14)); color:#f8d477; box-shadow:0 12px 26px rgba(31,20,5,.22); }
.cm-heading { min-width:0; flex:1; }
.cm-eyebrow { margin-bottom:3px; color:#978da9; font-size:9px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.cm-title { color:#fff; font-size:18px; font-weight:850; letter-spacing:-.035em; }
.cm-close { width:38px; height:38px; display:grid; place-items:center; flex:0 0 auto; border:1px solid rgba(196,181,253,.15); border-radius:12px; background:rgba(255,255,255,.045); color:#c9c1db; cursor:pointer; transition:background 140ms,border-color 140ms,color 140ms; }
.cm-close:hover { border-color:rgba(196,181,253,.32); background:rgba(139,92,246,.12); color:#fff; }
.cm-body { padding:18px; overflow-y:auto; position:relative; z-index:1; overscroll-behavior:contain; }
.cm-balance-card { min-height:150px; display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:20px; overflow:hidden; position:relative; border:1px solid rgba(251,191,36,.21); border-radius:20px; background:linear-gradient(125deg,rgba(251,191,36,.13),rgba(139,92,246,.12) 55%,rgba(91,141,239,.08)); }
.cm-balance-card::before { content:""; position:absolute; width:230px; height:230px; right:-72px; top:-92px; border-radius:50%; background:radial-gradient(circle,rgba(251,191,36,.18),transparent 67%); }
.cm-balance-card::after { content:""; position:absolute; top:-30%; bottom:-30%; width:80px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent); transform:translateX(-130%) rotate(16deg); animation:cm-shine 6s ease-in-out infinite; }
.cm-balance-copy { min-width:0; position:relative; z-index:1; }
.cm-section-label { color:#9f96b1; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.cm-balance { display:flex; align-items:baseline; gap:9px; margin-top:8px; }
.cm-balance-value { color:#fff6d7; font-size:clamp(38px,8vw,56px); font-weight:900; letter-spacing:-.065em; line-height:.95; }
.cm-balance-unit { color:#d0bb83; font-size:13px; font-weight:800; }
.cm-balance-note { margin-top:10px; color:#968da7; font-size:10px; font-weight:650; }
.cm-balance-gem { width:62px; height:62px; display:grid; place-items:center; flex:0 0 auto; position:relative; z-index:1; border:1px solid rgba(251,191,36,.24); border-radius:20px; background:rgba(7,5,15,.28); color:#f7cf68; }
.cm-opening { margin-top:14px; padding:16px; border:1px solid rgba(110,231,183,.2); border-radius:18px; background:rgba(16,185,129,.055); }
.cm-opening-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.cm-opening-title { color:#e8fff7; font-size:14px; font-weight:850; }
.cm-opening-sub { margin-top:4px; color:#8fa9a1; font-size:10px; font-weight:650; }
.cm-live-badge { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border:1px solid rgba(110,231,183,.24); border-radius:999px; background:rgba(16,185,129,.09); color:#8ce5c7; font-size:9px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
.cm-live-dot { width:6px; height:6px; border-radius:50%; background:#6ee7b7; box-shadow:0 0 10px #6ee7b7; }
.cm-stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:14px; }
.cm-stat { min-width:0; padding:11px; border:1px solid rgba(196,181,253,.11); border-radius:13px; background:rgba(4,3,11,.2); }
.cm-stat svg { color:#aa94e8; }
.cm-stat-value { display:block; margin-top:8px; color:#f5f2ff; font-size:15px; font-weight:850; }
.cm-stat-label { display:block; margin-top:2px; color:#857d96; font-size:8px; font-weight:750; text-transform:uppercase; }
.cm-progress-copy { display:flex; justify-content:space-between; gap:10px; margin-top:14px; color:#aaa1ba; font-size:9px; font-weight:750; }
.cm-progress { height:8px; margin-top:7px; overflow:hidden; border-radius:99px; background:rgba(255,255,255,.055); }
.cm-progress-fill { height:100%; position:relative; border-radius:inherit; background:linear-gradient(90deg,#34d399,#8b5cf6); box-shadow:0 0 20px rgba(52,211,153,.24); transition:width 700ms ease; }
.cm-empty { display:flex; align-items:center; gap:12px; margin-top:14px; padding:15px; border:1px solid rgba(196,181,253,.11); border-radius:16px; background:rgba(255,255,255,.025); }
.cm-empty-icon { width:38px; height:38px; display:grid; place-items:center; flex:0 0 auto; border-radius:12px; background:rgba(139,92,246,.09); color:#9487b7; }
.cm-empty strong { display:block; color:#d9d3e6; font-size:11px; }
.cm-empty span { display:block; margin-top:3px; color:#7f778f; font-size:9px; line-height:1.45; }
.cm-breakdown { margin-top:14px; padding:15px; border:1px solid rgba(196,181,253,.11); border-radius:17px; background:rgba(255,255,255,.025); }
.cm-breakdown-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.cm-breakdown-title { color:#dcd6e9; font-size:11px; font-weight:850; }
.cm-breakdown-hint { color:#716a80; font-size:8px; font-weight:700; }
.cm-chip-grid { display:flex; flex-wrap:wrap; gap:7px; margin-top:11px; }
.cm-chip { display:inline-flex; align-items:center; gap:6px; padding:7px 9px; border:1px solid rgba(167,139,250,.14); border-radius:10px; background:rgba(139,92,246,.065); color:#a69db8; font-size:9px; font-weight:700; }
.cm-chip strong { color:#e4dcfa; }
.cm-error { margin-top:14px; padding:11px 13px; border:1px solid rgba(248,113,113,.28); border-radius:12px; background:rgba(239,68,68,.08); color:#fca5a5; font-size:10px; font-weight:700; }
.cm-owner { margin-top:14px; padding:15px; border:1px solid rgba(167,139,250,.15); border-radius:17px; background:rgba(139,92,246,.055); }
.cm-owner-title { color:#e4dcfa; font-size:12px; font-weight:850; }
.cm-owner-sub { margin-top:4px; color:#81798f; font-size:9px; line-height:1.45; }
.cm-input-row { display:grid; grid-template-columns:minmax(110px,160px) 1fr; gap:8px; margin-top:12px; }
.cm-input { width:100%; min-height:42px; padding:10px 12px; border:1px solid rgba(167,139,250,.17); border-radius:12px; outline:none; background:rgba(6,4,14,.42); color:#f5f2ff; font:700 11px 'Manrope',sans-serif; }
.cm-input:focus { border-color:rgba(167,139,250,.45); box-shadow:0 0 0 3px rgba(139,92,246,.1); }
.cm-input::placeholder { color:#665f72; }
.cm-quick { display:flex; gap:6px; overflow-x:auto; }
.cm-quick button { min-width:50px; min-height:42px; border:1px solid rgba(167,139,250,.14); border-radius:11px; background:rgba(255,255,255,.035); color:#b8afc9; cursor:pointer; font:800 9px 'Manrope',sans-serif; }
.cm-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-top:14px; }
.cm-button { min-height:42px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:10px 14px; border:1px solid rgba(167,139,250,.17); border-radius:12px; background:rgba(255,255,255,.045); color:#d9d2e8; cursor:pointer; font:800 10px 'Manrope',sans-serif; transition:background 140ms,border-color 140ms,transform 140ms; }
.cm-button:hover { border-color:rgba(167,139,250,.35); background:rgba(139,92,246,.11); transform:translateY(-1px); }
.cm-button:disabled { opacity:.45; cursor:not-allowed; transform:none; }
.cm-button--primary { border-color:rgba(167,139,250,.4); background:linear-gradient(135deg,#8b5cf6,#6545d8); color:#fff; box-shadow:0 12px 28px rgba(104,69,210,.24); }
.cm-button--wide { flex:1; }
@media (max-width:600px) {
  .cm-modal { align-items:end; padding:0; }
  .cm-panel { width:100%; max-height:92dvh; border-width:1px 0 0; border-radius:24px 24px 0 0; }
  .cm-panel::after { content:""; width:38px; height:4px; position:absolute; top:7px; left:50%; z-index:4; transform:translateX(-50%); border-radius:99px; background:rgba(196,181,253,.28); }
  .cm-header { min-height:75px; padding:17px 14px 12px; }
  .cm-header-icon { width:40px; height:40px; border-radius:13px; }
  .cm-title { font-size:16px; }
  .cm-body { padding:12px 12px calc(14px + env(safe-area-inset-bottom)); }
  .cm-balance-card { min-height:126px; padding:16px; border-radius:17px; }
  .cm-balance-gem { width:50px; height:50px; border-radius:16px; }
  .cm-stat-grid { gap:6px; }
  .cm-stat { padding:9px; }
  .cm-stat-value { font-size:13px; }
  .cm-actions { position:sticky; bottom:-12px; z-index:3; margin:14px -12px -12px; padding:10px 12px calc(10px + env(safe-area-inset-bottom)); border-top:1px solid rgba(196,181,253,.1); background:rgba(10,7,21,.96); backdrop-filter:blur(12px); }
  .cm-actions .cm-button { flex:1; }
  .cm-input-row { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion:reduce) { .cm-modal,.cm-panel,.cm-balance-card::after { animation:none!important; } }
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
  React.useEffect(() => {
    if (!props.open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  const progressPct = Math.max(0, Math.min(100, Math.round(props.progress * 100)));
  const breakdown = Object.entries(props.chest?.breakdown || {}).sort((a, b) => Number(b[0]) - Number(a[0]));

  return (
    <div role="presentation" onClick={props.onClose} className="cm-modal">
      <style>{CM_STYLES}</style>
      <section role="dialog" aria-modal="true" aria-labelledby="chest-modal-title" onClick={(event) => event.stopPropagation()} className="cm-panel">
        <header className="cm-header">
          <span className="cm-header-icon"><Gift size={22} aria-hidden="true" /></span>
          <div className="cm-heading"><div className="cm-eyebrow">Récompenses communautaires</div><div className="cm-title" id="chest-modal-title">Coffre du live</div></div>
          <button className="cm-close" type="button" onClick={props.onClose} aria-label="Fermer"><X size={18} /></button>
        </header>

        <div className="cm-body">
          <section className="cm-balance-card" aria-label="Solde du coffre">
            <div className="cm-balance-copy">
              <div className="cm-section-label">Réserve actuelle</div>
              <div className="cm-balance" aria-live="polite"><span className="cm-balance-value">{props.chestLoading ? "…" : props.chestBalance.toLocaleString("fr-FR")}</span><span className="cm-balance-unit">rubis</span></div>
              <div className="cm-balance-note">Présence sur le direct requise · plafond de sécurité 0,20</div>
            </div>
            <span className="cm-balance-gem"><Gem size={30} aria-hidden="true" /></span>
          </section>

          {props.opening ? (
            <section className="cm-opening" aria-label="Tirage en cours">
              <div className="cm-opening-head"><div><div className="cm-opening-title">Le coffre est ouvert</div><div className="cm-opening-sub">Rejoins le tirage avant la fin du compteur.</div></div><span className="cm-live-badge"><span className="cm-live-dot" /> En cours</span></div>
              <div className="cm-stat-grid">
                <div className="cm-stat"><Users size={15} /><strong className="cm-stat-value">{Number(props.opening.participantsCount || 0)}</strong><span className="cm-stat-label">Participants</span></div>
                <div className="cm-stat"><Eye size={15} /><strong className="cm-stat-value">{Number(props.opening.minWatchMinutes || 5)} min</strong><span className="cm-stat-label">Watch requis</span></div>
                <div className="cm-stat"><Timer size={15} /><strong className="cm-stat-value">{Math.max(0, props.remainingSec)} s</strong><span className="cm-stat-label">Restantes</span></div>
              </div>
              <div className="cm-progress-copy"><span>Fenêtre de participation</span><span>{progressPct}%</span></div>
              <div className="cm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}><div className="cm-progress-fill" style={{ width: `${progressPct}%` }} /></div>
            </section>
          ) : (
            <div className="cm-empty"><span className="cm-empty-icon"><LockKeyhole size={18} /></span><div><strong>Le coffre attend le prochain tirage</strong><span>Reste sur le live : le streamer peut l’ouvrir à tout moment.</span></div></div>
          )}

          <section className="cm-breakdown">
            <div className="cm-breakdown-head"><div className="cm-breakdown-title">Répartition potentielle</div><div className="cm-breakdown-hint">poids → rubis</div></div>
            {breakdown.length ? <div className="cm-chip-grid">{breakdown.map(([weight, amount]) => <span key={weight} className="cm-chip"><Sparkles size={11} /><strong>{(Number(weight) / 10_000).toFixed(2)}</strong> → {Number(amount)}</span>)}</div> : <div className="cm-empty" style={{ marginTop: 11 }}><span>Aucune répartition définie pour le moment.</span></div>}
          </section>

          {props.error ? <div className="cm-error" role="alert">{props.error}</div> : null}

          {props.isOwner ? (
            <section className="cm-owner">
              <div className="cm-owner-title">Alimenter le coffre</div>
              <div className="cm-owner-sub">Ajoute des rubis à la réserve. Le montant devient disponible pour les prochains tirages.</div>
              <div className="cm-input-row">
                <input className="cm-input" value={props.depositAmount} onChange={(event) => props.setDepositAmount(event.target.value)} inputMode="numeric" aria-label="Montant en rubis" placeholder="Montant" />
                <div className="cm-quick">{[50, 100, 250, 500].map((amount) => <button key={amount} type="button" onClick={() => props.setDepositAmount(String(amount))}>+{amount}</button>)}</div>
              </div>
              <input className="cm-input" value={props.depositNote} onChange={(event) => props.setDepositNote(event.target.value)} placeholder="Note facultative" style={{ marginTop: 8 }} />
              <button type="button" className="cm-button cm-button--primary" onClick={props.onDeposit} disabled={props.depositLoading} style={{ width: "100%", marginTop: 9 }}><Gem size={14} /> {props.depositLoading ? "Dépôt en cours…" : "Déposer dans le coffre"}</button>
            </section>
          ) : null}

          <footer className="cm-actions">
            <button type="button" className="cm-button" onClick={props.onRefresh} disabled={props.chestLoading}><RefreshCw size={14} /> {props.chestLoading ? "Actualisation…" : "Actualiser"}</button>
            {!props.isOwner && props.openingId ? <button type="button" className="cm-button cm-button--primary cm-button--wide" onClick={props.onJoin} disabled={props.joinLoading || props.alreadyJoined}><Sparkles size={14} /> {props.alreadyJoined ? "Participation enregistrée" : props.joinLoading ? "Inscription…" : "Participer au tirage"}</button> : null}
            {props.isOwner && !props.chestHasOpen ? <button type="button" className="cm-button cm-button--primary cm-button--wide" onClick={props.onOpen} disabled={props.ownerLoading || !props.isLive} title={!props.isLive ? "Le stream doit être en direct" : "Ouvre le coffre pendant deux minutes"}><Gift size={14} /> {props.ownerLoading ? "Ouverture…" : props.isLive ? "Ouvrir pendant 2 minutes" : "Disponible en direct"}</button> : null}
          </footer>
        </div>
      </section>
    </div>
  );
}
