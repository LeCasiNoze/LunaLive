// api/src/discord/link.ts
import { pool } from "../db.js";
import type {Pool} from 'pg';
import {discordIdentityBindingsSql} from '../community/external-accounts.js';
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

export async function getLinkedUser(discordUserId: string,db:Pick<Pool,'query'>=pool) {
 const result=await db.query(`SELECT DISTINCT u.id,u.username,u.role FROM users u JOIN (
  SELECT user_id FROM (${discordIdentityBindingsSql}) bindings WHERE discord_user_id=$1
 ) linked ON linked.user_id=u.id LIMIT 2`,[discordUserId]);
 return result.rows.length===1?result.rows[0]:null;
}
