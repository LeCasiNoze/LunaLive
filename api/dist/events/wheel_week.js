import { pool } from "../db.js";
const NOT_BANNED_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM site_user_bans b
    WHERE b.user_id = t.user_id
      AND b.revoked_at IS NULL
      AND (b.until IS NULL OR b.until > NOW())
  )
`;
/**
 * Recompute simple (contrairement à viewer_week) : une seule source. Le score
 * = total rubis gagnés à la roue (wallet_tx, kind='earn', origin='wheel_daily')
 * dans la fenêtre de l'event.
 *
 * ⚠️ wallet_tx est la SEULE source fiable ici — daily_wheel_spins ne trace
 * QUE le spin gratuit du jour et omet les spins joués via ticket (wheel.ts:
 * l'INSERT dans daily_wheel_spins est sauté si `usedTicket`). Or l'event
 * distribue justement des tickets bonus via les quêtes quotidiennes
 * modifiées pendant sa durée (cf docs/events-design.md) : les ignorer
 * fausserait le score de tous les joueurs actifs. earnRubisTx écrit un
 * wallet_tx pour CHAQUE spin (gratuit ou via ticket), donc wallet_tx capture
 * bien la totalité des gains roue de la semaine.
 */
export async function recomputeWheelWeek(eventId) {
    const ev = await pool.query(`
    SELECT *
    FROM events
    WHERE type='wheel_week'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    const e = ev.rows?.[0];
    if (!e)
        return { ok: false, error: "missing" };
    if (String(e.type) !== "wheel_week")
        return { ok: false, error: "wrong_type" };
    if (String(e.state) !== "live")
        return { ok: true, skipped: "not_live" };
    await pool.query(`DELETE FROM event_scores WHERE event_id=$1`, [eventId]);
    await pool.query(`
    INSERT INTO event_scores (event_id, user_id, points, detail, updated_at)
    SELECT
      $1::bigint,
      t.user_id,
      SUM(t.amount)::int AS points,
      jsonb_build_object('spins', COUNT(*), 'rubisWon', SUM(t.amount)::int) AS detail,
      NOW()
    FROM wallet_tx t
    WHERE t.kind = 'earn'
      AND t.origin = 'wheel_daily'
      AND t.user_id > 0
      AND t.created_at >= $2::timestamptz
      AND t.created_at <  $3::timestamptz
      AND ${NOT_BANNED_SQL}
    GROUP BY t.user_id
    `, [eventId, e.start_at, e.end_at]);
    return { ok: true };
}
