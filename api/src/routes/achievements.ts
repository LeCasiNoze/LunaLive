// api/src/routes/achievements.ts
import { Router } from "express";
import { pool } from "../db.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";

export const achievementsRouter = Router();

type Tier = "bronze" | "silver" | "gold" | "master";
type Kind = "username" | "badge" | "title" | "frame" | "hat";

type Metrics = {
  userId: number;
  lastLoginAt: string | null;

  // month bounds (Paris)
  monthStartIso: string;
  monthEndIso: string;

  // tracked
  watchMinutesTotal: number;
  watchMinutesMonth: number;
  distinctLivesTotal: number;

  chatMessagesTotal: number;

  followsCount: number;
  hasNotifyEnabled: boolean;
  hasFollowQuick: boolean;

  wheelSpinsTotal: number;

  dailyBonusDaysMonth: number;

  chestJoinsTotal: number;
  chestWinningsTotal: number;

  hasAnySub: boolean;
  supportedStreamersDistinct: number;
  supportSpentRubis: number;

  noctambuleOk: boolean;
  earlyBirdOk: boolean;

  hasAvatarUploaded: boolean;
  hasAnyCosmeticEquipped: boolean;
  hasFullLookEquipped: boolean;
  hasShopPurchase: boolean;
  streamerTabsSeenMaxPerStreamer: number;
  clipsOpenedTotal: number;
  predictionBetsTotal: number;
  predictionWinsTotal: number;
  rainJoinsTotal: number;
  wheelJoinsTotal: number;
  hasPushEnabled: boolean;
  hasReferral: boolean;
  botTabsUsedMaxPerStreamer: number;
  hasVitrineCompleteSession: boolean;
};

type AchievementDef = {
  id: string;
  tier: Tier;
  category: string;
  icon: string;

  // visibilité
  name: string;
  desc?: string;
  hint?: string;
  hidden?: boolean;

  // évaluation
  eval: (m: Metrics, unlockedCountExceptCollector: number) => {
    unlocked: boolean;
    progress?: { current: number; target: number } | null;
  };

  // optionnel: “récompense” affichable côté UI
  rewardPreview?: string;
};

const SHOP_ENTITLEMENT_KEYS = new Set(
  COSMETICS_CATALOG.filter(
    (item) =>
      item.active &&
      item.unlock === "shop" &&
      (typeof item.priceRubis === "number" || typeof item.pricePrestige === "number")
  ).map((item) => `${item.kind}:${item.code}`)
);

// helper query typé (db.query n’est pas générique chez toi)
const q = <T extends Record<string, any> = any>(text: string, params: any[] = []) => pool.query<T>(text, params);

async function tableExists(table: string) {
  const r = await q<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  return !!r.rows?.[0]?.reg;
}

async function getParisBounds() {
  const r = await q<{ month_start: string; month_end: string }>(`
    SELECT
      (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) AT TIME ZONE 'Europe/Paris')::timestamptz AS month_start,
      ((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) + interval '1 month') AT TIME ZONE 'Europe/Paris')::timestamptz AS month_end
  `);

  const monthStart = r.rows?.[0]?.month_start;
  const monthEnd = r.rows?.[0]?.month_end;

  return {
    monthStartIso: monthStart ? new Date(monthStart).toISOString() : new Date().toISOString(),
    monthEndIso: monthEnd ? new Date(monthEnd).toISOString() : new Date().toISOString(),
  };
}

