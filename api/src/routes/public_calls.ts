// api/src/routes/public_calls.ts
// Endpoint PUBLIC (no auth) pour la zone "Call" de l'overlay.
// Monté tout en haut de la stack express, avant tout middleware d'auth.

import { Router } from "express";
import { pool } from "../db.js";
import {automodProviderAllowed} from '../calls/automod_provider_policy.js';
import {providerAliases} from '../calls/provider_aliases.js';

export const publicCallsRouter = Router();

publicCallsRouter.get("/api/public/calls/:slug/queue", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const stR = await pool.query<{ id: number; phase: string | null; opened: boolean | null;automod_mode:string|null;automod_enabled:boolean|null }>(
      `SELECT s.id, hs.phase, hs.opened,ac.desired_enabled AS automod_enabled,ac.dashboard_settings->>'mode' AS automod_mode
         FROM streamers s
         LEFT JOIN hunt_sessions hs ON hs.user_id = s.user_id
         LEFT JOIN automod_control ac ON ac.streamer_id=s.id AND lower(s.slug)='lecasinoze'
        WHERE s.slug=$1
        LIMIT 1`,
      [slug]
    );
    const streamer = stR.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const phase = String(streamer.phase || "edit").toLowerCase();
    const isOpening = !streamer.automod_enabled&&(phase === "open" || streamer.opened === true);
    const challenge=streamer.automod_enabled&&streamer.automod_mode==='provider-challenge';

    // En farm, la zone doit avancer uniquement dans les machines encore à
    // farmer (bet absent). En ouverture, elle doit suivre uniquement les
    // bonus droppés et non payés. Mélanger les deux listes faisait réapparaître
    // un bonus déjà droppé dans la zone "call en cours".
    const pendingFilter = isOpening
      ? `q.bet IS NOT NULL AND q.bet > 0 AND q.pay IS NULL`
      : `(q.bet IS NULL OR q.bet <= 0) AND q.pay IS NULL`;

    // File adaptée à la phase du hunt, triée par l'ordre courant du hunt.
    const r = await pool.query(
      `SELECT
         q.id::text   AS id,
         q.slot_name  AS "slotName",
         q.slot_key   AS "slotKey",
         q.provider   AS provider,
         q.username   AS username,
         q.pos        AS pos,
         sc.image_url AS "imageUrl"
       FROM calls_queue q
       LEFT JOIN slots_catalog sc ON sc.name_key = q.slot_key
       WHERE q.streamer_id=$1
         AND ${pendingFilter}
       ORDER BY q.pos ASC
       LIMIT 2`,
      [streamer.id]
    );

    const head = r.rows?.[0] ?? null;
    const next = r.rows?.[1] ?? null;

    const cR = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM calls_queue
        WHERE streamer_id=$1
          AND ${pendingFilter.replaceAll("q.", "")}`,
      [streamer.id]
    );
    const count = Number(cR.rows?.[0]?.count || 0);

    const providerQueues=challenge?Object.fromEntries(await Promise.all(['pragmatic','hacksaw'].map(async p=>{
      const rows=await pool.query(`SELECT q.id::text AS id,q.slot_name AS "slotName",q.username,q.provider,sc.image_url AS "imageUrl"
       FROM calls_queue q LEFT JOIN slots_catalog sc ON sc.name_key=q.slot_key
       WHERE q.streamer_id=$1 AND ${pendingFilter} AND lower(btrim(q.provider))=ANY($2::text[])
       ORDER BY q.pos ASC LIMIT 3`,[streamer.id,providerAliases(p)]);
      return [p,rows.rows.filter(row=>automodProviderAllowed(row.provider,[p]))];
    }))):undefined;
    return res.json({ ok: true, phase: isOpening ? "open" : phase, head, next, count,providerQueues });
  } catch (e) {
    console.error("[api/public/calls/queue]", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
