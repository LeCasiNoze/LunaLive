import { pool } from "../db.js";
import { notEventExcludedStreamerSql } from "./eligibility.js";
const TZ = "Europe/Paris";
// Fenêtre d'audience utilisée pour L'APPARIEMENT (proposeDuos) : indépendante
// de la fenêtre de l'event lui-même — le duo doit se calculer sur
// l'historique d'audience RÉCENT, pas sur la semaine qui vient de démarrer
// où il n'y a encore aucune donnée. Cf docs/events-design.md #6.
const SHARED_AUDIENCE_WINDOW_DAYS = 30;
/**
 * Pour chaque paire de streamers ayant eu de l'audience sur les
 * SHARED_AUDIENCE_WINDOW_DAYS derniers jours, compte les viewers COMMUNS
 * (comptes ayant regardé les deux). Self-join sur l'audience distincte
 * (streamer_id, user_id) — `b.streamer_id > a.streamer_id` évite les
 * doublons symétriques (A,B)/(B,A). Trié desc : base de l'appariement
 * glouton (proposeDuos) et du refresh (refreshDuoForStreamer).
 */
export async function computeSharedAudience(windowDays = SHARED_AUDIENCE_WINDOW_DAYS) {
    const r = await pool.query(`
    WITH audience AS (
      SELECT DISTINCT streamer_id, user_id
      FROM stream_viewer_minutes
      WHERE user_id IS NOT NULL AND user_id > 0
        AND bucket_ts >= NOW() - ($1::int * INTERVAL '1 day')
        AND ${notEventExcludedStreamerSql("streamer_id")}
    )
    SELECT a.streamer_id AS streamer_a_id, b.streamer_id AS streamer_b_id, COUNT(*)::int AS shared_viewers
    FROM audience a
    JOIN audience b ON b.user_id = a.user_id AND b.streamer_id > a.streamer_id
    GROUP BY a.streamer_id, b.streamer_id
    ORDER BY shared_viewers DESC, a.streamer_id ASC, b.streamer_id ASC
    `, [windowDays]);
    return (r.rows || []).map((row) => ({
        streamerAId: Number(row.streamer_a_id),
        streamerBId: Number(row.streamer_b_id),
        sharedViewers: Number(row.shared_viewers || 0),
    }));
}
/**
 * Appariement GLOUTON : parcourt les paires triées par audience commune desc,
 * associe chaque streamer à un seul duo (un streamer déjà pris est ignoré
 * pour la suite). Idempotent : si des duos existent déjà pour l'event, ne
 * refait rien — appelé à chaque tick tant que l'event est live (engine.ts),
 * donc pas besoin de détecter explicitement "le 1er tick".
 * Streamers impairs / sans audience commune avec personne restent non
 * appariés — loggé, pas d'erreur (cf docs/events-design.md #6).
 */
