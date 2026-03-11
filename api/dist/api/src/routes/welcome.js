import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { earnRubisTx } from "../wallet_engine.js";
const TZ = "Europe/Paris";
const STREAMER_WEEKLY_CAP = 20;
export const welcomeRouter = Router();
/**
 * GET /me/welcome/state
 * -> calcule la progression + indique si rewards déjà donnés
 */
welcomeRouter.get("/me/welcome/state", requireAuth, a(async (req, res) => {
    const userId = Number(req.user.id);
    // déjà récompensé ?
    const done = await pool.query(`SELECT 1 FROM welcome_rewards WHERE user_id=$1 LIMIT 1`, [userId]);
    const rewarded = !!done.rows?.[0];
    // 1) watchtime minutes total (connecté only)
    const watch = await pool.query(`SELECT COUNT(*)::int AS n
       FROM stream_viewer_minutes
       WHERE user_id=$1`, [userId]);
    const watchMin = Number(watch.rows?.[0]?.n || 0);
    // 2) daily bonus distinct days
    const d3 = await pool.query(`SELECT COUNT(*)::int AS n
       FROM daily_bonus_claims
       WHERE user_id=$1`, [userId]);
    const dailyDays = Number(d3.rows?.[0]?.n || 0);
    // 3) calls actions (>=2)
    const ca = await pool.query(`SELECT COUNT(*)::int AS n
       FROM calls_actions
       WHERE user_id=$1`, [userId]);
    const callsCount = Number(ca.rows?.[0]?.n || 0);
    // 4) wheel spin (>=1) : daily_wheel_spins ou wheel_spins
    const ws = await pool.query(`SELECT
         (SELECT COUNT(*) FROM daily_wheel_spins WHERE user_id=$1) +
         (SELECT COUNT(*) FROM wheel_spins WHERE user_id=$1)
       AS n`, [userId]);
    const wheelCount = Number(ws.rows?.[0]?.n || 0);
    // 5) follow (TODO: adapte à ton schema)
    const fo = await pool.query(`SELECT COUNT(*)::int AS n
    FROM streamer_follows
    WHERE user_id=$1`, [userId]);
    const followCount = Number(fo.rows?.[0]?.n || 0);
    const goals = {
        follow: { need: 1, have: followCount },
        daily2: { need: 2, have: dailyDays },
        calls2: { need: 2, have: callsCount },
        wheel1: { need: 1, have: wheelCount },
        watch60: { need: 60, have: watchMin },
    };
    const completed = goals.follow.have >= goals.follow.need &&
        goals.daily2.have >= goals.daily2.need &&
        goals.calls2.have >= goals.calls2.need &&
        goals.wheel1.have >= goals.wheel1.need &&
        goals.watch60.have >= goals.watch60.need;
    // ref info (optionnel)
    const ref = await pool.query(`SELECT ur.streamer_id, s.slug
       FROM user_referrals ur
       JOIN streamers s ON s.id=ur.streamer_id
       WHERE ur.user_id=$1
       LIMIT 1`, [userId]);
    res.json({
        ok: true,
        rewarded,
        completed,
        goals,
        referral: ref.rows?.[0]
            ? { streamerId: Number(ref.rows[0].streamer_id), streamerSlug: String(ref.rows[0].slug) }
            : null,
    });
}));
/**
 * POST /me/welcome/claim
 * -> si completed et pas déjà rewarded => donne:
 *   - viewer: +50 rubis (origin event_platform, petit poids)
 *   - viewer: promo perks 7 jours (promo_viewer_week)
 *   - streamer ref (si existe et cap pas atteint): +25 rubis poids 1 (comme paid_topup)
 */
