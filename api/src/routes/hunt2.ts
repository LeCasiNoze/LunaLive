// api/src/routes/hunt2.ts
import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

type HuntPhase = "edit" | "open" | "closed";

type HuntItem = {
  id: string;
  name: string;
  image_url?: string | null;
  bet?: number | null;
  pay?: number | null;
  provider?: string | null;
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

  // score token-based simple
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
  // MVP safe: create tables if missing (tu peux migrer proprement plus tard)
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

async function getState(userId: number): Promise<HuntState> {
  await ensureSession(userId);

  const s = await pool.query(
    `SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`,
    [userId]
  );
  const row = s.rows[0];
  const itemsQ = await pool.query(
    `SELECT id, name, provider, image_url, bet, pay, bounty, caller
     FROM hunt_session_items
     WHERE user_id=$1
     ORDER BY pos ASC, id ASC`,
    [userId]
  );

  const items: HuntItem[] = itemsQ.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    provider: r.provider ?? null,
    image_url: r.image_url ?? null,
    bet: num(r.bet),
    pay: num(r.pay),
    bounty: typeof r.bounty === "boolean" ? r.bounty : (r.bounty ?? null),
    caller: r.caller ?? null,
  }));

  const phase = (row?.phase as HuntPhase) || "edit";
  const opened = !!row?.opened;

  return {
    phase,
    opened,
    start: num(row?.start),
    archive_id: row?.archive_id ? Number(row.archive_id) : null,
    items,
  };
}

async function writeSessionMeta(userId: number, patch: Partial<{ phase: HuntPhase; opened: boolean; start: number | null; archive_id: number | null }>) {
  await ensureSession(userId);
  const cur = await pool.query(
    `SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`,
    [userId]
  );
  const row = cur.rows[0] || {};
  const phase = patch.phase ?? (row.phase as HuntPhase) ?? "edit";
  const opened = typeof patch.opened === "boolean" ? patch.opened : !!row.opened;
  const start = typeof patch.start !== "undefined" ? patch.start : num(row.start);
  const archiveId = typeof patch.archive_id !== "undefined" ? patch.archive_id : (row.archive_id ? Number(row.archive_id) : null);

  await pool.query(
    `UPDATE hunt_sessions
     SET phase=$2, opened=$3, start=$4, archive_id=$5, updated_at=NOW()
     WHERE user_id=$1`,
    [userId, phase, opened, start, archiveId]
  );
}

async function nextPos(userId: number): Promise<number> {
  const r = await pool.query(`SELECT COALESCE(MAX(pos), -1) AS m FROM hunt_session_items WHERE user_id=$1`, [userId]);
  return Number(r.rows?.[0]?.m ?? -1) + 1;
}

async function tryHydrateFromSlots(name: string): Promise<{ provider: string | null; image_url: string | null } | null> {
  // Best effort: si tu as une table slots, adapte ici.
  // Si ça fail => null, l’UI marche quand même.
  try {
    const exact = await pool.query(
      `
      SELECT name, provider, image_url
      FROM slots
      WHERE LOWER(name)=LOWER($1)
      LIMIT 1
    `,
      [name]
    );
    const r = exact.rows?.[0];
    if (!r) return null;
    return { provider: r.provider ?? null, image_url: r.image_url ?? null };
  } catch {
    return null;
  }
}