export async function proposeDuos(eventId) {
    const existing = await pool.query(`SELECT 1 FROM event_duos WHERE event_id=$1 LIMIT 1`, [eventId]);
    if ((existing.rowCount ?? 0) > 0)
        return { ok: true, skipped: "already_proposed" };
    // Streamers actifs (30j) + leur "taille" (viewers distincts), hors chaînes
    // exclues — sert au tie-break quand il n'y a pas d'audience commune exploitable.
    const sizeRes = await pool.query(`
    SELECT svm.streamer_id AS id, COUNT(DISTINCT svm.user_id)::int AS size
    FROM stream_viewer_minutes svm
    WHERE svm.user_id IS NOT NULL AND svm.user_id > 0
      AND svm.bucket_ts >= NOW() - ($1::int * INTERVAL '1 day')
      AND ${notEventExcludedStreamerSql("svm.streamer_id")}
    GROUP BY svm.streamer_id
    `, [SHARED_AUDIENCE_WINDOW_DAYS]);
    const streamers = (sizeRes.rows || []).map((r) => ({ id: Number(r.id), size: Number(r.size || 0) }));
    const sharedPairs = await computeSharedAudience();
    const sharedMap = new Map();
    for (const p of sharedPairs)
        sharedMap.set(`${Math.min(p.streamerAId, p.streamerBId)}-${Math.max(p.streamerAId, p.streamerBId)}`, p.sharedViewers);
    const sharedOf = (a, b) => sharedMap.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 0;
    // Toutes les paires possibles, annotées. Priorité : plus d'audience commune,
    // puis (fallback quand l'overlap est nul ou à égalité, cas petite commu) la
    // TAILLE la plus proche → des duos équilibrés plutôt qu'un gros collé à un
    // tout petit. À volume réel, l'audience commune primera d'elle-même.
    const candidates = [];
    for (let i = 0; i < streamers.length; i++) {
        for (let k = i + 1; k < streamers.length; k++) {
            const a = streamers[i];
            const b = streamers[k];
            candidates.push({ a: a.id, b: b.id, shared: sharedOf(a.id, b.id), sizeDiff: Math.abs(a.size - b.size) });
        }
    }
    candidates.sort((x, y) => y.shared - x.shared || x.sizeDiff - y.sizeDiff || x.a - y.a || x.b - y.b);
    const assigned = new Set();
    const duos = [];
    for (const c of candidates) {
        if (assigned.has(c.a) || assigned.has(c.b))
            continue;
        duos.push({ a: c.a, b: c.b, shared: c.shared });
        assigned.add(c.a);
        assigned.add(c.b);
    }
    for (const d of duos) {
        await pool.query(`
      INSERT INTO event_duos (event_id, streamer_a_id, streamer_b_id, status, shared_viewers)
      VALUES ($1,$2,$3,'proposed',$4)
      ON CONFLICT (event_id, streamer_a_id) DO NOTHING
      `, [eventId, d.a, d.b, d.shared]);
    }
    const unmatched = streamers.map((s) => s.id).filter((id) => !assigned.has(id));
    if (unmatched.length) {
        console.warn("[duo_week] streamers non appariés (nombre impair de streamers actifs) :", unmatched);
    }
    return { ok: true, duos: duos.length, unmatched: unmatched.length };
}
export const DUO_PALIERS = [
    {
        index: 0,
        name: "Rencontre",
        quests: [
            { key: "p1_live", label: "Les 2 streamers live ≥ 1 jour chacun", cat: "streamer", impartial: true, goal: 1, metric: "each_days", unit: "j" },
            { key: "p1_watch", label: "300 min de watch cumulées", cat: "commu", impartial: false, goal: 300, metric: "watch", unit: "min" },
        ],
    },
    {
        index: 1,
        name: "Régularité",
        quests: [
            { key: "p2_days", label: "Chaque streamer ≥ 2 jours de live", cat: "streamer", impartial: true, goal: 2, metric: "each_days", unit: "j" },
            { key: "p2_chest", label: "100 rubis déposés dans les coffres", cat: "commu", impartial: false, goal: 100, metric: "chest_dep", unit: "rubis" },
        ],
    },
    {
        index: 2,
        name: "Alliance",
        quests: [
            { key: "p3_host", label: "Host mutuel entre les 2 streamers", cat: "collab", impartial: true, goal: 1, metric: "host_mutual", unit: "" },
            { key: "p3_hours", label: "6 h de stream cumulées", cat: "streamer", impartial: false, goal: 6, metric: "combined_hours", unit: "h" },
            { key: "p3_watch", label: "1 500 min de watch cumulées", cat: "commu", impartial: false, goal: 1500, metric: "watch", unit: "min" },
        ],
    },
    {
        index: 3,
        name: "Symbiose",
        quests: [
            { key: "p4_days3", label: "Chaque streamer ≥ 3 jours dont un à 2h+", cat: "streamer", impartial: true, goal: 3, metric: "each_days_2h", unit: "j" },
            { key: "p4_open", label: "Chaque streamer ouvre un coffre", cat: "streamer", impartial: false, goal: 2, metric: "each_open", unit: "" },
            { key: "p4_sub", label: "Le duo reçoit ≥ 1 sub", cat: "commu", impartial: false, goal: 1, metric: "subs", unit: "sub" },
        ],
    },
    {
        index: 4,
        name: "Duo légendaire",
        quests: [
            { key: "p5_days5", label: "Chaque streamer 5 jours (ou 15h cumulées)", cat: "streamer", impartial: true, goal: 5, metric: "each_days5_or_15h", unit: "j" },
            { key: "p5_watch", label: "5 000 min de watch cumulées", cat: "commu", impartial: false, goal: 5000, metric: "watch", unit: "min" },
            { key: "p5_chest", label: "500 rubis déposés dans les coffres", cat: "commu", impartial: false, goal: 500, metric: "chest_dep", unit: "rubis" },
        ],
    },
];
/**
 * Mesure brute des 2 streamers d'un duo sur [start, end). `bId` peut être
 * null (duo sans partenaire, ex. après un refus non ré-apparié) : b est
 * alors traité comme totalement absent (0 partout, hostMutual=false) — un
 * `ARRAY[$1,$2]` avec $2=NULL ne matche simplement jamais aucune ligne pour
 * b, pas besoin de brancher le SQL différemment.
 */