async function safeCount(sql: string, params: any[] = [], fallback = 0) {
  try {
    const r = await q<{ n: string | number | null }>(sql, params);
    const v = Number(r.rows?.[0]?.n ?? fallback);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

async function safeSum(sql: string, params: any[] = [], fallback = 0) {
  try {
    const r = await q<{ s: string | number | null }>(sql, params);
    const v = Number(r.rows?.[0]?.s ?? fallback);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function criteriaProgress(flags: boolean[]) {
  return { current: flags.filter(Boolean).length, target: flags.length };
}

function boolProgress(flag: boolean) {
  return { current: flag ? 1 : 0, target: 1 };
}

function hasText(v: any) {
  return String(v ?? "").trim().length > 0;
}

function activeFeatureFamiliesCount(m: Metrics) {
  const families = [
    m.watchMinutesTotal > 0 || m.distinctLivesTotal > 0,
    m.chatMessagesTotal > 0,
    m.followsCount > 0 || m.hasNotifyEnabled || m.hasFollowQuick,
    m.wheelSpinsTotal > 0,
    m.dailyBonusDaysMonth > 0,
    m.chestJoinsTotal > 0 || m.chestWinningsTotal > 0,
    m.hasAnySub || m.supportSpentRubis > 0 || m.supportedStreamersDistinct > 0,
  ];
  return families.filter(Boolean).length;
}

async function getMetrics(userId: number): Promise<Metrics> {
  const { monthStartIso, monthEndIso } = await getParisBounds();

  // users.last_login_at
  const u = await q<{ last_login_at: string | null }>(`SELECT last_login_at FROM users WHERE id=$1 LIMIT 1`, [userId]);
  const lastLoginAt = u.rows?.[0]?.last_login_at ?? null;

  const hasStreamViewerMinutes = await tableExists("stream_viewer_minutes");
  const hasChatMessages = await tableExists("chat_messages");
  const hasChatMessageStats = await tableExists("chat_message_stats");
  const hasFollows = await tableExists("streamer_follows");
  const hasWheel = await tableExists("daily_wheel_spins");
  const hasChestParticipants = await tableExists("streamer_chest_participants");
  const hasChestPayouts = await tableExists("streamer_chest_payouts");
  const hasSubs = await tableExists("streamer_subscriptions");
  const hasRubisTx = await tableExists("rubis_tx");
  const hasUserAvatars = await tableExists("user_avatars");
  const hasUserEquippedCosmetics = await tableExists("user_equipped_cosmetics");
  const hasUserEntitlements = await tableExists("user_entitlements");
  const hasPredictionBets = await tableExists("prediction_bets");
  const hasPredictions = await tableExists("predictions");
  const hasBotRainJoins = await tableExists("bot_rain_joins");
  const hasBotWheelEntries = await tableExists("bot_wheel_entries");
  const hasPushSubscriptions = await tableExists("push_subscriptions");
  const hasUserReferrals = await tableExists("user_referrals");
  const hasFeatureEvents = await tableExists("user_feature_events");

  // daily bonus: supporte plusieurs noms possibles
  const dailyBonusTables = ["daily_bonus_claims", "user_daily_bonus_claims", "daily_bonus_days"];
  let dailyBonusTable: string | null = null;
  for (const t of dailyBonusTables) {
    if (await tableExists(t)) {
      dailyBonusTable = t;
      break;
    }
  }

  const watchMinutesTotal = hasStreamViewerMinutes
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM stream_viewer_minutes WHERE user_id=$1`, [userId])
    : 0;

  const watchMinutesMonth = hasStreamViewerMinutes
    ? await safeCount(
        `
        SELECT COUNT(*)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
          AND bucket_ts >= $2::timestamptz
          AND bucket_ts <  $3::timestamptz
        `,
        [userId, monthStartIso, monthEndIso]
      )
    : 0;

  const distinctLivesTotal = hasStreamViewerMinutes
    ? await safeCount(
        `
        SELECT COUNT(DISTINCT live_session_id)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
        `,
        [userId]
      )
    : 0;

  const liveChatMessagesTotal = hasChatMessages
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL`, [userId])
    : 0;

  const archivedChatMessagesTotal = hasChatMessageStats
    ? await safeSum(`SELECT COALESCE(SUM(messages_sent),0)::bigint AS s FROM chat_message_stats WHERE user_id=$1`, [userId])
    : 0;

  const chatMessagesTotal = liveChatMessagesTotal + archivedChatMessagesTotal;

  const followsCount = hasFollows ? await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1`, [userId]) : 0;

  const hasNotifyEnabled = hasFollows
    ? (await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1 AND notify_enabled=TRUE`, [userId])) > 0
    : false;

  const hasFollowQuick = hasFollows
    ? (await safeCount(
        `
        SELECT COUNT(*)::int AS n
        FROM streamer_follows f
        JOIN streamers s ON s.id = f.streamer_id
        WHERE f.user_id=$1
          AND s.live_started_at IS NOT NULL
          AND f.created_at >= s.live_started_at
          AND f.created_at <= s.live_started_at + interval '5 minutes'
        `,
        [userId]
      )) > 0
    : false;

  const wheelSpinsTotal = hasWheel ? await safeCount(`SELECT COUNT(*)::int AS n FROM daily_wheel_spins WHERE user_id=$1`, [userId]) : 0;

  const dailyBonusDaysMonth = dailyBonusTable
    ? await safeCount(
        `
        SELECT COUNT(*)::int AS n
        FROM ${dailyBonusTable}
        WHERE user_id=$1
          AND day >= (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris'))::date)
          AND day <  ((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) + interval '1 month')::date)
        `,
        [userId]
      )
    : 0;

  const chestJoinsTotal = hasChestParticipants
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_chest_participants WHERE user_id=$1`, [userId])
    : 0;

  const chestWinningsTotal = hasChestPayouts
    ? await safeSum(`SELECT COALESCE(SUM(amount),0)::int AS s FROM streamer_chest_payouts WHERE user_id=$1`, [userId])
    : 0;

  const hasAnySub = hasSubs
    ? (await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_subscriptions WHERE user_id=$1`, [userId])) > 0
    : false;

  const supportedFromSubs = hasSubs
    ? await safeCount(`SELECT COUNT(DISTINCT streamer_id)::int AS n FROM streamer_subscriptions WHERE user_id=$1`, [userId])
    : 0;

  const supportedFromSupportTx = hasRubisTx
    ? await safeCount(
        `
        SELECT COUNT(DISTINCT streamer_id)::int AS n
        FROM rubis_tx
        WHERE from_user_id=$1
          AND kind='support'
          AND status='succeeded'
          AND streamer_id IS NOT NULL
        `,
        [userId]
      )
    : 0;

  const supportedStreamersDistinct = Math.max(supportedFromSubs, supportedFromSupportTx);

  const supportSpentRubis = hasRubisTx
    ? await safeSum(
        `
        SELECT COALESCE(SUM(amount),0)::int AS s
        FROM rubis_tx
        WHERE from_user_id=$1
          AND kind='support'
          AND status='succeeded'
        `,
        [userId]
      )
    : 0;

  // Noctambule / Early Bird : 30 minutes watch + 1 msg dans la fenêtre
  async function windowOk(startHour: number, endHour: number) {
    if (!hasStreamViewerMinutes || !hasChatMessages) return false;

    const ok = await safeCount(
      `
      WITH w AS (
        SELECT date_trunc('day', (bucket_ts AT TIME ZONE 'Europe/Paris')) AS d,
               COUNT(*)::int AS minutes
        FROM stream_viewer_minutes
        WHERE user_id=$1
          AND bucket_ts >= $2::timestamptz AND bucket_ts < $3::timestamptz
          AND EXTRACT(HOUR FROM (bucket_ts AT TIME ZONE 'Europe/Paris')) >= $4
          AND EXTRACT(HOUR FROM (bucket_ts AT TIME ZONE 'Europe/Paris')) <  $5
        GROUP BY 1
      ),
      c AS (
        SELECT date_trunc('day', (created_at AT TIME ZONE 'Europe/Paris')) AS d,
               COUNT(*)::int AS msgs
        FROM chat_messages
        WHERE user_id=$1 AND deleted_at IS NULL
          AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) >= $4
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris')) <  $5
        GROUP BY 1
      )
      SELECT COUNT(*)::int AS n
      FROM w
      JOIN c USING (d)
      WHERE w.minutes >= 30 AND c.msgs >= 1
      `,
      [userId, monthStartIso, monthEndIso, startHour, endHour]
    );

    return ok > 0;
  }

  const noctambuleOk = await windowOk(2, 6); // 02:00 - 05:59
  const earlyBirdOk = await windowOk(5, 7); // 05:00 - 06:59

  const hasAvatarUploaded = hasUserAvatars
    ? (await safeCount(`SELECT COUNT(*)::int AS n FROM user_avatars WHERE user_id=$1`, [userId])) > 0
    : false;

  let hasAnyCosmeticEquipped = false;
  let hasFullLookEquipped = false;
  if (hasUserEquippedCosmetics) {
    try {
      const eq = await q<{
        username_code: string | null;
        badge_code: string | null;
        title_code: string | null;
        frame_code: string | null;
        hat_code: string | null;
      }>(
        `
        SELECT username_code, badge_code, title_code, frame_code, hat_code
        FROM user_equipped_cosmetics
        WHERE user_id=$1
        LIMIT 1
        `,
        [userId]
      );
      const row = eq.rows?.[0];
      const equippedCodes = row
        ? [row.username_code, row.badge_code, row.title_code, row.frame_code, row.hat_code]
        : [];
      hasAnyCosmeticEquipped = equippedCodes.some(hasText);
      hasFullLookEquipped = equippedCodes.length === 5 && equippedCodes.every(hasText);
    } catch {
      hasAnyCosmeticEquipped = false;
      hasFullLookEquipped = false;
    }
  }

  let hasShopPurchase = false;
  if (hasUserEntitlements) {
    try {
      const ent = await q<{ kind: string; code: string }>(
        `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
        [userId]
      );
      hasShopPurchase = (ent.rows || []).some((row) => SHOP_ENTITLEMENT_KEYS.has(`${row.kind}:${row.code}`));
    } catch {
      hasShopPurchase = false;
    }
  }

  const predictionBetsTotal = hasPredictionBets
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM prediction_bets WHERE user_id=$1`, [userId])
    : 0;

  const predictionWinsTotal = hasPredictionBets && hasPredictions
    ? await safeCount(
        `
        SELECT COUNT(*)::int AS n
        FROM prediction_bets b
        JOIN predictions p ON p.id = b.prediction_id
        WHERE b.user_id=$1
          AND p.status='resolved'
          AND p.resolved_option IS NOT NULL
          AND b.choice = p.resolved_option
        `,
        [userId]
      )
    : 0;

  const rainJoinsTotal = hasBotRainJoins
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM bot_rain_joins WHERE user_id=$1`, [userId])
    : 0;

  const wheelJoinsTotal = hasBotWheelEntries
    ? await safeCount(`SELECT COUNT(*)::int AS n FROM bot_wheel_entries WHERE user_id=$1`, [userId])
    : 0;

  const hasPushEnabled = hasPushSubscriptions
    ? (await safeCount(`SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [userId])) > 0
    : false;

  const hasReferral = hasUserReferrals
    ? (await safeCount(`SELECT COUNT(*)::int AS n FROM user_referrals WHERE user_id=$1`, [userId])) > 0
    : false;

  const streamerTabsSeenMaxPerStreamer = hasFeatureEvents
    ? await safeCount(
        `
        SELECT COALESCE(MAX(tab_count),0)::int AS n
        FROM (
          SELECT split_part(subject, '|', 1) AS streamer_key,
                 COUNT(DISTINCT split_part(subject, '|', 2))::int AS tab_count
          FROM user_feature_events
          WHERE user_id=$1
            AND kind='streamer_tab'
            AND POSITION('|' IN subject) > 0
          GROUP BY 1
        ) t
        `,
        [userId]
      )
    : 0;

  const clipsOpenedTotal = hasFeatureEvents
    ? await safeCount(
        `
        SELECT COUNT(DISTINCT subject)::int AS n
        FROM user_feature_events
        WHERE user_id=$1
          AND kind='clip_open'
          AND subject <> ''
        `,
        [userId]
      )
    : 0;

  const botTabsUsedMaxPerStreamer = hasFeatureEvents
    ? await safeCount(
        `
        SELECT COALESCE(MAX(tab_count),0)::int AS n
        FROM (
          SELECT split_part(subject, '|', 1) AS streamer_key,
                 COUNT(DISTINCT split_part(subject, '|', 2))::int AS tab_count
          FROM user_feature_events
          WHERE user_id=$1
            AND kind='bot_tab'
            AND POSITION('|' IN subject) > 0
          GROUP BY 1
        ) t
        `,
        [userId]
      )
    : 0;

  const hasVitrineCompleteSession = hasFeatureEvents
    ? (await safeCount(
        `
        SELECT COUNT(*)::int AS n
        FROM (
          SELECT session_id
          FROM user_feature_events
          WHERE user_id=$1
            AND session_id <> ''
          GROUP BY session_id
          HAVING BOOL_OR(kind='profile_style_action')
             AND BOOL_OR(kind='page_visit' AND subject='profile')
             AND BOOL_OR(kind='page_visit' AND subject='shop')
             AND BOOL_OR(kind='page_visit' AND subject='streamer')
        ) t
        `,
        [userId]
      )) > 0
    : false;

  return {
    userId,
    lastLoginAt,
    monthStartIso,
    monthEndIso,

    watchMinutesTotal,
    watchMinutesMonth,
    distinctLivesTotal,

    chatMessagesTotal,

    followsCount,
    hasNotifyEnabled,
    hasFollowQuick,

    wheelSpinsTotal,

    dailyBonusDaysMonth,

    chestJoinsTotal,
    chestWinningsTotal,

    hasAnySub,
    supportedStreamersDistinct,
    supportSpentRubis,

    noctambuleOk,
    earlyBirdOk,

    hasAvatarUploaded,
    hasAnyCosmeticEquipped,
    hasFullLookEquipped,
    hasShopPurchase,
    streamerTabsSeenMaxPerStreamer,
    clipsOpenedTotal,
    predictionBetsTotal,
    predictionWinsTotal,
    rainJoinsTotal,
    wheelJoinsTotal,
    hasPushEnabled,
    hasReferral,
    botTabsUsedMaxPerStreamer,
    hasVitrineCompleteSession,
  };
}