async function suggestSlots(q: string, limit = 12): Promise<SuggestItem[]> {
  const qq = String(q || "").trim();
  if (qq.length < 1) return [];

  // Best effort: on essaie de piocher dans une table slots si elle existe.
  // Sinon renvoie vide.
  let candidates: Array<{ name: string; provider: string | null; image_url: string | null }> = [];
  try {
    const r = await pool.query(
      `
      SELECT name, provider, image_url
      FROM slots
      WHERE name ILIKE $1
      ORDER BY name ASC
      LIMIT 60
    `,
      [`%${qq}%`]
    );
    candidates = (r.rows || []).map((x: any) => ({
      name: String(x.name),
      provider: x.provider ?? null,
      image_url: x.image_url ?? null,
    }));
  } catch {
    candidates = [];
  }

  const scored = candidates
    .map((c) => ({ ...c, score: scoreName(qq, c.name) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  // uniq par name (case-insensitive)
  const seen = new Set<string>();
  const out: SuggestItem[] = [];
  for (const s of scored) {
    const key = normName(s.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: s.name, provider: s.provider, image_url: s.image_url, score: s.score });
    if (out.length >= limit) break;
  }
  return out;
}

export const hunt2Router = express.Router();

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

hunt2Router.get("/api/hunt2/state", async (req, res) => {
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

hunt2Router.post("/api/hunt2/set-start", async (req, res) => {
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

hunt2Router.post("/api/hunt2/add", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "bad_name" });

    const st = await getState(userId);
    if (!(Number(st.start) > 0)) return res.status(400).json({ ok: false, error: "start_required" });

    const pos = await nextPos(userId);
    const hyd = await tryHydrateFromSlots(name);

    const ins = await pool.query(
      `INSERT INTO hunt_session_items(user_id, pos, name, provider, image_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [userId, pos, name, hyd?.provider ?? null, hyd?.image_url ?? null]
    );

    res.json({ ok: true, id: String(ins.rows[0].id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/remove", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(`DELETE FROM hunt_session_items WHERE user_id=$1 AND id=$2`, [userId, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-bet", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const bet = Number(req.body?.bet);
    if (!id || !(bet >= 0)) return res.status(400).json({ ok: false, error: "bad_input" });

    await pool.query(
      `UPDATE hunt_session_items SET bet=$3 WHERE user_id=$1 AND id=$2`,
      [userId, id, bet]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-pay", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const pay = Number(req.body?.pay);
    if (!id || !(pay >= 0)) return res.status(400).json({ ok: false, error: "bad_input" });

    await pool.query(
      `UPDATE hunt_session_items SET pay=$3 WHERE user_id=$1 AND id=$2`,
      [userId, id, pay]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-bounty", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const bounty = !!req.body?.bounty;
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(
      `UPDATE hunt_session_items SET bounty=$3 WHERE user_id=$1 AND id=$2`,
      [userId, id, bounty]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/set-caller", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = String(req.body?.id || "");
    const callerRaw = req.body?.caller;
    const caller = callerRaw === null ? null : String(callerRaw || "").trim().replace(/^@+/, "");
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(
      `UPDATE hunt_session_items SET caller=$3 WHERE user_id=$1 AND id=$2`,
      [userId, id, caller]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/hunt2/reorder   body: { ids: string[] }
hunt2Router.post("/api/hunt2/reorder", express.json(), async (req: any, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.map((x: unknown) => String(x))
      : [];

    if (!ids.length) return res.json({ ok: true });

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

hunt2Router.post("/api/hunt2/open", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const st = await getState(userId);

    const start = Number(st.start) || 0;
    if (!(start > 0)) return res.status(400).json({ ok: false, error: "start_required" });
    if (!st.items.length) return res.status(400).json({ ok: false, error: "empty" });
    if (!st.items.every((it) => (Number(it.bet) || 0) > 0)) {
      return res.status(400).json({ ok: false, error: "bet_required" });
    }

    await writeSessionMeta(userId, { phase: "open", opened: true });
    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/revert", async (req, res) => {
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

hunt2Router.post("/api/hunt2/close", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
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

    const next = await getState(userId);
    res.json({ ok: true, state: next });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/new", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSession(userId);

    await pool.query(`DELETE FROM hunt_session_items WHERE user_id=$1`, [userId]);
    await writeSessionMeta(userId, { phase: "edit", opened: false, start: null, archive_id: null });

    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.get("/api/hunt2/my-hunts", async (req, res) => {
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

hunt2Router.post("/api/hunt2/load", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    const id = Number(req.body?.id);
    if (!(id > 0)) return res.status(400).json({ ok: false, error: "bad_id" });

    const r = await pool.query(
      `SELECT snapshot, start FROM hunt_archives WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
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

    await writeSessionMeta(userId, {
      phase: "closed",
      opened: false,
      start: num(row.start),
      archive_id: id,
    });

    const state = await getState(userId);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/save", async (req, res) => {
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

hunt2Router.post("/api/hunt2/delete", async (req, res) => {
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

hunt2Router.post("/api/hunt2/delete-all", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    await pool.query(`DELETE FROM hunt_archives WHERE user_id=$1`, [userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/share/create", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSchema();

    const expiresInSec = Number(req.body?.expiresInSec || 0);
    const token = crypto.randomBytes(18).toString("base64url");

    const expiresAt =
      expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

    await pool.query(
      `INSERT INTO hunt_share_tokens(token, user_id, expires_at)
       VALUES($1,$2,$3)`,
      [token, userId, expiresAt]
    );

    // URL = origin du front si présent, sinon host API (fallback)
    const origin = String(req.headers.origin || `${req.protocol}://${req.get("host")}`);
    const url = `${origin}/hunt/share/${token}`;

    res.json({ ok: true, token, url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

hunt2Router.post("/api/hunt2/share/revoke", async (req, res) => {
  try {
    const userId = Number(req.user!.id);
    await ensureSchema();

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "bad_token" });

    await pool.query(
      `UPDATE hunt_share_tokens SET revoked_at=NOW()
       WHERE token=$1 AND user_id=$2`,
      [token, userId]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});