export async function computeDuoMetrics(db, aId, bId, start, end) {
    const [streamRes, watchRes, chestRes, opensRes, hostRes, subsRes] = await Promise.all([
        db.query(`
      WITH per_day AS (
        SELECT streamer_id, (started_at AT TIME ZONE '${TZ}')::date AS d,
               SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) AS secs
        FROM live_sessions
        WHERE streamer_id = ANY(ARRAY[$1,$2]::int[])
          AND started_at >= $3::timestamptz AND started_at < $4::timestamptz
        GROUP BY streamer_id, d
      )
      SELECT streamer_id, COUNT(*)::int AS days, COALESCE(SUM(secs),0)/3600.0 AS hours, BOOL_OR(secs >= 7200) AS has2h
      FROM per_day
      GROUP BY streamer_id
      `, [aId, bId, start, end]),
        db.query(`SELECT COUNT(*)::int AS watch FROM stream_viewer_minutes
       WHERE streamer_id = ANY(ARRAY[$1,$2]::int[]) AND bucket_ts >= $3::timestamptz AND bucket_ts < $4::timestamptz`, [aId, bId, start, end]),
        db.query(`SELECT COALESCE(SUM(amount),0)::int AS dep FROM wallet_tx
       WHERE spend_type='chest_deposit' AND streamer_id = ANY(ARRAY[$1,$2]::int[])
         AND created_at >= $3::timestamptz AND created_at < $4::timestamptz`, [aId, bId, start, end]),
        db.query(`SELECT streamer_id, COUNT(*)::int AS n FROM streamer_chest_openings
       WHERE streamer_id = ANY(ARRAY[$1,$2]::int[]) AND created_at >= $3::timestamptz AND created_at < $4::timestamptz
       GROUP BY streamer_id`, [aId, bId, start, end]),
        bId
            ? db.query(`SELECT
             EXISTS(SELECT 1 FROM streamer_hosts WHERE hoster_streamer_id=$1 AND target_streamer_id=$2) AS a_hosts_b,
             EXISTS(SELECT 1 FROM streamer_hosts WHERE hoster_streamer_id=$2 AND target_streamer_id=$1) AS b_hosts_a`, [aId, bId])
            : Promise.resolve({ rows: [{ a_hosts_b: false, b_hosts_a: false }] }),
        db.query(`SELECT COUNT(*)::int AS subs FROM sub_gift_claims
       WHERE streamer_id = ANY(ARRAY[$1,$2]::int[]) AND claimed_at >= $3::timestamptz AND claimed_at < $4::timestamptz`, [aId, bId, start, end]),
    ]);
    const streamByStreamer = new Map();
    for (const row of streamRes.rows || []) {
        streamByStreamer.set(Number(row.streamer_id), {
            days: Number(row.days || 0),
            hours: Number(row.hours || 0),
            has2h: Boolean(row.has2h),
        });
    }
    const opensByStreamer = new Map();
    for (const row of opensRes.rows || []) {
        opensByStreamer.set(Number(row.streamer_id), Number(row.n || 0));
    }
    const a = streamByStreamer.get(aId) ?? { days: 0, hours: 0, has2h: false };
    const b = bId != null ? streamByStreamer.get(bId) ?? { days: 0, hours: 0, has2h: false } : { days: 0, hours: 0, has2h: false };
    const hostRow = hostRes.rows?.[0] ?? { a_hosts_b: false, b_hosts_a: false };
    return {
        daysA: a.days,
        daysB: b.days,
        hoursA: a.hours,
        hoursB: b.hours,
        has2hA: a.has2h,
        has2hB: b.has2h,
        combinedHours: a.hours + b.hours,
        watch: Number(watchRes.rows?.[0]?.watch || 0),
        chestDep: Number(chestRes.rows?.[0]?.dep || 0),
        openA: opensByStreamer.get(aId) ?? 0,
        openB: bId != null ? opensByStreamer.get(bId) ?? 0 : 0,
        hostMutual: Boolean(hostRow.a_hosts_b) && Boolean(hostRow.b_hosts_a),
        subs: Number(subsRes.rows?.[0]?.subs || 0),
    };
}
function evaluateQuest(q, m) {
    switch (q.metric) {
        case "each_days":
            return { current: Math.min(m.daysA, m.daysB), done: m.daysA >= q.goal && m.daysB >= q.goal };
        case "each_days_2h":
            return {
                current: Math.min(m.daysA, m.daysB),
                done: m.daysA >= q.goal && m.daysB >= q.goal && m.has2hA && m.has2hB,
            };
        case "each_days5_or_15h":
            return {
                current: Math.min(m.daysA, m.daysB),
                done: (m.daysA >= 5 && m.daysB >= 5) || m.combinedHours >= 15,
            };
        case "each_open":
            return { current: (m.openA > 0 ? 1 : 0) + (m.openB > 0 ? 1 : 0), done: m.openA > 0 && m.openB > 0 };
        case "combined_hours":
            return { current: Math.round(m.combinedHours * 10) / 10, done: m.combinedHours >= q.goal };
        case "watch":
            return { current: m.watch, done: m.watch >= q.goal };
        case "chest_dep":
            return { current: m.chestDep, done: m.chestDep >= q.goal };
        case "host_mutual":
            return { current: m.hostMutual ? 1 : 0, done: m.hostMutual };
        case "subs":
            return { current: m.subs, done: m.subs >= q.goal };
        default: {
            const _exhaustive = q.metric;
            throw new Error(`metric duo inconnue: ${_exhaustive}`);
        }
    }
}
/**
 * Règle d'équité (cf docs/events-design.md #6) : un palier est complété SSI
 * sa quête impartiale (indépendante de la taille de commu) est faite ET AU
 * MOINS UNE autre quête du palier l'est aussi — un petit duo peut donc
 * toujours progresser sur la quête impartiale sans jamais dépendre
 * uniquement de l'activité de sa commu.
 */
