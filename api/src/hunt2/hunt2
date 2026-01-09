// api/src/hunt2/store.ts
import { keyText } from "../calls/normalize.js";

export type HuntPhase = "edit" | "open" | "closed";

export type HuntItemRow = {
  id: string;
  name: string;
  name_key: string | null;
  provider: string | null;
  image_url: string | null;
  bet: number | null;
  pay: number | null;
  bounty: boolean | null;
  caller: string | null;
  pos: number;
};

export type HuntState = {
  phase: HuntPhase;
  opened: boolean;
  start: number | null;
  archive_id: number | null;
  items: HuntItemRow[];
};

type Q = { query: (sql: string, params?: any[]) => Promise<any> };

function num(v: any): number | null {
  if (v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function huntEnsureSchema(db: Q) {
  // Tables + colonnes évolutives (safe)
  await db.query(`
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
      name_key    TEXT NULL,
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

  // Ajouts de colonnes si tables déjà existantes
  await db.query(`ALTER TABLE hunt_session_items ADD COLUMN IF NOT EXISTS name_key TEXT NULL;`);

  // Unique par machine pour éviter doublons lors du "sync hunt"
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS hunt_session_items_user_namekey_uniq
    ON hunt_session_items(user_id, name_key)
    WHERE name_key IS NOT NULL;
  `);
}

export async function huntEnsureSession(db: Q, userId: number) {
  await huntEnsureSchema(db);
  await db.query(
    `
    INSERT INTO hunt_sessions(user_id)
    VALUES($1)
    ON CONFLICT (user_id) DO NOTHING
  `,
    [userId]
  );
}

export async function huntGetState(db: Q, userId: number): Promise<HuntState> {
  await huntEnsureSession(db, userId);

  const s = await db.query(`SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`, [userId]);
  const row = s.rows?.[0] || {};

  const itemsQ = await db.query(
    `SELECT id, name, name_key, provider, image_url, bet, pay, bounty, caller, pos
     FROM hunt_session_items
     WHERE user_id=$1
     ORDER BY pos ASC, id ASC`,
    [userId]
  );

  const items: HuntItemRow[] = (itemsQ.rows || []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    name_key: r.name_key ? String(r.name_key) : null,
    provider: r.provider ?? null,
    image_url: r.image_url ?? null,
    bet: num(r.bet),
    pay: num(r.pay),
    bounty: typeof r.bounty === "boolean" ? r.bounty : (r.bounty ?? null),
    caller: r.caller ?? null,
    pos: Number(r.pos) || 0,
  }));

  return {
    phase: (row.phase as any) || "edit",
    opened: !!row.opened,
    start: num(row.start),
    archive_id: row.archive_id ? Number(row.archive_id) : null,
    items,
  };
}

export async function huntWriteMeta(
  db: Q,
  userId: number,
  patch: Partial<{ phase: HuntPhase; opened: boolean; start: number | null; archive_id: number | null }>
) {
  await huntEnsureSession(db, userId);

  const cur = await db.query(`SELECT phase, opened, start, archive_id FROM hunt_sessions WHERE user_id=$1`, [userId]);
  const row = cur.rows?.[0] || {};

  const phase = (patch.phase ?? row.phase ?? "edit") as HuntPhase;
  const opened = typeof patch.opened === "boolean" ? patch.opened : !!row.opened;
  const start = typeof patch.start !== "undefined" ? patch.start : num(row.start);
  const archiveId =
    typeof patch.archive_id !== "undefined" ? patch.archive_id : row.archive_id ? Number(row.archive_id) : null;

  await db.query(
    `UPDATE hunt_sessions
     SET phase=$2, opened=$3, start=$4, archive_id=$5, updated_at=NOW()
     WHERE user_id=$1`,
    [userId, phase, opened, start, archiveId]
  );
}

async function huntNextPos(db: Q, userId: number): Promise<number> {
  const r = await db.query(`SELECT COALESCE(MAX(pos), -1) AS m FROM hunt_session_items WHERE user_id=$1`, [userId]);
  return Number(r.rows?.[0]?.m ?? -1) + 1;
}

/**
 * Upsert “machine” dans le hunt (utilisé par sync hunt / bonus).
 * - name_key = keyText(name)
 * - si déjà existante: on rafraîchit provider/image/caller (si fournis)
 * - sinon insert en fin de liste
 */