// ─────────────────────────────────────────────
// ✅ Rewards -> entitlements mapping (succès => cosmétiques)
// Tu as donné :
// - Arc-en-ciel : master_collectionneur
// - Chroma toggle : master_parfait
// - Demon : master_roulette (chez toi c’est master_pretre_roue)
// - Couronne : gold_marathon
// - Halo : master_pilier
// - Lotus crown : master_archiviste
// - Eclipse : master_sous_la_lune
// (le néon = agenda 30j => on le fera après)
// ─────────────────────────────────────────────
const ACH_REWARD_ENTITLEMENTS: Record<string, Array<{ kind: Kind; code: string }>> = {
  master_collectionneur: [{ kind: "username", code: "uanim_rainbow_scroll" }],
  master_parfait: [{ kind: "username", code: "uanim_chroma_toggle" }],

  // alias “master_roulette” => ton id actuel = master_pretre_roue
  master_pretre_roue: [{ kind: "hat", code: "hat_demon_horn" }],
  master_roulette: [{ kind: "hat", code: "hat_demon_horn" }],

  gold_marathon: [{ kind: "hat", code: "hat_carton_crown" }],
  master_pilier: [{ kind: "hat", code: "hat_eclipse_halo" }],
  master_archiviste: [{ kind: "frame", code: "mframe_lotus_crown" }],
  master_sous_la_lune: [{ kind: "frame", code: "mframe_eclipse" }],

  // ✅ TITLES (nouveaux)
  bronze_first_chest: [{ kind: "title", code: "title_ratus" }],
  silver_rituel_roue: [{ kind: "title", code: "title_ca_tourne" }],
  silver_supporter: [{ kind: "title", code: "title_vrai_viewer" }],
  gold_assidu: [{ kind: "title", code: "title_no_life" }],
  gold_noctambule: [{ kind: "title", code: "title_batman" }],
};