export function evaluatePaliers(m) {
    return DUO_PALIERS.map((p) => {
        const quests = p.quests.map((q) => ({ ...q, ...evaluateQuest(q, m) }));
        const impartialDone = quests.find((q) => q.impartial)?.done ?? false;
        const otherDone = quests.some((q) => !q.impartial && q.done);
        return { index: p.index, name: p.name, done: impartialDone && otherDone, quests };
    });
}
/**
 * Recompute (pattern global_chest.ts / burn_boss.ts) : pour chaque duo de
 * l'event, évalue les quêtes/paliers (cf DUO_PALIERS/evaluatePaliers) et
 * stocke `points` = nombre de paliers complétés (ce qui définit le
 * classement/champion, cf getRankedDuos + distributeDuo dans rewards.ts) et
 * `detail` = la progression complète, réutilisée telle quelle par la route
 * publique pour l'affichage front.
 */
export async function recomputeDuoWeek(eventId) {
    const ev = await pool.query(`
    SELECT *
    FROM events
    WHERE type='duo_week'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    const e = ev.rows?.[0];
    if (!e)
        return { ok: false, error: "missing" };
    if (String(e.type) !== "duo_week")
        return { ok: false, error: "wrong_type" };
    if (String(e.state) !== "live")
        return { ok: true, skipped: "not_live" };
    await pool.query(`DELETE FROM event_duo_scores WHERE event_id=$1`, [eventId]);
    const duosRes = await pool.query(`SELECT id, streamer_a_id, streamer_b_id FROM event_duos WHERE event_id=$1`, [eventId]);
    for (const row of duosRes.rows || []) {
        const duoId = Number(row.id);
        const aId = Number(row.streamer_a_id);
        const bId = row.streamer_b_id != null ? Number(row.streamer_b_id) : null;
        const metrics = await computeDuoMetrics(pool, aId, bId, e.start_at, e.end_at);
        const paliers = evaluatePaliers(metrics);
        const paliersDone = paliers.filter((p) => p.done).length;
        await pool.query(`INSERT INTO event_duo_scores (event_id, duo_id, points, detail, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,NOW())`, [eventId, duoId, paliersDone, JSON.stringify({ paliers })]);
    }
    return { ok: true };
}
/**
 * Classement des duos (paliers complétés desc = eds.points, cf
 * recomputeDuoWeek). `db` accepte pool OU client de transaction — utilisé à
 * la fois par la route publique et par distributeDuo dans rewards.ts (même
 * pattern que clip_race.ts getRankedClips).
 */
export async function getRankedDuos(db, eventId, limit = 20) {
    const r = await db.query(`
    SELECT
      ed.id AS duo_id, ed.status, ed.shared_viewers, ed.refreshed_count,
      sa.id AS a_id, sa.slug AS a_slug, sa.display_name AS a_name, sa.user_id AS a_user_id,
      sb.id AS b_id, sb.slug AS b_slug, sb.display_name AS b_name, sb.user_id AS b_user_id,
      COALESCE(eds.points, 0)::int AS points, eds.detail AS detail
    FROM event_duos ed
    JOIN streamers sa ON sa.id = ed.streamer_a_id
    LEFT JOIN streamers sb ON sb.id = ed.streamer_b_id
    LEFT JOIN event_duo_scores eds ON eds.event_id = ed.event_id AND eds.duo_id = ed.id
    WHERE ed.event_id = $1
    ORDER BY COALESCE(eds.points, 0) DESC, ed.id ASC
    LIMIT $2
    `, [eventId, limit]);
    return (r.rows || []).map((row, idx) => ({
        rank: idx + 1,
        duoId: Number(row.duo_id),
        streamerAId: Number(row.a_id),
        streamerASlug: String(row.a_slug || ""),
        streamerADisplayName: String(row.a_name || ""),
        streamerAUserId: row.a_user_id != null ? Number(row.a_user_id) : null,
        streamerBId: row.b_id != null ? Number(row.b_id) : null,
        streamerBSlug: row.b_slug != null ? String(row.b_slug) : null,
        streamerBDisplayName: row.b_name != null ? String(row.b_name) : null,
        streamerBUserId: row.b_user_id != null ? Number(row.b_user_id) : null,
        status: String(row.status || "proposed"),
        sharedViewers: Number(row.shared_viewers || 0),
        refreshedCount: Number(row.refreshed_count || 0),
        points: Number(row.points || 0),
        paliersDone: Number(row.points || 0),
        paliers: (row.detail?.paliers ?? []),
    }));
}
export async function acceptDuoForStreamer(eventId, streamerId) {
    const r = await pool.query(`
    UPDATE event_duos
    SET status='accepted'
    WHERE event_id=$1 AND (streamer_a_id=$2 OR streamer_b_id=$2)
    RETURNING *
    `, [eventId, streamerId]);
    return r.rows?.[0] ?? null;
}
/**
 * "1 seul refresh autorisé si refus (→ 2ᵉ streamer le plus commun)" (cf
 * docs/events-design.md #6). Le côté du streamer demandeur (a ou b) est
 * conservé ; seul l'AUTRE côté change, vers le partenaire au 2e score
 * d'audience commune le plus haut PARMI CEUX PAS DÉJÀ PRIS dans un autre duo
 * de l'event. L'ancien partenaire redevient simplement non apparié — pas de
 * re-matching en cascade, hors scope MVP (cf docs/events-design.md — chiffres
 * et mécaniques fines à affiner event par event).
 */
export async function refreshDuoForStreamer(eventId, streamerId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [eventId]);
        const dRes = await client.query(`SELECT * FROM event_duos WHERE event_id=$1 AND (streamer_a_id=$2 OR streamer_b_id=$2) LIMIT 1`, [eventId, streamerId]);
        const duo = dRes.rows?.[0];
        if (!duo) {
            await client.query("ROLLBACK");
            return { ok: false, error: "no_duo" };
        }
        if (Number(duo.refreshed_count) >= 1) {
            await client.query("ROLLBACK");
            return { ok: false, error: "refresh_used" };
        }
        const isA = Number(duo.streamer_a_id) === streamerId;
        const usedRes = await client.query(`SELECT streamer_a_id, streamer_b_id FROM event_duos WHERE event_id=$1 AND id <> $2`, [eventId, duo.id]);
        const used = new Set([streamerId]);
        if (duo.streamer_a_id != null)
            used.add(Number(duo.streamer_a_id));
        if (duo.streamer_b_id != null)
            used.add(Number(duo.streamer_b_id));
        for (const row of usedRes.rows || []) {
            if (row.streamer_a_id != null)
                used.add(Number(row.streamer_a_id));
            if (row.streamer_b_id != null)
                used.add(Number(row.streamer_b_id));
        }
        const pairs = await computeSharedAudience();
        const candidate = pairs
            .filter((p) => p.streamerAId === streamerId || p.streamerBId === streamerId)
            .map((p) => ({
            partnerId: p.streamerAId === streamerId ? p.streamerBId : p.streamerAId,
            shared: p.sharedViewers,
        }))
            .filter((p) => !used.has(p.partnerId))
            .sort((x, y) => y.shared - x.shared)[0];
        if (!candidate) {
            await client.query("ROLLBACK");
            return { ok: false, error: "no_candidate" };
        }
        const updateSql = isA
            ? `UPDATE event_duos SET streamer_b_id=$3, shared_viewers=$4, refreshed_count=refreshed_count+1, status='refreshed' WHERE id=$1 AND event_id=$2 RETURNING *`
            : `UPDATE event_duos SET streamer_a_id=$3, shared_viewers=$4, refreshed_count=refreshed_count+1, status='refreshed' WHERE id=$1 AND event_id=$2 RETURNING *`;
        const updated = await client.query(updateSql, [duo.id, eventId, candidate.partnerId, candidate.shared]);
        await client.query("COMMIT");
        return { ok: true, duo: updated.rows[0] };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
