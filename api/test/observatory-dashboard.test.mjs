import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { dashboardMetrics } from "../scripts/observatory/dashboard-metrics.mjs";
const day = 86400000,
  now = Date.parse("2026-10-17T16:00:00Z");
function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE events(account TEXT,channel TEXT,at INTEGER,excluded INTEGER,resolved INTEGER,conversation INTEGER);CREATE TABLE points(channel TEXT,t INTEGER,p TEXT);CREATE TABLE followers(channel TEXT,t INTEGER,total INTEGER)",
  );
  return db;
}
test("period union deduplicates across sessions and excludes service/unresolved identities", () => {
  const db = setup(),
    add = db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)");
  for (const [account, excluded] of [
    ["a", 0],
    ["a", 0],
    ["b", 0],
    ["bot", 1],
  ])
    add.run(account, "alpha", now - 60000, excluded, 1, 1);
  add.run("foreign", "beta", now - 60000, 0, 1, 1);
  const m = dashboardMetrics(db, "alpha", now, now - day * 2);
  assert.equal(m.metrics.day.uniqueChatters, 2);
  assert.equal(m.metrics.day.messages, 3);
  assert.equal(m.metrics.day.conversation, 3);
  add.run("unresolved", "alpha", now - 1000, 0, 0, 1);
  assert.equal(
    dashboardMetrics(db, "alpha", now, now - day * 2).metrics.day
      .uniqueChatters,
    null,
  );
  db.close();
});
test("empty uncovered periods are unknown; retention and collection start remain explicit", () => {
  const db = setup();
  let m = dashboardMetrics(db, "alpha", now, now - day * 2);
  assert.equal(m.metrics.day.uniqueChatters, null);
  assert.equal(m.metrics.month.since, now - day * 2);
  assert.equal(m.metrics.month.retentionLimited, false);
  db.prepare("INSERT INTO points VALUES(?,?,?)").run(
    "alpha",
    now - 60000,
    JSON.stringify([now - 60000, 0, 0, 0, 0, 0, 1, 1, 0]),
  );
  m = dashboardMetrics(db, "alpha", now, now - day * 20);
  assert.equal(m.metrics.day.uniqueChatters, 0);
  assert.equal(m.metrics.month.since, now - day * 8);
  assert.equal(m.metrics.month.retentionLimited, true);
  assert.equal(m.growth, null);
  db.close();
});
test("follower growth requires 24h of actual observations and retains signed differences", () => {
  const db = setup(),
    add = db.prepare("INSERT INTO followers VALUES(?,?,?)");
  add.run("alpha", now - day, 10);
  add.run("alpha", now - 1, 30);
  assert.equal(dashboardMetrics(db, "alpha", now, now - day * 2).growth, null);
  add.run("alpha", now, 8);
  assert.deepEqual(dashboardMetrics(db, "alpha", now, now - day * 2).growth, {
    since: now - day,
    until: now,
    delta: -2,
  });
  db.close();
});
