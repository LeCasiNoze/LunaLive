// api/src/economy/xp.ts
//
// Système XP / Levels — LunaLive.
//
// Courbe : 100 niveaux exponentiels.
// xp_for_level(n) ≈ 4 × n^1.4 → progression rapide au début, longue à la fin.
// Cumul cible (XP_TOTAL_FOR_LEVEL) — recalibré avec retour utilisateur:
//   L1   ~4 XP
//   L10  ~360 XP        (~3 jours casu)
//   L25  ~3 200 XP      (~1 mois casu)
//   L50  ~17 000 XP     (~5 mois casu / 2 mois hardcore)
//   L75  ~50 000 XP     (~1.5 an casu / 6 mois hardcore)
//   L100 ~145 000 XP    (~3 ans casu / 1 an Nico / 8 mois ultra hardcore)
//
// Référence: Nico Carrasso = Lvl 71 sur Nozebet (326k XP, plusieurs années).
// 10 paliers (tiers) de 10 levels chacun. Titres romain I-X dans chaque palier.
// Le titre du palier courant suit automatiquement le level (pas besoin de
// "title_auto" séparés à débloquer — le titre niveau évolue tout seul).

import type { PoolClient } from "pg";

export const MAX_LEVEL = 100;
const COEF = 4;
const EXP = 1.4;

/** Coût XP pour passer du level n-1 au level n. Level 0 = 0 XP. */
export function xpForLevel(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(COEF * Math.pow(n, EXP)));
}

/** XP cumulatif total nécessaire pour ATTEINDRE le level n (depuis 0). */
export function xpTotalForLevel(n: number): number {
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 1; i <= Math.min(n, MAX_LEVEL); i++) sum += xpForLevel(i);
  return sum;
}

/** Pré-calcul de la table de seuils [0, xp_for_L1, xp_for_L1+L2, ...]. */
export const XP_THRESHOLDS: number[] = (() => {
  const out: number[] = [0];
  let cum = 0;
  for (let i = 1; i <= MAX_LEVEL; i++) {
    cum += xpForLevel(i);
    out.push(cum);
  }
  return out;
})();

