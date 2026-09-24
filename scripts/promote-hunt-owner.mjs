// Explicit, transactional operator action. Existing personal data is retained.
// node --env-file=/path/to/api/.env scripts/promote-hunt-owner.mjs USER_ID MOD_ID SLUG DISPLAY_NAME [--apply]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../api/package.json", import.meta.url));
const { Client } = require("pg");
const [userArg, modArg, slug, displayName, apply] = process.argv.slice(2);
const userId = Number(userArg), modId = Number(modArg);
assert(Number.isInteger(userId) && userId > 0 && Number.isInteger(modId) && modId > 0);
assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "") && displayName?.trim());
assert(!apply || apply === "--apply");
const keyText = (s) => String(s).normalize("NFKC").replace(/\u2019/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const user = (await client.query("SELECT id,username,role FROM users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
  const mod = (await client.query("SELECT id,username,role FROM users WHERE id=$1", [modId])).rows[0];
  assert(user?.role === "viewer", "Only a confirmed viewer may be promoted by this operation");
  assert(mod && modId !== userId, "Moderator not found");
  assert.equal((await client.query("SELECT 1 FROM streamers WHERE user_id=$1 OR slug=$2", [userId, slug])).rowCount, 0, "Existing channel: manual reconciliation required");
  const session = (await client.query("SELECT * FROM hunt_sessions WHERE user_id=$1 FOR UPDATE", [userId])).rows[0];
  assert(session, "Personal hunt missing");
  // Prevent additions as well as edits while taking the transfer snapshot.
  if (apply) await client.query("LOCK TABLE hunt_session_items IN SHARE ROW EXCLUSIVE MODE");
  const items = (await client.query("SELECT * FROM hunt_session_items WHERE user_id=$1 ORDER BY pos,id FOR UPDATE", [userId])).rows;
  assert(items.length > 0 && items.length <= 500);
  assert.equal(new Set(items.map(x => keyText(x.name))).size, items.length, "Duplicate slots need manual reconciliation");
  const preview = { userId, moderator: mod.username, slug, phase: session.phase, start: session.start, items: items.length };
  if (!apply) {
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ dryRun: true, ...preview }));
  } else {
    const snapshot = { phase: session.phase, opened: session.opened, start: session.start, archive_id: session.archive_id, items, promotion: { source: "personal", targetSlug: slug, betDefault: session.bet_default } };
    const archive = (await client.query(`INSERT INTO hunt_archives(user_id,title,start,total_pay,items_count,snapshot)
      VALUES($1,$2,$3,(SELECT SUM(pay) FROM hunt_session_items WHERE user_id=$1),$4,$5::jsonb) RETURNING id`,
      [userId, "Sauvegarde avant passage en streamer", session.start, items.length, JSON.stringify(snapshot)])).rows[0];
    const streamer = (await client.query(`INSERT INTO streamers(slug,display_name,user_id,platform,is_live)
      VALUES($1,$2,$3,'rumble',false) RETURNING id`, [slug, displayName, userId])).rows[0];
    await client.query("UPDATE users SET role='streamer' WHERE id=$1", [userId]);
    await client.query(`INSERT INTO streamer_requests(user_id,status) VALUES($1,'approved')
      ON CONFLICT(user_id) DO UPDATE SET status='approved',updated_at=NOW()`, [userId]);
    await client.query(`INSERT INTO streamer_mods(streamer_id,user_id,created_by,created_at)
      VALUES($1,$2,$2,NOW())`, [streamer.id, modId]);
    await client.query(`INSERT INTO calls_settings(streamer_id,enabled,sync_hunt) VALUES($1,true,true)`, [streamer.id]);
    await client.query(`INSERT INTO calls_hunt_sessions(streamer_id,mode,opened,start,bet_default,archive_id)
      VALUES($1,$2,$3,$4,$5,$6)`, [streamer.id, session.phase === "edit" ? "farm" : session.phase, session.opened, session.start, session.bet_default, session.archive_id]);
    for (const item of items) {
      await client.query(`INSERT INTO calls_queue(streamer_id,slot_name,slot_key,provider,user_id,username,pos,bet,pay,bounty,is_bonus,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
        [streamer.id, item.name, keyText(item.name), item.provider, userId, item.caller || displayName, item.pos, item.bet, item.pay, item.bounty, item.created_at]);
    }
    const copied = (await client.query("SELECT slot_name AS name,pos,bet,pay,bounty FROM calls_queue WHERE streamer_id=$1 ORDER BY pos,id", [streamer.id])).rows;
    assert.deepEqual(copied.map(x => ({...x,pos:Number(x.pos)})), items.map(({name,pos,bet,pay,bounty}) => ({name,pos,bet,pay,bounty})), "Transfer mismatch; rollback");
    assert.equal((await client.query("SELECT start FROM calls_hunt_sessions WHERE streamer_id=$1", [streamer.id])).rows[0].start, session.start);
    await client.query("COMMIT");
    console.log(JSON.stringify({ applied: true, ...preview, streamerId: streamer.id, safetyArchiveId: archive.id, originalPersonalHuntRetained: true }));
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
