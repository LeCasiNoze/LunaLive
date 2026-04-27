// api/src/routes/calls_hunt.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

type AuthedReq = any;

type StreamerRow = { id: number; ownerUserId: number };

async function ensureSchema() {
  // table session
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_hunt_sessions (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      mode        TEXT NOT NULL DEFAULT 'farm',   -- 'farm' | 'open'
      opened      BOOLEAN NOT NULL DEFAULT FALSE,
      start       NUMERIC NULL,                   -- start € (pas une date)
      bet_default NUMERIC NULL,                   -- bet par défaut (utilisée par /bonus)
      archive_id  BIGINT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // compat si table existait avant bet_default
  await pool.query(`
    ALTER TABLE calls_hunt_sessions
    ADD COLUMN IF NOT EXISTS bet_default NUMERIC NULL;
  `);
}

async function ensureCallsQueueIsBonusCol() {
  await pool.query(`
    ALTER TABLE calls_queue
    ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN NOT NULL DEFAULT FALSE;
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
async function canControlStreamer(
  streamerId: number,
  ownerUserId: number,
  actor: any
): Promise<boolean> {
  const actorUserId = Number(actor?.id || 0);
  if (!actorUserId) return false;

  if (actor?.role === "admin") return true;
  if (actorUserId === ownerUserId) return true;

  try {
    const r = await pool.query(
      `SELECT 1 FROM streamer_mods
        WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL
        LIMIT 1`,
      [streamerId, actorUserId]
    );
    if ((r.rowCount ?? 0) > 0) return true;
  } catch (e) {
    console.error("[calls_hunt canMod] streamer_mods lookup failed:", e);
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
    `SELECT mode, opened, start, bet_default, archive_id FROM calls_hunt_sessions WHERE streamer_id=$1`,
    [streamerId]
  );
  const row = r.rows?.[0] || {};

  const mode = (row.mode === "open" ? "open" : "farm") as "farm" | "open";
  const opened = !!row.opened;

  const start =
    row.start === null || typeof row.start === "undefined" ? null : Number(row.start);
  const betDefault =
    row.bet_default === null || typeof row.bet_default === "undefined"
      ? null
      : Number(row.bet_default);

  const archive_id = row.archive_id ? Number(row.archive_id) : null;

  return {
    mode,
    opened,
    start: Number.isFinite(start as any) ? start : null,
    betDefault: Number.isFinite(betDefault as any) ? betDefault : null,
    archive_id,
  };
}

async function setSession(
  streamerId: number,
  patch: Partial<{
    mode: "farm" | "open";
    opened: boolean;
    start: number | null;
    betDefault: number | null;
    archive_id: number | null;
  }>
) {
  await ensureSession(streamerId);
  const cur = await getSession(streamerId);

  const nextMode = patch.mode ?? cur.mode;
  const nextOpened = typeof patch.opened === "boolean" ? patch.opened : cur.opened;
  const nextStart = typeof patch.start !== "undefined" ? patch.start : cur.start;
  const nextBetDefault =
    typeof patch.betDefault !== "undefined" ? patch.betDefault : cur.betDefault;
  const nextArchiveId =
    typeof patch.archive_id !== "undefined" ? patch.archive_id : cur.archive_id;

  await pool.query(
    `UPDATE calls_hunt_sessions
     SET mode=$2, opened=$3, start=$4, bet_default=$5, archive_id=$6, updated_at=NOW()
     WHERE streamer_id=$1`,
    [streamerId, nextMode, nextOpened, nextStart, nextBetDefault, nextArchiveId]
  );
}

async function loadQueue(streamerId: number) {
  await ensureCallsQueueIsBonusCol();

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
      q.is_bonus        AS "isBonus",
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
    betEur: x.bet === null || typeof x.bet === "undefined" ? null : Number(x.bet),
    payEur: x.pay === null || typeof x.pay === "undefined" ? null : Number(x.pay),
    imageUrl: x.imageUrl ?? null,
    isBonus: !!x.isBonus,
  }));
}

// ✅ helpers anti-bug Number(null)=0
function isBonus(it: any) {
  if (it?.isBonus === true) return true;
  const b = it?.betEur;
  return typeof b === "number" && Number.isFinite(b) && b > 0;
}

function isUnpaid(it: any) {
  const p = it?.payEur;
  return p === null || typeof p === "undefined";
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

    const canModerate = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);

    const session = await getSession(streamer.id);
    const items = await loadQueue(streamer.id);

    const farmCalls = items.filter((x) => !isBonus(x));
    const bonusDrops = items.filter((x) => isBonus(x));

    const curCall = farmCalls[0] || null;
    const curOpen = bonusDrops.find((x) => isUnpaid(x)) || null;

    const opening = session.mode === "open" || session.opened === true;

    return res.json({
      ok: true,
      canModerate,

      mode: session.mode,
      opening,

      startEur: session.start,
      betEur: session.betDefault,

      callsCount: farmCalls.length,
      bonusCount: bonusDrops.length,

      queue: items,

      bonusDrops: bonusDrops.map((x) => ({
        id: x.id,
        slotName: x.slotName,
        provider: x.provider,
        username: x.username,
        imageUrl: x.imageUrl,
        betEur: x.betEur,
        payEur: x.payEur,
        pos: x.pos,
      })),

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

      currentOpenItem: curOpen
        ? {
            id: curOpen.id,
            name: curOpen.slotName,
            image_url: curOpen.imageUrl,

            slotName: curOpen.slotName,
            imageUrl: curOpen.imageUrl,
            provider: curOpen.provider,
            bet: curOpen.betEur,
            betEur: curOpen.betEur,
            pay: curOpen.payEur,
            payEur: curOpen.payEur,
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
 * POST /calls/:slug/hunt/close
 * Force fermeture => farm
 */
callsHuntRouter.post("/:slug/hunt/close", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    await setSession(streamer.id, { opened: false, mode: "farm" });
    return res.json({ ok: true, opening: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/revert
 * Alias "revenir en édition" => farm
 */
callsHuntRouter.post("/:slug/hunt/revert", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    await setSession(streamer.id, { opened: false, mode: "farm" });
    return res.json({ ok: true, opening: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/open
 * ✅ toggle: si déjà open -> repasse farm
 */
callsHuntRouter.post("/:slug/hunt/open", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const cur = await getSession(streamer.id);
    const currentlyOpen = cur.mode === "open" || cur.opened === true;

    if (currentlyOpen) {
      await setSession(streamer.id, { opened: false, mode: "farm" });
      return res.json({ ok: true, opening: false });
    } else {
      await setSession(streamer.id, { opened: true, mode: "open" });
      return res.json({ ok: true, opening: true });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/start  { startEur }
 */
callsHuntRouter.post("/:slug/hunt/start", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const startEur = Number(req.body?.startEur);
    if (!Number.isFinite(startEur) || startEur <= 0) {
      return res.status(400).json({ ok: false, error: "bad_start" });
    }

    await setSession(streamer.id, { start: startEur });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/bet { betEur }
 * Stocke la bet par défaut utilisée par /hunt/bonus
 */
callsHuntRouter.post("/:slug/hunt/bet", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const betEur = Number(req.body?.betEur);
    if (!Number.isFinite(betEur) || betEur <= 0) {
      return res.status(400).json({ ok: false, error: "bad_bet" });
    }

    await setSession(streamer.id, { betDefault: betEur });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/pass
 * ✅ Doit SUPPRIMER la machine en cours (première non-bonus).
 * Version atomique: lock + select current + delete + renum pos
 */
callsHuntRouter.post("/:slug/hunt/pass", async (req: AuthedReq, res) => {
  const slug = String(req.params.slug || "");

  try {
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    await ensureCallsQueueIsBonusCol();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 🔒 lock par streamer (évite les courses avec add/reorder/etc.)
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [Number(streamer.id)]);

      // snapshot avant
      const before = await client.query(
        `
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN COALESCE(is_bonus,FALSE)=FALSE AND (bet IS NULL OR bet <= 0) THEN 1 ELSE 0 END)::int AS farm
        FROM calls_queue
        WHERE streamer_id=$1
        `,
        [streamer.id]
      );

      // 🎯 current = 1er call FARM (non-bonus, bet null/<=0), par pos
      const cur = await client.query(
        `
        SELECT id::text AS id
        FROM calls_queue
        WHERE streamer_id=$1
          AND COALESCE(is_bonus,FALSE)=FALSE
          AND (bet IS NULL OR bet <= 0)
        ORDER BY pos ASC, id ASC
        LIMIT 1
        FOR UPDATE
        `,
        [streamer.id]
      );

      const curId = cur.rows?.[0]?.id ? String(cur.rows[0].id) : null;
      if (!curId) {
        await client.query("COMMIT");
        return res.json({
          ok: true,
          removed: false,
          removedId: null,
          snapshot: { before: before.rows?.[0] ?? null, after: before.rows?.[0] ?? null },
        });
      }

      // 🗑️ delete exact du current
      const del = await client.query(
        `
        DELETE FROM calls_queue
        WHERE streamer_id=$1 AND id::text=$2
        RETURNING id::text AS id
        `,
        [streamer.id, curId]
      );

      const removedId = del.rows?.[0]?.id ? String(del.rows[0].id) : null;

      // 🔢 renumérote les pos (évite états bizarres / current qui “revient”)
      await client.query(
        `
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY pos ASC, id ASC) AS rn
          FROM calls_queue
          WHERE streamer_id=$1
        )
        UPDATE calls_queue q
        SET pos = ordered.rn
        FROM ordered
        WHERE q.streamer_id=$1 AND q.id = ordered.id
        `,
        [streamer.id]
      );

      // snapshot après
      const after = await client.query(
        `
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN COALESCE(is_bonus,FALSE)=FALSE AND (bet IS NULL OR bet <= 0) THEN 1 ELSE 0 END)::int AS farm
        FROM calls_queue
        WHERE streamer_id=$1
        `,
        [streamer.id]
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        removed: !!removedId,
        removedId,
        snapshot: { before: before.rows?.[0] ?? null, after: after.rows?.[0] ?? null },
      });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});


/**
 * POST /calls/:slug/hunt/bonus
 * Convertit la machine en cours -> bonus drop en lui assignant bet_default
 */
callsHuntRouter.post("/:slug/hunt/bonus", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const session = await getSession(streamer.id);
    const bet = Number(session.betDefault ?? 0);
    if (!(bet > 0)) return res.status(400).json({ ok: false, error: "no_bet_set" });

    const items = await loadQueue(streamer.id);
    const curCall = items.find((x) => !isBonus(x)) || null;
    if (!curCall) return res.json({ ok: true });

    await ensureCallsQueueIsBonusCol();

    await pool.query(
      `UPDATE calls_queue
       SET bet=$3, is_bonus=TRUE
       WHERE streamer_id=$1 AND id=$2`,
      [streamer.id, curCall.id, bet]
    );

    return res.json({ ok: true, bonusId: curCall.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * PATCH /calls/:slug/hunt/bonus/:id  { betEur }
 * ✅ modifier la bet d'un bonus drop
 */
callsHuntRouter.patch("/:slug/hunt/bonus/:id", express.json(), async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const id = String(req.params.id || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const betEur = Number(req.body?.betEur);
    if (!Number.isFinite(betEur) || betEur <= 0) {
      return res.status(400).json({ ok: false, error: "bad_bet" });
    }

    await ensureCallsQueueIsBonusCol();

    const r = await pool.query(
      `
      UPDATE calls_queue
      SET bet=$3, is_bonus=TRUE