/** À partir d'un total XP, retourne le level courant (0..100). */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let lo = 0;
  let hi = XP_THRESHOLDS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_THRESHOLDS[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Détail level pour un user (level courant + progression vers next). */
export type LevelInfo = {
  level: number;
  xp: number;
  xpAtLevel: number; // XP cumul au début du level courant
  xpForNextLevel: number; // XP requis pour passer au next level (à partir de xpAtLevel)
  xpProgress: number; // XP gagné dans le level courant
  xpToNext: number; // XP restant pour next level
  pctToNext: number; // 0..100
  isMax: boolean;
  tier: number; // 0..9
  tierLabel: string; // "Gratteur de Tips", etc.
  romanInTier: string; // I..X
  fullTitle: string; // "Farm Hunter III"
};

const TIER_TITLES = [
  "Nouveau-Né",
  "Gratteur de Tips",
  "Apprenti Spinner",
  "Habitué",
  "Farm Hunter",
  "Flaireur de Call",
  "Saigneur de Slot",
  "Roi de la Slot",
  "Apôtre de la Lune",
  "Légende LunaLive",
];

function intToRoman(n: number): string {
  n = Math.max(1, Math.min(n, 10));
  const map = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return map[n - 1];
}

export function getLevelInfo(xp: number): LevelInfo {
  const level = levelFromXp(xp);
  const isMax = level >= MAX_LEVEL;
  const xpAtLevel = XP_THRESHOLDS[level] || 0;
  const xpAtNext = XP_THRESHOLDS[Math.min(level + 1, MAX_LEVEL)] || xpAtLevel;
  const xpForNextLevel = Math.max(1, xpAtNext - xpAtLevel);
  const xpProgress = Math.max(0, xp - xpAtLevel);
  const xpToNext = isMax ? 0 : Math.max(0, xpAtNext - xp);
  const pctToNext = isMax ? 100 : Math.min(100, Math.round((xpProgress * 100) / xpForNextLevel));

  const tier = Math.min(9, Math.floor(level / 10));
  const tierLabel = TIER_TITLES[tier];
  const romanInTier = intToRoman((level % 10) + 1);

  return {
    level,
    xp,
    xpAtLevel,
    xpForNextLevel,
    xpProgress,
    xpToNext,
    pctToNext,
    isMax,
    tier,
    tierLabel,
    romanInTier,
    fullTitle: isMax ? `${tierLabel} (MAX)` : `${tierLabel} ${romanInTier}`,
  };
}

/* ─── Perks par level ──────────────────────────────────────────────────── */
//
// Perks débloqués au passage d'un level. Utilisés pour gating shop, bonus
// gameplay, etc. Les "shop_grade" indiquent le grade max de cosmétique
// achetable. Les "perk_*" sont des effets passifs.

export type Perk =
  | { kind: "shop_grade"; grade: number; label: string }
  | { kind: "perk"; code: string; label: string; description: string }
  | { kind: "cosmetic"; code: string; label: string; description: string }
  | { kind: "title_auto"; code: string; label: string };

export const LEVEL_PERKS: Record<number, Perk[]> = {
  1:   [{ kind: "shop_grade", grade: 0, label: "Shop niveau 0 débloqué" }],
  5:   [{ kind: "perk", code: "wheel_ticket_weekly", label: "+1 ticket roue / semaine", description: "Reçois 1 ticket roue de plus chaque semaine." }],
  10:  [{ kind: "shop_grade", grade: 1, label: "Shop niveau 1 (badges, hats simples)" }],
  15:  [{ kind: "perk", code: "daily_bonus_5pct", label: "+5% sur le daily bonus rubis", description: "Tous les daily bonus en rubis sont boostés de 5%." }],
  20:  [{ kind: "perk", code: "bj_cd_10pct", label: "−10% cooldown blackjack", description: "Le cooldown du /blackjack passe de 12h à ~10h48." }],
  25:  [{ kind: "shop_grade", grade: 2, label: "Shop niveau 2 (titres premium)" },
        { kind: "perk", code: "daily_bonus_10pct", label: "+10% sur le daily bonus rubis (remplace le +5%)", description: "Daily bonus rubis boosté à +10%." }],
  40:  [{ kind: "perk", code: "wheel_ticket_weekly_2", label: "+2 tickets roue / semaine (remplace +1)", description: "Reçois 2 tickets roue de plus chaque semaine." },
        { kind: "perk", code: "bj_cd_20pct", label: "−20% cooldown blackjack (remplace −10%)", description: "Cooldown blackjack ramené à ~9h36." }],
  50:  [{ kind: "shop_grade", grade: 3, label: "Shop niveau 3 (cosmétiques premium)" },
        { kind: "cosmetic", code: "frame_silver_aura", label: "Frame chat 'Silver Aura'", description: "Cosmétique exclusif débloqué." }],
  60:  [{ kind: "perk", code: "bj_cd_30pct", label: "−30% cooldown blackjack (remplace −20%)", description: "Cooldown blackjack ramené à ~8h24." }],
  70:  [{ kind: "perk", code: "claim_discord_bonus_10pct", label: "+10% sur les /claim Discord", description: "Tes /claim Discord sont boostés de 10%." }],
  75:  [{ kind: "shop_grade", grade: 4, label: "Shop niveau 4 (collections limitées)" },
        { kind: "cosmetic", code: "hat_eclipse_halo", label: "Hat 'Eclipse Halo'", description: "Cosmétique exclusif débloqué." }],
  80:  [{ kind: "perk", code: "bj_cd_40pct", label: "−40% cooldown blackjack (remplace −30%)", description: "Cooldown blackjack ramené à ~7h12." },
        { kind: "perk", code: "discord_blackjack_max", label: "Commande Discord /blackjack_max débloquée", description: "Joue avec mises ×10 sur tous les paris (main + side bets)." }],
  85:  [{ kind: "perk", code: "blackjack_natural_bonus", label: "+5% gain blackjack natural", description: "Les blackjack naturels paient légèrement plus." }],
  100: [{ kind: "shop_grade", grade: 5, label: "Shop niveau légendaire" },
        { kind: "cosmetic", code: "uanim_chroma_legendary", label: "Username Chroma Legendary", description: "Animation pseudo unique au level max." },
        { kind: "perk", code: "bj_cd_50pct", label: "−50% cooldown blackjack (max)", description: "Cooldown blackjack ramené à 6h." },
        { kind: "perk", code: "all_in", label: "Tous les perks précédents cumulés", description: "Tu as débloqué tout ce qu'il y a à débloquer." }],
};

/**
 * Helpers gameplay calculés depuis le level (à utiliser dans les routes).
 */

/** Cooldown blackjack ajusté par level (en ms). Base = 12h. */
export function getBlackjackCooldownMs(level: number): number {
  const base = 12 * 60 * 60 * 1000;
  if (level >= 100) return Math.round(base * 0.5);
  if (level >= 80) return Math.round(base * 0.6);
  if (level >= 60) return Math.round(base * 0.7);
  if (level >= 40) return Math.round(base * 0.8);
  if (level >= 20) return Math.round(base * 0.9);
  return base;
}

/** Multiplicateur daily bonus rubis (1.0 = pas de bonus). */
export function getDailyBonusMultiplier(level: number): number {
  if (level >= 25) return 1.10;
  if (level >= 15) return 1.05;
  return 1.0;
}

/** Tickets roue bonus offerts par semaine. */
export function getWeeklyWheelTicketsBonus(level: number): number {
  if (level >= 40) return 2;
  if (level >= 5) return 1;
  return 0;
}

/** Multiplicateur Discord /claim. */
export function getDiscordClaimMultiplier(level: number): number {
  if (level >= 70) return 1.10;
  return 1.0;
}

/** Daily wheel: nombre de spins gratuits par jour. (Reste à 1 même au level max.) */
export function getDailyWheelFreeSpins(_level: number): number {
  return 1;
}

/** L'user débloque-t-il /blackjack_max (mises x10) ? */
export function hasBlackjackMaxUnlock(level: number): boolean {
  return level >= 80;
}

/** Liste tous les perks débloqués pour un level donné (cumulatif). */
export function getUnlockedPerks(level: number): Perk[] {
  const out: Perk[] = [];
  for (const k of Object.keys(LEVEL_PERKS).map(Number).sort((a, b) => a - b)) {
    if (k <= level) out.push(...LEVEL_PERKS[k]);
  }
  return out;
}

/** Les prochains perks à débloquer (top 3 levels suivants). */
export function getUpcomingPerks(level: number, count = 3): Array<{ level: number; perks: Perk[] }> {
  const out: Array<{ level: number; perks: Perk[] }> = [];
  const keys = Object.keys(LEVEL_PERKS).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (k > level) {
      out.push({ level: k, perks: LEVEL_PERKS[k] });
      if (out.length >= count) break;
    }
  }
  return out;
}

