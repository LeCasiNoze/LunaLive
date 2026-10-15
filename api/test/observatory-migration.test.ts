import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { mig148_rumble_observatory } from "../src/db/migrations/mig148_rumble_observatory.js";
test("Postgres migration is idempotent and singleton enforces one row", async () => {
  const db = new PGlite();
  try {
    await mig148_rumble_observatory(db as any);
    await mig148_rumble_observatory(db as any);
    await db.query(
      "INSERT INTO rumble_observatory_snapshot(singleton,captured_at,payload) VALUES(true,NOW(),'{\"version\":1}'::jsonb)",
    );
    assert.equal(
      (
        await db.query(
          "SELECT COUNT(*)::int n FROM rumble_observatory_snapshot",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO rumble_observatory_snapshot(singleton,captured_at,payload) VALUES(false,NOW(),'{}'::jsonb)",
      ),
    );
    assert.ok(
      (await db.query("SELECT usage_out FROM rumble_observatory_snapshot"))
        .rows[0],
    );
  } finally {
    await db.close();
  }
});