WHERE streamer_id=$1
  AND id=$2
  AND (COALESCE(is_bonus,FALSE)=TRUE OR (bet IS NOT NULL AND bet > 0))
      RETURNING id::text AS id
      `,
      [streamer.id, id, betEur]
    );

    if ((r.rowCount ?? 0) === 0) {
      return res.status(404).json({ ok: false, error: "bonus_not_found" });
    }

    return res.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * DELETE /calls/:slug/hunt/bonus/:id
 * ✅ supprimer un bonus drop
 */
callsHuntRouter.delete("/:slug/hunt/bonus/:id", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const id = String(req.params.id || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    await ensureCallsQueueIsBonusCol();

    const r = await pool.query(
      `DELETE FROM calls_queue
        WHERE streamer_id=$1
          AND id=$2
          AND (COALESCE(is_bonus,FALSE)=TRUE OR (bet IS NOT NULL AND bet > 0))
        `,
      [streamer.id, id]
    );

    return res.json({ ok: true, deleted: (r.rowCount ?? 0) > 0, id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/pay { payEur }
 */
callsHuntRouter.post("/:slug/hunt/pay", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    const payEur = Number(req.body?.payEur);
    if (!Number.isFinite(payEur) || payEur < 0) {
      return res.status(400).json({ ok: false, error: "bad_pay" });
    }

    const items = await loadQueue(streamer.id);

    const unpaidBonus = items.filter((x) => isBonus(x) && isUnpaid(x));
    const curOpen = unpaidBonus[0] || null;

    if (!curOpen) {
      return res.json({
        ok: true,
        paid: false,
        reason: "no_unpaid_bonus",
        payEur,
        unpaidBonusIds: unpaidBonus.map((x) => x.id),
        snapshot: {
          total: items.length,
          farmCount: items.filter((x) => !isBonus(x)).length,
          bonusCount: items.filter((x) => isBonus(x)).length,
        },
      });
    }

    await pool.query(`UPDATE calls_queue SET pay=$3 WHERE streamer_id=$1 AND id=$2`, [
      streamer.id,
      curOpen.id,
      payEur,
    ]);

    return res.json({
      ok: true,
      paid: true,
      paidId: curOpen.id,
      payEur,
      was: {
        payEur: curOpen.payEur ?? null,
      },
      unpaidBonusIds: unpaidBonus.map((x) => x.id),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /calls/:slug/hunt/reset
 * Reset total: enlève start, repasse farm, ferme, vide la queue.
 */
callsHuntRouter.post("/:slug/hunt/reset", async (req: AuthedReq, res) => {
  try {
    const slug = String(req.params.slug || "");
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const okCtl = await canControlStreamer(streamer.id, streamer.ownerUserId, req.user);
    if (!okCtl) return res.status(403).json({ ok: false, error: "forbidden" });

    await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [streamer.id]);

    await setSession(streamer.id, {
      mode: "farm",
      opened: false,
      start: null,
      betDefault: null,
      archive_id: null,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
