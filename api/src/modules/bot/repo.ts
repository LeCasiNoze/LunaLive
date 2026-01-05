import type { Pool } from "pg";

export type MyStreamer = {
  id: number;
  slug: string;
};

export type BotCommandRow = {
  id: string;
  trigger: string;
  response: string;
  enabled: boolean;
  cooldownSec: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BotAutopostRow = {
  id: string;
  message: string;
  everySec: number;
  enabled: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BotLogRow = {
  id: string;
  level: string;
  message: string;
  meta: any;
  createdAt: string;
};

function isMissingTable(e: any) {
  return String(e?.code || "") === "42P01";
}

function isUndefinedColumn(e: any) {
  return String(e?.code || "") === "42703"; // undefined_column
}

// Récupère le streamer “du user” (owner). MVP : 1 streamer owner.
export async function getMyStreamer(pool: Pool, userId: number): Promise<MyStreamer | null> {
  const tries: { sql: string; args: any[] }[] = [
    // ✅ cas très fréquent: users.streamer_id -> streamers.id
    {
      sql: `SELECT s.id, s.slug
            FROM users u
            JOIN streamers s ON s.id = u.streamer_id
            WHERE u.id = $1
            LIMIT 1`,
      args: [userId],
    },

    // owner_user_id (chez toi ça crash, mais on le tente si ça existe sur d'autres env)
    {
      sql: `SELECT id, slug
            FROM streamers
            WHERE owner_user_id = $1
            ORDER BY id ASC
            LIMIT 1`,
      args: [userId],
    },

    // user_id
    {
      sql: `SELECT id, slug
            FROM streamers
            WHERE user_id = $1
            ORDER BY id ASC
            LIMIT 1`,
      args: [userId],
    },

    // table de liaison possible
    {
      sql: `SELECT s.id, s.slug
            FROM streamer_users su
            JOIN streamers s ON s.id = su.streamer_id
            WHERE su.user_id = $1
            ORDER BY s.id ASC
            LIMIT 1`,
      args: [userId],
    },

    {
      sql: `SELECT s.id, s.slug
            FROM streamer_members sm
            JOIN streamers s ON s.id = sm.streamer_id
            WHERE sm.user_id = $1
            ORDER BY s.id ASC
            LIMIT 1`,
      args: [userId],
    },
  ];

  for (const t of tries) {
    try {
      const r = await pool.query(t.sql, t.args);
      return r.rows[0] ?? null;
    } catch (e: any) {
      // on teste l'alternative si table/colonne n'existe pas
      if (isMissingTable(e) || isUndefinedColumn(e)) continue;
      throw e;
    }
  }

  return null;
}


/* Commands */
export async function listCommands(pool: Pool, streamerId: number): Promise<BotCommandRow[]> {
  try {
    const r = await pool.query(
      `SELECT
         id::text AS id,
         trigger,
         response,
         enabled,
         COALESCE(cooldown_sec, 3) AS "cooldownSec",
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"
       FROM bot_commands
       WHERE streamer_id = $1
       ORDER BY trigger ASC`,
      [streamerId]
    );
    return r.rows.map((x) => ({
      id: String(x.id),
      trigger: String(x.trigger ?? ""),
      response: String(x.response ?? ""),
      enabled: Boolean(x.enabled),
      cooldownSec: Number(x.cooldownSec ?? 3),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    }));
  } catch (e: any) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function createCommand(
  pool: Pool,
  streamerId: number,
  data: { trigger: string; response: string; enabled: boolean; cooldownSec: number }
): Promise<BotCommandRow> {
  try {
    const existing = await pool.query(
      `SELECT id::text AS id
       FROM bot_commands
       WHERE streamer_id=$1 AND trigger=$2
       LIMIT 1`,
      [streamerId, data.trigger]
    );

    if (existing.rows[0]?.id) {
      const id = String(existing.rows[0].id);
      return await patchCommand(pool, streamerId, id, data);
    }

    const r = await pool.query(
      `INSERT INTO bot_commands (streamer_id, trigger, response, enabled, cooldown_sec, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING
         id::text AS id,
         trigger, response, enabled,
         COALESCE(cooldown_sec, 3) AS "cooldownSec",
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"`,
      [streamerId, data.trigger, data.response, data.enabled, data.cooldownSec]
    );

    const x = r.rows[0];
    return {
      id: String(x.id),
      trigger: String(x.trigger ?? ""),
      response: String(x.response ?? ""),
      enabled: Boolean(x.enabled),
      cooldownSec: Number(x.cooldownSec ?? 3),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    };
  } catch (e: any) {
    if (isMissingTable(e)) {
      throw Object.assign(new Error("BOT_TABLE_MISSING:bot_commands"), { status: 501 });
    }
    throw e;
  }
}

export async function patchCommand(
  pool: Pool,
  streamerId: number,
  id: string,
  patch: Partial<{ trigger: string; response: string; enabled: boolean; cooldownSec: number }>
): Promise<BotCommandRow> {
  try {
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (patch.trigger != null) {
      fields.push(`trigger=$${i++}`);
      vals.push(patch.trigger);
    }
    if (patch.response != null) {
      fields.push(`response=$${i++}`);
      vals.push(patch.response);
    }
    if (patch.enabled != null) {
      fields.push(`enabled=$${i++}`);
      vals.push(patch.enabled);
    }
    if (patch.cooldownSec != null) {
      fields.push(`cooldown_sec=$${i++}`);
      vals.push(patch.cooldownSec);
    }

    fields.push(`updated_at=NOW()`);

    vals.push(streamerId);
    vals.push(id);

    const r = await pool.query(
      `UPDATE bot_commands
       SET ${fields.join(", ")}
       WHERE streamer_id=$${i++} AND id=$${i++}
       RETURNING
         id::text AS id,
         trigger, response, enabled,
         COALESCE(cooldown_sec, 3) AS "cooldownSec",
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"`,
      vals
    );

    const x = r.rows[0];
    if (!x) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

    return {
      id: String(x.id),
      trigger: String(x.trigger ?? ""),
      response: String(x.response ?? ""),
      enabled: Boolean(x.enabled),
      cooldownSec: Number(x.cooldownSec ?? 3),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    };
  } catch (e: any) {
    if (isMissingTable(e)) throw Object.assign(new Error("BOT_TABLE_MISSING:bot_commands"), { status: 501 });
    throw e;
  }
}

export async function deleteCommand(pool: Pool, streamerId: number, id: string) {
  try {
    const r = await pool.query(
      `DELETE FROM bot_commands
       WHERE streamer_id=$1 AND id=$2`,
      [streamerId, id]
    );
    return { deleted: (r.rowCount ?? 0) > 0 };
  } catch (e: any) {
    if (isMissingTable(e)) return { deleted: false };
    throw e;
  }
}

/* Autoposts */
export async function listAutoposts(pool: Pool, streamerId: number): Promise<BotAutopostRow[]> {
  try {
    const r = await pool.query(
      `SELECT
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"
       FROM bot_autoposts
       WHERE streamer_id = $1
       ORDER BY id ASC`,
      [streamerId]
    );
    return r.rows.map((x) => ({
      id: String(x.id),
      message: String(x.message ?? ""),
      everySec: Number(x.everySec ?? 0),
      enabled: Boolean(x.enabled),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    }));
  } catch (e: any) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function createAutopost(
  pool: Pool,
  streamerId: number,
  data: { message: string; everySec: number; enabled: boolean }
): Promise<BotAutopostRow> {
  try {
    const r = await pool.query(
      `INSERT INTO bot_autoposts (streamer_id, message, every_sec, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"`,
      [streamerId, data.message, data.everySec, data.enabled]
    );
    const x = r.rows[0];
    return {
      id: String(x.id),
      message: String(x.message ?? ""),
      everySec: Number(x.everySec ?? 0),
      enabled: Boolean(x.enabled),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    };
  } catch (e: any) {
    if (isMissingTable(e)) throw Object.assign(new Error("BOT_TABLE_MISSING:bot_autoposts"), { status: 501 });
    throw e;
  }
}

export async function patchAutopost(
  pool: Pool,
  streamerId: number,
  id: string,
  patch: Partial<{ message: string; everySec: number; enabled: boolean }>
): Promise<BotAutopostRow> {
  try {
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (patch.message != null) {
      fields.push(`message=$${i++}`);
      vals.push(patch.message);
    }
    if (patch.everySec != null) {
      fields.push(`every_sec=$${i++}`);
      vals.push(patch.everySec);
    }
    if (patch.enabled != null) {
      fields.push(`enabled=$${i++}`);
      vals.push(patch.enabled);
    }

    fields.push(`updated_at=NOW()`);

    vals.push(streamerId);
    vals.push(id);

    const r = await pool.query(
      `UPDATE bot_autoposts
       SET ${fields.join(", ")}
       WHERE streamer_id=$${i++} AND id=$${i++}
       RETURNING
         id::text AS id,
         message,
         every_sec AS "everySec",
         enabled,
         created_at::text AS "createdAt",
         updated_at::text AS "updatedAt"`,
      vals
    );

    const x = r.rows[0];
    if (!x) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

    return {
      id: String(x.id),
      message: String(x.message ?? ""),
      everySec: Number(x.everySec ?? 0),
      enabled: Boolean(x.enabled),
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
    };
  } catch (e: any) {
    if (isMissingTable(e)) throw Object.assign(new Error("BOT_TABLE_MISSING:bot_autoposts"), { status: 501 });
    throw e;
  }
}

export async function deleteAutopost(pool: Pool, streamerId: number, id: string) {
  try {
    const r = await pool.query(
      `DELETE FROM bot_autoposts
       WHERE streamer_id=$1 AND id=$2`,
      [streamerId, id]
    );
    return { deleted: (r.rowCount ?? 0) > 0 };
  } catch (e: any) {
    if (isMissingTable(e)) return { deleted: false };
    throw e;
  }
}

/* Logs (essaie bot_logs puis bot_events) */
export async function listLogs(pool: Pool, streamerId: number, limit: number): Promise<BotLogRow[]> {
  const q1 = `SELECT id::text AS id, level, message, meta, created_at::text AS "createdAt"
              FROM bot_logs
              WHERE streamer_id=$1
              ORDER BY id DESC
              LIMIT $2`;
  const q2 = `SELECT id::text AS id, level, message, meta, created_at::text AS "createdAt"
              FROM bot_events
              WHERE streamer_id=$1
              ORDER BY id DESC
              LIMIT $2`;

  try {
    const r = await pool.query(q1, [streamerId, limit]);
    return r.rows.map((x) => ({
      id: String(x.id),
      level: String(x.level ?? "info"),
      message: String(x.message ?? ""),
      meta: x.meta ?? null,
      createdAt: String(x.createdAt ?? ""),
    }));
  } catch (e: any) {
    if (!isMissingTable(e)) throw e;
  }

  try {
    const r = await pool.query(q2, [streamerId, limit]);
    return r.rows.map((x) => ({
      id: String(x.id),
      level: String(x.level ?? "info"),
      message: String(x.message ?? ""),
      meta: x.meta ?? null,
      createdAt: String(x.createdAt ?? ""),
    }));
  } catch (e: any) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function clearLogs(pool: Pool, streamerId: number) {
  try {
    await pool.query(`DELETE FROM bot_logs WHERE streamer_id=$1`, [streamerId]);
    return { ok: true, table: "bot_logs" as const };
  } catch (e: any) {
    if (!isMissingTable(e)) throw e;
  }

  try {
    await pool.query(`DELETE FROM bot_events WHERE streamer_id=$1`, [streamerId]);
    return { ok: true, table: "bot_events" as const };
  } catch (e: any) {
    if (isMissingTable(e)) return { ok: true, table: null };
    throw e;
  }
}

/* Test-send : outbox (Phase D) */
export async function enqueueTestSend(pool: Pool, streamerId: number, body: string) {
  try {
    const r = await pool.query(
      `INSERT INTO bot_outbox (streamer_id, body, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id::text AS id`,
      [streamerId, body]
    );
    return { id: String(r.rows[0]?.id ?? "") };
  } catch (e: any) {
    if (isMissingTable(e)) {
      throw Object.assign(new Error("BOT_TABLE_MISSING:bot_outbox"), { status: 501 });
    }
    throw e;
  }
}
