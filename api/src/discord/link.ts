// api/src/discord/link.ts
import { pool } from "../db.js";
import type { BotCtx } from "./utils.ts";
import { genCode, getTtlMin, hashCode } from "./utils.js";

export async function createLinkCode(discordUserId: string, ctx: BotCtx) {
  const code = genCode(6);
  const codeHash = hashCode(code, ctx);
  const ttl = getTtlMin();
  const expiresAt = new Date(Date.now() + ttl * 60_000);

  await pool.query(
    `
    INSERT INTO discord_link_codes (discord_user_id, code_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [discordUserId, codeHash, expiresAt.toISOString()]
  );

  return { code, expiresAt };
}

export async function getLinkedUser(discordUserId: string) {
  try {
    const r = await pool.query(
      `
      SELECT u.id, u.username, u.role, u.email
      FROM discord_links dl
      JOIN users u ON u.id = dl.user_id
      WHERE dl.discord_user_id = $1
      LIMIT 1
      `,
      [discordUserId]
    );
    return r.rows?.[0] || null;
  } catch {
    const r = await pool.query(
      `
      SELECT u.id, u.username, u.role
      FROM discord_links dl
      JOIN users u ON u.id = dl.user_id
      WHERE dl.discord_user_id = $1
      LIMIT 1
      `,
      [discordUserId]
    );
    return r.rows?.[0] || null;
  }
}
