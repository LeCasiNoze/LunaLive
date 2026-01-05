// api/src/routes/me_profile.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const meProfileRouter = Router();

function getAuthUserId(req: any, res: any): number | null {
  // compatible avec plusieurs patterns (req.user ou res.locals.user)
  const u = req.user ?? res.locals?.user ?? null;
  const id = u?.id;
  return typeof id === "number" ? id : null;
}

function clampInt(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * GET /me/following?q=&limit=
 * -> { ok:true, items:[{ id?, slug, displayName, isLive, notifyEnabled }] }
 */
meProfileRouter.get("/me/following", requireAuth, async (req, res) => {
  const userId = getAuthUserId(req, res);
  if (!userId) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });

  const q = String(req.query.q ?? "").trim();
  const limit = clampInt(Number(req.query.limit ?? 80) || 80, 1, 200);

  const { rows } = await pool.query(
    `
    SELECT
      s.id::text              AS id,
      s.slug                  AS slug,
      s.display_name          AS "displayName",
      s.is_live               AS "isLive",
      f.notify_enabled        AS "notifyEnabled",
      f.created_at            AS "followedAt"
    FROM streamer_follows f
    JOIN streamers s ON s.id = f.streamer_id
    WHERE f.user_id = $1
      AND (
        $2 = '' OR
        s.slug ILIKE ('%' || $2 || '%') OR
        s.display_name ILIKE ('%' || $2 || '%')
      )
    ORDER BY f.created_at DESC
    LIMIT $3
    `,
    [userId, q, limit]
  );

  return res.json({ ok: true, items: rows });
});

/**
 * GET /me/stats
 * -> un gros récap fun du compte
 */
meProfileRouter.get("/me/stats", requireAuth, async (req, res) => {
  const userId = getAuthUserId(req, res);
  if (!userId) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });

  // 1) user + ancienneté
  const me = await pool.query(`SELECT created_at FROM users WHERE id=$1`, [userId]);
  if (me.rowCount === 0) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

  // 2) Queries (on garde ça lisible; perf OK pour un profil)
  const [
    followingQ,
    chatQ,
    watchQ,
    topWatchQ,
    topMsgQ,
    activityHourQ,
    activityDowQ,
    earnedQ,
    spentQ,
    supportQ,
    burnQ,
    wheelQ,
    bonusQ,
    achQ,
    entQ,
    chestQ,
    giftsQ,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id=$1`, [userId]),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL`,
      [userId]
    ),
    pool.query(`SELECT COUNT(*)::int AS minutes FROM stream_viewer_minutes WHERE user_id=$1`, [
      userId,
    ]),
    pool.query(
      `
      SELECT s.slug, s.display_name AS "displayName", COUNT(*)::int AS minutes
      FROM stream_viewer_minutes m
      JOIN streamers s ON s.id = m.streamer_id
      WHERE m.user_id=$1
      GROUP BY s.slug, s.display_name
      ORDER BY minutes DESC
      LIMIT 5
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT s.slug, s.display_name AS "displayName", COUNT(*)::int AS messages
      FROM chat_messages cm
      JOIN streamers s ON s.id = cm.streamer_id
      WHERE cm.user_id=$1 AND cm.deleted_at IS NULL
      GROUP BY s.slug, s.display_name
      ORDER BY messages DESC
      LIMIT 5
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Paris'))::int AS hour,
             COUNT(*)::int AS n
      FROM chat_messages
      WHERE user_id=$1 AND deleted_at IS NULL
      GROUP BY hour
      ORDER BY n DESC
      LIMIT 1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT EXTRACT(DOW FROM (created_at AT TIME ZONE 'Europe/Paris'))::int AS dow,
             COUNT(*)::int AS n
      FROM chat_messages
      WHERE user_id=$1 AND deleted_at IS NULL
      GROUP BY dow
      ORDER BY n DESC
      LIMIT 1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(amount),0)::int AS n
      FROM rubis_tx
      WHERE status='succeeded'
        AND to_user_id=$1
        AND kind IN ('mint','transfer','adjust')
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(amount),0)::int AS n
      FROM rubis_tx
      WHERE status='succeeded'
        AND from_user_id=$1
        AND kind IN ('support','sink','transfer','adjust')
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(amount),0)::int AS n
      FROM rubis_tx
      WHERE status='succeeded'
        AND from_user_id=$1
        AND kind='support'
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(burn_amount),0)::int AS n
      FROM rubis_tx
      WHERE status='succeeded'
        AND from_user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS spins,
             COALESCE(SUM(reward_rubis),0)::int AS rubis
      FROM daily_wheel_spins
      WHERE user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS claims
      FROM daily_bonus_claims
      WHERE user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM user_achievements
      WHERE user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM user_entitlements
      WHERE user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(amount),0)::int AS rubis
      FROM streamer_chest_payouts
      WHERE user_id=$1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM sub_gift_claims
      WHERE user_id=$1
      `,
      [userId]
    ),
  ]);

  const createdAt = new Date(String(me.rows[0].created_at));
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));

  const watchMinutes = Number(watchQ.rows[0]?.minutes ?? 0);
  const watchSecondsTotal = watchMinutes * 60;

  const topWatch = topWatchQ.rows?.[0] ?? null;

  return res.json({
    ok: true,

    // Account
    accountAgeDays,

    // Social
    followingCount: Number(followingQ.rows[0]?.n ?? 0),

    // Chat
    chatMessagesTotal: Number(chatQ.rows[0]?.n ?? 0),
    mostActiveChatHour: activityHourQ.rows?.[0]?.hour ?? null,
    mostActiveChatDow: activityDowQ.rows?.[0]?.dow ?? null,
    topStreamersByMessages: topMsgQ.rows ?? [],

    // Watch
    watchSecondsTotal,
    topStreamerByWatch: topWatch
      ? {
          slug: topWatch.slug,
          displayName: topWatch.displayName,
          seconds: Number(topWatch.minutes ?? 0) * 60,
        }
      : null,
    topStreamersByWatch: (topWatchQ.rows ?? []).map((r: any) => ({
      slug: r.slug,
      displayName: r.displayName,
      seconds: Number(r.minutes ?? 0) * 60,
    })),

    // Economy
    rubisEarnedTotal: Number(earnedQ.rows[0]?.n ?? 0),
    rubisSpentTotal: Number(spentQ.rows[0]?.n ?? 0),
    rubisSupportTotal: Number(supportQ.rows[0]?.n ?? 0),
    rubisBurnTotal: Number(burnQ.rows[0]?.n ?? 0),

    // Fun extras
    dailyWheelSpinsTotal: Number(wheelQ.rows[0]?.spins ?? 0),
    dailyWheelRubisTotal: Number(wheelQ.rows[0]?.rubis ?? 0),
    dailyBonusClaimsTotal: Number(bonusQ.rows[0]?.claims ?? 0),
    achievementsUnlockedTotal: Number(achQ.rows[0]?.n ?? 0),
    entitlementsTotal: Number(entQ.rows[0]?.n ?? 0),
    chestRubisWonTotal: Number(chestQ.rows[0]?.rubis ?? 0),
    subGiftsClaimedTotal: Number(giftsQ.rows[0]?.n ?? 0),
  });
});
