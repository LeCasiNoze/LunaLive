// web/src/components/QuestsModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { claimQuest, getQuests, type Quest, type QuestType } from "../lib/api_quests";
import { fireLevelUpToast } from "./LevelUpToast";

const TYPE_LABEL: Record<QuestType, string> = {
  daily: "Quotidien",
  weekly: "Hebdo",
  monthly: "Mensuel",
};

const TYPE_COLOR: Record<QuestType, string> = {
  daily: "#22d3ee",
  weekly: "#a855f7",
  monthly: "#f59e0b",
};

const STYLE_ID = "qm-styles-v1";
const CSS = `
.qm-back{
  position:fixed;inset:0;background:rgba(4,8,24,.82);backdrop-filter:blur(14px);
  display:grid;place-items:center;padding:16px;z-index:3300;
}
.qm-shell{
  width:min(820px,100%);max-height:90vh;display:flex;flex-direction:column;
  border:1px solid rgba(99,140,220,.32);border-radius:22px;overflow:hidden;
  background:
    radial-gradient(ellipse 80% 60% at 0% 0%,rgba(99,102,241,.10),transparent 55%),
    radial-gradient(ellipse 80% 60% at 100% 0%,rgba(34,211,238,.08),transparent 55%),
    #0a1628;
  box-shadow:0 40px 100px rgba(0,0,0,.6);color:#dde8ff;
}
.qm-head{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid rgba(60,95,175,.18)}
.qm-title{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em}
.qm-sub{color:rgba(148,178,232,.62);font-size:12.5px;margin-top:2px}
.qm-close{background:rgba(255,255,255,.05);border:1px solid rgba(60,95,175,.18);color:#dde8ff;cursor:pointer;border-radius:10px;padding:6px 10px;font-size:14px}
.qm-tabs{display:flex;gap:6px;padding:12px 22px 0;border-bottom:1px solid rgba(60,95,175,.12)}
.qm-tab{
  padding:8px 14px;border-radius:10px 10px 0 0;font:inherit;font-size:13px;font-weight:700;
  background:transparent;color:rgba(148,178,232,.62);border:none;cursor:pointer;
  transition:color .15s,background .15s;
}
.qm-tab:hover{color:#dde8ff;background:rgba(255,255,255,.04)}
.qm-tab-active{color:#fff;background:rgba(99,102,241,.16);border-bottom:2px solid #6366f1}
.qm-tab-badge{
  display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;
  background:linear-gradient(135deg,#10b981,#22d3ee);color:#fff;font-size:11px;font-weight:800;
}
.qm-body{flex:1;overflow:auto;padding:18px 22px 22px}
.qm-empty{text-align:center;padding:50px 20px;color:rgba(148,178,232,.62);font-size:13px}
.qm-list{display:grid;gap:10px}
.qm-card{
  border:1px solid rgba(60,95,175,.18);border-radius:14px;padding:14px 16px;
  background:rgba(255,255,255,.025);display:flex;flex-direction:column;gap:10px;
  transition:border-color .15s,background .15s;
}
.qm-card-claimable{
  border-color:rgba(16,185,129,.4);
  background:linear-gradient(160deg,rgba(16,185,129,.08),rgba(255,255,255,.025));
  box-shadow:0 0 0 1px rgba(16,185,129,.18) inset;
}
.qm-card-claimed{opacity:.55}
.qm-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.qm-h{font-size:14px;font-weight:800;letter-spacing:-.01em;line-height:1.25}
.qm-d{font-size:12px;color:rgba(148,178,232,.62);margin-top:2px;line-height:1.45}
.qm-reward{
  display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;
  background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:800;font-size:12.5px;
  white-space:nowrap;flex-shrink:0;
}
.qm-bar{
  height:6px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden;
  position:relative;
}
.qm-bar-fill{
  height:100%;background:linear-gradient(90deg,#6366f1,#22d3ee);transition:width .35s ease;
  border-radius:3px;
}
.qm-bar-fill-done{background:linear-gradient(90deg,#10b981,#34d399)}
.qm-meta{display:flex;justify-content:space-between;font-size:11.5px;color:rgba(148,178,232,.7)}
.qm-claim{
  background:linear-gradient(135deg,#10b981,#34d399);border:none;color:#fff;
  font:inherit;font-size:13px;font-weight:800;padding:9px 18px;border-radius:11px;
  cursor:pointer;box-shadow:0 4px 16px rgba(16,185,129,.3);transition:transform .15s,box-shadow .15s;
}
.qm-claim:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(16,185,129,.4)}
.qm-claim:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.qm-tag{
  display:inline-block;padding:2px 9px;border-radius:999px;
  font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);
}
@media (max-width:640px){
  .qm-shell{max-height:95vh;border-radius:18px}
  .qm-head{padding:14px 16px}
  .qm-tabs{padding:10px 14px 0}
  .qm-body{padding:14px 16px 18px}
  .qm-row{flex-direction:column;align-items:stretch}
  .qm-reward{align-self:flex-start}
}
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function fmtMetric(metric: string, target: number, progress: number): string {
  const cap = Math.min(progress, target);
  const map: Record<string, string> = {
    chat_msg: `${cap}/${target} messages`,
    watch_min: `${cap}/${target} min`,
    call: `${cap}/${target} calls`,
    streamer_visit: `${cap}/${target} streamers`,
    discord_claim: `${cap}/${target} /claim`,
    discord_blackjack: `${cap}/${target} parties`,
    rain_catch: `${cap}/${target} rain`,
    chest_open: `${cap}/${target} coffres`,
    prediction_bet: `${cap}/${target} bets`,
    daily_claim: `${cap}/${target} bonus`,
    sub_send: `${cap}/${target} sub`,
    login: `${cap}/${target}`,
  };
  return map[metric] || `${cap}/${target}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onClaimed?: () => void;
};

