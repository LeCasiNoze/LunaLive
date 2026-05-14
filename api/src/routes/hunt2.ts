// api/src/routes/hunt2.ts
import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { searchSlots as searchSlotsCatalog } from "../calls/catalog.js";
import {
  addCall,
  deleteCallById,
  getCallsSettings,
  reorderCalls,
  setCallBet,
  setCallPay,
  setCallBounty,
} from "../calls/queue.js";

type HuntPhase = "edit" | "open" | "closed";

type HuntItem = {
  id: string;
  name: string;
  provider?: string | null;
  image_url?: string | null;

  // queue meta
  pos?: number | null;
  slot_key?: string | null;

  bet?: number | null;
  pay?: number | null;

  bounty?: boolean | null;
  caller?: string | null;
};

type HuntState = {
  phase: HuntPhase;
  opened: boolean;
  items: HuntItem[];
  start?: number | null;
  archive_id?: number | null;
};

type SuggestItem = {
  name: string;
  provider?: string | null;
  image_url?: string | null;
  score: number;
};

function num(v: any): number | null {
  if (v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normName(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreName(q: string, name: string) {
  const qq = normName(q);
  const nn = normName(name);
  if (!qq || !nn) return 0;

  if (qq === nn) return 100;
  if (nn.startsWith(qq)) return 92;
  if (nn.includes(qq)) return 78;

  const qParts = qq.split(/\s+/).filter(Boolean);
  const nParts = nn.split(/\s+/).filter(Boolean);
  if (!qParts.length || !nParts.length) return 0;

  let hit = 0;
  for (const p of qParts) {
    if (nParts.some((x) => x.startsWith(p) || x.includes(p))) hit++;
  }
  const ratio = hit / qParts.length;
  return Math.round(clamp(ratio * 70, 0, 70));
}

async function ensureSchema() {
  // tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hunt_sessions (
      user_id      INT PRIMARY KEY,
      phase        TEXT NOT NULL DEFAULT 'edit',
      opened       BOOLEAN NOT NULL DEFAULT FALSE,
      start        NUMERIC NULL,
      archive_id   BIGINT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hunt_session_items (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INT NOT NULL REFERENCES hunt_sessions(user_id) ON DELETE CASCADE,
      pos         INT NOT NULL DEFAULT 0,
      name        TEXT NOT NULL,
      provider    TEXT NULL,
      image_url   TEXT NULL,
      bet         NUMERIC NULL,
      pay         NUMERIC NULL,
      bounty      BOOLEAN NULL,
      caller      TEXT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS hunt_session_items_user_pos_idx ON hunt_session_items(user_id, pos);

    CREATE TABLE IF NOT EXISTS hunt_archives (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      title       TEXT NULL,
      start       NUMERIC NULL,
      total_pay   NUMERIC NULL,
      items_count INT NOT NULL DEFAULT 0,
      snapshot    JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hunt_archives_user_created_idx ON hunt_archives(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS hunt_share_tokens (
      token       TEXT PRIMARY KEY,
      user_id     INT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at  TIMESTAMPTZ NULL,
      expires_at  TIMESTAMPTZ NULL
    );
    CREATE INDEX IF NOT EXISTS hunt_share_tokens_user_idx ON hunt_share_tokens(user_id);
  `);

  // ✅ compat columns used by /calls-hunt/* (bet_default)
  await pool.query(`
    ALTER TABLE hunt_sessions
    ADD COLUMN IF NOT EXISTS bet_default NUMERIC NULL;
  `);
}

async function ensureSession(userId: number) {
  await ensureSchema();
  await pool.query(
    `
    INSERT INTO hunt_sessions(user_id)
    VALUES($1)
    ON CONFLICT (user_id) DO NOTHING
  `,
    [userId]
  );
}

async function getBetDefault(userId: number): Promise<number | null> {
  await ensureSession(userId);
  const r = await pool.query(`SELECT bet_default FROM hunt_sessions WHERE user_id=$1`, [userId]);
  return num(r.rows?.[0]?.bet_default);
}

async function setBetDefault(userId: number, bet: number | null) {
  await ensureSession(userId);
  await pool.query(`UPDATE hunt_sessions SET bet_default=$2, updated_at=NOW() WHERE user_id=$1`, [userId, bet]);
}

async function getMyStreamerMeta(
  userId: number
): Promise<{ streamerId: number; ownerUserId: number } | null> {
  const r = await pool.query(
    `SELECT id, user_id AS "ownerUserId" FROM streamers WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return { streamerId: Number(row.id), ownerUserId: Number(row.ownerUserId) };
}

async function isSyncActiveForUser(
  userId: number
): Promise<{ ok: true; streamerId: number } | { ok: false }> {
  const meta = await getMyStreamerMeta(userId);
  if (!meta) return { ok: false };

  const cs = await getCallsSettings(pool, meta.streamerId);
  if (!cs.syncHunt) return { ok: false };

  await ensureSession(userId);
  const s = await pool.query(`SELECT start FROM hunt_sessions WHERE user_id=$1`, [userId]);
  const start = num(s.rows?.[0]?.start);
  if (!(Number(start) > 0)) return { ok: false };

  return { ok: true, streamerId: meta.streamerId };
}

async function getState(userId: number): Promise<HuntState> {
  await ensureSession(userId);

  const s = await pool.query(
    `SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`,
    [userId]
  );
  const row = s.rows[0] || {};
  const phase = (row?.phase as HuntPhase) || "edit";
  const opened = !!row?.opened;

  // ✅ SYNC MODE: source-of-truth = calls_queue
  const sync = await isSyncActiveForUser(userId);
  if (sync.ok) {
    const items = await pool.query(
      `
      SELECT
        q.id::text AS id,
        q.pos AS pos,
        q.slot_key AS slot_key,
        q.slot_name AS name,
        q.provider AS provider,
        sc.image_url AS image_url,
        q.bet AS bet,
        q.pay AS pay,
        q.bounty AS bounty,
        q.username AS caller
      FROM calls_queue q
      LEFT JOIN slots_catalog sc
        ON sc.name_key = q.slot_key
      WHERE q.streamer_id=$1
      ORDER BY q.pos ASC
      `,
      [sync.streamerId]
    );

    const mapped: HuntItem[] = (items.rows || []).map((r: any) => ({
      id: String(r.id),
      pos: Number.isFinite(Number(r.pos)) ? Number(r.pos) : null,
      slot_key: r.slot_key ?? null,

      name: String(r.name),
      provider: r.provider ?? null,
      image_url: r.image_url ?? null,

      bet: num(r.bet),
      pay: num(r.pay),
      bounty: typeof r.bounty === "boolean" ? r.bounty : r.bounty ?? null,
      caller: r.caller ?? null,
    }));

    return {
      phase,
      opened,
      start: num(row?.start),
      archive_id: row?.archive_id ? Number(row.archive_id) : null,
      items: mapped,
    };
  }

  // fallback (old hunt2 local list)
  const itemsQ = await pool.query(
    `SELECT id, pos, name, provider, image_url, bet, pay, bounty, caller
     FROM hunt_session_items
     WHERE user_id=$1
     ORDER BY pos ASC, id ASC`,
    [userId]
  );

  const items: HuntItem[] = itemsQ.rows.map((r: any) => ({
    id: String(r.id),
    pos: Number.isFinite(Number(r.pos)) ? Number(r.pos) : null,

    name: String(r.name),
    provider: r.provider ?? null,
    image_url: r.image_url ?? null,

    bet: num(r.bet),
    pay: num(r.pay),
    bounty: typeof r.bounty === "boolean" ? r.bounty : r.bounty ?? null,
    caller: r.caller ?? null,
  }));

  return {
    phase,
    opened,
    start: num(row?.start),
    archive_id: row?.archive_id ? Number(row.archive_id) : null,
    items,
  };
}

async function writeSessionMeta(
  userId: number,
  patch: Partial<{ phase: HuntPhase; opened: boolean; start: number | null; archive_id: number | null }>
) {
  await ensureSession(userId);
  const cur = await pool.query(
    `SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`,
    [userId]
  );
  const row = cur.rows[0] || {};
  const phase = patch.phase ?? (row.phase as HuntPhase) ?? "edit";
  const opened = typeof patch.opened === "boolean" ? patch.opened : !!row.opened;
  const start = typeof patch.start !== "undefined" ? patch.start : num(row.start);
  const archiveId =
    typeof patch.archive_id !== "undefined" ? patch.archive_id : row.archive_id ? Number(row.archive_id) : null;

  await pool.query(
    `UPDATE hunt_sessions
     SET phase=$2, opened=$3, start=$4, archive_id=$5, updated_at=NOW()
     WHERE user_id=$1`,
    [userId, phase, opened, start, archiveId]
  );
}

async function suggestSlots(q: string, limit = 12): Promise<SuggestItem[]> {
  const qq = String(q || "").trim();
  if (qq.length < 2) return [];
  const lim = clamp(Number(limit || 12), 1, 20);
  const raw: any[] = await searchSlotsCatalog(pool, qq, lim);

  const scored = (raw || [])
    .map((it) => ({
      name: String(it?.name || ""),
      provider: it?.provider ?? null,
      image_url: it?.imageUrl ?? null,
      score: scoreName(qq, String(it?.name || "")),
    }))
    .filter((x) => x.name.trim().length)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  const seen = new Set<string>();
  const out: SuggestItem[] = [];
  for (const s of scored) {
    const key = normName(s.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: s.name, provider: s.provider, image_url: s.image_url, score: s.score });
    if (out.length >= lim) break;
  }
  return out;
}

async function getStreamerBySlug(slug: string): Promise<{ streamerId: number; ownerUserId: number } | null> {
  const r = await pool.query(`SELECT id, user_id AS "ownerUserId" FROM streamers WHERE slug=$1 LIMIT 1`, [slug]);
  const row = r.rows?.[0];
  if (!row) return null;
  return { streamerId: Number(row.id), ownerUserId: Number(row.ownerUserId) };
}

async function canControlStreamer(opts: {
  actorUserId: number;
  actorRole: string | null;
  streamerId: number;
  ownerUserId: number;
}): Promise<boolean> {
  const { actorUserId, actorRole, streamerId, ownerUserId } = opts;
  if (!actorUserId) return false;
  if (actorRole === "admin") return true;
  if (actorUserId === ownerUserId) return true;

  try {
    const r = await pool.query(
      `SELECT 1 FROM streamer_mods
        WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL
        LIMIT 1`,
      [streamerId, actorUserId]
    );
    if ((r.rows?.length ?? 0) > 0) return true;
  } catch (e) {
    console.error("[canControlStreamer] streamer_mods lookup failed:", e);
  }
  return false;
}

async function requireStreamerControl(req: any, res: any, slug: string) {
  const meta = await getStreamerBySlug(slug);
  if (!meta) {
    res.status(404).json({ ok: false, error: "streamer_not_found" });
    return null;
  }

  const actorUserId = Number(req.user?.id || 0);
  const actorRole = req.user?.role ? String(req.user.role) : null;

  const ok = await canControlStreamer({
    actorUserId,
    actorRole,
    streamerId: meta.streamerId,
    ownerUserId: meta.ownerUserId,
  });

  if (!ok) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return null;
  }

  return meta;
}

// ✅ current call = first FARM item (bet null/<=0)
async function getHeadCall(streamerId: number) {
  const r = await pool.query(
    `
    SELECT
      q.id::text AS id,
      q.slot_name AS "slotName",
      q.slot_key  AS "slotKey",
      q.provider  AS provider,
      q.username  AS username,
      q.pos       AS pos,
      sc.image_url AS "imageUrl"
    FROM calls_queue q
    LEFT JOIN slots_catalog sc
      ON sc.name_key = q.slot_key
    WHERE q.streamer_id=$1
      AND (q.bet IS NULL OR q.bet <= 0)
    ORDER BY q.pos ASC
    LIMIT 1
  `,
    [streamerId]
  );
  return r.rows?.[0] ?? null;
}

// ✅ current open item = first BONUS item unpaid (bet>0 && pay NULL)
async function getFirstUnpaidOpenItem(streamerId: number) {
  const r = await pool.query(
    `
    SELECT
      q.id::text AS id,
      q.slot_name AS name,
      q.provider  AS provider,
      sc.image_url AS image_url,
      q.bet       AS bet,
      q.username  AS caller,
      q.pos       AS pos
    FROM calls_queue q
    LEFT JOIN slots_catalog sc
      ON sc.name_key = q.slot_key
    WHERE q.streamer_id=$1
      AND q.bet IS NOT NULL AND q.bet > 0
      AND q.pay IS NULL
    ORDER BY q.pos ASC
    LIMIT 1
  `,
    [streamerId]
  );
  return r.rows?.[0] ?? null;
}

async function rotateCallsQueue(streamerId: number) {
  const idsR = await pool.query(`SELECT id::text AS id FROM calls_queue WHERE streamer_id=$1 ORDER BY pos ASC`, [
    streamerId,
  ]);
  const ids = (idsR.rows || []).map((x: any) => String(x.id)).filter(Boolean);
  if (ids.length <= 1) return;

  const first = ids.shift()!;
  ids.push(first);
  await reorderCalls(pool, streamerId, ids);
}

export const hunt2Router = express.Router();
hunt2Router.use(express.json());

/* ──────────────────────────────────────────
   ✅ Shared payload builder for /calls/* & /calls-hunt/*
   (IMPORTANT: all POST now return the updated state)
   ────────────────────────────────────────── */

async function buildCallsCompatPayload(meta: { streamerId: number; ownerUserId: number }) {
  const st = await getState(meta.ownerUserId);
  const betDefault = await getBetDefault(meta.ownerUserId);

  const mode: "farm" | "open" = st.phase === "open" ? "open" : "farm";
  const opening = mode === "open";

  const queue = (st.items || [])
    .slice()
    .sort((a, b) => (Number(a.pos ?? 0) || 0) - (Number(b.pos ?? 0) || 0))
    .map((it) => ({
      id: it.id,
      slotName: it.name,
      provider: it.provider ?? null,
      username: it.caller ?? null,
      pos: Number(it.pos ?? 0) || 0,
      imageUrl: it.image_url ?? null,
      betEur: it.bet ?? null,
      payEur: it.pay ?? null,
    }));

  const bonusDrops = queue.filter((x) => Number(x.betEur) > 0);

  const head = await getHeadCall(meta.streamerId);
  const openItem = opening ? await getFirstUnpaidOpenItem(meta.streamerId) : null;

  return {
    ok: true as const,

    mode,
    opening,

    startEur: num(st.start),
    betEur: betDefault,

    queue,

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

    // compat old payload
    hunt: {
      phase: st.phase,
      opened: !!st.opened,
      start: num(st.start),
      archive_id: st.archive_id ?? null,
      itemsCount: Array.isArray(st.items) ? st.items.length : 0,
    },

    currentCall: head,
    currentOpenItem: openItem,
  };
}

/* ──────────────────────────────────────────
   ✅ Shared handlers for /calls/* and /calls-hunt/*
   ────────────────────────────────────────── */

function registerCallsCompat(prefix: "/calls" | "/calls-hunt") {
  // STATE
  hunt2Router.get(`${prefix}/:slug/hunt/state`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // OPEN
  hunt2Router.post(`${prefix}/:slug/hunt/open`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      const st = await getState(meta.ownerUserId);
      const start = Number(st.start) || 0;

      if (!(start > 0)) return res.status(400).json({ ok: false, error: "start_required" });
      if (!st.items?.length) return res.status(400).json({ ok: false, error: "empty" });

      // ✅ IMPORTANT: en sync mode tu as des FARM (bet null) + BONUS (bet>0)
      // On autorise l'open si on a AU MOINS 1 bonus drop (bet>0)
      const hasBonus = (st.items || []).some((it) => (Number(it.bet) || 0) > 0);
      if (!hasBonus) return res.status(400).json({ ok: false, error: "no_bonus_drops" });

      await writeSessionMeta(meta.ownerUserId, { phase: "open", opened: true });

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // PASS
  hunt2Router.post(`${prefix}/:slug/hunt/pass`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      await rotateCallsQueue(meta.streamerId);

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // BONUS DROP (uses bet_default stored; body optional)
  hunt2Router.post(`${prefix}/:slug/hunt/bonus`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      // front usually sends NO body -> take stored bet_default
      const betFromBody = Number(req.body?.betEur ?? req.body?.bet);
      const betDefault = await getBetDefault(meta.ownerUserId);
      const bet = Number.isFinite(betFromBody) && betFromBody > 0 ? betFromBody : Number(betDefault ?? 0);

      if (!(bet > 0)) return res.status(400).json({ ok: false, error: "no_bet_set" });

      const head = await getHeadCall(meta.streamerId);
      if (!head?.id) return res.status(400).json({ ok: false, error: "empty_queue" });

      await setCallBet(pool, meta.streamerId, String(head.id), bet);

      // workflow: bonus -> go next
      await rotateCallsQueue(meta.streamerId);

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // PAY
  hunt2Router.post(`${prefix}/:slug/hunt/pay`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      const pay = Number(req.body?.payEur);
      if (!Number.isFinite(pay) || pay < 0) return res.status(400).json({ ok: false, error: "bad_pay" });

      const it = await getFirstUnpaidOpenItem(meta.streamerId);
      if (it?.id) {
        await setCallPay(pool, meta.streamerId, String(it.id), pay);
      }

      // ✅ always return the updated state (even if nothing to pay)
      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // START
  hunt2Router.post(`${prefix}/:slug/hunt/start`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      const startEur = Number(req.body?.startEur);
      if (!Number.isFinite(startEur) || startEur <= 0) return res.status(400).json({ ok: false, error: "bad_start" });

      await writeSessionMeta(meta.ownerUserId, { start: startEur, phase: "edit", opened: false, archive_id: null });

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // BET DEFAULT
  hunt2Router.post(`${prefix}/:slug/hunt/bet`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      const betEur = Number(req.body?.betEur);
      if (!Number.isFinite(betEur) || betEur <= 0) return res.status(400).json({ ok: false, error: "bad_bet" });

      await setBetDefault(meta.ownerUserId, betEur);

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  // RESET
  hunt2Router.post(`${prefix}/:slug/hunt/reset`, requireAuth, async (req: any, res) => {
    try {
      const slug = String(req.params.slug || "");
      const meta = await requireStreamerControl(req, res, slug);
      if (!meta) return;

      await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [meta.streamerId]);

      await ensureSession(meta.ownerUserId);
      await pool.query(
        `UPDATE hunt_sessions
         SET phase='edit', opened=FALSE, start=NULL, bet_default=NULL, archive_id=NULL, updated_at=NOW()
         WHERE user_id=$1`,
        [meta.ownerUserId]
      );

      const payload = await buildCallsCompatPayload(meta);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
}

// ✅ register BOTH route families
registerCallsCompat("/calls");
registerCallsCompat("/calls-hunt");

/* =========================
   PUBLIC SHARE (no auth)
   ========================= */

hunt2Router.get("/api/hunt2/share/state", async (req, res) => {
  try {
    await ensureSchema();
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "missing_token" });

    const t = await pool.query(
      `SELECT token, user_id, revoked_at, expires_at
       FROM hunt_share_tokens
       WHERE token=$1`,
      [token]
    );
    const row = t.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    if (row.revoked_at) return res.status(401).json({ ok: false, error: "revoked" });
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
      return res.status(401).json({ ok: false, error: "expired" });

    const userId = Number(row.user_id);
    const state = await getState(userId);
    return res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* =========================
   AUTH REQUIRED
   ========================= */

hunt2Router.use("/api/hunt2", requireAuth);

hunt2Router.get("/api/hunt2/state", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.get("/api/hunt2/suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const limit = clamp(Number(req.query.limit || 12), 1, 40);
    const items = await suggestSlots(q, limit);
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-start", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const start = Number(req.body?.start);
    if (!(start > 0)) return res.status(400).json({ ok: false, error: "bad_start" });

    await writeSessionMeta(userId, { start, phase: "edit", opened: false, archive_id: null });
    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ADD: in sync mode, insert into calls_queue (same list)
hunt2Router.post("/api/hunt2/add", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "bad_name" });

    const st = await getState(userId);
    if (!(Number(st.start) > 0)) return res.status(400).json({ ok: false, error: "start_required" });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      const add = await addCall(pool, sync.streamerId, userId, String(req.user?.username || "streamer"), name, null, {
        bypassLimit: true,
      });
      if (!add.ok) return res.status(400).json({ ok: false, error: add.error });
      return res.json({ ok: true, id: add.item.id });
    }

    const ins = await pool.query(
      `INSERT INTO hunt_session_items(user_id, pos, name, provider, image_url)
       VALUES ($1, (SELECT COALESCE(MAX(pos), -1)+1 FROM hunt_session_items WHERE user_id=$1), $2, NULL, NULL)
       RETURNING id`,
      [userId, name]
    );

    res.json({ ok: true, id: String(ins.rows[0].id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/remove", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await deleteCallById(pool, sync.streamerId, id);
      return res.json({ ok: true });
    }

    await pool.query(`DELETE FROM hunt_session_items WHERE user_id=$1 AND id=$2`, [userId, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-bet", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const bet = Number(req.body?.bet);
    if (!id || !(bet >= 0)) return res.status(400).json({ ok: false, error: "bad_input" });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await setCallBet(pool, sync.streamerId, id, bet);
      return res.json({ ok: true });
    }

    await pool.query(`UPDATE hunt_session_items SET bet=$3 WHERE user_id=$1 AND id=$2`, [userId, id, bet]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-pay", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const pay = Number(req.body?.pay);
    if (!id || !(pay >= 0)) return res.status(400).json({ ok: false, error: "bad_input" });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await setCallPay(pool, sync.streamerId, id, pay);
    } else {
      await pool.query(`UPDATE hunt_session_items SET pay=$3 WHERE user_id=$1 AND id=$2`, [userId, id, pay]);
    }

    // ✅ Auto-archive: when the last open bonus gets its pay, finalise the hunt
    // automatically so the user no longer has to click "Terminer le hunt".
    // Only fires when phase === "open" (avoids double-archive) and every item
    // has a pay value (>=0) set.
    const after = await getState(userId);
    const allPaid =
      after.items.length > 0 && after.items.every((it) => it.pay != null && Number(it.pay) >= 0);
    if (after.phase === "open" && allPaid) {
      try {
        const { archiveId, state: closed } = await closeHunt(userId);
        return res.json({ ok: true, autoArchived: true, archiveId, state: closed });
      } catch (closeErr) {
        console.error("[hunt2] auto-archive failed", closeErr);
        // fall through and return ok=true without auto-archive so the set-pay
        // itself is still considered successful
      }
    }

    res.json({ ok: true, state: after });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-bounty", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const bounty = !!req.body?.bounty;
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await setCallBounty(pool, sync.streamerId, id, bounty);
      return res.json({ ok: true });
    }

    await pool.query(`UPDATE hunt_session_items SET bounty=$3 WHERE user_id=$1 AND id=$2`, [userId, id, bounty]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// reorder
hunt2Router.post("/api/hunt2/reorder", express.json(), async (req: any, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((x: unknown) => String(x)) : [];
    if (!ids.length) return res.json({ ok: true });

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await reorderCalls(pool, sync.streamerId, ids);
      return res.json({ ok: true });
    }

    const tasks = ids.map((id: string, i: number) =>
      pool.query(`UPDATE hunt_session_items SET pos=$3 WHERE user_id=$1 AND id=$2`, [userId, id, i])
    );
    await Promise.all(tasks);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/open", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const st = await getState(userId);

    const start = Number(st.start) || 0;
    if (!(start > 0)) return res.status(400).json({ ok: false, error: "start_required" });
    if (!st.items.length) return res.status(400).json({ ok: false, error: "empty" });
    if (!st.items.every((it) => (Number(it.bet) || 0) > 0))
      return res.status(400).json({ ok: false, error: "bet_required" });

    await writeSessionMeta(userId, { phase: "open", opened: true });
    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/revert", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await writeSessionMeta(userId, { phase: "edit", opened: false });
    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * Archive the current hunt snapshot for `userId` into `hunt_archives`,
 * update the session meta to closed, and (in sync mode) wipe the calls_queue.
 *
 * Returns { archiveId, state } for the caller to forward to the client.
 * Safe to call multiple times in theory, but the caller should gate it on
 * `phase === "open"` to avoid duplicate archives.
 */
async function closeHunt(userId: number): Promise<{ archiveId: number; state: HuntState }> {
  const state = await getState(userId);

  const start = Number(state.start) || 0;
  const totalPay = state.items.reduce((s, it) => s + (Number(it.pay) || 0), 0);
  const itemsCount = state.items.length;

  const snapshot: HuntState = {
    phase: "closed",
    opened: false,
    start: start || null,
    items: state.items,
    archive_id: null,
  };

  const ins = await pool.query(
    `INSERT INTO hunt_archives(user_id, title, start, total_pay, items_count, snapshot)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [userId, null, start || null, totalPay, itemsCount, snapshot]
  );

  const archiveId = Number(ins.rows[0].id);
  await writeSessionMeta(userId, { phase: "closed", opened: false, archive_id: archiveId });

  // ✅ if sync active => reset calls_queue too
  const sync = await isSyncActiveForUser(userId);
  if (sync.ok) {
    await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [sync.streamerId]);
  }

  const next = await getState(userId);
  return { archiveId, state: next };
}

// close = archive snapshot (in sync mode: snapshot comes from calls_queue view)
hunt2Router.post("/api/hunt2/close", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const { state } = await closeHunt(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/new", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSession(userId);

    const sync = await isSyncActiveForUser(userId);
    if (sync.ok) {
      await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [sync.streamerId]);
    } else {
      await pool.query(`DELETE FROM hunt_session_items WHERE user_id=$1`, [userId]);
    }

    await writeSessionMeta(userId, { phase: "edit", opened: false, start: null, archive_id: null });
    await setBetDefault(userId, null);

    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* my-hunts/load/save/delete/share */

hunt2Router.get("/api/hunt2/my-hunts", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSchema();
    const r = await pool.query(
      `SELECT id, created_at, title, start, total_pay, items_count, snapshot
       FROM hunt_archives
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId]
    );

    const items = r.rows.map((x: any) => ({
      id: Number(x.id),
      created_at: x.created_at ? String(x.created_at) : null,
      title: x.title ?? null,
      start: num(x.start),
      total_pay: num(x.total_pay),
      items_count: Number(x.items_count) || 0,
      snapshot: x.snapshot ?? null,
    }));

    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/load", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = Number(req.body?.id);
    if (!(id > 0)) return res.status(400).json({ ok: false, error: "bad_id" });

    const r = await pool.query(`SELECT snapshot, start FROM hunt_archives WHERE id=$1 AND user_id=$2`, [id, userId]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });

    const snap = row.snapshot as HuntState;
    const items = Array.isArray(snap?.items) ? snap.items : [];

    await ensureSession(userId);
    await pool.query(`DELETE FROM hunt_session_items WHERE user_id=$1`, [userId]);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO hunt_session_items(user_id, pos, name, provider, image_url, bet, pay, bounty, caller)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          userId,
          i,
          String(it.name),
          it.provider ?? null,
          it.image_url ?? null,
          it.bet ?? null,
          it.pay ?? null,
          typeof it.bounty === "boolean" ? it.bounty : null,
          it.caller ?? null,
        ]
      );
    }

    await writeSessionMeta(userId, { phase: "closed", opened: false, start: num(row.start), archive_id: id });

    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/save", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const title = req.body?.title ? String(req.body.title).trim() : null;

    const state = await getState(userId);
    const start = Number(state.start) || 0;
    const totalPay = state.items.reduce((s, it) => s + (Number(it.pay) || 0), 0);
    const itemsCount = state.items.length;

    const snapshot: HuntState = {
      phase: state.phase || "edit",
      opened: !!state.opened,
      start: start || null,
      items: state.items,
      archive_id: state.archive_id ?? null,
    };

    const ins = await pool.query(
      `INSERT INTO hunt_archives(user_id, title, start, total_pay, items_count, snapshot)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [userId, title, start || null, totalPay, itemsCount, snapshot]
    );

    res.json({ ok: true, id: Number(ins.rows[0].id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/delete", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = Number(req.body?.id);
    if (!(id > 0)) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(`DELETE FROM hunt_archives WHERE id=$1 AND user_id=$2`, [id, userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/delete-all", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await pool.query(`DELETE FROM hunt_archives WHERE user_id=$1`, [userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/share/create", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSchema();

    const expiresInSec = Number(req.body?.expiresInSec || 0);
    const token = crypto.randomBytes(18).toString("base64url");
    const expiresAt = expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

    await pool.query(`INSERT INTO hunt_share_tokens(token, user_id, expires_at) VALUES($1,$2,$3)`, [
      token,
      userId,
      expiresAt,
    ]);

    const origin = String(req.headers.origin || `${req.protocol}://${req.get("host")}`);
    const url = `${origin}/hunt/share/${token}`;

    res.json({ ok: true, token, url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/share/revoke", async (req: any, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSchema();

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "bad_token" });

    await pool.query(`UPDATE hunt_share_tokens SET revoked_at=NOW() WHERE token=$1 AND user_id=$2`, [token, userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

