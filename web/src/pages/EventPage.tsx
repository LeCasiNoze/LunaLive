// web/src/pages/EventPage.tsx
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import { CountUp } from "../components/events/CountUp";
import { EventAvatar } from "../components/events/EventAvatar";
import { computeWheelSegments, EventWheelDial, WHEEL_SPIN_MS } from "../components/events/EventWheelDial";
import { playSpinSound } from "../components/events/wheelSound";
import "../components/events/events-theme.css";
import {
  getCurrentBoss,
  getCurrentChest,
  getCurrentClipRace,
  getCurrentEvent,
  getCurrentViewerWeek,
  getCurrentWheel,
  getEventAccessStatus,
  postBossBurn,
  postChestDeposit,
  postClipRaceVote,
  postWheelPalierClaim,
  postWheelQuestClaim,
  postWheelShopBuy,
  postWheelSpin,
  type ApiBossResp,
  type ApiChestResp,
  type ApiClipRaceResp,
  type ApiEventAccessStatus,
  type ApiEventRow,
  type ApiViewerWeekResp,
  type ApiWheelPageResp,
  type ApiWheelQuest,
  type EventAccessStepKey,
} from "../lib/api_events";

// Forme minimale commune à tous les classements individuels (viewer_week,
// wheel_week, top contributeurs coffre, top dégâts boss) — permet de
// réutiliser Podium/LeaderboardList pour n'importe quel type d'event.
type EvTopRow = { rank: number | null; userId: number; username: string; points: number };

// Modulo toujours positif — utilisé pour aligner la roue sur un angle cible
// sans jamais la faire reculer visuellement (voir handleSpin de WheelWeekPanel).
function normMod(n: number, m: number) {
  return ((n % m) + m) % m;
}

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

// ── Section règles "Comment ça marche ?" — un texte clair et non-technique
// par type d'event, affiché quel que soit l'état (scheduled/live/closed).
type RuleItem = { icon: string; title: string; text: string };
type EventRules = { summary: string; items: RuleItem[] };

