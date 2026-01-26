// api/src/routes/streamer_dlive_link.ts
import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { fetchDliveLiveInfo } from "../dlive.js";
import { waitForDliveChatCode } from "../dlive_ws.js";

export const streamerDliveLinkRouter = Router();
type AuthedReq = any;

function parseDliveDisplayname(input: string): string {
  const s = String(input || "").trim();
  const m = s.match(/dlive\.tv\/([^/?#]+)/i);
  const dn = (m ? m[1] : s).replace(/^@/, "").trim();
  return dn;
}

function isNonEmpty(s: any) {
  return typeof s === "string" && s.trim().length > 0;
}

async function getStreamerIdByUserId(userId: number): Promise<number | null> {
  const r = await pool.query(`SELECT id FROM streamers WHERE user_id=$1`, [userId]);
  const sid = r.rows?.[0]?.id;
  return sid ? Number(sid) : null;
}

async function maybeSyncUsersLinkToStreamer(userId: number, streamerId: number) {
  // Si le streamer n'a pas encore la link mais que users l'a, on copie (one-time sync)
  const s = await pool.query(
    `SELECT dlive_link_username AS u, dlive_link_displayname AS d, dlive_use_linked AS use
     FROM users WHERE id=$1`,
    [userId]
  );
  const u = s.rows?.[0];
  if (!u?.u && !u?.d) return;

  const t = await pool.query(
    `SELECT dlive_link_username AS u, dlive_link_displayname AS d
     FROM streamers WHERE id=$1`,
    [streamerId]
  );
  const st = t.rows?.[0];
  const streamerHas = !!String(st?.u || st?.d || "").trim();
  if (streamerHas) return;

  await pool.query(
    `UPDATE streamers
     SET dlive_link_displayname=$2,
         dlive_link_username=$3,
         dlive_linked_at=COALESCE(dlive_linked_at, NOW()),
         dlive_use_linked=$4
     WHERE id=$1`,
    [streamerId, u.d ?? null, u.u ?? null, !!u.use]
  );
}

// GET /streamer/me/dlive-link
streamerDliveLinkRouter.get("/", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamerId = await getStreamerIdByUserId(userId);
  if (streamerId) {
    // Sync si l'utilisateur avait déjà link avant d'être streamer
    await maybeSyncUsersLinkToStreamer(userId, streamerId);

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
       WHERE user_id=$1 AND status='pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return res.json({
      ok: true,
      ...(s.rows[0] || {
        useLinked: false,
        linkedDisplayname: null,
        linkedUsername: null,
        linkedAt: null,
      }),
      pending: pending.rows[0] ?? null,
    });
  }

  // ✅ Non-streamer: on lit depuis users + pending via user_id
  const u = await pool.query(
    `SELECT
        dlive_use_linked AS "useLinked",
        dlive_link_displayname AS "linkedDisplayname",
        dlive_link_username AS "linkedUsername",
        dlive_linked_at AS "linkedAt"
     FROM users
     WHERE id=$1`,
    [userId]
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
     WHERE user_id=$1 AND status='pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  return res.json({
    ok: true,
    ...(u.rows[0] || {
      useLinked: false,
      linkedDisplayname: null,
      linkedUsername: null,
      linkedAt: null,
    }),
    pending: pending.rows[0] ?? null,
  });
});

