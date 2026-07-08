/**
 * Gate d'éligibilité "assoupli" pour les events (v1, onboarding).
 * IMPORTANT : ce gate ne filtre JAMAIS le calcul des points (les points
 * comptent pour tout le monde) — il ne filtre que l'APPARITION dans un
 * classement public et la DISTRIBUTION des lots (cf events/rewards.ts,
 * routes/events_viewer_week.ts).
 *
 * v1 : suivre 1 streamer + réclamer 1 bonus quotidien + 30 min de watch
 * cumulées (anti-farm : minutes distinctes, pas de lignes), hors bannis.
 * TODO gate complet = + Discord lié (discord_links) + Insta déclaratif — v1b
 */
export function eventRewardEligibilitySql(userIdExpr) {
    return `(
    EXISTS (SELECT 1 FROM streamer_follows f WHERE f.user_id = ${userIdExpr})
    AND EXISTS (SELECT 1 FROM daily_bonus_claims c WHERE c.user_id = ${userIdExpr})
    AND (
      SELECT COUNT(DISTINCT svm.bucket_ts)
      FROM stream_viewer_minutes svm
      WHERE svm.user_id = ${userIdExpr}
    ) >= 30
    AND NOT EXISTS (
      SELECT 1 FROM site_user_bans b
      WHERE b.user_id = ${userIdExpr}
        AND b.revoked_at IS NULL
        AND (b.until IS NULL OR b.until > NOW())
    )
  )`;
}
export async function hasEventAccess(client, userId) {
    const r = await client.query(`SELECT ${eventRewardEligibilitySql("$1")} AS eligible`, [userId]);
    return Boolean(r.rows?.[0]?.eligible);
}