export async function huntUpsertFromCall(
  db: Q,
  userId: number,
  input: { name: string; provider?: string | null; image_url?: string | null; caller?: string | null }
): Promise<{ id: string; created: boolean }> {
  await huntEnsureSession(db, userId);

  const name = String(input.name || "").trim();
  const name_key = keyText(name);

  if (!name) throw new Error("bad_name");

  // update si existe
  const upd = await db.query(
    `
    UPDATE hunt_session_items
    SET
      provider = COALESCE($4, provider),
      image_url = COALESCE($5, image_url),
      caller = COALESCE($6, caller)
    WHERE user_id=$1 AND name_key=$2
    RETURNING id
  `,
    [userId, name_key, name, input.provider ?? null, input.image_url ?? null, input.caller ?? null]
  );

  if (upd.rows?.[0]?.id) {
    return { id: String(upd.rows[0].id), created: false };
  }

  const pos = await huntNextPos(db, userId);
  const ins = await db.query(
    `
    INSERT INTO hunt_session_items(user_id, pos, name, name_key, provider, image_url, caller)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING id
  `,
    [userId, pos, name, name_key, input.provider ?? null, input.image_url ?? null, input.caller ?? null]
  );

  return { id: String(ins.rows?.[0]?.id), created: true };
}

export async function huntDeleteByNameKey(db: Q, userId: number, nameKey: string): Promise<boolean> {
  await huntEnsureSession(db, userId);
  const k = String(nameKey || "").trim();
  if (!k) return false;

  const r = await db.query(
    `
    DELETE FROM hunt_session_items
    WHERE user_id=$1 AND name_key=$2
    RETURNING id
  `,
    [userId, k]
  );
  return !!r.rows?.[0];
}

export async function huntSetBetByNameKey(
  db: Q,
  userId: number,
  nameKey: string,
  bet: number,
  patch?: { caller?: string | null; provider?: string | null; image_url?: string | null }
): Promise<boolean> {
  await huntEnsureSession(db, userId);

  const k = String(nameKey || "").trim();
  if (!k) return false;

  const b = Number(bet);
  if (!(b >= 0)) throw new Error("bad_bet");

  const r = await db.query(
    `
    UPDATE hunt_session_items
    SET
      bet=$3,
      caller = COALESCE($4, caller),
      provider = COALESCE($5, provider),
      image_url = COALESCE($6, image_url)
    WHERE user_id=$1 AND name_key=$2
    RETURNING id
  `,
    [userId, k, b, patch?.caller ?? null, patch?.provider ?? null, patch?.image_url ?? null]
  );
  return !!r.rows?.[0];
}

export async function huntOpenForUser(db: Q, userId: number) {
  const st = await huntGetState(db, userId);

  const start = Number(st.start) || 0;
  if (!(start > 0)) throw new Error("start_required");
  if (!st.items.length) throw new Error("empty");
  if (!st.items.every((it) => (Number(it.bet) || 0) > 0)) throw new Error("bet_required");

  await huntWriteMeta(db, userId, { phase: "open", opened: true });
}

export async function huntApplyPayNext(
  db: Q,
  userId: number,
  pay: number
): Promise<{ ok: true; item: HuntItemRow } | { ok: false; error: string }> {
  await huntEnsureSession(db, userId);

  const p = Number(pay);
  if (!(p >= 0)) return { ok: false, error: "bad_pay" };

  // prochain item "à payer" = pay IS NULL (ordre pos)
  const next = await db.query(
    `
    SELECT id, name, name_key, provider, image_url, bet, pay, bounty, caller, pos
    FROM hunt_session_items
    WHERE user_id=$1 AND pay IS NULL
    ORDER BY pos ASC, id ASC
    LIMIT 1
  `,
    [userId]
  );

  const row = next.rows?.[0];
  if (!row) return { ok: false, error: "no_pending_item" };

  const upd = await db.query(
    `UPDATE hunt_session_items SET pay=$2 WHERE user_id=$1 AND id=$3 RETURNING id`,
    [userId, p, row.id]
  );
  if (!upd.rows?.[0]) return { ok: false, error: "update_failed" };

  return {
    ok: true,
    item: {
      id: String(row.id),
      name: String(row.name),
      name_key: row.name_key ? String(row.name_key) : null,
      provider: row.provider ?? null,
      image_url: row.image_url ?? null,
      bet: num(row.bet),
      pay: p,
      bounty: typeof row.bounty === "boolean" ? row.bounty : (row.bounty ?? null),
      caller: row.caller ?? null,
      pos: Number(row.pos) || 0,
    },
  };
}
