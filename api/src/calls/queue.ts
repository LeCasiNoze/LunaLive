// api/src/calls/queue.ts
import type { Pool } from "pg";
import { keyText, normText } from "./normalize.js";

export type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  userId: number;
  username: string;
  pos: number;
  createdAt: string;
};

export type CallsSettings = {
  enabled: boolean;
  showCmdInChat: boolean;
  showAcceptPublic: boolean;
  allowListec: boolean;
  listecMax: number;
  perUserLimit: number;
};

// règle “0 infini / >10 infini”
export function effectiveLimit(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 2;
  if (x <= 0) return 0;
  if (x > 10) return 0;
  return Math.floor(x);
}

export async function getCallsSettings(pool: Pool, streamerId: number): Promise<CallsSettings> {
  const r = await pool.query(
    `SELECT enabled, show_cmd_in_chat, show_accept_public, allow_listec, listec_max, per_user_limit
     FROM calls_settings
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );

  const row = r.rows?.[0];
  if (!row) {
    // auto-create default row (idempotent)
    await pool.query(
      `INSERT INTO calls_settings (streamer_id) VALUES ($1)
       ON CONFLICT (streamer_id) DO NOTHING`,
      [streamerId]
    );

    return {
      enabled: true,
      showCmdInChat: false,
      showAcceptPublic: true,
      allowListec: true,
      listecMax: 10,
      perUserLimit: 2,
    };
  }

  return {
    enabled: !!row.enabled,
    showCmdInChat: !!row.show_cmd_in_chat,
    showAcceptPublic: !!row.show_accept_public,
    allowListec: !!row.allow_listec,
    listecMax: Math.max(1, Math.min(50, Number(row.listec_max ?? 10))),
    perUserLimit: effectiveLimit(Number(row.per_user_limit ?? 2)),
  };
}

export async function isUserBannedFromCalls(pool: Pool, streamerId: number, userId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM calls_user_bans WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
    [streamerId, userId]
  );
  return !!r.rows?.[0];
}

export async function isSlotBanned(pool: Pool, streamerId: number, slotKey: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM calls_banned_slots WHERE streamer_id=$1 AND slot_key=$2 LIMIT 1`,
    [streamerId, slotKey]
  );
  return !!r.rows?.[0];
}

export async function isProviderBanned(pool: Pool, streamerId: number, provider: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM calls_banned_providers WHERE streamer_id=$1 AND provider=$2 LIMIT 1`,
    [streamerId, provider]
  );
  return !!r.rows?.[0];
}

export async function countUserCalls(pool: Pool, streamerId: number, userId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM calls_queue WHERE streamer_id=$1 AND user_id=$2`,
    [streamerId, userId]
  );
  return Number(r.rows?.[0]?.n ?? 0);
}

export async function addCall(
  pool: Pool,
  streamerId: number,
  userId: number,
  username: string,
  slotNameRaw: string,
  provider: string | null
): Promise<{ ok: true; item: CallItem; position: number } | { ok: false; error: string }> {
  const slotName = normText(slotNameRaw);
  if (!slotName) return { ok: false, error: "bad_slot" };

  const slotKey = keyText(slotName);

  // lock par streamer pour pos + dédup
  await pool.query(`SELECT pg_advisory_xact_lock($1)`, [Number(streamerId)]);

  const maxPos = await pool.query(
    `SELECT COALESCE(MAX(pos),0)::bigint AS m FROM calls_queue WHERE streamer_id=$1`,
    [streamerId]
  );
  const nextPos = Number(maxPos.rows?.[0]?.m ?? 0) + 1;

  try {
    const ins = await pool.query(
      `
      INSERT INTO calls_queue (streamer_id, slot_name, slot_key, provider, user_id, username, pos)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, created_at AS "createdAt"
      `,
      [streamerId, slotName, slotKey, provider, userId, username, nextPos]
    );

    const row = ins.rows?.[0];
    const id = String(row.id);

    return {
      ok: true,
      position: nextPos,
      item: {
        id,
        slotName,
        provider: provider ?? null,
        userId,
        username,
        pos: nextPos,
        createdAt: new Date(row.createdAt).toISOString(),
      },
    };
  } catch (e: any) {
    // unique violation => déjà en file
    const msg = String(e?.message || "");
    if (msg.includes("calls_queue_unique_slot")) return { ok: false, error: "already_in_queue" };
    return { ok: false, error: "insert_failed" };
  }
}

export async function listCalls(
  pool: Pool,
  streamerId: number,
  limit: number,
  offset: number
): Promise<CallItem[]> {
  const lim = Math.max(1, Math.min(200, Math.floor(Number(limit || 50))));
  const off = Math.max(0, Math.floor(Number(offset || 0)));

  const r = await pool.query(
    `
    SELECT
      id::text AS id,
      slot_name AS "slotName",
      provider AS "provider",
      user_id::int AS "userId",
      username AS "username",
      pos::int AS "pos",
      created_at AS "createdAt"
    FROM calls_queue
    WHERE streamer_id=$1
    ORDER BY pos ASC
    LIMIT $2 OFFSET $3
    `,
    [streamerId, lim, off]
  );

  return (r.rows || []).map((x: any) => ({
    id: String(x.id),
    slotName: String(x.slotName),
    provider: x.provider ? String(x.provider) : null,
    userId: Number(x.userId),
    username: String(x.username),
    pos: Number(x.pos),
    createdAt: new Date(x.createdAt).toISOString(),
  }));
}

export async function resetCalls(pool: Pool, streamerId: number): Promise<void> {
  await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [streamerId]);
}

export async function deleteCallById(pool: Pool, streamerId: number, id: string): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM calls_queue WHERE streamer_id=$1 AND id=$2 RETURNING id`,
    [streamerId, id]
  );
  return !!r.rows?.[0];
}
