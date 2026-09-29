import { createHash, randomInt } from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";
import { keyText } from "../calls/normalize.js";
import { resolveSlot } from "../calls/catalog.js";

export const rumbleCallSelfRouter = Router();
const STREAMER_SLUG = "lecasinoze";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function streamerId() {
  const result = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=$1 LIMIT 1`, [STREAMER_SLUG]);
  return Number(result.rows[0]?.id || 0);
}

async function linkFor(userId: number, id: number) {
  const result = await pool.query(
    `SELECT rumble_user_id AS "rumbleUserId", rumble_username AS "rumbleUsername"
       FROM rumble_call_links WHERE user_id=$1 AND streamer_id=$2 LIMIT 1`,
    [userId, id],
  );
  return result.rows[0] ?? null;
}

rumbleCallSelfRouter.get("/", async (req: any, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const uid = Number(req.user?.id || 0), sid = await streamerId();
    const link = await linkFor(uid, sid);
    if (!link) return res.json({ ok: true, linked: false, calls: [] });
    const result = await pool.query(
      `SELECT id::text AS id, slot_name AS "slotName", provider, pos::int AS pos, created_at AS "createdAt"
         FROM calls_queue WHERE streamer_id=$1 AND rumble_user_id=$2
          AND bet IS NULL AND pay IS NULL AND COALESCE(is_bonus,FALSE)=FALSE
         ORDER BY pos ASC`,
      [sid, link.rumbleUserId],
    );
    res.json({ ok: true, linked: true, rumbleUsername: link.rumbleUsername, calls: result.rows });
  } catch (error) {
    console.error("[rumble_call_self] list failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

rumbleCallSelfRouter.post("/link-code", async (req: any, res) => {
  try {
    const uid = Number(req.user?.id || 0), sid = await streamerId();
    if (!uid || !sid) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const code = String(randomInt(10_000_000, 100_000_000));
    await pool.query(`DELETE FROM rumble_call_link_codes WHERE user_id=$1`, [uid]);
    await pool.query(
      `INSERT INTO rumble_call_link_codes(code_hash,user_id,streamer_id,expires_at)
       VALUES ($1,$2,$3,NOW()+INTERVAL '10 minutes')`,
      [hash(code), uid, sid],
    );
    res.set("Cache-Control", "no-store").json({ ok: true, code, expiresInSeconds: 600, command: `!lier ${code}` });
  } catch (error) {
    console.error("[rumble_call_self] code creation failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

rumbleCallSelfRouter.delete("/link", async (req: any, res) => {
  try {
    await pool.query(`DELETE FROM rumble_call_links WHERE user_id=$1`, [Number(req.user?.id || 0)]);
    await pool.query(`DELETE FROM rumble_call_link_codes WHERE user_id=$1`, [Number(req.user?.id || 0)]);
    res.json({ ok: true });
  } catch (error) {
    console.error("[rumble_call_self] unlink failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

rumbleCallSelfRouter.patch("/queue/:id", async (req: any, res) => {
  try {
    const uid = Number(req.user?.id || 0), sid = await streamerId();
    const link = await linkFor(uid, sid);
    if (!link) return res.status(403).json({ ok: false, error: "rumble_not_linked" });
    const slotName = String(req.body?.slotName || "").trim();
    if (!slotName || slotName.length > 180) return res.status(400).json({ ok: false, error: "bad_slot" });
    const slot = await resolveSlot(pool, slotName);
    if (!slot || keyText(slot.name) !== keyText(slotName)) return res.status(404).json({ ok: false, error: "slot_not_found" });
    const result = await pool.query(
      `UPDATE calls_queue q SET slot_name=$4, slot_key=$5, provider=$6
        WHERE q.id=$1 AND q.streamer_id=$2 AND q.rumble_user_id=$3
          AND q.bet IS NULL AND q.pay IS NULL AND COALESCE(q.is_bonus,FALSE)=FALSE
          AND NOT EXISTS (SELECT 1 FROM calls_queue x WHERE x.streamer_id=q.streamer_id AND x.slot_key=$5 AND x.id<>q.id)
        RETURNING q.id::text AS id, q.slot_name AS "slotName", q.provider, q.pos::int AS pos`,
      [String(req.params.id), sid, link.rumbleUserId, slot.name, keyText(slot.name), slot.provider],
    );
    if (!result.rows[0]) return res.status(409).json({ ok: false, error: "call_not_pending_or_duplicate" });
    res.json({ ok: true, call: result.rows[0] });
  } catch (error) {
    console.error("[rumble_call_self] update failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

rumbleCallSelfRouter.delete("/queue/:id", async (req: any, res) => {
  try {
    const uid = Number(req.user?.id || 0), sid = await streamerId();
    const link = await linkFor(uid, sid);
    if (!link) return res.status(403).json({ ok: false, error: "rumble_not_linked" });
    const result = await pool.query(
      `DELETE FROM calls_queue WHERE id=$1 AND streamer_id=$2 AND rumble_user_id=$3
        AND bet IS NULL AND pay IS NULL AND COALESCE(is_bonus,FALSE)=FALSE RETURNING id`,
      [String(req.params.id), sid, link.rumbleUserId],
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "call_not_pending" });
    await pool.query(`WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY pos,id) AS p FROM calls_queue WHERE streamer_id=$1) UPDATE calls_queue q SET pos=ranked.p FROM ranked WHERE q.id=ranked.id`, [sid]);
    res.json({ ok: true });
  } catch (error) {
    console.error("[rumble_call_self] delete failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ ok: false, error: "server_error" });
  }
});