// POST /streamer/me/dlive-link/request  { channel }
streamerDliveLinkRouter.post("/request", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const channel = String(req.body?.channel ?? "").trim();
  if (!isNonEmpty(channel)) return res.status(400).json({ ok: false, error: "bad_request" });

  const displayname = parseDliveDisplayname(channel);
  if (!isNonEmpty(displayname)) return res.status(400).json({ ok: false, error: "bad_request" });

  const info = await fetchDliveLiveInfo(displayname);
  if (!info.username) return res.status(400).json({ ok: false, error: "dlive_channel_not_found" });

  const streamerId = await getStreamerIdByUserId(userId);

  await pool.query(
    `UPDATE streamer_dlive_link_requests
     SET status='expired'
     WHERE user_id=$1 AND status='pending'`,
    [userId]
  );

  const code = `LL-${randomBytes(4).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  const ins = await pool.query(
    `INSERT INTO streamer_dlive_link_requests
      (streamer_id, user_id, requested_displayname, requested_username, code, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, created_at AS "createdAt", expires_at AS "expiresAt"`,
    [streamerId, userId, displayname, info.username, code, expiresAt.toISOString()]
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
streamerDliveLinkRouter.post("/verify", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamerId = await getStreamerIdByUserId(userId);

  const r = await pool.query(
    `SELECT
        id,
        requested_displayname AS "requestedDisplayname",
        requested_username AS "requestedUsername",
        code,
        expires_at AS "expiresAt"
     FROM streamer_dlive_link_requests
     WHERE user_id=$1 AND status='pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  const row = r.rows?.[0];
  if (!row) return res.status(400).json({ ok: false, error: "no_pending_request" });

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await pool.query(`UPDATE streamer_dlive_link_requests SET status='expired' WHERE id=$1`, [row.id]);
    return res.status(400).json({ ok: false, error: "request_expired" });
  }

  if (!row.requestedUsername) {
    return res.status(400).json({ ok: false, error: "missing_requested_username" });
  }

  const wait = await waitForDliveChatCode({
    streamerUsername: row.requestedUsername,
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

    // ✅ Toujours stocker côté users (pré-streamer friendly)
    await client.query(
      `UPDATE users
       SET dlive_link_displayname=$2,
           dlive_link_username=$3,
           dlive_linked_at=NOW(),
           dlive_use_linked=TRUE
       WHERE id=$1`,
      [userId, row.requestedDisplayname, row.requestedUsername]
    );

    // ✅ Si streamer existe déjà: on mirror aussi
    if (streamerId) {
      await client.query(
        `UPDATE streamers
         SET dlive_link_displayname=$2,
             dlive_link_username=$3,
             dlive_linked_at=NOW(),
             dlive_use_linked=TRUE
         WHERE id=$1`,
        [streamerId, row.requestedDisplayname, row.requestedUsername]
      );
    }

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
streamerDliveLinkRouter.post("/toggle", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const useLinked = !!req.body?.useLinked;
  const streamerId = await getStreamerIdByUserId(userId);

  if (useLinked) {
    const u = await pool.query(
      `SELECT dlive_link_displayname AS d, dlive_link_username AS u FROM users WHERE id=$1`,
      [userId]
    );
    const ok = !!String(u.rows?.[0]?.u || u.rows?.[0]?.d || "").trim();
    if (!ok) return res.status(400).json({ ok: false, error: "no_linked_channel" });
  }

  await pool.query(`UPDATE users SET dlive_use_linked=$2 WHERE id=$1`, [userId, useLinked]);
  if (streamerId) {
    await pool.query(`UPDATE streamers SET dlive_use_linked=$2 WHERE id=$1`, [streamerId, useLinked]);
  }

  res.json({ ok: true });
});

// POST /streamer/me/dlive-link/unlink
streamerDliveLinkRouter.post("/unlink", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamerId = await getStreamerIdByUserId(userId);

  await pool.query(
    `UPDATE users
     SET dlive_use_linked=FALSE,
         dlive_link_displayname=NULL,
         dlive_link_username=NULL,
         dlive_linked_at=NULL
     WHERE id=$1`,
    [userId]
  );

  if (streamerId) {
    await pool.query(
      `UPDATE streamers
       SET dlive_use_linked=FALSE,
           dlive_link_displayname=NULL,
           dlive_link_username=NULL,
           dlive_linked_at=NULL
       WHERE id=$1`,
      [streamerId]
    );
  }

  await pool.query(
    `UPDATE streamer_dlive_link_requests
     SET status='expired'
     WHERE user_id=$1 AND status='pending'`,
    [userId]
  );

  res.json({ ok: true });
});
