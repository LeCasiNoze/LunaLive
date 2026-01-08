import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

type AuthedReq = any;

type StreamerRow = { id: number; ownerUserId: number };

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_hunt_sessions (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      mode        TEXT NOT NULL DEFAULT 'farm',   -- 'farm' | 'open'
      opened      BOOLEAN NOT NULL DEFAULT FALSE,
      start       NUMERIC NULL,
      archive_id  BIGINT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getStreamerBySlug(slug: string): Promise<StreamerRow | null> {
  const r = await pool.query(
    `SELECT id, user_id AS "ownerUserId" FROM streamers WHERE slug=$1 LIMIT 1`,
    [slug]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return { id: Number(row.id), ownerUserId: Number(row.ownerUserId) };
}

// Autorise: owner / admin / mod (si table existe)
async function canControlStreamer(streamerId: number, ownerUserId: number, actor: any): Promise<boolean> {
  const actorUserId = Number(actor?.id || 0);
  if (!actorUserId) return false;

  if (actor?.role === "admin") return true;
  if (actorUserId === ownerUserId) return true;

  // mods: table streamer_moderators (si elle existe)
  try {
    const r = await pool.query(
      `SELECT 1 FROM streamer_moderators WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
      [streamerId, actorUserId]
    );
    if ((r.rowCount ?? 0) > 0) return true;
  } catch {
    // si la table n'existe pas, on ne crash pas
  }

  return false;
}

async function ensureSession(streamerId: number) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO calls_hunt_sessions(streamer_id) VALUES($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

async function getSession(streamerId: number) {
  await ensureSession(streamerId);
  const r = await pool.query(
    `SELECT mode, opened, start, archive_id FROM calls_hunt_sessions WHERE streamer_id=$1`,
    [streamerId]
  );
  const row = r.rows?.[0] || {};
  const mode = (row.mode === "open" ? "open" : "farm") as "farm" | "open";
  const opened = !!row.opened;
  const start = row.start === null || typeof row.start === "undefined" ? null : Number(row.start);
  const archive_id = row.archive_id ? Number(row.archive_id) : null;
  return { mode, opened, start: Number.isFinite(start as any) ? start : null, archive_id };
}

async function setSession(
  streamerId: number,
  patch: Partial<{ mode: "farm" | "open"; opened: boolean; start: number | null; archive_id: number | null }>
) {
  await ensureSession(streamerId);
  const cur = await getSession(streamerId);

  const nextMode = patch.mode ?? cur.mode;
  const nextOpened = typeof patch.opened === "boolean" ? patch.opened : cur.opened;
  const nextStart = typeof patch.start !== "undefined" ? patch.start : cur.start;
  const nextArchiveId = typeof patch.archive_id !== "undefined" ? patch.archive_id : cur.archive_id;

  await pool.query(
    `UPDATE calls_hunt_sessions
     SET mode=$2, opened=$3, start=$4, archive_id=$5, updated_at=NOW()
     WHERE streamer_id=$1`,
    [streamerId, nextMode, nextOpened, nextStart, nextArchiveId]
  );
}

async function loadQueue(streamerId: number) {
  const r = await pool.query(
    `
    SELECT
      q.id::text        AS id,
      q.slot_name       AS "slotName",
      q.slot_key        AS "slotKey",
      q.provider        AS provider,
      q.username        AS username,
      q.pos             AS pos,
      q.bet             AS bet,
      q.pay             AS pay,
      sc.image_url      AS "imageUrl"
    FROM calls_queue q
    LEFT JOIN slots_catalog sc
      ON sc.name_key = q.slot_key
    WHERE q.streamer_id=$1
    ORDER BY q.pos ASC
    LIMIT 500
    `,
    [streamerId]
  );

  return (r.rows || []).map((x: any) => ({
    id: String(x.id),
    slotName: String(x.slotName),
    slotKey: String(x.slotKey),
    provider: x.provider ?? null,
    username: x.username ?? null,
    pos: Number(x.pos) || 0,
    bet: x.bet === null || typeof x.bet === "undefined" ? null : Number(x.bet),
    pay: x.pay === null || typeof x.pay === "undefined" ? null : Number(x.pay),
    imageUrl: x.imageUrl ?? null,
  }));
}

export const callsHuntRouter = express.Router();
callsHuntRouter.use(requireAuth);

/**
 * GET /calls/:slug/hunt/state
 */
callsHuntRouter.get("/:slug/hunt/state", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const session = await getSession(streamer.id);
    const items = await loadQueue(streamer.id);

    // “machine en cours” = première machine SANS bet (farm)
    const curCall = items.find((x) => !(Number(x.bet) > 0)) || null;

    // “open item” = première machine SANS pay mais AVEC bet (open)
    const curOpen = items.find((x) => Number(x.bet) > 0 && !(Number(x.pay) >= 0)) || null;

    return res.json({
      ok: true,
      mode: session.mode,
      hunt: {
        phase: session.mode,
        opened: session.opened,
        start: session.start,
        archive_id: session.archive_id,
        itemsCount: items.length,
      },
      currentCall: curCall
        ? {
            id: curCall.id,
            slotName: curCall.slotName,
            slotKey: curCall.slotKey,
            provider: curCall.provider,
            username: curCall.username ?? "streamer",
            pos: curCall.pos,
            imageUrl: curCall.imageUrl,
          }
        : null,
      currentOpenItem:
        session.mode === "open" && curOpen
          ? {
              id: curOpen.id,
              name: curOpen.slotName,
              provider: curOpen.provider,
              image_url: curOpen.imageUrl,
              bet: curOpen.bet,
              caller: curOpen.username ?? null,
              pos: curOpen.pos,
            }
          : null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/open
 * Ouvre la session (ne change pas le mode).
 */
callsHuntRouter.post("/:slug/hunt/open", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const cur = await getSession(streamer.id);
    await setSession(streamer.id, {
      opened: true,
      start: cur.start ?? Date.now(),
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/pass
 * Supprime la “machine en cours” (première sans bet).
 */
callsHuntRouter.post("/:slug/hunt/pass", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const items = await loadQueue(streamer.id);
    const curCall = items.find((x) => !(Number(x.bet) > 0)) || null;
    if (!curCall) return res.json({ ok: true });

    await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1 AND id=$2`, [streamer.id, curCall.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/bonus { bet }
 * Set bet sur la “machine en cours” (première sans bet).
 */
callsHuntRouter.post("/:slug/hunt/bonus", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const bet = Number(req.body?.bet);
    if (!(bet > 0)) return res.status(400).json({ ok: false, error: "bad_bet" });

    const items = await loadQueue(streamer.id);
    const curCall = items.find((x) => !(Number(x.bet) > 0)) || null;
    if (!curCall) return res.json({ ok: true });

    await pool.query(
      `UPDATE calls_queue SET bet=$3 WHERE streamer_id=$1 AND id=$2`,
      [streamer.id, curCall.id, bet]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/pay { pay }
 * Set pay sur la première machine avec bet mais sans pay.
 */
callsHuntRouter.post("/:slug/hunt/pay", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const pay = Number(req.body?.pay);
    if (!(pay >= 0)) return res.status(400).json({ ok: false, error: "bad_pay" });

    const items = await loadQueue(streamer.id);
    const curOpen = items.find((x) => Number(x.bet) > 0 && !(Number(x.pay) >= 0)) || null;
    if (!curOpen) return res.json({ ok: true });

    await pool.query(
      `UPDATE calls_queue SET pay=$3 WHERE streamer_id=$1 AND id=$2`,
      [streamer.id, curOpen.id, pay]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
