import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { request } from "node:http";
import { gzipSync, gunzipSync } from "node:zlib";
import { observatoryRouter } from "../src/observatory/router.js";
const token = "test-only-".repeat(5),
  t = Date.now();
const cohort = {
  firstObserved: 0,
  evening: 0,
  j1: 0,
  j3: 0,
  matureEvening: 0,
  matureJ1: 0,
  matureJ3: 0,
};
const snapshot = {
  version: 1,
  startedAt: t - 60000,
  capturedAt: t,
  complete: false,
  status: "degraded",
  channels: [],
  latest: {
    all: [t, null, null, null, null, null, 0, 0, null],
    fr: [t, null, null, null, null, null, 0, 0, null],
  },
  series: { all: [], fr: [] },
  daily: { all: [], fr: [] },
  cohorts: { personal: cohort, automod: cohort, unknown: cohort },
  costs: {
    day: new Date(t).toISOString().slice(0, 10),
    rumbleBytes: 1,
    renderBytes: 0,
    nivoraBytes: 0,
    requests: 1,
    reconnects: 0,
    dbBytes: 8192,
    vpsDailyBudget: 209715200,
    apiDailyBudget: 20971520,
  },
};
function http(
  port: number,
  path: string,
  method = "GET",
  body?: Buffer,
  headers: Record<string, string> = {},
) {
  return new Promise<{ status: number; headers: any; body: Buffer }>(
    (resolve, reject) => {
      const r = request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/observatory" + path,
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (b) => chunks.push(b));
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      r.on("error", reject);
      if (body) r.write(body);
      r.end();
    },
  );
}
test("public diagnostics summarize only covered aggregates, without histories or participant data", async () => {
  const h = 3600000;
  const channel = (slug: string, coverage: number, active: number) => ({
    slug, name: slug, language: "unknown", languageConfidence: "unknown", mode: "unknown",
    firstSeen: t - 4 * h, lastSeen: t, sourceStart: null,
    latest: [t, 50, active, null, 2, 1, coverage, 1, active],
    history: [t - 3 * h, t - 2 * h].map(at => [at, 50, active, null, 2, 1, coverage, 1, active]),
    daily: [], sessions: [],
    recent: [[t,50,active,null,2,1,coverage,1,active]],
    metrics: Object.fromEntries(["day","week","month"].map(period=>[period,{since:t-4*h,until:t,retentionLimited:false,uniqueChatters:2,messages:3,conversation:2,followersFirst:null,followersLast:null}])),
  });
  const payload = {...snapshot, channels: [channel("flagged",1,1), channel("partial",0.5,0), channel("ordinary",1,8)]};
  const app = express();
  app.use("/observatory", observatoryRouter({query: async () => ({rows: [{payload}]})}, token));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  try {
    const response = await http((server.address() as any).port,"/snapshot","GET",undefined,{"accept-encoding":"gzip"});
    assert.equal(response.status,200);
    const summary = JSON.parse(gunzipSync(response.body).toString());
    assert.equal(summary.channels[0].diagnostics.coveredHours,2);
    assert.deepEqual(summary.channels[0].diagnostics.signals,[{code:"low_chat",hours:2,samples:2}]);
    assert.equal(summary.channels[1].diagnostics.coveredHours,0);
    assert.deepEqual(summary.channels[1].diagnostics.signals,[]);
    assert.equal(summary.channels[2].diagnostics.coveredHours,2);
    assert.deepEqual(summary.channels[2].diagnostics.signals,[]);
    assert.equal(summary.channels[0].history,undefined);
    assert.equal(summary.channels[0].sessions,undefined);
    assert.equal(summary.channels[0].recent,undefined);
    assert.equal(summary.channels[0].metrics,undefined);
    const detailResponse = await http((server.address() as any).port,"/channels/flagged","GET",undefined,{"accept-encoding":"gzip"});
    const detail = JSON.parse(gunzipSync(detailResponse.body).toString());
    assert.equal(detail.channel.history.length,2);
    assert.equal(detail.channel.metrics.day.uniqueChatters,2);
    assert.equal(detail.channel.recent.length,1);
    assert.deepEqual(detail.channel.diagnostics,summary.channels[0].diagnostics);
  } finally { server.close(); }
});
test("HTTP gzip ingestion, ETag, no message payload and one read per cache interval", async () => {
  let stored: any = null,
    reads = 0,
    writes = 0;
  const db = {
    query: async (sql: string, args?: any[]) => {
      if (sql.startsWith("SELECT")) {
        reads++;
        return { rows: stored ? [{ payload: stored }] : [] };
      }
      if (sql.startsWith("UPDATE")) return { rows: [] };
      writes++;
      if (!stored || args![0] > stored.capturedAt)
        stored = JSON.parse(args![1]);
      return { rows: [] };
    },
  };
  const app = express();
  app.use("/observatory", observatoryRouter(db, token));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  try {
    assert.equal(
      (
        await http(port, "/ingest", "POST", Buffer.from("{}"), {
          "content-type": "application/json",
        })
      ).status,
      401,
    );
    const ingest = await http(
      port,
      "/ingest",
      "POST",
      gzipSync(Buffer.from(JSON.stringify(snapshot))),
      {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
    );
    assert.equal(ingest.status, 204);
    assert.equal(writes, 1);
    const first = await http(port, "/snapshot", "GET", undefined, {
      "accept-encoding": "gzip",
    });
    assert.equal(first.status, 200);
    assert.equal(first.headers["content-encoding"], "gzip");
    const parsed = JSON.parse(gunzipSync(first.body).toString());
    assert.equal(parsed.capturedAt, t);
    assert.equal(parsed.raw, undefined);
    const second = await http(port, "/snapshot", "GET", undefined, {
      "if-none-match": first.headers.etag,
    });
    assert.equal(second.status, 304);
    assert.equal(second.body.length, 0);
    assert.equal(reads, 1);
    assert.equal((await http(port, "/channels/no-such-channel")).status, 404);
    assert.equal((await http(port, "/metrics")).status, 401);
    assert.equal(
      (
        await http(port, "/metrics", "GET", undefined, {
          authorization: "Bearer " + token,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await http(port, "/ingest", "POST", Buffer.from("{}"), {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        })
      ).status,
      429,
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});
test("strict schema rejects raw chat and missing counts", async () => {
  const app = express();
  app.use(
    "/observatory",
    observatoryRouter({ query: async () => ({ rows: [] }) }, token),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  try {
    const r = await http(
      port,
      "/ingest",
      "POST",
      Buffer.from(JSON.stringify({ ...snapshot, body: "private chat" })),
      { authorization: "Bearer " + token, "content-type": "application/json" },
    );
    assert.equal(r.status, 400);
  } finally {
    server.close();
  }
});

test("daily egress budget includes 304 headers and restores persisted usage", async () => {
  const before = process.env.OBSERVATORY_API_DAILY_BYTES;
  process.env.OBSERVATORY_API_DAILY_BYTES = "1024";
  let used = 0;
  const day = new Date().toISOString().slice(0, 10);
  const db = {
    query: async (sql: string, args?: any[]) => {
      if (sql.startsWith("SELECT"))
        return {
          rows: [{ payload: snapshot, usage_date: day, usage_out: used }],
        };
      if (sql.startsWith("UPDATE"))
        used = Math.max(used, Number(args?.[1]) || 0);
      return { rows: [] };
    },
  };
  const app = express();
  app.use("/observatory", observatoryRouter(db, token));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  try {
    const first = await http(port, "/snapshot", "GET", undefined, {
      "accept-encoding": "gzip",
    });
    assert.equal(first.status, 200);
    assert.ok(first.body.length + 512 <= 1024);
    assert.equal(
      (
        await http(port, "/snapshot", "GET", undefined, {
          "if-none-match": first.headers.etag,
        })
      ).status,
      429,
    );
    assert.ok(used > 0);
  } finally {
    server.close();
    if (before == null) delete process.env.OBSERVATORY_API_DAILY_BYTES;
    else process.env.OBSERVATORY_API_DAILY_BYTES = before;
  }
});

test("private discovery restores daily budget before triggering upstream", async () => {
  let upstreamCalls = 0;
  const db = {
    query: async () => ({
      rows: [
        {
          payload: snapshot,
          usage_date: new Date().toISOString().slice(0, 10),
          usage_out: 20971520,
        },
      ],
    }),
  };
  const app = express();
  app.use(
    "/observatory",
    observatoryRouter(db, token, async () => {
      upstreamCalls++;
      return { lives: new Map(), complete: true, fetchedAt: Date.now() };
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const result = await http(
      (server.address() as any).port,
      "/discovery",
      "GET",
      undefined,
      { authorization: "Bearer " + token },
    );
    assert.equal(result.status, 429);
    assert.equal(upstreamCalls, 0);
  } finally {
    server.close();
  }
});
