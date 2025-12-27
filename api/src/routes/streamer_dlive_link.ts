// api/src/routes/streamer_dlive_link.ts
import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js"; // <-- ADAPTE le path (là où tu as collé ton code)
import { fetchDliveLiveInfo } from "../dlive.js";
import { waitForDliveChatCode } from "../dlive_ws.js"; // si tu fais la vérif websocket

export const streamerDliveLinkRouter = Router();

type AuthedReq = any;

async function requireStreamer(req: AuthedReq, res: any, next: any) {
  // Chez toi: req.user vient de requireAuth (JWT)
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  // ✅ Hypothèse: streamers.user_id existe
  const r = await pool.query(`SELECT id FROM streamers WHERE user_id=$1`, [userId]);
  const streamerId = r.rows?.[0]?.id;
  if (!streamerId) return res.status(403).json({ ok: false, error: "not_streamer" });

  req.streamerId = Number(streamerId);
  next();
}

function parseDliveDisplayname(input: string): string {
  const s = String(input || "").trim();
  const m = s.match(/dlive\.tv\/([^/?#]+)/i);
  const dn = (m ? m[1] : s).replace(/^@/, "").trim();
  return dn;
}

function isNonEmpty(s: any) {
  return typeof s === "string" && s.trim().length > 0;
}

// GET /streamer/me/dlive-link
streamerDliveLinkRouter.get("/", requireAuth, requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = req.streamerId as number;

  const s = await pool.query(
    `SELECT
        dlive_use_linked AS "useLinked",
        dlive_link_displayname AS "linkedDisplayname",
        dlive_link_username AS "linkedUsername",
        dlive_linked_at AS "linkedAt"
     FROM streamers
     WHERE id=$1`,
    [streamerId]
  );

  const pending = await pool.query(
    `SELECT
        id,
        requested_displayname AS "requestedDisplayname",
        requested_username AS "requestedUsername",
        code,
        created_at AS "createdAt",
        expires_at AS "expiresAt"
     FROM streamer_dlive_link_requests
     WHERE streamer_id=$1 AND status='pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [streamerId]
  );

  res.json({
    ok: true,
    ...(s.rows[0] || {
      useLinked: false,
      linkedDisplayname: null,
      linkedUsername: null,
      linkedAt: null,
    }),
    pending: pending.rows[0] ?? null,
  });
});

// POST /streamer/me/dlive-link/request  { channel: "LeCasinoze" | "https://dlive.tv/LeCasinoze" }
streamerDliveLinkRouter.post("/request", requireAuth, requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = req.streamerId as number;

  const channel = String(req.body?.channel ?? "").trim();
  if (!isNonEmpty(channel)) return res.status(400).json({ ok: false, error: "bad_request" });

  const displayname = parseDliveDisplayname(channel);
  if (!isNonEmpty(displayname)) return res.status(400).json({ ok: false, error: "bad_request" });

  // resolve username (immutable) via GraphQL
  const info = await fetchDliveLiveInfo(displayname);
  if (!info.username) return res.status(400).json({ ok: false, error: "dlive_channel_not_found" });

  // expire older pending
  await pool.query(
    `UPDATE streamer_dlive_link_requests
     SET status='expired'
     WHERE streamer_id=$1 AND status='pending'`,
    [streamerId]
  );

  const code = `LL-${randomBytes(4).toString("hex").toUpperCase()}`; // LL-3FA2B9C1
  const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 min

  const ins = await pool.query(
    `INSERT INTO streamer_dlive_link_requests
      (streamer_id, requested_displayname, requested_username, code, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, created_at AS "createdAt", expires_at AS "expiresAt"`,
    [streamerId, displayname, info.username, code, expiresAt.toISOString()]
  );

  res.json({
    ok: true,
    request: ins.rows[0],
    code,
    requestedDisplayname: displayname,
    requestedUsername: info.username,
    expiresAt: expiresAt.toISOString(),
  });
});

// POST /streamer/me/dlive-link/verify
streamerDliveLinkRouter.post("/verify", requireAuth, requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = req.streamerId as number;

  const r = await pool.query(
    `SELECT
        id,
        requested_displayname AS "requestedDisplayname",
        requested_username AS "requestedUsername",
        code,
        expires_at AS "expiresAt"
     FROM streamer_dlive_link_requests
     WHERE streamer_id=$1 AND status='pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [streamerId]
  );

  const row = r.rows?.[0];
  if (!row) return res.status(400).json({ ok: false, error: "no_pending_request" });

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await pool.query(`UPDATE streamer_dlive_link_requests SET status='expired' WHERE id=$1`, [row.id]);
    return res.status(400).json({ ok: false, error: "request_expired" });
  }

  // ✅ vérif websocket (chat)
  const wait = await waitForDliveChatCode({
    streamerUsername: row.requestedUsername,          // username DLive (immutable)
    expectedSenderDisplayname: row.requestedDisplayname, // doit matcher le nom de chaîne
    code: row.code,
    timeoutMs: 25_000,
  });

  if (!wait.ok) return res.status(400).json({ ok: false, error: wait.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE streamer_dlive_link_requests
       SET status='verified', verified_at=NOW()
       WHERE id=$1`,
      [row.id]
    );

    await client.query(
      `UPDATE streamers
       SET dlive_link_displayname=$2,
           dlive_link_username=$3,
           dlive_linked_at=NOW(),
           dlive_use_linked=TRUE
       WHERE id=$1`,
      [streamerId, row.requestedDisplayname, row.requestedUsername]
    );

    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }

  res.json({ ok: true });
});

// POST /streamer/me/dlive-link/toggle { useLinked: boolean }
streamerDliveLinkRouter.post("/toggle", requireAuth, requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = req.streamerId as number;
  const useLinked = !!req.body?.useLinked;

  if (useLinked) {
    const s = await pool.query(
      `SELECT dlive_link_displayname AS d FROM streamers WHERE id=$1`,
      [streamerId]
    );
    if (!s.rows?.[0]?.d) return res.status(400).json({ ok: false, error: "no_linked_channel" });
  }

  await pool.query(`UPDATE streamers SET dlive_use_linked=$2 WHERE id=$1`, [streamerId, useLinked]);
  res.json({ ok: true });
});

// POST /streamer/me/dlive-link/unlink
streamerDliveLinkRouter.post("/unlink", requireAuth, requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = req.streamerId as number;

  await pool.query(
    `UPDATE streamers
     SET dlive_use_linked=FALSE,
         dlive_link_displayname=NULL,
         dlive_link_username=NULL,
         dlive_linked_at=NULL
     WHERE id=$1`,
    [streamerId]
  );

  await pool.query(
    `UPDATE streamer_dlive_link_requests
     SET status='expired'
     WHERE streamer_id=$1 AND status='pending'`,
    [streamerId]
  );

  res.json({ ok: true });
});