/** Grade shop max accessible au level donné. */
export function getShopGrade(level: number): number {
  let g = 0;
  for (const k of Object.keys(LEVEL_PERKS).map(Number)) {
    if (k > level) continue;
    for (const perk of LEVEL_PERKS[k]) {
      if (perk.kind === "shop_grade") g = Math.max(g, perk.grade);
    }
  }
  return g;
}

/* ─── Sources d'XP & caps quotidiens ───────────────────────────────────── */

export const XP_SOURCES = {
  quest_daily: 30,
  quest_weekly: 80,
  quest_monthly: 250,
  daily_bonus: 5,
  achievement_bronze: 50,
  achievement_silver: 100,
  achievement_gold: 250,
  achievement_master: 500,
  call_sent: 5,
  chat_message: 0.1, // accumulé puis arrondi
  watch_minute: 0.2, // 1 XP / 5 min
  sub_send: 100,
  wheel_spin: 1,
  blackjack_played: 2,
  admin_grant: null, // pas de cap
} as const;

/** Caps quotidiens par source (pour empêcher le farm en spammant chat/watch). */
export const XP_DAILY_CAPS: Partial<Record<string, number>> = {
  chat_message: 50, // 50 XP/j max via chat
  watch_minute: 100, // 100 XP/j max via watch (= 500 min de watch)
  call_sent: 50, // 10 calls/jour max
  wheel_spin: 10, // 10 spins/jour comptés
  blackjack_played: 20,
};