export function QuestsModal({ open, onClose, onClaimed }: Props) {
  const [quests, setQuests] = React.useState<Quest[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState<QuestType>("daily");
  const [claimingCode, setClaimingCode] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    ensureCss();
  }, []);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await getQuests();
      setQuests(r.quests);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleClaim = async (code: string) => {
    setClaimingCode(code);
    setErr(null);
    try {
      const r = await claimQuest(code);
      if (r?.leveledUp) {
        fireLevelUpToast({ newLevel: r.newLevel });
      }
      await reload();
      onClaimed?.();
    } catch (e: any) {
      setErr(`${code}: ${e?.message || e}`);
    } finally {
      setClaimingCode(null);
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const filtered = quests.filter((q) => q.type === tab);
  const claimableByType: Record<QuestType, number> = {
    daily: quests.filter((q) => q.type === "daily" && q.claimable).length,
    weekly: quests.filter((q) => q.type === "weekly" && q.claimable).length,
    monthly: quests.filter((q) => q.type === "monthly" && q.claimable).length,
  };

  return createPortal(
    <div className="qm-back" onClick={onClose}>
      <div className="qm-shell" onClick={(e) => e.stopPropagation()}>
        <div className="qm-head">
          <div>
            <h2 className="qm-title">🎯 Quêtes</h2>
            <div className="qm-sub">Gagne des rubis en restant actif sur LunaLive.</div>
          </div>
          <button className="qm-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div className="qm-tabs">
          {(["daily", "weekly", "monthly"] as QuestType[]).map((t) => (
            <button
              key={t}
              className={`qm-tab ${tab === t ? "qm-tab-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {TYPE_LABEL[t]}
              {claimableByType[t] > 0 && (
                <span className="qm-tab-badge">{claimableByType[t]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="qm-body">
          {err && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "rgba(240,78,78,.1)", border: "1px solid rgba(240,78,78,.28)", color: "#fc8181", fontSize: 12.5 }}>
              ⚠️ {err}
            </div>
          )}
          {loading && quests.length === 0 ? (
            <div className="qm-empty">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="qm-empty">
              <div style={{ fontSize: 14, fontWeight: 700, color: "#dde8ff", marginBottom: 4 }}>
                Aucune quête {TYPE_LABEL[tab].toLowerCase()} active
              </div>
              Reviens plus tard, de nouvelles quêtes arrivent.
            </div>
          ) : (
            <div className="qm-list">
              {filtered.map((q) => {
                const pct = Math.min(100, Math.round((q.progress / Math.max(q.target, 1)) * 100));
                const cardCls = q.claimedAt ? "qm-card qm-card-claimed" : q.claimable ? "qm-card qm-card-claimable" : "qm-card";
                return (
                  <div key={q.code} className={cardCls}>
                    <div className="qm-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="qm-h">
                          <span className="qm-tag" style={{ color: TYPE_COLOR[q.type], borderColor: TYPE_COLOR[q.type] + "44" }}>
                            {TYPE_LABEL[q.type]}
                          </span>{" "}
                          {q.title}
                        </div>
                        {q.description && <div className="qm-d">{q.description}</div>}
                      </div>
                      {q.rewardRubis > 0 ? (
                        <div className="qm-reward">+{q.rewardRubis} 💎</div>
                      ) : q.rewardMeta?.title_code ? (
                        <div className="qm-reward">🎖 Titre exclusif</div>
                      ) : null}
                    </div>

                    <div className="qm-bar">
                      <div
                        className={`qm-bar-fill ${q.completed ? "qm-bar-fill-done" : ""}`}
                        style={{ width: pct + "%" }}
                      />
                    </div>

                    <div className="qm-meta">
                      <span>{fmtMetric(q.metric, q.target, q.progress)}</span>
                      <span>
                        {q.claimedAt
                          ? "✓ Récupéré"
                          : q.claimable
                          ? "Prêt à récupérer"
                          : `${pct}%`}
                      </span>
                    </div>

                    {q.claimable && (
                      <button
                        className="qm-claim"
                        onClick={() => handleClaim(q.code)}
                        disabled={claimingCode === q.code}
                      >
                        {claimingCode === q.code ? "…" : "🎁 Récupérer"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