const EVENT_RULES: Record<string, EventRules> = {
  viewer_week: {
    summary:
      "Chaque minute passée sur les lives LunaLive te fait gagner des points. Le viewer le plus actif de la semaine grimpe en tête du classement — et ton streamer préféré en profite aussi !",
    items: [
      {
        icon: "🔓",
        title: "Comment participer ?",
        text: "Connecte-toi, suis un streamer et débloque ta participation (quelques étapes rapides sur la page Participer). Ensuite, regarde un live pour commencer à marquer des points.",
      },
      {
        icon: "⭐",
        title: "Comment gagner des points ?",
        text: "Le temps passé à regarder un live, les jours où tu reviens, tes bonus quotidiens réclamés, tes messages dans le chat, tes calls (demander une slot précise au streamer) et tes tours de roue rapportent tous des points.",
      },
      {
        icon: "🤝",
        title: "Un bonus pour ton streamer",
        text: "Tes points comptent aussi pour le streamer que tu as le plus regardé cette semaine : il grimpe dans un classement streamers à part.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Le top du classement remporte des rubis, avec un badge exclusif « Champion du mois » pour le #1. Tous les participants actifs repartent avec des rubis et un ticket de roue.",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "L'event dure une semaine. À la fin, le classement est figé et les récompenses sont distribuées automatiquement.",
      },
    ],
  },
  wheel_week: {
    summary:
      "Chaque jour, tu as un tour de roue gratuit. Gagne des tickets, tourne, cumule des points et découvre un vrai lot à chaque tour !",
    items: [
      {
        icon: "🎟",
        title: "Comment participer ?",
        text: "Connecte-toi : tu reçois un tour de roue gratuit chaque jour. En accomplissant des petites quêtes, tu gagnes des tickets supplémentaires pour tourner encore plus.",
      },
      {
        icon: "🎡",
        title: "Comment gagner des points ?",
        text: "Chaque tour de roue rapporte des points qui s'ajoutent à ton classement de la semaine, et parfois un vrai lot en plus : rubis, XP, ticket bonus, cosmétique, voire le jackpot.",
      },
      {
        icon: "🏁",
        title: "Les paliers de la roue",
        text: "En cumulant tes points, tu débloques automatiquement des paliers avec des lots de plus en plus beaux — pas besoin de les réclamer, ils tombent tout seuls.",
      },
      {
        icon: "🛍",
        title: "La boutique",
        text: "Tu peux dépenser tes rubis pour racheter des tours de roue, rejouer un tour raté, ou booster ton XP pendant l'event.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Le classement est réservé au prestige : le podium reçoit un cadre de message exclusif, et le #1 remporte un abonnement offert de 7 jours et le titre « Roi de la Roue ».",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "L'event dure une semaine, classement remis à zéro chaque dimanche soir. Les tickets non utilisés sont gardés pour le prochain event de la roue.",
      },
    ],
  },
  clip_race: {
    summary:
      "Poste tes meilleurs moments en clip pendant l'event et utilise tes coups de cœur pour faire grimper les vidéos que tu préfères.",
    items: [
      {
        icon: "🎬",
        title: "Comment participer ?",
        text: "Utilise la commande !clip pendant un live pour créer un clip. Chaque clip posté pendant la semaine de l'event entre automatiquement en lice.",
      },
      {
        icon: "❤️",
        title: "Comment voter ?",
        text: "Connecte-toi et utilise tes coups de cœur (un nombre limité par semaine) pour soutenir tes clips préférés. Choisis bien, chaque vote compte !",
      },
      {
        icon: "🏅",
        title: "Deux classements",
        text: "Le classement des clips récompense les meilleures vidéos individuelles. Le classement des streamers récompense celui dont la communauté a cumulé le plus de votes.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Le streamer #1 reçoit des subs à distribuer, une mise en avant et un dépôt dans le coffre de sa commu. Les 3 meilleurs clips remportent des rubis (et un abonnement offert pour le #1). Les votants actifs reçoivent aussi une récompense.",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "L'event dure une semaine. Le classement final est figé à la fin et les lots sont distribués automatiquement.",
      },
    ],
  },
  global_chest: {
    summary:
      "Toute la communauté remplit un coffre commun ensemble. Une fois le palier atteint, tout le monde repart avec une récompense !",
    items: [
      {
        icon: "🤲",
        title: "Comment participer ?",
        text: "Connecte-toi et reste actif : tes bonus quotidiens, tes tours de roue, tes calls et tes messages remplissent automatiquement le coffre commun. Tu peux aussi y déposer des rubis directement.",
      },
      {
        icon: "📈",
        title: "Comment ça avance ?",
        text: "Chaque action de chaque joueur fait monter la barre commune. Plus la communauté est active (et généreuse), plus vite le coffre se remplit.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Dès que le palier est atteint, tous les contributeurs actifs reçoivent une récompense en rubis, plus un badge exclusif.",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "Le coffre peut se remplir avant la fin de la semaine : dans ce cas, l'event se termine dès que le palier est atteint. Sinon, il se clôture à la fin de la semaine.",
      },
    ],
  },
  burn_boss: {
    summary:
      "Un boss avec une jauge de vie commune s'invite sur LunaLive. Toute la communauté doit s'unir pour le faire tomber avant la fin de la semaine.",
    items: [
      {
        icon: "👊",
        title: "Comment participer ?",
        text: "Regarde les lives, discute, participe aux calls : chaque action de la communauté inflige des dégâts au boss. Tu peux aussi brûler des rubis pour taper plus fort.",
      },
      {
        icon: "🔥",
        title: "Comment infliger des dégâts ?",
        text: "Le temps de watch, les messages, les calls et tes rubis brûlés comptent tous comme des dégâts. Pas besoin de dépenser pour participer : rester actif suffit.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Quand le boss tombe, tous les contributeurs reçoivent une récompense et le badge « Boss Slayer ». Les joueurs qui ont infligé le plus de dégâts remportent un bonus supplémentaire.",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "Dès que la jauge de vie du boss tombe à zéro, ou à la fin de la semaine si le boss résiste.",
      },
    ],
  },
  duo_week: {
    summary:
      "LunaLive te forme un duo avec un autre viewer proche de tes centres d'intérêt. À deux, vos points s'additionnent pour grimper dans le classement !",
    items: [
      {
        icon: "🤝",
        title: "Comment participer ?",
        text: "LunaLive te propose automatiquement un partenaire, choisi parmi les viewers qui regardent les mêmes streamers que toi. Tu as quelques jours pour accepter.",
      },
      {
        icon: "🔄",
        title: "Pas convaincu par ton duo ?",
        text: "Tu peux refuser une fois pour recevoir une nouvelle proposition. Après ça, ton duo est figé pour le reste de la semaine.",
      },
      {
        icon: "⭐",
        title: "Comment marquer des points ?",
        text: "Toutes les actions de toi et de ton partenaire (watch, chat, calls…) s'additionnent dans un score de duo commun.",
      },
      {
        icon: "🎁",
        title: "Ce que tu peux gagner",
        text: "Le duo en tête du classement remporte une récompense pour lui, et sa communauté (celle des deux streamers concernés) en profite aussi.",
      },
      {
        icon: "⏳",
        title: "Quand ça se termine ?",
        text: "L'event dure une semaine. Le classement des duos est figé à la fin et les lots sont distribués automatiquement.",
      },
    ],
  },
};