/* ─── Award XP service (atomique, log, cap) ────────────────────────────── */

export type AwardXpResult = {
  delta: number; // peut être 0 si capé
  capped: boolean;
  newXp: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
};

/**
 * Crédit XP atomique avec cap quotidien optionnel.
 * À appeler dans une transaction existante (PoolClient).
 *
 * @param amount nombre d'XP positif (sera arrondi à l'entier supérieur)
 * @param source clé pour le cap quotidien (ex: 'quest_daily', 'chat_message')
 * @param reason texte court pour audit (optionnel)
 * @param meta données contextuelles (optionnel)
 */
export async function awardXpTx(
  client: PoolClient,
  userId: number,
  amount: number,
  source: string,
  reason?: string,
  meta?: Record<string, unknown>
): Promise<AwardXpResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    const u = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
    const xp = Number(u.rows[0]?.xp || 0);
    const lvl = levelFromXp(xp);
    return { delta: 0, capped: false, newXp: xp, oldLevel: lvl, newLevel: lvl, leveledUp: false };
  }

  let delta = Math.ceil(amount);
  let capped = false;

  // Cap quotidien
  const cap = XP_DAILY_CAPS[source];
  if (cap != null && cap > 0) {
    const r = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS used
         FROM xp_events
        WHERE user_id = $1 AND source = $2
          AND day = (NOW() AT TIME ZONE 'Europe/Paris')::date`,
      [userId, source]
    );
    const used = Number(r.rows[0]?.used || 0);
    const remaining = Math.max(0, cap - used);
    if (remaining <= 0) {
      const u = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
      const xp = Number(u.rows[0]?.xp || 0);
      const lvl = levelFromXp(xp);
      return { delta: 0, capped: true, newXp: xp, oldLevel: lvl, newLevel: lvl, leveledUp: false };
    }
    if (delta > remaining) {
      delta = remaining;
      capped = true;
    }
  }

  if (delta <= 0) {
    const u = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
    const xp = Number(u.rows[0]?.xp || 0);
    const lvl = levelFromXp(xp);
    return { delta: 0, capped, newXp: xp, oldLevel: lvl, newLevel: lvl, leveledUp: false };
  }

  // Lock + update
  const before = await client.query(
    `SELECT xp::bigint AS xp FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (!before.rows[0]) {
    return { delta: 0, capped: false, newXp: 0, oldLevel: 0, newLevel: 0, leveledUp: false };
  }
  const oldXp = Number(before.rows[0].xp || 0);
  const oldLevel = levelFromXp(oldXp);
  const newXp = oldXp + delta;
  const newLevel = levelFromXp(newXp);

  await client.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [userId, delta]);
  await client.query(
    `INSERT INTO xp_events (user_id, delta, source, reason, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, delta, source, reason || null, meta ? JSON.stringify(meta) : null]
  );

  return {
    delta,
    capped,
    newXp,
    oldLevel,
    newLevel,
    leveledUp: newLevel > oldLevel,
  };
}
