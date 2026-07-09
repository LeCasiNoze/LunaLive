// Chaînes EXCLUES de tous les events (ex. la radio "LunaLive" : ce n'est pas un
// vrai streamer compétiteur, elle ne doit jamais être appariée en duo ni
// apparaître dans un classement de streamers). Par slug (pas de flag dédié en
// base). Étendre le tableau pour bannir d'autres chaînes.
export const EVENT_EXCLUDED_STREAMER_SLUGS = ["lunalive"];
/**
 * Prédicat SQL : vrai si `streamerIdExpr` n'est PAS une chaîne exclue des
 * events. `streamerIdExpr` doit être une colonne qualifiée renvoyant un
 * streamers.id (ex. "svm.streamer_id", "ecs.streamer_id"). Le sous-select sur
 * streamers.slug est trivial (set minuscule constant) — Postgres le hoist.
 */
export function notEventExcludedStreamerSql(streamerIdExpr) {
    const list = EVENT_EXCLUDED_STREAMER_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
    return `${streamerIdExpr} NOT IN (SELECT id FROM streamers WHERE lower(slug) IN (${list}))`;
}
/**
 * Gate d'éligibilité "assoupli" pour les events (v1b, onboarding complet).
 * IMPORTANT : ce gate ne filtre JAMAIS le calcul des points (les points
 * comptent pour tout le monde) — il ne filtre que l'APPARITION dans un
 * classement public et la DISTRIBUTION des lots (cf events/rewards.ts,
 * routes/events_viewer_week.ts).
 *
 * v1b : suivre 1 streamer + Discord lié (discord_links) + Insta déclaré
 * (event_access_flags.insta_declared_at) + réclamer 1 bonus quotidien +
 * 30 min de watch cumulées (anti-farm : minutes distinctes, pas de lignes),
 * hors bannis.
 *
 * ⚠️ TOUJOURS passer une colonne QUALIFIÉE (ex. "s.user_id", "combined.user_id").
 * Une colonne nue ("user_id") est capturée par les tables internes des EXISTS
 * (f/dl/c/svm/b ont toutes une colonne user_id) → corrélation cassée : les
 * EXISTS deviennent toujours vrais et le NOT EXISTS bans devient faux dès
 * qu'un seul compte est banni (0 ligne éligible).
 */
export function eventRewardEligibilitySql(userIdExpr) {
    return `(
    EXISTS (SELECT 1 FROM streamer_follows f WHERE f.user_id = ${userIdExpr})
    AND EXISTS (SELECT 1 FROM discord_links dl WHERE dl.user_id = ${userIdExpr})
    AND EXISTS (
      SELECT 1 FROM event_access_flags eaf
      WHERE eaf.user_id = ${userIdExpr} AND eaf.insta_declared_at IS NOT NULL
    )
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
const STEP_LABELS = {
    follow_streamer: "Suivre un streamer",
    link_discord: "Lier ton compte Discord",
    follow_insta: "Suivre @lunalive_tv sur Instagram",
    daily_claim: "Réclamer ton bonus quotidien",
    watch_30: "Regarder 30 minutes de live",
};
/**
 * Détail par critère (pour la page /participer). Mêmes conditions que
 * eventRewardEligibilitySql, hors check ban (le ban n'est pas une "étape"
 * affichable à l'utilisateur ; utiliser hasEventAccess pour l'éligibilité
 * finale qui, elle, exclut les bannis).
 */
export async function getEventAccessSteps(client, userId) {
    const r = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM streamer_follows f WHERE f.user_id = $1) AS follow_streamer,
      EXISTS (SELECT 1 FROM discord_links dl WHERE dl.user_id = $1) AS link_discord,
      EXISTS (
        SELECT 1 FROM event_access_flags eaf
        WHERE eaf.user_id = $1 AND eaf.insta_declared_at IS NOT NULL
      ) AS follow_insta,
      EXISTS (SELECT 1 FROM daily_bonus_claims c WHERE c.user_id = $1) AS daily_claim,
      (
        SELECT COUNT(DISTINCT svm.bucket_ts) FROM stream_viewer_minutes svm WHERE svm.user_id = $1
      ) >= 30 AS watch_30
    `, [userId]);
    const row = r.rows?.[0] ?? {};
    return Object.keys(STEP_LABELS).map((key) => ({
        key,
        label: STEP_LABELS[key],
        done: Boolean(row[key]),
    }));
}
