// api/src/routes/twitch_scout.ts
//
// Lecture des résultats du scout casino Twitch (script local
// scripts/twitch_casino_scout.mjs qui pousse dans twitch_scout_streamers).
// Consommé par la section "Scout" du FSB Board.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";
export const twitchScoutRouter = Router();
twitchScoutRouter.use("/fsb/twitch-scout", requireAuth, requireFsbAccess);
function mapRow(row) {
    return {
        login: row.login,
        name: row.name,
        country: row.country,
        language: row.language,
        partner: !!row.partner,
        followers: Number(row.followers || 0),
        live: !!row.live,
        viewers: Number(row.viewers || 0),
        viewersAvg: Number(row.viewers_avg || 0),
        viewersPeak: Number(row.viewers_peak || 0),
        viewersSamples: Number(row.viewers_samples || 0),
        game: row.game,
        title: row.title,
        contactType: row.contact_type,
        contactValue: row.contact_value,
        telegram: row.telegram,
        email: row.email,
        discord: row.discord,
        instagram: row.instagram,
        hasContact: !!row.has_contact,
        botStatus: row.bot_status,
        verdictLabel: row.verdict_label,
        verdictScore: row.verdict_score,
        firstSeen: row.first_seen ? new Date(row.first_seen).toISOString() : null,
        lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
        seenCount: Number(row.seen_count || 0),
        contacted: !!row.contacted,
        contactedAt: row.contacted_at ? new Date(row.contacted_at).toISOString() : null,
        contactedChannel: row.contacted_channel || null,
    };
}
twitchScoutRouter.get("/fsb/twitch-scout", a(async (_req, res) => {
    let rows = [];
    let updatedAt = null;
    try {
        const r = await pool.query(`SELECT * FROM twitch_scout_streamers
         ORDER BY (live IS TRUE) DESC, COALESCE(viewers_avg, viewers, 0) DESC, followers DESC`);
        rows = r.rows;
        const maxUpdated = await pool.query(`SELECT max(updated_at) AS u FROM twitch_scout_streamers`);
        updatedAt = maxUpdated.rows[0]?.u ? new Date(maxUpdated.rows[0].u).toISOString() : null;
    }
    catch (e) {
        // 42P01 = table absente (scout jamais lancé) — on renvoie une liste vide
        if (e?.code !== "42P01")
            throw e;
    }
    res.json({
        ok: true,
        updatedAt,
        streamers: rows.map(mapRow),
    });
}));
// Marque un streamer comme contacté (ou annule). Le statut n'est jamais
// réécrit par le scout horaire.
twitchScoutRouter.post("/fsb/twitch-scout/contacted", a(async (req, res) => {
    const login = String(req.body?.login || "").trim().toLowerCase();
    const channel = String(req.body?.channel || "telegram").trim() || "telegram";
    const contacted = req.body?.contacted !== false;
    if (!login)
        return res.status(400).json({ ok: false, error: "login_required" });
    await pool.query(`UPDATE twitch_scout_streamers
       SET contacted = $2, contacted_at = CASE WHEN $2 THEN now() ELSE NULL END, contacted_channel = CASE WHEN $2 THEN $3 ELSE NULL END
       WHERE login = $1`, [login, contacted, channel]);
    res.json({ ok: true });
}));