welcomeRouter.post("/me/welcome/claim", requireAuth, a(async (req, res) => {
    const userId = Number(req.user.id);
    // lock anti double (et on le re-check sous transaction)
    const already = await pool.query(`SELECT 1 FROM welcome_rewards WHERE user_id=$1 LIMIT 1`, [userId]);
    if (already.rows?.[0])
        return res.json({ ok: true, already: true });
    // re-calc state (réutilise la même logique, en vrai tu peux factoriser)
    const watch = await pool.query(`SELECT COUNT(*)::int AS n FROM stream_viewer_minutes WHERE user_id=$1`, [userId]);
    const watchMin = Number(watch.rows?.[0]?.n || 0);
    const d3 = await pool.query(`SELECT COUNT(*)::int AS n FROM daily_bonus_claims WHERE user_id=$1`, [userId]);
    const dailyDays = Number(d3.rows?.[0]?.n || 0);
    const ca = await pool.query(`SELECT COUNT(*)::int AS n FROM calls_actions WHERE user_id=$1`, [userId]);
    const callsCount = Number(ca.rows?.[0]?.n || 0);
    const ws = await pool.query(`SELECT
         (SELECT COUNT(*) FROM daily_wheel_spins WHERE user_id=$1) +
         (SELECT COUNT(*) FROM wheel_spins WHERE user_id=$1)
       AS n`, [userId]);
    const wheelCount = Number(ws.rows?.[0]?.n || 0);
    const fo = await pool.query(`SELECT COUNT(*)::int AS n
    FROM streamer_follows
    WHERE user_id=$1`, [userId]);
    const followCount = Number(fo.rows?.[0]?.n || 0);
    const completed = followCount >= 1 && dailyDays >= 2 && callsCount >= 2 && wheelCount >= 1 && watchMin >= 60;
    if (!completed)
        return res.status(400).json({ ok: false, error: "not_completed" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // ✅ re-lock sous transaction
        const already2 = await client.query(`SELECT 1 FROM welcome_rewards WHERE user_id=$1 LIMIT 1`, [userId]);
        if (already2.rows?.[0]) {
            await client.query("COMMIT");
            return res.json({ ok: true, already: true });
        }
        // viewer reward: +50 rubis origin=event_platform (petit poids)
        // ✅ earnRubisTx signature: (client, userId, origin, amount, meta)
        await earnRubisTx(client, userId, "event_platform", 50, { purpose: "welcome_rewards", kind: "welcome", promoDays: 7 });
        // ✅ promo "viewer week" via la même table que Stripe (user_subscriptions)
        // -> provider='promo' pour pouvoir distinguer + éviter le portail Stripe
        // -> NE PAS écraser un sub Stripe actif
        await client.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_code, provider, provider_subscription_id,
          status, current_period_start, current_period_end, cancel_at_period_end,
          updated_at
        )
        VALUES (
          $1, 'viewer', 'promo', $2,
          'active', NOW(), NOW() + INTERVAL '7 days', TRUE,
          NOW()
        )
        ON CONFLICT (user_id, plan_code)
        DO UPDATE SET
          provider='promo',
          provider_subscription_id=EXCLUDED.provider_subscription_id,
          status='active',
          current_period_start=EXCLUDED.current_period_start,
          current_period_end=GREATEST(user_subscriptions.current_period_end, EXCLUDED.current_period_end),
          cancel_at_period_end=TRUE,
          updated_at=NOW()
        WHERE
          -- on update si:
          -- 1) c'est déjà une promo
          user_subscriptions.provider='promo'
          OR
          -- 2) ou si l'enregistrement existant n'est plus actif (expiré/inactif)
          user_subscriptions.status NOT IN ('active','trialing')
          OR
          (user_subscriptions.current_period_end IS NOT NULL AND user_subscriptions.current_period_end <= NOW())
        `, [
            userId,
            `promo_welcome_week:${userId}`, // id "stable"
        ]);
        // ✅ earnRubisTx ne renvoie pas de txId chez toi => on stocke NULL
        const viewerTxId = null;
        // mark welcome rewarded
        await client.query(`INSERT INTO welcome_rewards(user_id, viewer_tx_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`, [userId, viewerTxId]);
        // streamer referral payout (si ref exists, cap weekly)
        const ref = await client.query(`SELECT ur.streamer_id
         FROM user_referrals ur
         WHERE ur.user_id=$1
         LIMIT 1`, [userId]);
        let streamerPaid = false;
        let streamerTxId = null;
        if (ref.rows?.[0]?.streamer_id) {
            const streamerId = Number(ref.rows[0].streamer_id);
            // resolve streamer userId
            const ru = await client.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
            const streamerUserId = Number(ru.rows?.[0]?.user_id || 0);
            if (streamerUserId > 0) {
                // week_start Paris (lundi)
                const wk = await client.query(`SELECT to_char(date_trunc('week', (NOW() AT TIME ZONE '${TZ}'))::date, 'YYYY-MM-DD') AS week_start`);
                const weekStart = String(wk.rows?.[0]?.week_start || "");
                // cap: count payouts this week
                const cap = await client.query(`SELECT COUNT(*)::int AS n
             FROM referral_streamer_payouts
             WHERE streamer_id=$1 AND week_start=$2::date`, [streamerId, weekStart]);
                const n = Number(cap.rows?.[0]?.n || 0);
                if (n < STREAMER_WEEKLY_CAP) {
                    // ✅ +25 rubis poids 1 => origin=paid_topup
                    await earnRubisTx(client, streamerUserId, "paid_topup", 25, { purpose: "referral_streamer_reward", referredUserId: userId, weekStart });
                    // ✅ idem: pas de txId dispo
                    streamerTxId = null;
                    await client.query(`INSERT INTO referral_streamer_payouts(streamer_id, referred_user_id, week_start, amount, tx_id)
               VALUES ($1,$2,$3::date,25,$4)
               ON CONFLICT (referred_user_id) DO NOTHING`, [streamerId, userId, weekStart, streamerTxId]);
                    streamerPaid = true;
                }
            }
        }
        await client.query("COMMIT");
        return res.json({
            ok: true,
            viewer: { rubis: 50, promoDays: 7 },
            streamer: { paid: streamerPaid, rubis: streamerPaid ? 25 : 0, txId: streamerTxId },
        });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        return res.status(500).json({ ok: false, error: "server_error", message: e?.message || String(e) });
    }
    finally {
        client.release();
    }
}));
