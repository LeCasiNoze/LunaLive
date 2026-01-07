// api/src/calls/queue.ts
import type { Pool } from "pg";
import { keyText, normText } from "./normalize.js";
import { normalizeProvider } from "./provider_aliases.js";

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

/**
 * Nouveau système bans:
 *  - table calls_bans(streamer_id, kind, ban_key)
 *  - kind in ('user','slot','provider')
 *
 * IMPORTANT:
 * - ban user = ban_key = lower(username) (fallback: userId string)
 * - ban provider = ban_key = provider_norm (lower)
 * - ban slot = ban_key = slotKey (name_key)
 */
export async function isUserBannedFromCalls(
  pool: Pool,
  streamerId: number,
  userId: number,
  username?: string | null
): Promise<boolean> {
  const u = String(username || "").trim().toLowerCase();
  const idKey = String(userId || "").trim();

  if (u) {
    const r = await pool.query(
      `SELECT 1
       FROM calls_bans
       WHERE streamer_id=$1 AND kind='user' AND (ban_key=$2 OR ban_key=$3)
       LIMIT 1`,
      [streamerId, u, idKey]
    );
    return !!r.rows?.[0];
  }

  const r = await pool.query(
    `SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='user' AND ban_key=$2
     LIMIT 1`,
    [streamerId, idKey]
  );
  return !!r.rows?.[0];
}

export async function isSlotBanned(pool: Pool, streamerId: number, slotKey: string): Promise<boolean> {
  const k = String(slotKey || "").trim();
  if (!k) return false;

  const r = await pool.query(
    `SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='slot' AND ban_key=$2
     LIMIT 1`,
    [streamerId, k]
  );
  return !!r.rows?.[0];
}

export async function isProviderBanned(pool: Pool, streamerId: number, provider: string): Promise<boolean> {
  const raw = String(provider || "").trim();
  if (!raw) return false;

  const prov = normalizeProvider(raw);
  const k = String(prov || raw).trim().toLowerCase();
  if (!k) return false;

  const r = await pool.query(
    `SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='provider' AND ban_key=$2
     LIMIT 1`,
    [streamerId, k]
  );
  return !!r.rows?.[0];
}

export async function countUserCalls(pool: Pool, streamerId: number, userId: number): Promise<number> {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM calls_queue WHERE streamer_id=$1 AND user_id=$2`, [
    streamerId,
    userId,
  ]);
  return Number(r.rows?.[0]?.n ?? 0);
}

async function ensureProviderPolicyRow(pool: Pool, streamerId: number) {
  await pool.query(
    `
    INSERT INTO calls_provider_policy (streamer_id, mode)
    VALUES ($1, 'allow_all')
    ON CONFLICT (streamer_id) DO NOTHING
    `,
    [streamerId]
  );
}

async function isProviderAllowedByPolicy(pool: Pool, streamerId: number, providerNormLower: string | null): Promise<boolean> {
  // si pas de provider => on laisse passer (tu peux rendre strict si tu veux)
  if (!providerNormLower) return true;

  await ensureProviderPolicyRow(pool, streamerId);

  const pr = await pool.query(`SELECT mode FROM calls_provider_policy WHERE streamer_id=$1 LIMIT 1`, [streamerId]);
  const mode = String(pr.rows?.[0]?.mode || "allow_all");

  if (mode !== "allow_only") return true;

  const ar = await pool.query(
    `SELECT 1
     FROM calls_allowed_providers
     WHERE streamer_id=$1 AND provider_norm=$2
     LIMIT 1`,
    [streamerId, providerNormLower]
  );
  return !!ar.rows?.[0];
}

export async function addCall(
  pool: Pool,
  streamerId: number,
  userId: number,
  username: string,
  slotNameRaw: string,
  provider: string | null,
  opts?: { bypassLimit?: boolean }
): Promise<{ ok: true; item: CallItem; position: number } | { ok: false; error: string }> {
  const slotName = normText(slotNameRaw);
  if (!slotName) return { ok: false, error: "bad_slot" };

  const slotKey = keyText(slotName);

  // provider -> provider_norm (stocké en lower)
  const providerRaw = provider ? normText(provider) : null;
  const providerNorm = providerRaw ? normalizeProvider(providerRaw) : null;
  const providerLower = providerNorm ? String(providerNorm).trim().toLowerCase() : providerRaw ? providerRaw.toLowerCase() : null;

  const settings = await getCallsSettings(pool, streamerId);
  if (!settings.enabled) return { ok: false, error: "calls_disabled" };

  // bans / policy / limits
  if (await isUserBannedFromCalls(pool, streamerId, userId, username)) return { ok: false, error: "user_banned" };
  if (await isSlotBanned(pool, streamerId, slotKey)) return { ok: false, error: "slot_banned" };
  if (providerLower && (await isProviderBanned(pool, streamerId, providerLower))) return { ok: false, error: "provider_banned" };
  if (!(await isProviderAllowedByPolicy(pool, streamerId, providerLower))) return { ok: false, error: "provider_not_allowed" };

  if (!opts?.bypassLimit) {
    if (settings.perUserLimit > 0) {
      const n = await countUserCalls(pool, streamerId, userId);
      if (n >= settings.perUserLimit) return { ok: false, error: "limit_reached" };
    }
  }

  // IMPORTANT: multi-queries cohérentes => on prend un client + transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock par streamer pour pos + dédup
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [Number(streamerId)]);

    const maxPos = await client.query(`SELECT COALESCE(MAX(pos),0)::bigint AS m FROM calls_queue WHERE streamer_id=$1`, [
      streamerId,
    ]);
    const nextPos = Number(maxPos.rows?.[0]?.m ?? 0) + 1;

    const ins = await client.query(
      `
      INSERT INTO calls_queue (streamer_id, slot_name, slot_key, provider, user_id, username, pos)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, created_at AS "createdAt"
      `,
      [streamerId, slotName, slotKey, providerLower, userId, username, nextPos]
    );

    await client.query("COMMIT");

    const row = ins.rows?.[0];
    const id = String(row.id);

    return {
      ok: true,
      position: nextPos,
      item: {
        id,
        slotName,
        provider: providerLower ?? null,
        userId,
        username,
        pos: nextPos,
        createdAt: new Date(row.createdAt).toISOString(),
      },
    };
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    const msg = String(e?.message || "");
    if (msg.includes("calls_queue_unique_slot")) return { ok: false, error: "already_in_queue" };

    return { ok: false, error: "insert_failed" };
  } finally {
    client.release();
  }
}

export async function listCalls(pool: Pool, streamerId: number, limit: number, offset: number): Promise<CallItem[]> {
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
  const r = await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1 AND id=$2 RETURNING id`, [streamerId, id]);
  return !!r.rows?.[0];
}
