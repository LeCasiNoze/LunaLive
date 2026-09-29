import { createHash } from "node:crypto";
import type { Pool } from "pg";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Redeem the short-lived, account-created linking code from the Rumble bridge. */
export async function redeemRumbleCallLinkCode(
  pool: Pool,
  streamerId: number,
  rumbleUserId: string,
  rumbleUsername: string,
  rawCode: string,
): Promise<boolean> {
  const code = String(rawCode || "").trim().replace(/\s+/g, "");
  if (!/^\d{8}$/.test(code) || !rumbleUserId) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM rumble_call_link_codes
        WHERE code_hash=$1 AND streamer_id=$2 AND expires_at > NOW()
        RETURNING user_id`,
      [sha256(code), streamerId],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO rumble_call_links(user_id, streamer_id, rumble_user_id, rumble_username)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET
         streamer_id=EXCLUDED.streamer_id,
         rumble_user_id=EXCLUDED.rumble_user_id,
         rumble_username=EXCLUDED.rumble_username,
         linked_at=NOW()`,
      [result.rows[0].user_id, streamerId, rumbleUserId, rumbleUsername.slice(0, 80)],
    );
    // Associate any still-pending calls created before this feature. The Rumble
    // author ID is authoritative for new calls; for older rows we only adopt the
    // exact username supplied by the message that redeemed this single-use code.
    await client.query(
      `UPDATE calls_queue SET rumble_user_id=$3
        WHERE streamer_id=$1 AND user_id=0 AND rumble_user_id IS NULL
          AND lower(username)=lower($2) AND bet IS NULL AND pay IS NULL
          AND COALESCE(is_bonus,FALSE)=FALSE`,
      [streamerId, rumbleUsername, rumbleUserId],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.warn("[rumble_call_link] redeem failed", error instanceof Error ? error.message : "unknown");
    return false;
  } finally {
    client.release();
  }
}
