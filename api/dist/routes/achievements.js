// api/src/routes/achievements.ts
import { Router } from "express";
import { pool } from "../db.js";
export const achievementsRouter = Router();
// helper query typé (db.query n’est pas générique chez toi)
const q = (text, params = []) => pool.query(text, params);
async function tableExists(table) {
    const r = await q(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
    return !!r.rows?.[0]?.reg;
}
async function getParisBounds() {
    const r = await q(`
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
async function safeCount(sql, params = [], fallback = 0) {
    try {
        const r = await q(sql, params);
        const v = Number(r.rows?.[0]?.n ?? fallback);
        return Number.isFinite(v) ? v : fallback;
    }
    catch {
        return fallback;
    }
}
async function safeSum(sql, params = [], fallback = 0) {
    try {
        const r = await q(sql, params);
        const v = Number(r.rows?.[0]?.s ?? fallback);
        return Number.isFinite(v) ? v : fallback;
    }
    catch {
        return fallback;
    }
}
async function getMetrics(userId) {
    const { monthStartIso, monthEndIso } = await getParisBounds();
    // users.last_login_at
    const u = await q(`SELECT last_login_at FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const lastLoginAt = u.rows?.[0]?.last_login_at ?? null;
    const hasStreamViewerMinutes = await tableExists("stream_viewer_minutes");
    const hasChatMessages = await tableExists("chat_messages");
    const hasFollows = await tableExists("streamer_follows");
    const hasWheel = await tableExists("daily_wheel_spins");
    const hasChestParticipants = await tableExists("streamer_chest_participants");
    const hasChestPayouts = await tableExists("streamer_chest_payouts");
    const hasSubs = await tableExists("streamer_subscriptions");
    const hasRubisTx = await tableExists("rubis_tx");
    // daily bonus: supporte plusieurs noms possibles
    const dailyBonusTables = ["daily_bonus_claims", "user_daily_bonus_claims", "daily_bonus_days"];
    let dailyBonusTable = null;
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
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
          AND bucket_ts >= $2::timestamptz
          AND bucket_ts <  $3::timestamptz
        `, [userId, monthStartIso, monthEndIso])
        : 0;
    const distinctLivesTotal = hasStreamViewerMinutes
        ? await safeCount(`
        SELECT COUNT(DISTINCT live_session_id)::int AS n
        FROM stream_viewer_minutes
        WHERE user_id=$1
        `, [userId])
        : 0;
    const chatMessagesTotal = hasChatMessages
        ? await safeCount(`SELECT COUNT(*)::int AS n FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL`, [userId])
        : 0;
    const followsCount = hasFollows ? await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1`, [userId]) : 0;
    const hasNotifyEnabled = hasFollows
        ? (await safeCount(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1 AND notify_enabled=TRUE`, [userId])) > 0
        : false;
    const hasFollowQuick = hasFollows
        ? (await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM streamer_follows f
        JOIN streamers s ON s.id = f.streamer_id
        WHERE f.user_id=$1
          AND s.live_started_at IS NOT NULL
          AND f.created_at >= s.live_started_at
          AND f.created_at <= s.live_started_at + interval '5 minutes'
        `, [userId])) > 0
        : false;
    const wheelSpinsTotal = hasWheel ? await safeCount(`SELECT COUNT(*)::int AS n FROM daily_wheel_spins WHERE user_id=$1`, [userId]) : 0;
    const dailyBonusDaysMonth = dailyBonusTable
        ? await safeCount(`
        SELECT COUNT(*)::int AS n
        FROM ${dailyBonusTable}
        WHERE user_id=$1
          AND day >= (date_trunc('month', (now() AT TIME ZONE 'Europe/Paris'))::date)
          AND day <  ((date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')) + interval '1 month')::date)
        `, [userId])
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
        ? await safeCount(`
        SELECT COUNT(DISTINCT streamer_id)::int AS n
        FROM rubis_tx
        WHERE from_user_id=$1
          AND kind='support'
          AND status='succeeded'
          AND streamer_id IS NOT NULL
        `, [userId])
        : 0;
    const supportedStreamersDistinct = Math.max(supportedFromSubs, supportedFromSupportTx);
    const supportSpentRubis = hasRubisTx
        ? await safeSum(`
        SELECT COALESCE(SUM(amount),0)::int AS s
        FROM rubis_tx
        WHERE from_user_id=$1
          AND kind='support'
          AND status='succeeded'
        `, [userId])
        : 0;
    // Noctambule / Early Bird : 30 minutes watch + 1 msg dans la fenêtre
    async function windowOk(startHour, endHour) {
        if (!hasStreamViewerMinutes || !hasChatMessages)
            return false;
        const ok = await safeCount(`
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
      `, [userId, monthStartIso, monthEndIso, startHour, endHour]);
        return ok > 0;
    }
    const noctambuleOk = await windowOk(2, 6); // 02:00 - 05:59
    const earlyBirdOk = await windowOk(5, 7); // 05:00 - 06:59
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
const ACH_REWARD_ENTITLEMENTS = {
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
    if (entitlementsEnsured)
        return;
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
async function grantEntitlementsForUnlocked(userId, unlockedIds) {
    const rewards = [];
    for (const id of unlockedIds) {
        const r = ACH_REWARD_ENTITLEMENTS[id];
        if (r && r.length)
            rewards.push(...r);
    }
    if (!rewards.length)
        return { granted: 0 };
    await ensureEntitlementsTable();
    // insert en batch
    const values = [];
    const rowsSql = [];
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
const defs = [
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
        id: "gold_mecene",
        tier: "gold",
        category: "Support",
        icon: "🤝",
        name: "Mécène",
        hint: "Soutenir, encore et encore.",
        eval: (m) => ({ unlocked: m.supportedStreamersDistinct >= 10, progress: { current: m.supportedStreamersDistinct, target: 10 } }),
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
    const userIdRaw = req?.user?.id ?? req?.userId ?? null;
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const m = await getMetrics(userId);
    // 1) calc unlocked sans le collectionneur
    const prelim = defs.map((d) => {
        const r = d.eval(m, 0);
        return { id: d.id, unlocked: !!r.unlocked };
    });
    const unlockedCountExceptCollector = prelim.filter((x) => x.unlocked && x.id !== "master_collectionneur").length;
    // 2) build final payload
    const achievements = defs.map((d) => {
        const r = d.eval(m, unlockedCountExceptCollector);
        const unlocked = !!r.unlocked;
        const isHiddenLocked = !!d.hidden && !unlocked;
        return {
            id: d.id,
            tier: d.tier,
            category: d.category,
            icon: isHiddenLocked ? "❔" : d.icon,
            name: isHiddenLocked ? "???" : d.name,
            // ✅ règle:
            // - si unlocked => on révèle la desc pour tout le monde
            // - sinon => bronze only
            desc: unlocked ? (d.desc ?? null) : d.tier === "bronze" ? (d.desc ?? null) : null,
            // hint: seulement quand locked sur gold (comme avant)
            hint: !unlocked && d.tier === "gold" ? (d.hint ?? null) : null,
            // rewardPreview: on renvoie si défini (même hors master)
            rewardPreview: d.rewardPreview ?? null,
            unlocked,
            progress: r.progress ?? null,
        };
    });
    // ✅ 3) Grant entitlements (cosmétiques) pour les succès débloqués
    // (idempotent grâce à ON CONFLICT DO NOTHING)
    const unlockedIds = achievements.filter((a) => a.unlocked).map((a) => a.id);
    let granted = 0;
    try {
        const r = await grantEntitlementsForUnlocked(userId, unlockedIds);
        granted = r.granted;
    }
    catch {
        // on ne casse pas la route achievements si la DB est down ou autre
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
