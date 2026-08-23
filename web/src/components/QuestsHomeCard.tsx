// web/src/components/QuestsHomeCard.tsx
//
// Carte d'accès aux quêtes sur la home. Visuel harmonisé avec
// DailyBonusAccessCard / DailyWheelCard (même iframe glassmorphique violette).
//
// Logique : on affiche la première section (daily → weekly → monthly) qui
// contient encore des quêtes non complétées. À l'intérieur, on affiche la
// première quête non claim (la plus proche du complete pour motiver).

import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getQuests, type Quest, type QuestType } from "../lib/api_quests";
import { QuestsModal } from "./QuestsModal";

const TYPE_LABEL: Record<QuestType, string> = {
  daily: "Quotidienne",
  weekly: "Hebdo",
  monthly: "Mensuelle",
};

const TYPE_ICON: Record<QuestType, string> = {
  daily: "☀️",
  weekly: "📅",
  monthly: "🌙",
};

const css = `
@keyframes qhc-shimmer {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@keyframes qhc-ready-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(16,185,129,0.30), 0 0 16px rgba(16,185,129,0.16); }
  50%       { box-shadow: 0 0 0 1px rgba(52,211,153,0.55), 0 0 28px rgba(16,185,129,0.32); }
}
@keyframes qhc-dot {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: .45; transform: scale(.75); }
}
@keyframes qhc-bar-glow {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.15); }
}

.qhc-card {
  position: relative;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,0.14);
  background: rgba(13, 11, 24, 0.82);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  transition: border-color 220ms ease, box-shadow 220ms ease;
  cursor: pointer;
}
.qhc-card:hover {
  border-color: rgba(124,92,252,0.28);
  box-shadow: 0 18px 60px rgba(0,0,0,0.40), 0 0 0 1px rgba(124,92,252,0.07);
}
.qhc-card::before {
  content: "";
  position: absolute;
  top: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,0.40) 35%, rgba(91,142,248,0.28) 65%, transparent);
  pointer-events: none;
}
.qhc-card::after {
  content: "";
  position: absolute;
  top: -40px; left: -40px;
  width: 200px; height: 140px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(124,92,252,0.10), transparent 70%);
  pointer-events: none;
}
.qhc-card.is-claimable {
  border-color: rgba(16,185,129,0.32);
  animation: qhc-ready-pulse 2.6s ease-in-out infinite;
}

.qhc-inner { position: relative; z-index: 1; padding: 14px 16px 16px; }

.qhc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.qhc-title-wrap { min-width: 0; flex: 1; }
.qhc-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.qhc-icon {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(124,92,252,0.22), rgba(91,142,248,0.18));
  border: 1px solid rgba(124,92,252,0.30);
  font-size: 14px;
}
.qhc-title {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg,#a78bfa 0%,#22d3ee 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 100%;
  animation: qhc-shimmer 5s linear infinite;
}
.qhc-sub {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px;
  color: rgba(220,220,255,0.62);
  letter-spacing: 0.01em;
}
.qhc-sub-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #34d399;
  animation: qhc-dot 1.6s ease-in-out infinite;
}

.qhc-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  border: 1px solid rgba(124,92,252,0.30);
  background: rgba(124,92,252,0.12);
  color: #c4b5fd;
  white-space: nowrap;
}
.qhc-pill.is-claimable {
  background: linear-gradient(135deg,#10b981,#34d399);
  border-color: rgba(16,185,129,0.4);
  color: #fff;
  box-shadow: 0 2px 8px rgba(16,185,129,0.3);
}

.qhc-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(124,92,252,0.18), transparent);
  margin: 10px 0;
}

.qhc-quest {
  margin-bottom: 10px;
}
.qhc-quest-title {
  font-size: 13px;
  font-weight: 700;
  color: #dde8ff;
  margin-bottom: 6px;
  line-height: 1.35;
}
.qhc-quest-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.07);
  overflow: hidden;
  position: relative;
}
.qhc-quest-bar-fill {
  height: 100%;
  background: linear-gradient(90deg,#a78bfa,#22d3ee);
  border-radius: 3px;
  transition: width 350ms ease;
  animation: qhc-bar-glow 2s ease-in-out infinite;
}
.qhc-quest-bar-fill.is-done {
  background: linear-gradient(90deg,#10b981,#34d399);
}
.qhc-quest-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(220,220,255,0.58);
}
.qhc-quest-reward {
  color: #fbbf24;
  font-weight: 700;
}

.qhc-cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 11px;
  border: 1px solid rgba(124,92,252,0.30);
  background: linear-gradient(135deg, rgba(124,92,252,0.18), rgba(91,142,248,0.14));
  color: #dde8ff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 180ms ease;
}
.qhc-cta:hover {
  background: linear-gradient(135deg, rgba(124,92,252,0.28), rgba(91,142,248,0.22));
  border-color: rgba(124,92,252,0.46);
  transform: translateY(-1px);
}
.qhc-cta:disabled {
  opacity: 0.5; cursor: not-allowed; transform: none;
}

.qhc-empty {
  text-align: center;
  padding: 14px 4px 6px;
}
.qhc-empty-emoji {
  font-size: 28px;
  margin-bottom: 4px;
}
.qhc-empty-title {
  font-size: 14px;
  font-weight: 800;
  color: #dde8ff;
  margin-bottom: 3px;
}
.qhc-empty-sub {
  font-size: 11.5px;
  color: rgba(220,220,255,0.55);
}
.qhc-locked {
  text-align: center;
  padding: 14px 4px 6px;
  color: rgba(220,220,255,0.55);
  font-size: 12px;
  line-height: 1.5;
}
.qhc-card{font-family:'Manrope',sans-serif;border-radius:17px;border-color:rgba(196,181,253,.12);background:rgba(17,11,28,.86);box-shadow:none;transform:none!important}.qhc-card::before{left:16px;right:16px;background:linear-gradient(90deg,rgba(159,131,255,.65),transparent)}.qhc-card::after{opacity:.3}.qhc-title,.qhc-cta{font-family:'Manrope',sans-serif}.qhc-title{font-size:15px;letter-spacing:-.25px;color:#ede7f5}.qhc-icon{border-radius:11px}.qhc-cta{min-height:42px;border-radius:11px;background:rgba(124,92,252,.14);box-shadow:none}.qhc-cta:hover{transform:none;background:rgba(124,92,252,.22)}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  if (typeof document === "undefined") return;
  const tag = document.createElement("style");
  tag.id = "qhc-styles-v1";
  tag.textContent = css;
  document.head.appendChild(tag);
  stylesInjected = true;
}

function fmtMetricUnit(metric: string): string {
  const map: Record<string, string> = {
    chat_msg: "msg",
    watch_min: "min",
    call: "calls",
    streamer_visit: "streamers",
    discord_claim: "/claim",
    discord_blackjack: "parties",
    rain_catch: "rain",
    chest_open: "coffres",
    prediction_bet: "bets",
    daily_claim: "bonus",
    sub_send: "sub",
    login: "",
  };
  return map[metric] || "";
}

export function QuestsHomeCard() {
  const { token } = useAuth() as any;
  const [quests, setQuests] = React.useState<Quest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    ensureStyles();
  }, []);

  const reload = React.useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const r = await getQuests();
      setQuests(r.quests);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    reload();
    if (!token) return;
    const id = setInterval(reload, 90_000);
    return () => clearInterval(id);
  }, [reload, token]);

  // Détermine la section active : la première (daily→weekly→monthly) qui a
  // au moins une quête NON claim. Si tout est claim, on tombe sur "all done".
  const sectionForDisplay = React.useMemo<QuestType | null>(() => {
    const types: QuestType[] = ["daily", "weekly", "monthly"];
    for (const t of types) {
      const list = quests.filter((q) => q.type === t);
      if (list.length === 0) continue;
      const remaining = list.filter((q) => !q.claimedAt);
      if (remaining.length > 0) return t;
    }
    return null;
  }, [quests]);

  const sectionList = React.useMemo(
    () => (sectionForDisplay ? quests.filter((q) => q.type === sectionForDisplay) : []),
    [quests, sectionForDisplay]
  );

  const claimed = sectionList.filter((q) => q.claimedAt).length;
  const total = sectionList.length;
  const claimableInSection = sectionList.filter((q) => q.claimable).length;

  // Quête à mettre en avant : claimable d'abord (ready), sinon la plus avancée non claim
  const featured = React.useMemo(() => {
    if (sectionList.length === 0) return null;
    const claimable = sectionList.find((q) => q.claimable);
    if (claimable) return claimable;
    const remaining = sectionList.filter((q) => !q.claimedAt);
    if (remaining.length === 0) return null;
    return remaining
      .slice()
      .sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  }, [sectionList]);

  const hasAny = quests.length > 0;
  const cardCls = `qhc-card${claimableInSection > 0 ? " is-claimable" : ""}`;

  return (
    <>
      <div className={cardCls} onClick={() => token && setOpen(true)} role={token ? "button" : undefined} tabIndex={token ? 0 : -1}
        onKeyDown={(e) => { if (token && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }}
      >
        <div className="qhc-inner">
          <div className="qhc-header">
            <div className="qhc-title-wrap">
              <div className="qhc-label">
                <span className="qhc-icon" aria-hidden>🎯</span>
                <span className="qhc-title">Quêtes</span>
              </div>
              <div className="qhc-sub">
                {!token
                  ? "Connecte-toi pour voir tes quêtes"
                  : loading
                  ? "Chargement…"
                  : !hasAny
                  ? "Aucune quête active"
                  : sectionForDisplay
                  ? <>
                      <span>{TYPE_ICON[sectionForDisplay]}</span>
                      <span>{TYPE_LABEL[sectionForDisplay]} · {claimed}/{total}</span>
                    </>
                  : <>
                      <span className="qhc-sub-dot" />
                      <span>Toutes complétées</span>
                    </>}
              </div>
            </div>

            {claimableInSection > 0 && (
              <span className="qhc-pill is-claimable">
                {claimableInSection} prêt{claimableInSection > 1 ? "s" : ""}
              </span>
            )}
            {claimableInSection === 0 && sectionForDisplay && total > 0 && (
              <span className="qhc-pill">{claimed}/{total}</span>
            )}
          </div>

          {!token ? (
            <div className="qhc-locked">
              Crée un compte ou connecte-toi pour débloquer les quêtes quotidiennes,
              hebdo et mensuelles.
            </div>
          ) : !hasAny || !featured ? (
            <div className="qhc-empty">
              <div className="qhc-empty-emoji">🎉</div>
              <div className="qhc-empty-title">Toutes les quêtes terminées</div>
              <div className="qhc-empty-sub">Reviens plus tard pour les prochaines.</div>
            </div>
          ) : (
            <>
              <div className="qhc-divider" />
              <div className="qhc-quest">
                <div className="qhc-quest-title">{featured.title}</div>
                <div className="qhc-quest-bar">
                  <div
                    className={`qhc-quest-bar-fill${featured.completed ? " is-done" : ""}`}
                    style={{
                      width: `${Math.min(100, Math.round((featured.progress / Math.max(1, featured.target)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="qhc-quest-meta">
                  <span>
                    {Math.min(featured.progress, featured.target)}/{featured.target}
                    {fmtMetricUnit(featured.metric) ? ` ${fmtMetricUnit(featured.metric)}` : ""}
                  </span>
                  <span className="qhc-quest-reward">
                    {featured.rewardRubis > 0
                      ? `+${featured.rewardRubis} 💎`
                      : featured.rewardMeta?.title_code
                      ? "🎖 Titre"
                      : ""}
                  </span>
                </div>
              </div>
              <div className="qhc-divider" />
              <button
                type="button"
                className="qhc-cta"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
              >
                Voir toutes les quêtes →
              </button>
            </>
          )}
        </div>
      </div>

      <QuestsModal open={open} onClose={() => setOpen(false)} onClaimed={reload} />
    </>
  );
}
