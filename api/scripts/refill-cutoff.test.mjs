import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

function bridge(fetch, enabled = true) {
  const source = stripTypeScriptTypes(fs.readFileSync(new URL("../src/aurix/nivora_refills.ts", import.meta.url), "utf8")).replace(/^export /gm, "");
  const context = { fetch, AbortSignal, console, process: { env: {
    NIVORA_REFILLS_VIA_AURIX: enabled ? "1" : "0", NIVORA_API_BASE: "https://nivora.test", NIVORA_BOT_INTERNAL_KEY: "test",
  } } };
  vm.runInNewContext(source + "\nglobalThis.run = pendingNivoraRefills;", context);
  return context.run;
}
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });

test("bridge asks for due batches only and bounds request time", async () => {
  const pending = bridge(async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.action, "refill-batch");
    assert.equal(body.includeFuture, false);
    assert.ok(init.signal instanceof AbortSignal);
    return response({ empty: true });
  });
  assert.equal(await pending(), null);
  assert.equal(await bridge(() => assert.fail("disabled bridge must not fetch"), false)(), null);
});

test("bridge errors and malformed JSON are never an empty queue", async () => {
  await assert.rejects(bridge(async () => response({ error: "database unavailable" }, false)), /database unavailable/);
  await assert.rejects(bridge(async () => response({})), /Invalid Nivora/);
  await assert.rejects(bridge(async () => response({ batch: { id: null }, requests: [] })), /Invalid Nivora/);
  await assert.rejects(bridge(async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } })), /bad JSON/);
});

test("a claimed zero-request batch is explicitly discarded, not left locked", async () => {
  const actions = [];
  const pending = bridge(async (_url, init) => {
    const body = JSON.parse(init.body); actions.push(body.action);
    return response(body.action === "refill-batch" ? { batch: { id: "batch" }, requests: [] } : { ok: true });
  });
  assert.equal(await pending(), null);
  assert.deepEqual(actions, ["refill-batch", "discard-empty-refill-batch"]);
});

function cutoffFixture({ failBridge = false, noStaff = false, noGuild = false, noRequests = false } = {}) {
  const source = fs.readFileSync(new URL("../src/aurix/refill.ts", import.meta.url), "utf8");
  const fragment = source.slice(source.indexOf("async function triggerCutoff("), source.indexOf("function fmtDayDateFr("));
  const code = stripTypeScriptTypes(fragment).replace('await import("./telegram.js")', "telegram");
  const batch = { id: 139, status: "open", cutoff_at: new Date("2026-10-01T02:00:00Z") };
  const counters = { sends: 0, marks: 0, next: 0, claims: 0, reopen: 0, auto: 0, payload: null };
  const guild = { channels: { cache: new Map(noStaff ? [] : [["staff", { type: 0, send: async () => {} }]]) }, members: { fetch: async () => ({ displayName: "Streamer" }) } };
  const client = { guilds: { cache: { get: () => noGuild ? undefined : guild, first: () => noGuild ? undefined : guild } } };
  class Embed { setTitle() { return this; } setDescription() { return this; } setColor() { return this; } setFooter() { return this; } }
  const context = { console: { log() {} }, Date,
    log: () => {}, loadEnv: () => ({ GUILD_ID: "guild" }),
    one: async () => { counters.claims++; return batch.status === "open" ? { id: batch.id } : null; },
    query: async sql => {
      if (sql.includes("status='open'")) counters.reopen++;
    },
    refreshBatchMessage: async () => {}, injectAutoRefills: async () => { counters.auto++; },
    getRequests: async () => [],
    pendingNivoraRefills: async () => {
      if (failBridge) throw new Error("Nivora API failed");
      return noRequests ? null : { id: "nivora-batch", requests: [
        { amount: 250, casino_username: "A", casino_email: "a@example.test" },
        { amount: 500, casino_username: "B", casino_email: "b@example.test" },
      ] };
    },
    markNivoraBatchSent: async () => { counters.marks++; },
    ensureOpenBatch: async () => { counters.next++; },
    kvGet: async key => key === "channel_staff_chat_id" ? "staff" : null,
    getAccount: async () => null, buildPlainListForManager: () => "", summarizeAmounts: () => "0",
    EmbedBuilder: Embed, cfg: { COLOR: { WARNING: 0 }, BRAND: { NAME: "Aurix" }, DEFAULTS: { REFILL_FIXED_AMOUNT: "500€" } },
    withTimeout: p => p, fmtDayDateFr: () => "jeudi 01/10/2026", tz: () => "Europe/Paris",
    telegram: { sendRefillBatchToTelegram: async payload => { counters.sends++; counters.payload=payload; return { ok: true }; } },
    notifyRequestersTransmitted: async () => {},
  };
  vm.runInNewContext(code + "\nglobalThis.run = triggerCutoff;", context);
  return { batch, counters, run: () => context.run(client, batch) };
}

test("failed Nivora preparation reopens the same Aurix batch without sending or advancing the day", async () => {
  const f = cutoffFixture({ failBridge: true });
  await f.run();
  assert.equal(f.batch.status, "open");
  assert.equal(f.counters.reopen, 1);
  assert.equal(f.counters.sends, 0);
  assert.equal(f.counters.next, 0);
  await f.run();
  assert.equal(f.counters.reopen, 2);
  assert.equal(f.counters.sends, 0);
});

test("a Nivora-only shared batch sends 2 requests for EUR750 exactly once, even without staff chat", async () => {
  for (const noStaff of [false, true]) {
    const f = cutoffFixture({ noStaff });
    await f.run();
    assert.equal(f.counters.sends, 1);
    assert.equal(f.counters.marks, 1);
    assert.equal(f.counters.payload.count, 2);
    assert.deepEqual(Array.from(f.counters.payload.items, r => r.amount), ["EUR 250.00", "EUR 500.00"]);
    assert.equal(f.batch.status, "locked");
    await f.run();
    assert.equal(f.counters.sends, 1);
  }
});

test("no Discord guild does not claim a batch, and a genuinely empty queue rolls forward without a message", async () => {
  const absent = cutoffFixture({ noGuild: true }); await absent.run();
  assert.equal(absent.counters.claims, 0);
  assert.equal(absent.batch.status, "open");
  const empty = cutoffFixture({ noRequests: true }); await empty.run();
  assert.equal(empty.counters.sends, 0);
  assert.equal(empty.batch.status, "sent");
  assert.equal(empty.counters.next, 1);
});