let entitlementsEnsured = false;
async function ensureEntitlementsTable() {
  if (entitlementsEnsured) return;

  // si la table existe déjà, CREATE IF NOT EXISTS ne casse rien
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id INT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, kind, code)
    );
  `);

  entitlementsEnsured = true;
}

async function grantEntitlementsForUnlocked(userId: number, unlockedIds: string[]) {
  const rewards: Array<{ kind: Kind; code: string }> = [];

  for (const id of unlockedIds) {
    const r = ACH_REWARD_ENTITLEMENTS[id];
    if (r && r.length) rewards.push(...r);
  }

  if (!rewards.length) return { granted: 0 };

  await ensureEntitlementsTable();

  // insert en batch
  const values: any[] = [];
  const rowsSql: string[] = [];
  let i = 1;

  for (const r of rewards) {
    rowsSql.push(`($${i++}, $${i++}, $${i++})`);
    values.push(userId, r.kind, r.code);
  }

  const sql = `
    INSERT INTO user_entitlements (user_id, kind, code)
    VALUES ${rowsSql.join(",")}
    ON CONFLICT (user_id, kind, code) DO NOTHING
  `;

  const r = await pool.query(sql, values);
  return { granted: r.rowCount || 0 };
}

const defs: AchievementDef[] = [
  // ───────────────── Bronze (tuto)
  {
    id: "bronze_welcome",
    tier: "bronze",
    category: "Découverte",
    icon: "🌙",
    name: "Bienvenue sur LunaLive",
    desc: "Créer un compte.",
    eval: () => ({ unlocked: true }),
  },
  {
    id: "bronze_first_login",
    tier: "bronze",
    category: "Découverte",
    icon: "🔑",
    name: "Premier pas",
    desc: "Se connecter une fois.",
    eval: (m) => ({ unlocked: !!m.lastLoginAt }),
  },
  {
    id: "bronze_first_live",
    tier: "bronze",
    category: "Watch & Lives",
    icon: "📺",
    name: "Premier live",
    desc: "Regarder un live (5 minutes).",
    eval: (m) => ({ unlocked: m.watchMinutesTotal >= 5, progress: { current: m.watchMinutesTotal, target: 5 } }),
  },
  {
    id: "bronze_first_message",
    tier: "bronze",
    category: "Chat & Social",
    icon: "💬",
    name: "Premier message",
    desc: "Envoyer 1 message dans le chat.",
    eval: (m) => ({ unlocked: m.chatMessagesTotal >= 1, progress: { current: m.chatMessagesTotal, target: 1 } }),
  },
  {
    id: "bronze_first_follow",
    tier: "bronze",
    category: "Chat & Social",
    icon: "⭐",
    name: "Premier follow",
    desc: "Suivre un streamer.",
    eval: (m) => ({ unlocked: m.followsCount >= 1, progress: { current: m.followsCount, target: 1 } }),
  },
  {
    id: "bronze_notify_on",
    tier: "bronze",
    category: "Chat & Social",
    icon: "🔔",
    name: "Cloche activée",
    desc: "Activer la notification d’un follow.",
    eval: (m) => ({ unlocked: m.hasNotifyEnabled }),
  },
  {
    id: "bronze_first_spin",
    tier: "bronze",
    category: "Roue & Bonus",
    icon: "🎡",
    name: "Premier tour",
    desc: "Faire tourner la roue 1 fois.",
    eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 1, progress: { current: m.wheelSpinsTotal, target: 1 } }),
  },
  {
    id: "bronze_pack_de_depart",
    tier: "bronze",
    category: "Découverte",
    icon: "🧰",
    name: "Pack de départ",
    desc: "Valider live + message + follow + roue.",
    eval: (m) => {
      const steps = [m.watchMinutesTotal >= 5, m.chatMessagesTotal >= 1, m.followsCount >= 1, m.wheelSpinsTotal >= 1];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "bronze_feed_lance",
    tier: "bronze",
    category: "Chat & Social",
    icon: "🛰️",
    name: "Feed lancé",
    desc: "Avoir 3 follows et au moins une cloche activée.",
    eval: (m) => {
      const steps = [m.followsCount >= 3, m.hasNotifyEnabled];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "bronze_first_daily_bonus",
    tier: "bronze",
    category: "Roue & Bonus",
    icon: "🗓️",
    name: "Premier bonus",
    desc: "Récupérer un bonus quotidien 1 fois.",
    eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 1, progress: { current: m.dailyBonusDaysMonth, target: 1 } }),
  },
  {
    id: "bronze_first_support",
    tier: "bronze",
    category: "Support",
    icon: "💎",
    name: "Premier soutien",
    desc: "S’abonner (ou tip) une fois.",
    eval: (m) => ({ unlocked: m.hasAnySub || m.supportSpentRubis > 0 }),
  },
  {
    id: "bronze_first_chest",
    tier: "bronze",
    category: "Coffre",
    icon: "🎁",
    name: "Premier coffre",
    desc: "Participer à un coffre streamer.",
    rewardPreview: "Titre : Ratus",
    eval: (m) => ({ unlocked: m.chestJoinsTotal >= 1, progress: { current: m.chestJoinsTotal, target: 1 } }),
  },
  {
    id: "bronze_avatar_pose",
    tier: "bronze",
    category: "Personnalisation",
    icon: "🖼️",
    name: "Avatar posé",
    desc: "Uploader ton premier avatar.",
    eval: (m) => ({ unlocked: m.hasAvatarUploaded, progress: boolProgress(m.hasAvatarUploaded) }),
  },
  {
    id: "bronze_premier_style",
    tier: "bronze",
    category: "Personnalisation",
    icon: "✨",
    name: "Premier style",
    desc: "Équiper ton premier cosmétique.",
    eval: (m) => ({ unlocked: m.hasAnyCosmeticEquipped, progress: boolProgress(m.hasAnyCosmeticEquipped) }),
  },
  {
    id: "bronze_premiere_prediction",
    tier: "bronze",
    category: "Bot & Fun",
    icon: "🔮",
    name: "Première prédiction",
    desc: "Placer un premier pari.",
    eval: (m) => ({ unlocked: m.predictionBetsTotal >= 1, progress: { current: m.predictionBetsTotal, target: 1 } }),
  },
  {
    id: "bronze_sous_la_pluie",
    tier: "bronze",
    category: "Bot & Fun",
    icon: "🌧️",
    name: "Sous la pluie",
    desc: "Rejoindre une rain.",
    eval: (m) => ({ unlocked: m.rainJoinsTotal >= 1, progress: { current: m.rainJoinsTotal, target: 1 } }),
  },
  {
    id: "bronze_roue_sociale",
    tier: "bronze",
    category: "Bot & Fun",
    icon: "🎯",
    name: "Roue sociale",
    desc: "Rejoindre une roue via LunaBot.",
    eval: (m) => ({ unlocked: m.wheelJoinsTotal >= 1, progress: { current: m.wheelJoinsTotal, target: 1 } }),
  },
  {
    id: "bronze_parraine",
    tier: "bronze",
    category: "Découverte",
    icon: "🫂",
    name: "Parrainé",
    desc: "Arriver via un referral ou lier un code referral.",
    eval: (m) => ({ unlocked: m.hasReferral, progress: boolProgress(m.hasReferral) }),
  },

  // ───────────────── Silver (actif chill)
  {
    id: "silver_habitue",
    tier: "silver",
    category: "Roue & Bonus",
    icon: "📅",
    name: "Habitué",
    eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 10, progress: { current: m.dailyBonusDaysMonth, target: 10 } }),
  },
  {
    id: "silver_rituel_roue",
    tier: "silver",
    category: "Roue & Bonus",
    icon: "🎡",
    name: "Rituel de la roue",
    rewardPreview: "Titre : Ça tourne !",
    eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 10, progress: { current: m.wheelSpinsTotal, target: 10 } }),
  },
  {
    id: "silver_discussion",
    tier: "silver",
    category: "Chat & Social",
    icon: "💬",
    name: "Discussion",
    eval: (m) => ({ unlocked: m.chatMessagesTotal >= 250, progress: { current: m.chatMessagesTotal, target: 250 } }),
  },
  {
    id: "silver_fidele",
    tier: "silver",
    category: "Watch & Lives",
    icon: "📺",
    name: "Fidèle",
    eval: (m) => ({ unlocked: m.distinctLivesTotal >= 10, progress: { current: m.distinctLivesTotal, target: 10 } }),
  },
  {
    id: "silver_curieux",
    tier: "silver",
    category: "Chat & Social",
    icon: "⭐",
    name: "Curieux",
    eval: (m) => ({ unlocked: m.followsCount >= 15, progress: { current: m.followsCount, target: 15 } }),
  },
  {
    id: "silver_touche_a_tout",
    tier: "silver",
    category: "Découverte",
    icon: "🧭",
    name: "Touche-à-tout",
    desc: "Utiliser 5 familles de fonctionnalités du site.",
    eval: (m) => {
      const current = activeFeatureFamiliesCount(m);
      return { unlocked: current >= 5, progress: { current, target: 5 } };
    },
  },
  {
    id: "silver_retour_regulier",
    tier: "silver",
    category: "Roue & Bonus",
    icon: "🔁",
    name: "Retour régulier",
    desc: "Cumuler 7 bonus du mois et 7 spins.",
    eval: (m) => {
      const steps = [m.dailyBonusDaysMonth >= 7, m.wheelSpinsTotal >= 7];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "silver_vrai_feed",
    tier: "silver",
    category: "Chat & Social",
    icon: "📡",
    name: "Vrai feed",
    desc: "Avoir 10 follows et réussir un quick-follow.",
    eval: (m) => {
      const steps = [m.followsCount >= 10, m.hasFollowQuick];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "silver_coffres",
    tier: "silver",
    category: "Coffre",
    icon: "🎁",
    name: "Coffres & compagnie",
    eval: (m) => ({ unlocked: m.chestJoinsTotal >= 10, progress: { current: m.chestJoinsTotal, target: 10 } }),
  },
  {
    id: "silver_supporter",
    tier: "silver",
    category: "Support",
    icon: "💎",
    name: "Supporter",
    rewardPreview: "Titre : Vrai Viewer",
    eval: (m) => ({ unlocked: m.supportSpentRubis >= 1000, progress: { current: m.supportSpentRubis, target: 1000 } }),
  },
  {
    id: "silver_look_complet",
    tier: "silver",
    category: "Personnalisation",
    icon: "🪞",
    name: "Look complet",
    desc: "Équiper badge, titre, frame, hat et effet pseudo.",
    eval: (m) => ({ unlocked: m.hasFullLookEquipped, progress: boolProgress(m.hasFullLookEquipped) }),
  },
  {
    id: "silver_premier_achat_shop",
    tier: "silver",
    category: "Personnalisation",
    icon: "🛍️",
    name: "Premier achat shop",
    desc: "Acheter un premier item au shop.",
    eval: (m) => ({ unlocked: m.hasShopPurchase, progress: boolProgress(m.hasShopPurchase) }),
  },
  {
    id: "silver_explorateur_streamer",
    tier: "silver",
    category: "Découverte",
    icon: "🧭",
    name: "Explorateur streamer",
    desc: "Visiter About, Clips, VOD et Agenda sur une même page streamer.",
    eval: (m) => ({
      unlocked: m.streamerTabsSeenMaxPerStreamer >= 4,
      progress: { current: m.streamerTabsSeenMaxPerStreamer, target: 4 },
    }),
  },
  {
    id: "silver_clip_lover",
    tier: "silver",
    category: "Watch & Lives",
    icon: "🎬",
    name: "Clip lover",
    desc: "Ouvrir 5 clips.",
    eval: (m) => ({ unlocked: m.clipsOpenedTotal >= 5, progress: { current: m.clipsOpenedTotal, target: 5 } }),
  },
  {
    id: "silver_ping_pret",
    tier: "silver",
    category: "Chat & Social",
    icon: "📲",
    name: "Ping prêt",
    desc: "Activer les notifications push du site.",
    eval: (m) => ({ unlocked: m.hasPushEnabled, progress: boolProgress(m.hasPushEnabled) }),
  },
  {
    id: "silver_affut",
    tier: "silver",
    category: "Chat & Social",
    icon: "⏱️",
    name: "À l’affût",
    eval: (m) => ({
      unlocked: m.hasFollowQuick,
      progress: { current: m.hasFollowQuick ? 1 : 0, target: 1 },
    }),
  },

  // ───────────────── Gold (très actif)
  {
    id: "gold_assidu",
    tier: "gold",
    category: "Roue & Bonus",
    icon: "📅",
    name: "Assidu",
    hint: "On te voit souvent par ici…",
    rewardPreview: "Titre : No Life",
    eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 20, progress: { current: m.dailyBonusDaysMonth, target: 20 } }),
  },
  {
    id: "gold_roulette",
    tier: "gold",
    category: "Roue & Bonus",
    icon: "🎡",
    name: "Roulette",
    hint: "La roue n’a plus de secrets.",
    eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 50, progress: { current: m.wheelSpinsTotal, target: 50 } }),
  },
  {
    id: "gold_grande_discussion",
    tier: "gold",
    category: "Chat & Social",
    icon: "💬",
    name: "Grande discussion",
    hint: "Ça parle beaucoup ici…",
    eval: (m) => ({ unlocked: m.chatMessagesTotal >= 2000, progress: { current: m.chatMessagesTotal, target: 2000 } }),
  },
  {
    id: "gold_marathon",
    tier: "gold",
    category: "Watch & Lives",
    icon: "⏳",
    name: "Marathon",
    hint: "Une présence qui commence à peser.",
    rewardPreview: "Chapeau : Carton Crown",
    eval: (m) => ({ unlocked: m.watchMinutesMonth >= 600, progress: { current: m.watchMinutesMonth, target: 600 } }), // 10h
  },
  {
    id: "gold_explorateur",
    tier: "gold",
    category: "Watch & Lives",
    icon: "🧭",
    name: "Explorateur",
    hint: "Tu aimes varier les lives.",
    eval: (m) => ({ unlocked: m.distinctLivesTotal >= 15, progress: { current: m.distinctLivesTotal, target: 15 } }),
  },
  {
    id: "gold_super_follow",
    tier: "gold",
    category: "Chat & Social",
    icon: "🌟",
    name: "Super-follow",
    hint: "Ton feed doit être chargé…",
    eval: (m) => ({ unlocked: m.followsCount >= 20, progress: { current: m.followsCount, target: 20 } }),
  },
  {
    id: "gold_tour_complet",
    tier: "gold",
    category: "Découverte",
    icon: "🗺️",
    name: "Tour complet",
    desc: "Activer 6 grandes familles de fonctionnalités.",
    hint: "Tu connais presque toute la maison.",
    eval: (m) => {
      const current = activeFeatureFamiliesCount(m);
      return { unlocked: current >= 6, progress: { current, target: 6 } };
    },
  },
  {
    id: "gold_rituel_lunalive",
    tier: "gold",
    category: "Roue & Bonus",
    icon: "🌗",
    name: "Rituel LunaLive",
    desc: "Cumuler 20 bonus du mois, 50 spins et 10 coffres.",
    hint: "Quand le site devient une routine.",
    eval: (m) => {
      const steps = [m.dailyBonusDaysMonth >= 20, m.wheelSpinsTotal >= 50, m.chestJoinsTotal >= 10];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "gold_mecene",
    tier: "gold",
    category: "Support",
    icon: "🤝",
    name: "Mécène",
    hint: "Soutenir, encore et encore.",
    eval: (m) => ({ unlocked: m.supportedStreamersDistinct >= 10, progress: { current: m.supportedStreamersDistinct, target: 10 } }),
  },
  {
    id: "gold_cercle_fidele",
    tier: "gold",
    category: "Support",
    icon: "💠",
    name: "Cercle fidèle",
    desc: "Soutenir 3 streamers distincts et y cumuler 2500 rubis.",
    hint: "Un cercle de streamers que tu soutiens vraiment.",
    eval: (m) => {
      const steps = [m.supportedStreamersDistinct >= 3, m.supportSpentRubis >= 2500];
      return { unlocked: steps.every(Boolean), progress: criteriaProgress(steps) };
    },
  },
  {
    id: "gold_coffre_fort",
    tier: "gold",
    category: "Coffre",
    icon: "🧰",
    name: "Coffre-fort",
    hint: "Le coffre t’aime bien.",
    eval: (m) => ({ unlocked: m.chestWinningsTotal >= 200, progress: { current: m.chestWinningsTotal, target: 200 } }),
  },
  {
    id: "gold_noctambule",
    tier: "gold",
    category: "Watch & Lives",
    icon: "🌙",
    name: "Noctambule",
    hint: "Tu traînes tard…",
    rewardPreview: "Titre : Batman",
    eval: (m) => ({ unlocked: m.noctambuleOk }),
  },
  {
    id: "gold_early_bird",
    tier: "gold",
    category: "Watch & Lives",
    icon: "🌅",
    name: "Early Bird",
    hint: "Debout avant tout le monde…",
    eval: (m) => ({ unlocked: m.earlyBirdOk }),
  },
  {
    id: "gold_oracle",
    tier: "gold",
    category: "Bot & Fun",
    icon: "🔮",
    name: "Oracle",
    desc: "Gagner 3 prédictions.",
    hint: "Les prédictions commencent à te sourire.",
    eval: (m) => ({ unlocked: m.predictionWinsTotal >= 3, progress: { current: m.predictionWinsTotal, target: 3 } }),
  },
  {
    id: "gold_maitre_du_bot",
    tier: "gold",
    category: "Bot & Fun",
    icon: "🤖",
    name: "Maître du bot",
    desc: "Utiliser au moins 4 tabs du LunaBot sur un même streamer.",
    hint: "Call, hunt, roue, rain... fais le tour de LunaBot.",
    eval: (m) => ({
      unlocked: m.botTabsUsedMaxPerStreamer >= 4,
      progress: { current: m.botTabsUsedMaxPerStreamer, target: 4 },
    }),
  },
  {
    id: "gold_vitrine_complete",
    tier: "gold",
    category: "Personnalisation",
    icon: "🪄",
    name: "Vitrine complète",
    desc: "Personnaliser ton profil puis visiter shop, profil et page streamer dans la même session.",
    hint: "Ton style mérite d'être vu partout.",
    eval: (m) => ({ unlocked: m.hasVitrineCompleteSession, progress: boolProgress(m.hasVitrineCompleteSession) }),
  },

  // ───────────────── Master (rare / tryhard)
  {
    id: "master_sous_la_lune",
    tier: "master",
    category: "Master",
    icon: "🌕",
    name: "Sous la lune",
    hidden: true,
    rewardPreview: "Cadran : Eclipse",
    eval: (m) => ({ unlocked: m.watchMinutesMonth >= 1800, progress: { current: m.watchMinutesMonth, target: 1800 } }), // 30h
  },
  {
    id: "master_pretre_roue",
    tier: "master",
    category: "Master",
    icon: "🎡",
    name: "Prêtre de la roue",
    hidden: true,
    rewardPreview: "Chapeau : Demon Horn",
    eval: (m) => ({ unlocked: m.wheelSpinsTotal >= 200, progress: { current: m.wheelSpinsTotal, target: 200 } }),
  },
  {
    id: "master_archiviste",
    tier: "master",
    category: "Master",
    icon: "📜",
    name: "Archiviste",
    hidden: true,
    rewardPreview: "Cadran : Lotus Crown",
    eval: (m) => ({ unlocked: m.chatMessagesTotal >= 10000, progress: { current: m.chatMessagesTotal, target: 10000 } }),
  },
  {
    id: "master_pilier",
    tier: "master",
    category: "Master",
    icon: "🛡️",
    name: "Pilier",
    hidden: true,
    rewardPreview: "Chapeau : Eclipse Halo",
    eval: (m) => ({ unlocked: m.supportedStreamersDistinct >= 20, progress: { current: m.supportedStreamersDistinct, target: 20 } }),
  },
  {
    id: "master_parfait",
    tier: "master",
    category: "Master",
    icon: "👑",
    name: "Parfait",
    hidden: true,
    rewardPreview: "Pseudo : Chroma (toggle)",
    eval: (m) => ({ unlocked: m.dailyBonusDaysMonth >= 30, progress: { current: m.dailyBonusDaysMonth, target: 30 } }),
  },
  {
    id: "master_polyvalent",
    tier: "master",
    category: "Meta",
    icon: "🧠",
    name: "Polyvalent",
    desc: "Débloquer au moins 3 succès gold dans 3 catégories différentes.",
    eval: () => ({ unlocked: false, progress: { current: 0, target: 3 } }),
  },
  {
    id: "master_collection_par_categorie",
    tier: "master",
    category: "Meta",
    icon: "🧩",
    name: "Collection par catégorie",
    desc: "Débloquer tous les succès bronze et silver.",
    eval: () => ({ unlocked: false, progress: { current: 0, target: 1 } }),
  },
  {
    id: "master_collectionneur",
    tier: "master",
    category: "Meta",
    icon: "🏆",
    name: "Collectionneur",
    hidden: false,
    rewardPreview: "Pseudo : Arc-en-ciel défilant",
    eval: (_m, unlockedCountExceptCollector) => ({
      unlocked: unlockedCountExceptCollector >= 20,
      progress: { current: unlockedCountExceptCollector, target: 20 },
    }),
  },
];

achievementsRouter.get("/", async (req, res) => {
  const user = (req as any).user;

  const userId = user.id;
  const m = await getMetrics(userId);

  const derivedIds = new Set(["master_polyvalent", "master_collection_par_categorie"]);
  const baseDefs = defs.filter((d) => !derivedIds.has(d.id) && d.id !== "master_collectionneur");
  const baseResults = baseDefs.map((d) => ({ def: d, result: d.eval(m, 0) }));

  const bronzeTotal = baseDefs.filter((d) => d.tier === "bronze").length;
  const silverTotal = baseDefs.filter((d) => d.tier === "silver").length;
  const bronzeUnlockedCount = baseResults.filter((x) => x.def.tier === "bronze" && x.result.unlocked).length;
  const silverUnlockedCount = baseResults.filter((x) => x.def.tier === "silver" && x.result.unlocked).length;
  const unlockedGoldCategories = new Set(
    baseResults.filter((x) => x.def.tier === "gold" && x.result.unlocked).map((x) => x.def.category)
  );

  const derivedResults: Record<string, { unlocked: boolean; progress: { current: number; target: number } }> = {
    master_polyvalent: {
      unlocked: unlockedGoldCategories.size >= 3,
      progress: { current: unlockedGoldCategories.size, target: 3 },
    },
    master_collection_par_categorie: {
      unlocked: bronzeUnlockedCount >= bronzeTotal && silverUnlockedCount >= silverTotal,
      progress: { current: bronzeUnlockedCount + silverUnlockedCount, target: bronzeTotal + silverTotal },
    },
  };

  const unlockedCountExceptCollector =
    baseResults.filter((x) => x.result.unlocked).length +
    Object.values(derivedResults).filter((x) => x.unlocked).length;

  const collectorResult = defs.find((d) => d.id === "master_collectionneur")?.eval(m, unlockedCountExceptCollector) ?? {
    unlocked: false,
    progress: { current: 0, target: 20 },
  };

  const achievements = defs.map((d) => {
    const r =
      d.id === "master_collectionneur"
        ? collectorResult
        : derivedResults[d.id]
        ? derivedResults[d.id]
        : d.eval(m, unlockedCountExceptCollector);
    const unlocked = !!r.unlocked;
    const isHiddenLocked = !!d.hidden && !unlocked;

    return {
      id: d.id,
      tier: d.tier,
      category: d.category,
      icon: isHiddenLocked ? "❔" : d.icon,
      name: isHiddenLocked ? "???" : d.name,
      desc: unlocked ? (d.desc ?? null) : d.tier === "bronze" ? (d.desc ?? null) : null,
      hint: !unlocked && d.tier === "gold" ? (d.hint ?? null) : null,
      rewardPreview: d.rewardPreview ?? null,
      unlocked,
      progress: r.progress ?? null,
    };
  });

  const unlockedIds = achievements.filter((a) => a.unlocked).map((a) => a.id);
  let granted = 0;
  try {
    const r = await grantEntitlementsForUnlocked(userId, unlockedIds);
    granted = r.granted;
  } catch {
    granted = 0;
  }

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    monthStart: m.monthStartIso,
    monthEnd: m.monthEndIso,
    achievements,
    grantedEntitlements: granted, // debug (front peut ignorer)
  });
});
