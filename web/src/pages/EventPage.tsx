// web/src/pages/EventPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import { CountUp } from "../components/events/CountUp";
import { EventAvatar } from "../components/events/EventAvatar";
import "../components/events/events-theme.css";
import {
  getCurrentBoss,
  getCurrentChest,
  getCurrentClipRace,
  getCurrentEvent,
  getCurrentViewerWeek,
  getCurrentWheelWeek,
  getEventAccessStatus,
  postBossBurn,
  postChestDeposit,
  postClipRaceVote,
  type ApiBossResp,
  type ApiChestResp,
  type ApiClipRaceResp,
  type ApiEventAccessStatus,
  type ApiEventRow,
  type ApiViewerWeekResp,
  type ApiWheelWeekResp,
  type EventAccessStepKey,
} from "../lib/api_events";

// Forme minimale commune à tous les classements individuels (viewer_week,
// wheel_week, top contributeurs coffre, top dégâts boss) — permet de
// réutiliser Podium/LeaderboardList pour n'importe quel type d'event.
type EvTopRow = { rank: number | null; userId: number; username: string; points: number };

function splitRemain(ms: number) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return { d, h: h % 24, m: m % 60, s: s % 60 };
}

function fmtIsoLocal(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function eventLabel(type: string) {
  if (type === "viewer_week") return "Semaine du viewer";
  if (type === "wheel_week") return "Semaine de la roue";
  if (type === "clip_race") return "Course aux clips";
  if (type === "global_chest") return "Coffre communautaire";
  if (type === "burn_boss") return "Boss à abattre";
  if (type === "duo_week") return "Semaine en duo";
  return type || "Event";
}

function eventEmoji(type: string) {
  if (type === "viewer_week") return "🏁";
  if (type === "wheel_week") return "🎡";
  if (type === "clip_race") return "🎬";
  if (type === "global_chest") return "🎁";
  if (type === "burn_boss") return "🔥";
  if (type === "duo_week") return "🤝";
  return "✨";
}

const EVENT_TEASER: Record<string, string> = {
  wheel_week: "Chaque tour de roue gratuit rapporte des points. Le classement final distribue rubis et tickets bonus.",
  clip_race: "Le clip le plus vu ou le plus liké de la semaine grimpe au classement et remporte la mise.",
  global_chest: "Toute la communauté remplit un coffre ensemble. Une fois plein, tout le monde reçoit une récompense.",
  burn_boss: "Un boss avec une jauge de vie commune. Chaque action de la communauté lui inflige des dégâts jusqu'à sa chute.",
  duo_week: "Forme un duo avec un autre viewer et cumulez vos points ensemble pour grimper au classement.",
};

const STEP_ICON: Record<EventAccessStepKey, string> = {
  follow_streamer: "❤️",
  link_discord: "🔗",
  follow_insta: "📸",
  daily_claim: "🎁",
  watch_30: "⏱",
};

// Reveal on scroll — opacity/translateY, pas de layout shift. Neutralisé
// sous prefers-reduced-motion (le CSS coupe aussi les animations continues).
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  // animate on mount (pas whileInView) : garantit que le contenu est TOUJOURS
  // visible même hors écran initial / en capture pleine page. whileInView
  // laissait le contenu sous la ligne de flottaison à opacity:0 (vide fantôme).
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function Countdown({ targetMs, nowMs, label }: { targetMs: number; nowMs: number; label: string }) {
  const { d, h, m, s } = splitRemain(targetMs - nowMs);
  const boxes: [string, number][] = d > 0 ? [["jours", d], ["h", h], ["min", m], ["sec", s]] : [["h", h], ["min", m], ["sec", s]];
  return (
    <div className="evCountdownWrap">
      <div className="evCountdownLabel">{label}</div>
      <div className="evCountdown">
        {boxes.map(([unit, val]) => (
          <div className="evCdBox" key={unit}>
            <div className="evCdNum">{String(val).padStart(2, "0")}</div>
            <div className="evCdUnit">{unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tables des lots — reflètent EVENT_REWARD_CONFIGS (api/src/events/rewards.ts).
// Valeurs hardcodées volontairement : pas de dépendance runtime au barème
// serveur pour l'affichage (classement/points restent dynamiques).
type RewardTierDisplay = { key: string; rank: string; amount: string; extra?: string; gold?: boolean };

const VIEWER_WEEK_REWARD_TIERS: RewardTierDisplay[] = [
  { key: "gold", rank: "🥇 #1", amount: "600", extra: "+ badge exclusif « Champion du mois »", gold: true },
  { key: "s23", rank: "🥈🥉 #2-3", amount: "300" },
  { key: "s45", rank: "#4-5", amount: "150" },
  { key: "part", rank: "🎯 Participation (≥ 200 pts)", amount: "40", extra: "+ 1 ticket roue" },
];

const WHEEL_WEEK_REWARD_TIERS: RewardTierDisplay[] = [
  { key: "gold", rank: "🥇 #1", amount: "600", extra: "+ titre exclusif « Roi de la roue »", gold: true },
  { key: "s23", rank: "🥈🥉 #2-3", amount: "300" },
  { key: "s45", rank: "#4-5", amount: "150" },
  { key: "part", rank: "🎯 Participation (≥ 50 pts)", amount: "40", extra: "+ 1 ticket roue" },
];

const CHEST_REWARD_TIERS: RewardTierDisplay[] = [
  {
    key: "reached",
    rank: "🎁 Coffre rempli (3000 pts communs)",
    amount: "150",
    extra: "pour chaque contributeur ≥ 50 pts + badge exclusif",
    gold: true,
  },
];

const CLIP_RACE_REWARD_TIERS: RewardTierDisplay[] = [
  {
    key: "streamer",
    rank: "🏅 Streamer #1 (classement streamers)",
    amount: "400",
    extra: "dans son coffre + mis en avant 7 jours",
    gold: true,
  },
  { key: "clip1", rank: "🥇 Clip #1", amount: "250", extra: "+ abonnement offert 7 jours au créateur" },
  { key: "clip2", rank: "🥈 Clip #2", amount: "120" },
  { key: "clip3", rank: "🥉 Clip #3", amount: "60" },
  { key: "part", rank: "🎯 Votants actifs", amount: "25" },
];

const BOSS_REWARD_TIERS: RewardTierDisplay[] = [
  { key: "gold", rank: "🥇 #1 dégâts", amount: "500", extra: "cumulable avec la récompense de base", gold: true },
  { key: "s2", rank: "🥈 #2 dégâts", amount: "300" },
  { key: "s3", rank: "🥉 #3 dégâts", amount: "180" },
  {
    key: "part",
    rank: "🎯 Tout contributeur (≥ 50 dégâts)",
    amount: "120",
    extra: "+ badge « Boss Slayer », si le boss tombe",
  },
];

function RewardsShowcase({ tiers }: { tiers: RewardTierDisplay[] }) {
  return (
    <div className="evRewardGrid">
      {tiers.map((t) => (
        <div key={t.key} className={`evRewardCard${t.gold ? " gold" : ""}`}>
          <div className="evRewardRank">{t.rank}</div>
          <div className="evRewardAmount">⭐ {t.amount}</div>
          {t.extra ? <div className="evRewardExtra">{t.extra}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Podium({ top, meUserId }: { top: EvTopRow[]; meUserId: number | null }) {
  const slots = [1, 2, 3].map((rank) => top.find((r) => Number(r.rank) === rank) ?? null);
  const medalOf = (rank: number) => (rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉");

  return (
    <>
      <div className="evPodium">
        {slots.map((row, i) => {
          const rank = i + 1;
          if (!row) {
            return (
              <div key={rank} className={`evPodCard r${rank} empty`}>
                <div className="evPodMedal">{medalOf(rank)}</div>
                <div className="evPodName">—</div>
                <div className="evPodPoints">·</div>
              </div>
            );
          }
          const isMe = meUserId != null && Number(meUserId) === Number(row.userId);
          return (
            <div key={rank} className={`evPodCard r${rank}`}>
              {rank === 1 ? <div className="evPodCrown">👑</div> : <div className="evPodMedal">{medalOf(rank)}</div>}
              <EventAvatar userId={row.userId} username={row.username} size={rank === 1 ? 76 : 60} />
              <div className="evPodName" title={row.username}>{row.username}</div>
              {isMe ? <div className="evPodMe">C'est toi !</div> : null}
              <div className="evPodPoints">
                <CountUp value={Number(row.points || 0)} /> pts
              </div>
            </div>
          );
        })}
      </div>
      {top.length === 0 ? (
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
          Pas encore de scores cette semaine — sois le premier à apparaître ici !
        </div>
      ) : null}
    </>
  );
}

function LeaderboardList({ rows, meUserId, unit = "pts" }: { rows: EvTopRow[]; meUserId: number | null; unit?: string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r, i) => {
        const isMe = meUserId != null && Number(meUserId) === Number(r.userId);
        return (
          <Reveal key={`${r.userId}-${r.rank}`} delay={Math.min(i * 0.03, 0.3)}>
            <div className={`evRow${isMe ? " me" : ""}`}>
              <div className="evRowRank">#{r.rank}</div>
              <EventAvatar userId={r.userId} username={r.username} size={32} />
              <div className="evRowName">
                {r.username}
                {isMe ? <span style={{ opacity: 0.7 }}> (toi)</span> : null}
              </div>
              <div className="evRowPts">{Math.floor(Number(r.points || 0))} {unit}</div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

// Détail des points perso — stat tiles avec count-up. Visible uniquement
// connecté + éligible + score existant.
function MyScoreTiles({ me }: { me: NonNullable<ApiViewerWeekResp["me"]> }) {
  const items: { label: string; value: number; icon: string }[] = [
    { label: "Minutes de watch", value: me.minutesPoints ?? 0, icon: "⏱" },
    { label: "Bonus jour actif", value: me.dayBonusPoints ?? 0, icon: "🔥" },
    { label: "Daily claims", value: me.claimPoints ?? 0, icon: "🎁" },
    { label: "Chat", value: me.chatPoints ?? 0, icon: "💬" },
    { label: "Calls", value: me.callsPoints ?? 0, icon: "📣" },
    { label: "Roue", value: me.wheelPoints ?? 0, icon: "🎡" },
    { label: "Prédictions (participation)", value: me.predJoinPoints ?? 0, icon: "🔮" },
    { label: "Prédictions (victoire)", value: me.predWinPoints ?? 0, icon: "✅" },
  ];

  return (
    <div className="evCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 24 }}>✅</span>
        <div style={{ minWidth: 0 }}>
          <div className="evLockedTitle" style={{ fontSize: 15 }}>Tu participes</div>
          <div className="evHeroMeta" style={{ opacity: 0.78, justifyContent: "flex-start" }}>
            Rang actuel : #{me.rank ?? "?"} · <CountUp value={Number(me.points || 0)} /> pts
          </div>
        </div>
      </div>

      <div className="evStatGrid" style={{ marginTop: 14 }}>
        {items.map((it) => (
          <div className="evStatTile" key={it.label}>
            <div className="evStatIcon">{it.icon}</div>
            <div className="evStatValue"><CountUp value={it.value} /></div>
            <div className="evStatLabel">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Carte "connecte-toi" générique — même contenu que le bloc historique de
// viewer_week, réutilisé par les nouveaux panneaux.
function LoginGate({ onLogin, text }: { onLogin: () => void; text: string }) {
  return (
    <div className="evCard" style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
      <div style={{ fontSize: 30 }}>🔐</div>
      <div className="evLockedTitle" style={{ fontSize: 17 }}>Connecte-toi pour participer</div>
      <div className="evLockedSub">{text}</div>
      <button type="button" className="evBtn" onClick={onLogin}>Se connecter</button>
    </div>
  );
}

// Carte "mon statut" générique (icône + titre + méta + contenu optionnel,
// ex. formulaire de dépôt/burn) — même gabarit que l'en-tête de MyScoreTiles.
function MyStatusCard({
  icon,
  title,
  meta,
  children,
}: {
  icon: string;
  title: string;
  meta: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="evCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="evLockedTitle" style={{ fontSize: 15 }}>{title}</div>
          <div className="evHeroMeta" style={{ opacity: 0.78, justifyContent: "flex-start" }}>{meta}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function humanRubisError(code: string) {
  switch (code) {
    case "bad_amount":
      return "Montant invalide.";
    case "insufficient_funds":
      return "Solde insuffisant.";
    case "no_active_chest_event":
    case "no_active_boss_event":
      return "Cet event n'est plus actif.";
    default:
      return code || "Erreur, réessaie.";
  }
}

// Formulaire montant rubis réutilisé par le dépôt coffre et le burn boss —
// mêmes chips de montants rapides que ChestModal.tsx (streamer).
function RubisAmountForm({
  icon,
  buttonLabel,
  onSubmit,
}: {
  icon: string;
  buttonLabel: string;
  onSubmit: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = React.useState("50");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Montant invalide.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(n);
    } catch (e: any) {
      setError(humanRubisError(String(e?.message || "")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="evAmountInput"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="Montant"
        />
        {[50, 100, 250, 500].map((n) => (
          <button key={n} type="button" className="evBtnGhost" onClick={() => setAmount(String(n))}>+{n}</button>
        ))}
      </div>
      {error ? <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5", fontWeight: 800 }}>{error}</div> : null}
      <button type="button" className="evBtn" onClick={submit} disabled={loading} style={{ marginTop: 10 }}>
        {loading ? "…" : `${icon} ${buttonLabel}`}
      </button>
    </div>
  );
}

// ── wheel_week : podium + classement + vitrine + statut ──────────────
function WheelWeekPanel({
  resp,
  token,
  onLoginClick,
}: {
  resp: Extract<ApiWheelWeekResp, { event: ApiEventRow }>;
  token: string | null;
  onLoginClick: () => void;
}) {
  const top3 = resp.top.slice(0, 3);
  const rest = resp.top.slice(3);
  const meUserId = resp.me?.userId ?? null;

  return (
    <>
      <Reveal>
        <div>
          <div className="evSectionTitle">🏆 Podium</div>
          <Podium top={top3} meUserId={meUserId} />
        </div>
      </Reveal>

      {rest.length > 0 ? (
        <Reveal delay={0.05}>
          <div>
            <div className="evSectionTitle">📊 Classement complet</div>
            <LeaderboardList rows={rest} meUserId={meUserId} />
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.08}>
        <div>
          <div className="evSectionTitle">🎁 Vitrine des lots</div>
          <RewardsShowcase tiers={WHEEL_WEEK_REWARD_TIERS} />
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div>
          <div className="evSectionTitle">🎯 Ton statut</div>
          {!token ? (
            <LoginGate onLogin={onLoginClick} text="Ton classement à la roue s'affichera ici dès que tu es connecté." />
          ) : resp.me ? (
            <MyStatusCard
              icon="🎡"
              title="Tu participes"
              meta={<>Rang actuel : #{resp.me.rank ?? "?"} · <CountUp value={Number(resp.me.points || 0)} /> pts</>}
            />
          ) : (
            <div className="evCard" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26 }}>✅</div>
              <div className="evLockedSub" style={{ marginTop: 8 }}>
                Éligible ! Tourne la roue gratuite pour commencer à marquer des points.
              </div>
            </div>
          )}
        </div>
      </Reveal>
    </>
  );
}

// ── global_chest : barre de progression + top contributeurs + dépôt ──
function ChestPanel({
  resp,
  token,
  meUserId,
  onLoginClick,
  onRefresh,
}: {
  resp: Extract<ApiChestResp, { event: ApiEventRow }>;
  token: string | null;
  meUserId: number | null;
  onLoginClick: () => void;
  onRefresh: () => void;
}) {
  const pct = resp.goal > 0 ? Math.min(100, Math.round((resp.communityTotal / resp.goal) * 100)) : 0;
  const contributors: EvTopRow[] = resp.topContributors.map((c, i) => ({
    rank: i + 1,
    userId: c.userId,
    username: c.username,
    points: c.points,
  }));

  return (
    <>
      <Reveal>
        <div>
          <div className="evSectionTitle">🎁 Coffre communautaire</div>
          <div className="evCard">
            <div className="evBarHead">
              <span><CountUp value={resp.communityTotal} /> / {resp.goal} pts</span>
              {resp.reached ? <span className="evStateBadge live">✅ Palier atteint !</span> : null}
            </div>
            <div className="evBar">
              <div className="evBarFill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </Reveal>

      {contributors.length > 0 ? (
        <Reveal delay={0.05}>
          <div>
            <div className="evSectionTitle">📊 Top contributeurs</div>
            <LeaderboardList rows={contributors} meUserId={meUserId} />
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.08}>
        <div>
          <div className="evSectionTitle">🎁 Vitrine des lots</div>
          <RewardsShowcase tiers={CHEST_REWARD_TIERS} />
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div>
          <div className="evSectionTitle">🎯 Ton statut</div>
          {!token ? (
            <LoginGate onLogin={onLoginClick} text="Connecte-toi pour déposer des rubis dans le coffre commun." />
          ) : (
            <MyStatusCard
              icon="💎"
              title="Ta contribution"
              meta={<><CountUp value={resp.myContribution ?? 0} /> pts déposés</>}
            >
              <RubisAmountForm
                icon="💎"
                buttonLabel="Déposer des rubis"
                onSubmit={async (n) => {
                  await postChestDeposit(token, n);
                  onRefresh();
                }}
              />
            </MyStatusCard>
          )}
        </div>
      </Reveal>
    </>
  );
}

// ── clip_race : double classement (clips + streamers) + vote ─────────
function ClipRacePanel({
  resp,
  token,
  onLoginClick,
  onRefresh,
}: {
  resp: Extract<ApiClipRaceResp, { event: ApiEventRow }>;
  token: string | null;
  onLoginClick: () => void;
  onRefresh: () => void;
}) {
  const [votingClipId, setVotingClipId] = React.useState<number | null>(null);
  const [voteErr, setVoteErr] = React.useState<string | null>(null);
  const votesLeft = resp.myVotesLeft ?? 0;
  const canVote = !!token && votesLeft > 0;

  async function vote(clipId: number) {
    if (!token) {
      onLoginClick();
      return;
    }
    setVoteErr(null);
    setVotingClipId(clipId);
    try {
      await postClipRaceVote(token, clipId);
      onRefresh();
    } catch (e: any) {
      setVoteErr(e?.message || "Vote impossible, réessaie.");
    } finally {
      setVotingClipId(null);
    }
  }

  return (
    <>
      <Reveal>
        <div className="evTwoCol">
          <div>
            <div className="evSectionTitle">🎬 Top clips</div>
            {resp.topClips.length === 0 ? (
              <div className="evCard" style={{ textAlign: "center", fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                Pas encore de clip en lice — le premier clip posté cette semaine apparaîtra ici.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {resp.topClips.map((c) => (
                  <div className="evRow" key={c.clipId}>
                    <div className="evRowRank">#{c.rank}</div>
                    <div className="evRowName" title={c.title ?? undefined}>
                      {c.title || "Clip sans titre"}
                      <span style={{ opacity: 0.65 }}> · {c.streamerDisplayName}</span>
                    </div>
                    <div className="evRowPts">{c.votes} ❤️</div>
                    {token ? (
                      <button
                        type="button"
                        className="evBtnGhost"
                        onClick={() => vote(c.clipId)}
                        disabled={!canVote || votingClipId !== null}
                        title={canVote ? "Coup de cœur" : "Plus de votes disponibles"}
                        style={{ marginLeft: 6 }}
                      >
                        {votingClipId === c.clipId ? "…" : "❤️"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="evSectionTitle">🏅 Top streamers</div>
            {resp.topStreamers.length === 0 ? (
              <div className="evCard" style={{ textAlign: "center", fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                Pas encore de streamer classé — les votes sur ses clips le feront grimper ici.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {resp.topStreamers.map((s) => (
                  <div className="evRow" key={s.streamerId}>
                    <div className="evRowRank">#{s.rank}</div>
                    <div className="evRowName">{s.displayName}</div>
                    <div className="evRowPts">{s.votes} ❤️</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div>
          <div className="evSectionTitle">🎁 Vitrine des lots</div>
          <RewardsShowcase tiers={CLIP_RACE_REWARD_TIERS} />
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div>
          <div className="evSectionTitle">🎯 Ton statut</div>
          {!token ? (
            <LoginGate onLogin={onLoginClick} text="Connecte-toi pour voter pour tes clips préférés." />
          ) : (
            <>
              <MyStatusCard
                icon="❤️"
                title="Coups de cœur restants"
                meta={<>{votesLeft} vote{votesLeft > 1 ? "s" : ""} disponible{votesLeft > 1 ? "s" : ""} cette semaine</>}
              />
              {voteErr ? <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5", fontWeight: 800 }}>{voteErr}</div> : null}
            </>
          )}
        </div>
      </Reveal>
    </>
  );
}

// ── burn_boss : jauge de vie + top dégâts + burn ──────────────────────
function BossPanel({
  resp,
  token,
  meUserId,
  onLoginClick,
  onRefresh,
}: {
  resp: Extract<ApiBossResp, { event: ApiEventRow }>;
  token: string | null;
  meUserId: number | null;
  onLoginClick: () => void;
  onRefresh: () => void;
}) {
  const pct = resp.hp > 0 ? Math.min(100, Math.round((resp.totalDamage / resp.hp) * 100)) : 0;
  const damagers: EvTopRow[] = resp.topDamagers.map((d) => ({
    rank: d.rank,
    userId: d.userId,
    username: d.username,
    points: d.damage,
  }));

  return (
    <>
      <Reveal>
        <div>
          <div className="evSectionTitle">🔥 Boss à abattre</div>
          <div className="evCard">
            <div className="evBarHead">
              <span><CountUp value={resp.totalDamage} /> / {resp.hp} dégâts</span>
              {resp.killed ? <span className="evStateBadge live">💀 Boss vaincu !</span> : null}
            </div>
            <div className="evBar">
              <div className="evBarFill boss" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </Reveal>

      {damagers.length > 0 ? (
        <Reveal delay={0.05}>
          <div>
            <div className="evSectionTitle">📊 Top dégâts</div>
            <LeaderboardList rows={damagers} meUserId={meUserId} unit="dégâts" />
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.08}>
        <div>
          <div className="evSectionTitle">🎁 Vitrine des lots</div>
          <RewardsShowcase tiers={BOSS_REWARD_TIERS} />
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div>
          <div className="evSectionTitle">🎯 Ton statut</div>
          {!token ? (
            <LoginGate onLogin={onLoginClick} text="Connecte-toi pour infliger des dégâts au boss." />
          ) : (
            <MyStatusCard
              icon="🔥"
              title="Tes dégâts"
              meta={<><CountUp value={resp.myDamage ?? 0} /> dégâts infligés</>}
            >
              <RubisAmountForm
                icon="🔥"
                buttonLabel="Brûler des rubis"
                onSubmit={async (n) => {
                  await postBossBurn(token, n);
                  onRefresh();
                }}
              />
            </MyStatusCard>
          )}
        </div>
      </Reveal>
    </>
  );
}

function EventTeaser({ event }: { event: ApiEventRow }) {
  const pitch = EVENT_TEASER[event.type] || "Un nouvel event arrive bientôt sur LunaLive. Reviens vite pour découvrir les règles et le classement.";
  return (
    <div className="evCard evTeaser">
      <div className="evTeaserEmoji">{eventEmoji(event.type)}</div>
      <div className="evTeaserTitle">{eventLabel(event.type)}</div>
      <div className="evTeaserPitch">{pitch}</div>
      <span className="evStateBadge scheduled">⏳ Bientôt disponible</span>
    </div>
  );
}

export default function EventPage() {
  const auth = useAuth();
  const token = auth?.token ?? null;

  const [loginOpen, setLoginOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [event, setEvent] = React.useState<ApiEventRow | null>(null);
  const [viewerWeek, setViewerWeek] = React.useState<ApiViewerWeekResp | null>(null);
  const [wheelWeek, setWheelWeek] = React.useState<ApiWheelWeekResp | null>(null);
  const [chest, setChest] = React.useState<ApiChestResp | null>(null);
  const [clipRace, setClipRace] = React.useState<ApiClipRaceResp | null>(null);
  const [boss, setBoss] = React.useState<ApiBossResp | null>(null);
  const [accessStatus, setAccessStatus] = React.useState<ApiEventAccessStatus | null>(null);

  // mini timer pour countdown
  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Spotlight curseur sur le hero.
  const heroRef = React.useRef<HTMLDivElement>(null);
  const mx = useMotionValue(50);
  const my = useMotionValue(22);
  const smx = useSpring(mx, { stiffness: 70, damping: 20 });
  const smy = useSpring(my, { stiffness: 70, damping: 20 });
  const onHeroMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const cur = await getCurrentEvent();
      setEvent(cur?.event ?? null);

      const type = String(cur?.event?.type || "");
      if (type === "viewer_week" && cur?.event) {
        // top public toujours chargé ; "me" apparaît seulement si connecté (token optionnel)
        const v = await getCurrentViewerWeek(token);
        setViewerWeek(v);
      } else {
        setViewerWeek(null);
      }

      if (type === "wheel_week" && cur?.event) {
        const w = await getCurrentWheelWeek(token);
        setWheelWeek(w);
      } else {
        setWheelWeek(null);
      }

      if (type === "global_chest" && cur?.event) {
        const c = await getCurrentChest(token);
        setChest(c);
      } else {
        setChest(null);
      }

      if (type === "clip_race" && cur?.event) {
        const cr = await getCurrentClipRace(token);
        setClipRace(cr);
      } else {
        setClipRace(null);
      }

      if (type === "burn_boss" && cur?.event) {
        const b = await getCurrentBoss(token);
        setBoss(b);
      } else {
        setBoss(null);
      }

      if (token) {
        try {
          const acc = await getEventAccessStatus(token);
          setAccessStatus(acc);
        } catch {
          setAccessStatus(null);
        }
      } else {
        setAccessStatus(null);
      }

      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const endMs = event?.end_at ? new Date(event.end_at).getTime() : 0;
  const startMs = event?.start_at ? new Date(event.start_at).getTime() : 0;

  const titleEmoji = event ? eventEmoji(event.type) : "✨";
  const titleLabel = event ? eventLabel(event.type) : "Event";
  const isViewerWeek = event?.type === "viewer_week";
  const meRow = viewerWeek?.me ?? null;
  const meUserId = viewerWeek?.me?.userId ?? null;
  const top3 = viewerWeek?.top ?? [];
  const rest = top3.slice(3);

  const eligible = accessStatus?.eligible ?? null;
  const steps = accessStatus?.steps ?? [];
  const missingCount = steps.filter((s) => !s.done).length;

  const stateBadge = !event
    ? null
    : event.state === "live"
    ? { cls: "live", text: "🟢 En cours" }
    : event.state === "scheduled"
    ? { cls: "scheduled", text: "⏳ Bientôt" }
    : { cls: "closed", text: "✅ Terminé" };

  const cdTarget = event?.state === "scheduled" && startMs > 0 ? startMs : endMs;
  const cdLabel = event?.state === "scheduled" ? "Commence dans" : "Se termine dans";
  const showCountdown = !!event && event.state !== "closed" && cdTarget > 0;

  return (
    <main className="container evRoot" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))", display: "grid", gap: 14 }}>
      <section className="evHero" ref={heroRef} onMouseMove={onHeroMove}>
        <div className="evMesh" />
        <motion.div
          className="evHeroSpotlight"
          style={
            {
              ["--mx" as any]: useTransform(smx, (v) => `${v}%`),
              ["--my" as any]: useTransform(smy, (v) => `${v}%`),
            } as any
          }
        />
        <div className="evGrain" />

        <div className="evHeroTop">
          {stateBadge ? <span className={`evStateBadge ${stateBadge.cls}`}>{stateBadge.text}</span> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="evBtnGhost" onClick={() => load().catch(() => {})} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir ↻"}
            </button>
            <Link to="/" className="evBtnGhost" title="Retour aux lives">Lives</Link>
          </div>
        </div>

        <div className="evHeroContent">
          <h1 className="evTitle"><span className="evTitleEmoji">{titleEmoji}</span>{titleLabel}</h1>
          {event ? (
            <div className="evHeroMeta">
              <span title="Début">{fmtIsoLocal(event.start_at)}</span>
              <span style={{ opacity: 0.6 }}>→</span>
              <span title="Fin">{fmtIsoLocal(event.end_at)}</span>
            </div>
          ) : (
            <div className="evHeroMeta">Aucun event actif.</div>
          )}

          {showCountdown ? <Countdown targetMs={cdTarget} nowMs={nowMs} label={cdLabel} /> : null}
        </div>
      </section>

      {err ? (
        <div className="alert" style={{ margin: 0 }}>{err}</div>
      ) : null}

      {loading ? (
        <div className="evCard">
          <div style={{ fontWeight: 1200 }}>Chargement…</div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 6 }}>
            Récupération de l'event courant et du classement.
          </div>
        </div>
      ) : !event ? (
        <div className="evCard">
          <div style={{ fontWeight: 1200 }}>Aucun event actif</div>
          <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950, marginTop: 6 }}>
            Le moteur d'events n'a peut-être pas encore ouvert l'event (ou la fenêtre est terminée).
          </div>
        </div>
      ) : isViewerWeek ? (
        <>
          <Reveal>
            <div>
              <div className="evSectionTitle">🏆 Podium</div>
              <Podium top={top3} meUserId={meUserId} />
            </div>
          </Reveal>

          {rest.length > 0 ? (
            <Reveal delay={0.05}>
              <div>
                <div className="evSectionTitle">📊 Classement complet</div>
                <LeaderboardList rows={rest} meUserId={meUserId} />
              </div>
            </Reveal>
          ) : null}

          <Reveal delay={0.08}>
            <div>
              <div className="evSectionTitle">🎁 Vitrine des lots</div>
              <RewardsShowcase tiers={VIEWER_WEEK_REWARD_TIERS} />
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div>
              <div className="evSectionTitle">🎯 Ton statut</div>

              {!token ? (
                <div className="evCard" style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
                  <div style={{ fontSize: 30 }}>🔐</div>
                  <div className="evLockedTitle" style={{ fontSize: 17 }}>Connecte-toi pour participer</div>
                  <div className="evLockedSub">
                    Ton classement et le détail de tes points s'afficheront ici dès que tu es connecté.
                  </div>
                  <button type="button" className="evBtn" onClick={() => setLoginOpen(true)}>Se connecter</button>
                </div>
              ) : eligible === false ? (
                <div className="evLocked">
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div className="evLockedIcon">🔒</div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div className="evLockedTitle">Tu ne participes pas encore aux événements</div>
                      <div className="evLockedSub" style={{ marginTop: 6 }}>
                        Il te manque {missingCount} étape{missingCount > 1 ? "s" : ""} pour apparaître dans le classement et gagner des lots.
                      </div>

                      {steps.length > 0 ? (
                        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {steps.map((s) => (
                            <span key={s.key} className={`evStepChip ${s.done ? "done" : "todo"}`}>
                              {s.done ? "✅" : STEP_ICON[s.key] ?? "•"} {s.label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 16 }}>
                        <Link to="/participer" className="evBtnBig">🔓 Débloquer ma participation →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : meRow ? (
                <MyScoreTiles me={meRow} />
              ) : (
                <div className="evCard" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26 }}>✅</div>
                  <div className="evLockedSub" style={{ marginTop: 8 }}>
                    Éligible ! Regarde un live pour commencer à marquer des points.
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </>
      ) : event.type === "wheel_week" && wheelWeek && wheelWeek.event ? (
        <WheelWeekPanel resp={wheelWeek} token={token} onLoginClick={() => setLoginOpen(true)} />
      ) : event.type === "global_chest" && chest && chest.event ? (
        <ChestPanel
          resp={chest}
          token={token}
          meUserId={auth?.user?.id ?? null}
          onLoginClick={() => setLoginOpen(true)}
          onRefresh={() => load().catch(() => {})}
        />
      ) : event.type === "clip_race" && clipRace && clipRace.event ? (
        <ClipRacePanel
          resp={clipRace}
          token={token}
          onLoginClick={() => setLoginOpen(true)}
          onRefresh={() => load().catch(() => {})}
        />
      ) : event.type === "burn_boss" && boss && boss.event ? (
        <BossPanel
          resp={boss}
          token={token}
          meUserId={auth?.user?.id ?? null}
          onLoginClick={() => setLoginOpen(true)}
          onRefresh={() => load().catch(() => {})}
        />
      ) : (
        <Reveal>
          <EventTeaser event={event} />
        </Reveal>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