function EventRulesBlock({ type }: { type: string }) {
  const rules = EVENT_RULES[type];
  const [open, setOpen] = React.useState(true);
  if (!rules) return null;
  return (
    <div className="evCard evRules">
      <button type="button" className="evRulesHead" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="evRulesTitle">📖 Comment ça marche ?</span>
        <span className={`evRulesChevron${open ? " open" : ""}`} aria-hidden="true">▾</span>
      </button>
      <div className="evRulesSummary">{rules.summary}</div>
      {open ? (
        <div className="evRulesBody">
          {rules.items.map((it) => (
            <div className="evRuleItem" key={it.title}>
              <span className="evRuleIcon">{it.icon}</span>
              <div>
                <div className="evRuleItemTitle">{it.title}</div>
                <div className="evRuleItemText">{it.text}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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

// Classement wheel_week v2 = prestige only (pas de rubis) : le podium
// remporte un cadre de message exclusif, le #1 en plus un abo + un titre.
const WHEEL_WEEK_REWARD_TIERS: RewardTierDisplay[] = [
  { key: "gold", rank: "👑 #1", amount: "Abo 7j", extra: "+ titre exclusif « Roi de la Roue » + cadre de message", gold: true },
  { key: "top3", rank: "🥈🥉 #2-3", amount: "Cadre", extra: "cadre de message exclusif « Roulette »" },
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

// Une ligne de quêtes (daily ou weekly) — barre de progression + bouton
// Réclamer si complétée et pas déjà récupérée.
function QuestGroup({
  quests,
  token,
  claimingKey,
  lastClaim,
  onClaim,
  onLoginClick,
}: {
  quests: ApiWheelQuest[];
  token: string | null;
  claimingKey: string | null;
  lastClaim: { key: string; ticketsAwarded: number } | null;
  onClaim: (key: string) => void;
  onLoginClick: () => void;
}) {
  return (
    <div className="evQuestList">
      {quests.map((q) => {
        const pct = q.goal > 0 ? Math.min(100, Math.round((q.progress / q.goal) * 100)) : 0;
        const justClaimed = lastClaim?.key === q.key;
        const cls = `evQuest${q.claimed ? " claimed" : q.done ? " claimable" : ""}`;
        return (
          <div className={cls} key={q.key}>
            <div className="evQuestHead">
              <div className="evQuestLabel">{q.label}</div>
              {justClaimed ? (
                <span className="evQuestReward">🎉 +{lastClaim!.ticketsAwarded} 🎟</span>
              ) : !token ? (
                <button type="button" className="evBtnGhost" onClick={onLoginClick}>Se connecter</button>
              ) : q.claimed ? (
                <span className="evQuestReward">✓ Récupéré</span>
              ) : q.done ? (
                <button type="button" className="evBtnGhost" onClick={() => onClaim(q.key)} disabled={claimingKey !== null}>
                  {claimingKey === q.key ? "…" : "🎟 Réclamer"}
                </button>
              ) : null}
            </div>
            <div className="evQuestBar"><div className="evQuestBarFill" style={{ width: `${pct}%` }} /></div>
            <div className="evQuestFoot">
              <span>{Math.min(q.progress, q.goal)}/{q.goal}</span>
              <span>{q.claimed ? "Récupéré" : q.done ? "Prêt !" : `${pct}%`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── wheel_week : roue + paliers + boutique + quêtes + classement ─────
function WheelWeekPanel({
  resp,
  token,
  meUserId,
  meName,
  onLoginClick,
}: {
  resp: Extract<ApiWheelPageResp, { event: ApiEventRow }>;
  token: string | null;
  meUserId: number | null;
  meName: string;
  onLoginClick: () => void;
}) {
  const [me, setMe] = React.useState(resp.me);
  const [shop, setShop] = React.useState(resp.shop);
  const [quests, setQuests] = React.useState(resp.quests);
  React.useEffect(() => { setMe(resp.me); setShop(resp.shop); setQuests(resp.quests); }, [resp.me, resp.shop, resp.quests]);
  const top3 = resp.leaderboard.slice(0, 3);
  const rest = resp.leaderboard.slice(3);
  const segMeta = React.useMemo(() => computeWheelSegments(resp.wheel), [resp.wheel]);

  const [tab, setTab] = React.useState<"roue" | "boutique" | "quetes" | "classement">("roue");
  const [modal, setModal] = React.useState<null | "rules" | "proba">(null);

  const [rotation, setRotation] = React.useState(0);
  const [spinning, setSpinning] = React.useState(false);
  const [hasSpun, setHasSpun] = React.useState(false);
  const [spinResult, setSpinResult] = React.useState<{
    points: number;
    xp: number;
    lotLabel?: string | null;
  } | null>(null);
  const [spinErr, setSpinErr] = React.useState<string | null>(null);

  // Fait tourner la roue jusqu'à ce que le segment `index` s'aligne sous le
  // repère (12h), avec 6 tours pleins de spectacle. Ne recule jamais (normMod).
  function animateToSegment(index: number) {
    const mid = index >= 0 && segMeta[index] ? segMeta[index].midDeg : Math.random() * 360;
    const targetMod = normMod(360 - mid, 360);
    setRotation((prev) => prev + normMod(targetMod - normMod(prev, 360), 360) + 360 * 6);
  }

  async function handleSpin() {
    if (!token) { onLoginClick(); return; }
    if (!me || (me.tickets < 1 && !me.freeSpinAvailable) || spinning) return;
    setSpinErr(null);
    setSpinResult(null);
    setSpinning(true);
    try {
      const r = await postWheelSpin(token);
      animateToSegment(r.segment.index);
      playSpinSound(WHEEL_SPIN_MS);
      window.setTimeout(() => {
        setSpinResult({ points: r.segment.points, xp: r.segment.xp, lotLabel: r.segment.lotLabel });
        setMe((cur) => cur ? { ...cur, tickets: r.tickets, points: r.points, freeSpinAvailable: false } : cur);
        setHasSpun(true);
        setSpinning(false);
      }, WHEEL_SPIN_MS + 120);
    } catch (e: any) {
      setSpinErr(e?.message || "Le tour a échoué, réessaie.");
      setSpinning(false);
    }
  }

  // Relance immédiate (item boutique 'reroll', payée en rubis) : même spectacle
  // qu'un spin normal, le segment tiré revient dans granted.segment.
  async function handleReroll() {
    if (!token) { onLoginClick(); return; }
    const item = shop.find((s) => s.code === "reroll");
    if (!me || !item || item.soldOut || spinning) return;
    setSpinErr(null);
    setSpinResult(null);
    setSpinning(true);
    try {
      const r = await postWheelShopBuy(token, "reroll");
      const seg = r.granted?.segment;
      animateToSegment(seg ? Number(seg.index) : -1);
      playSpinSound(WHEEL_SPIN_MS);
      window.setTimeout(() => {
        if (seg) setSpinResult({ points: Number(seg.points), xp: Number(seg.xp), lotLabel: seg.lotLabel });
        if (seg) setMe((cur) => cur ? { ...cur, points: cur.points + Number(seg.points || 0) } : cur);
        setSpinning(false);
      }, WHEEL_SPIN_MS + 120);
    } catch (e: any) {
      setSpinErr(e?.message || "Relance impossible (rubis insuffisants ou limite atteinte).");
      setSpinning(false);
    }
  }

  const [buyingCode, setBuyingCode] = React.useState<string | null>(null);
  const [buyErr, setBuyErr] = React.useState<string | null>(null);

  async function handleBuy(code: string) {
    if (!token) { onLoginClick(); return; }
    setBuyErr(null);
    setBuyingCode(code);
    try {
      const r = await postWheelShopBuy(token, code);
      setShop((cur) => cur.map((item) => item.code === code ? {
        ...item,
        boughtToday: r.boughtToday,
        nextPrice: r.nextPrice,
        soldOut: r.nextPrice == null,
      } : item));
      if (code === "ticket") setMe((cur) => cur ? { ...cur, tickets: cur.tickets + Number(r.granted?.tickets ?? 1) } : cur);
    } catch (e: any) {
      setBuyErr(e?.message || "Achat impossible, réessaie.");
    } finally {
      setBuyingCode(null);
    }
  }

  const [claimingKey, setClaimingKey] = React.useState<string | null>(null);
  const [claimErr, setClaimErr] = React.useState<string | null>(null);
  const [lastClaim, setLastClaim] = React.useState<{ key: string; ticketsAwarded: number } | null>(null);

  async function handleClaimQuest(key: string) {
    if (!token) { onLoginClick(); return; }
    setClaimErr(null);
    setClaimingKey(key);
    try {
      const r = await postWheelQuestClaim(token, key);
      setLastClaim({ key, ticketsAwarded: r.ticketsAwarded });
      setMe((cur) => cur ? { ...cur, tickets: r.tickets } : cur);
      setQuests((cur) => ({
        daily: cur.daily.map((q) => q.key === key ? { ...q, claimed: true } : q),
        weekly: cur.weekly.map((q) => q.key === key ? { ...q, claimed: true } : q),
      }));
      window.setTimeout(() => setLastClaim((cur) => (cur?.key === key ? null : cur)), 3500);
    } catch (e: any) {
      setClaimErr(e?.message || "Réclamation impossible, réessaie.");
    } finally {
      setClaimingKey(null);
    }
  }

  const [claimingPalier, setClaimingPalier] = React.useState(false);
  const [palierFlash, setPalierFlash] = React.useState<string[] | null>(null);
  async function handlePalierClaim() {
    if (!token) { onLoginClick(); return; }
    setClaimingPalier(true);
    try {
      const r = await postWheelPalierClaim(token);
      if (r.count > 0) {
        setMe((cur) => cur ? { ...cur, paliersClaimed: [...new Set([...cur.paliersClaimed, ...r.claimed.map((c) => c.index)])] } : cur);
        setPalierFlash(r.claimed.map((c) => c.rewardLabel));
        window.setTimeout(() => setPalierFlash(null), 4500);
      }
    } catch (e: any) {
      setSpinErr(e?.message || "Récupération impossible, réessaie.");
    } finally {
      setClaimingPalier(false);
    }
  }

  const points = me?.points ?? 0;
  const maxThreshold = resp.paliers.length ? resp.paliers[resp.paliers.length - 1].threshold : 0;
  const palierPct = maxThreshold > 0 ? Math.min(100, (Math.min(points, maxThreshold) / maxThreshold) * 100) : 0;
  const claimedSet = new Set(me?.paliersClaimed ?? []);
  const reachedUnclaimed = resp.paliers.filter((p) => points >= p.threshold && !claimedSet.has(p.index));
  const nextPalierReward = me?.nextPalier ? resp.paliers.find((p) => p.index === me.nextPalier!.index) : null;
  const reroll = shop.find((s) => s.code === "reroll");
  const canSpin = !!me && (me.tickets >= 1 || me.freeSpinAvailable);
  const rules = EVENT_RULES["wheel_week"];

  return (
    <div className="evWheel2">
      {/* Barre de statut : rang / points / tickets + accès popups (règles, chances) */}
      <div className="evWheel2Status">
        <div className="evW2Stats">
          <div className="evW2Stat"><span className="evW2Label">Rang</span><span className="evW2Val">#{me?.rank ?? "—"}</span></div>
          <div className="evW2Stat"><span className="evW2Label">Points</span><span className="evW2Val"><CountUp value={points} /></span></div>
          <div className="evW2Stat">
            <span className="evW2Label">Tickets</span>
            <span className="evW2Val">🎟 {me?.tickets ?? 0}{me?.freeSpinAvailable ? " · 🎁" : ""}</span>
          </div>
        </div>
        <div className="evW2Actions">
          <button type="button" className="evChipBtn" onClick={() => setModal("rules")}>📖 Règles</button>
          <button type="button" className="evChipBtn" onClick={() => setModal("proba")}>🎲 Chances</button>
        </div>
      </div>

      {/* Onglets (mobile-first, sticky) */}
      <div className="evTabs" role="tablist">
        {([
          ["roue", "🎡", "Roue"],
          ["boutique", "🛍️", "Boutique"],
          ["quetes", "🎯", "Quêtes"],
          ["classement", "🏆", "Classement"],
        ] as const).map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`evTab${tab === k ? " active" : ""}`}
            onClick={() => setTab(k)}
          >
            <span className="evTabIcon">{icon}</span>
            <span className="evTabLabel">{label}</span>
            {k === "roue" && reachedUnclaimed.length > 0 ? <span className="evTabBadge">{reachedUnclaimed.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="evTabPanel">
        {tab === "roue" ? (
          <div className="evRoueTab">
            <div className="evWheelArena">
              <div className="evWheelMachine">
                <div className="evWheelEyebrow">LUNALIVE JACKPOT</div>
                <EventWheelDial wheel={resp.wheel} rotationDeg={rotation} spinning={spinning} avatarUserId={meUserId} avatarName={meName} />
                {spinResult ? (
                  <div className="evSpinFlash">
                    <div className="evSpinFlashPts">+{spinResult.points} pts · +{spinResult.xp} XP</div>
                    {spinResult.lotLabel && spinResult.lotLabel !== "—" ? (
                      <div className="evSpinFlashLot">🎉 {spinResult.lotLabel}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="evWheelConsole">
                <div>
                  <span className="evConsoleKicker">{me?.freeSpinAvailable ? "CADEAU QUOTIDIEN DISPONIBLE" : "TENTE TA CHANCE"}</span>
                  <h2 className="evConsoleTitle">{me?.freeSpinAvailable ? "Ton tour gratuit t’attend." : "Un tour. Un lot. Zéro temps mort."}</h2>
                  <p className="evConsoleCopy">Chaque lancer rapporte des points et de l’XP. Le lot indiqué par le pointeur est immédiatement ajouté à ton compte.</p>
                </div>

                <div className="evConsoleBalance">
                  <div><span>Solde</span><strong>🎟 {me?.tickets ?? 0}</strong></div>
                  <div><span>Score semaine</span><strong>{points} pts</strong></div>
                </div>

                {!token ? (
                  <button type="button" className="evBtn evSpinBtn" onClick={onLoginClick}>Se connecter pour tourner</button>
                ) : (
                  <div className="evSpinBtns">
                    <button type="button" className="evBtn evSpinBtn" onClick={handleSpin} disabled={spinning || !canSpin}>
                      {spinning
                        ? "LA ROUE TOURNE…"
                        : me?.freeSpinAvailable
                        ? "LANCER MON TOUR GRATUIT"
                        : me && me.tickets >= 1
                        ? `TOURNER · 1 (${me.tickets})`
                        : "PLUS DE TICKETS"}
                    </button>
                    {hasSpun ? (
                      <button
                        type="button"
                        className="evBtn evRerollBtn"
                        onClick={handleReroll}
                        disabled={spinning || !reroll || reroll.soldOut}
                        title="Relancer tout de suite en payant des rubis"
                      >
                        {reroll && !reroll.soldOut ? `↻ Relancer · 💎 ${reroll.nextPrice}` : "Relances épuisées"}
                      </button>
                    ) : null}
                  </div>
                )}
                {spinErr ? <div className="evErrLine">{spinErr}</div> : null}
                <button type="button" className="evOddsLink" onClick={() => setModal("proba")}>Voir les chances de gain →</button>
              </div>
            </div>

            {resp.paliers.length > 0 ? (
              <div className="evPalierBlock">
                <div className="evPalierHead">
                  <span className="evPalierHeadTitle">🏁 Paliers de points</span>
                  <span className="evPalierHeadPts">{points} / {maxThreshold}</span>
                </div>
                <div className="evPalierTrack">
                  <div className="evPalierFill" style={{ width: `${palierPct}%` }} />
                  {resp.paliers.map((p) => {
                    const left = maxThreshold > 0 ? Math.min(100, (p.threshold / maxThreshold) * 100) : 0;
                    const done = claimedSet.has(p.index);
                    const reached = points >= p.threshold;
                    return (
                      <div
                        key={p.index}
                        className={`evPalierMark${done ? " done" : reached ? " reached" : ""}`}
                        style={{ left: `${left}%` }}
                        title={`${p.threshold} pts — ${p.rewardLabel}`}
                      >
                        {done ? "✓" : p.threshold}
                      </div>
                    );
                  })}
                </div>
                {me && nextPalierReward ? (
                  <div className="evPalierNext">🎯 {me.nextPalier!.remaining} pts avant « {nextPalierReward.rewardLabel} »</div>
                ) : me ? (
                  <div className="evPalierNext">🏆 Tous les paliers atteints !</div>
                ) : null}

                {reachedUnclaimed.length > 0 ? (
                  <div className="evPalierClaim">
                    <div className="evPalierClaimList">
                      {reachedUnclaimed.map((p) => (
                        <span className="evPalierClaimChip" key={p.index}>🎁 {p.rewardLabel}</span>
                      ))}
                    </div>
                    <button type="button" className="evBtn evPalierClaimBtn" onClick={handlePalierClaim} disabled={claimingPalier}>
                      {claimingPalier ? "…" : `Récupérer ${reachedUnclaimed.length} palier${reachedUnclaimed.length > 1 ? "s" : ""}`}
                    </button>
                  </div>
                ) : null}
                {palierFlash ? <div className="evPalierFlash">✅ Récupéré : {palierFlash.join(" · ")}</div> : null}

                <div className="evPalierList">
                  {resp.paliers.map((p) => {
                    const done = claimedSet.has(p.index);
                    const reached = points >= p.threshold;
                    return (
                      <div className={`evPalierRow${done ? " done" : reached ? " reached" : ""}`} key={p.index}>
                        <span className="evPalierRowThresh">{p.threshold}</span>
                        <span className="evPalierRowLabel">{p.rewardLabel}</span>
                        <span className="evPalierRowState">{done ? "✓ obtenu" : reached ? "à récupérer" : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === "boutique" ? (
          <div className="evShopTab">
            <div className="evShopGrid">
              {shop.map((item) => (
                <div className="evShopItem" key={item.code}>
                  <div className="evShopLabel">{item.label}</div>
                  <div className="evShopPrice">{item.nextPrice != null ? `💎 ${item.nextPrice}` : "Épuisé"}</div>
                  <div className="evShopCap">{item.boughtToday}/{item.capPerDay} aujourd'hui</div>
                  <button
                    type="button"
                    className="evBtn evShopBuyBtn"
                    onClick={() => (token ? handleBuy(item.code) : onLoginClick())}
                    disabled={(token != null && item.soldOut) || buyingCode !== null}
                  >
                    {buyingCode === item.code ? "…" : item.soldOut ? "Épuisé" : "Acheter"}
                  </button>
                </div>
              ))}
            </div>
            {buyErr ? <div className="evErrLine">{buyErr}</div> : null}
            {!token ? <div className="evLockedSub" style={{ marginTop: 12 }}>Connecte-toi pour acheter dans la boutique.</div> : null}
          </div>
        ) : tab === "quetes" ? (
          <div className="evQuestTab">
            {quests.daily.length > 0 ? (
              <div className="evQuestGroup">
                <div className="evQuestGroupTitle">Quotidiennes</div>
                <QuestGroup quests={quests.daily} token={token} claimingKey={claimingKey} lastClaim={lastClaim} onClaim={handleClaimQuest} onLoginClick={onLoginClick} />
              </div>
            ) : null}
            {quests.weekly.length > 0 ? (
              <div className="evQuestGroup">
                <div className="evQuestGroupTitle">Hebdomadaires</div>
                <QuestGroup quests={quests.weekly} token={token} claimingKey={claimingKey} lastClaim={lastClaim} onClaim={handleClaimQuest} onLoginClick={onLoginClick} />
              </div>
            ) : null}
            {quests.daily.length === 0 && quests.weekly.length === 0 ? (
              <div className="evLockedSub" style={{ textAlign: "center" }}>Aucune quête disponible pour l'instant.</div>
            ) : null}
            {claimErr ? <div className="evErrLine">{claimErr}</div> : null}
          </div>
        ) : (
          <div className="evRankTab">
            {top3.length > 0 ? <Podium top={top3} meUserId={meUserId} /> : (
              <div className="evLockedSub" style={{ textAlign: "center", padding: "8px 0 4px" }}>
                Personne au classement pour l'instant — tourne la roue pour y entrer !
              </div>
            )}
            {rest.length > 0 ? <div style={{ marginTop: 14 }}><LeaderboardList rows={rest} meUserId={meUserId} /></div> : null}
            <div style={{ marginTop: 18 }}>
              <div className="evSectionTitle">🎁 Récompenses de fin de semaine</div>
              <RewardsShowcase tiers={WHEEL_WEEK_REWARD_TIERS} />
            </div>
          </div>
        )}
      </div>

      {modal ? (
        <div className="evModalBackdrop" role="dialog" aria-modal="true" onClick={() => setModal(null)}>
          <div className="evModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="evModalHead">
              <span className="evModalTitle">{modal === "rules" ? "📖 Comment ça marche ?" : "🎲 Chances de la roue"}</span>
              <button type="button" className="evModalClose" onClick={() => setModal(null)} aria-label="Fermer">✕</button>
            </div>
            <div className="evModalBody">
              {modal === "rules" ? (
                <>
                  {rules ? <div className="evRulesSummary" style={{ marginBottom: 12 }}>{rules.summary}</div> : null}
                  {rules?.items.map((it) => (
                    <div className="evRuleItem" key={it.title}>
                      <span className="evRuleIcon">{it.icon}</span>
                      <div>
                        <div className="evRuleItemTitle">{it.title}</div>
                        <div className="evRuleItemText">{it.text}</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="evProbaList">
                  {resp.wheel.map((seg, i) => (
                    <div className="evProbaRow" key={i}>
                      <span className="evWheelSwatch" style={{ background: segMeta[i]?.color }} />
                      <span className="evProbaLabel">{seg.lotLabel && seg.lotLabel !== "—" ? seg.lotLabel : `${seg.points} pts`}</span>
                      <span className="evProbaPct">{seg.proba}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
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

// Slugs d'URL /event/:type -> type d'event réel. Permet de consulter n'importe
// quel event live directement (ex. /event/roue) sans qu'il soit l'event courant.
const SLUG_TO_TYPE: Record<string, string> = {
  roue: "wheel_week",
  wheel: "wheel_week",
  viewer: "viewer_week",
  clips: "clip_race",
  clip: "clip_race",
  coffre: "global_chest",
  chest: "global_chest",
  boss: "burn_boss",
  duo: "duo_week",
};

export default function EventPage() {
  const auth = useAuth();
  const routeParams = useParams();
  const rawSlug = String(routeParams.type || "").toLowerCase();
  // null => event courant (rotation). "__unknown__" => slug inconnu (aucun event).
  const forcedType = rawSlug ? (SLUG_TO_TYPE[rawSlug] ?? "__unknown__") : null;
  const token = auth?.token ?? null;

  const [loginOpen, setLoginOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [event, setEvent] = React.useState<ApiEventRow | null>(null);
  const [viewerWeek, setViewerWeek] = React.useState<ApiViewerWeekResp | null>(null);
  const [wheelWeek, setWheelWeek] = React.useState<ApiWheelPageResp | null>(null);
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
      // Aperçu local des events sans modifier le cycle de production.
      const previewType = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("preview") : null;
      if (previewType === "viewer_week") {
        const start = new Date();
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        const previewEvent: ApiEventRow = {
          id: -1, type: "viewer_week", cycle_index: 0, state: "live",
          start_at: start.toISOString(), end_at: end.toISOString(),
          created_at: start.toISOString(), updated_at: start.toISOString(),
        };
        setEvent(previewEvent);
        setViewerWeek({
          ok: true,
          event: previewEvent,
          rules: { pointsPerMinute: 1, topN: 100 },
          top: [],
          me: null,
        });
        setWheelWeek(null);
        setChest(null);
        setClipRace(null);
        setBoss(null);
        setLoading(false);
        return;
      }
      // Type imposé par l'URL /event/:type (consulter un event précis sans qu'il
      // soit l'event "courant" de la rotation), sinon type de l'event courant.
      // Chaque endpoint de type trouve l'event LIVE de son type indépendamment.
      let type: string;
      let baseEvent: ApiEventRow | null = null;
      if (forcedType) {
        type = forcedType;
      } else {
        const cur = await getCurrentEvent();
        baseEvent = cur?.event ?? null;
        type = String(baseEvent?.type || "");
      }
      let resolvedEvent: ApiEventRow | null = baseEvent;

      if (type === "viewer_week") {
        const v = await getCurrentViewerWeek(token);
        setViewerWeek(v);
        if (forcedType) resolvedEvent = v.event ?? null;
      } else {
        setViewerWeek(null);
      }

      if (type === "wheel_week") {
        const w = await getCurrentWheel(token);
        setWheelWeek(w);
        if (forcedType) resolvedEvent = w.event ?? null;
      } else {
        setWheelWeek(null);
      }

      if (type === "global_chest") {
        const c = await getCurrentChest(token);
        setChest(c);
        if (forcedType) resolvedEvent = c.event ?? null;
      } else {
        setChest(null);
      }

      if (type === "clip_race") {
        const cr = await getCurrentClipRace(token);
        setClipRace(cr);
        if (forcedType) resolvedEvent = cr.event ?? null;
      } else {
        setClipRace(null);
      }

      if (type === "burn_boss") {
        const b = await getCurrentBoss(token);
        setBoss(b);
        if (forcedType) resolvedEvent = b.event ?? null;
      } else {
        setBoss(null);
      }

      setEvent(resolvedEvent);

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
  }, [token, forcedType]);

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
      <section className={`evHero${event?.type === "wheel_week" || event?.type === "viewer_week" ? " evHeroWheel" : ""}`} ref={heroRef} onMouseMove={onHeroMove}>
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

      {event && event.type !== "wheel_week" && event.type !== "viewer_week" ? (
        <Reveal>
          <EventRulesBlock type={event.type} />
        </Reveal>
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
        <div className="evViewerWeek">
          <div className="evViewerIntro">
            <div>
              <span className="evConsoleKicker">LA COURSE EST LANCÉE</span>
              <h2 className="evViewerHeadline">Regarde. Participe.<br />Prends la tête.</h2>
              <p>Chaque minute de live et chaque interaction font grimper ton score. Une semaine pour laisser ton nom tout en haut.</p>
            </div>
            <div className="evViewerQuickStats">
              <div><span>Participants classés</span><strong>{top3.length}</strong></div>
              <div><span>Ton rang</span><strong>#{meRow?.rank ?? "—"}</strong></div>
              <div><span>Ton score</span><strong>{meRow?.points ?? 0}</strong></div>
            </div>
          </div>

          <div className="evViewerMainGrid">
            <Reveal>
              <div className="evViewerPanel evViewerPodiumPanel">
                <div className="evPanelHead"><span>🏆 Podium actuel</span><small>Mise à jour en direct</small></div>
                <Podium top={top3} meUserId={meUserId} />
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="evViewerPanel">
                <div className="evPanelHead"><span>🎁 Récompenses</span><small>Fin de semaine</small></div>
                <RewardsShowcase tiers={VIEWER_WEEK_REWARD_TIERS} />
              </div>
            </Reveal>
          </div>

          {rest.length > 0 ? (
            <Reveal delay={0.08}>
              <div className="evViewerPanel">
                <div className="evPanelHead"><span>📊 Classement complet</span><small>{rest.length + 3} joueurs</small></div>
                <LeaderboardList rows={rest} meUserId={meUserId} />
              </div>
            </Reveal>
          ) : null}

          <Reveal delay={0.12}>
            <div className="evViewerPanel">
              <div className="evPanelHead"><span>🎯 Ton espace</span><small>Progression personnelle</small></div>

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
        </div>
      ) : event.type === "wheel_week" && wheelWeek && wheelWeek.event ? (
        <WheelWeekPanel
          resp={wheelWeek}
          token={token}
          meUserId={auth?.user?.id ?? null}
          meName={auth?.user?.username ?? ""}
          onLoginClick={() => setLoginOpen(true)}
        />
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
