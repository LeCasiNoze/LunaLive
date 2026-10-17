import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { snapshotSchema, type Snapshot } from "./schema.js";
import { discoveryMetrics } from "./discovery-metrics.js";
import { anomaly } from "./core.js";
function publicDiagnostics(history: Snapshot["series"]["all"]) {
  const coveredHours = history.filter(p => p[6] >= 0.9 && p[1] != null && p[2] != null).length;
  return {
    coveredHours,
    since: history[0]?.[0] ?? null,
    until: history.at(-1)?.[0] ?? null,
    signals: anomaly(history).map(({code, hours, samples}) => ({code, hours, samples})),
  };
}
type Db = { query: (sql: string, params?: any[]) => Promise<any> };
export function observatoryRouter(
  db: Db,
  token = process.env.OBSERVATORY_INGEST_TOKEN ?? "",
  getDiscovery?: () => Promise<any>,
) {
  const r = express.Router();
  let current: Snapshot | null = null,
    loadedAt = 0,
    loading: Promise<void> | null = null,
    lastWrite = 0;
  let day = "",
    outBytes = 0,
    requests = 0,
    notModified = 0,
    ingestBytes = 0,
    lastUsageWrite = 0;
  const budget = Math.max(
    1024,
    Number(process.env.OBSERVATORY_API_DAILY_BYTES) || 20 * 1024 * 1024,
  );
  const cache = new Map<string, { raw: Buffer; gzip: Buffer; etag: string }>();
  const today = () => {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      outBytes = 0;
      requests = 0;
      notModified = 0;
      ingestBytes = 0;
    }
  };
  const authorized = (value: string) => {
    const a = Buffer.from(value),
      b = Buffer.from(token);
    return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
  };
  function account(bytes: number) {
    outBytes += bytes;
    if (Date.now() - lastUsageWrite >= 60000) {
      lastUsageWrite = Date.now();
      void db
        .query(
          "UPDATE rumble_observatory_snapshot SET usage_out=CASE WHEN usage_date=$1::date THEN GREATEST(usage_out,$2) ELSE $2 END,usage_date=$1::date WHERE singleton=true",
          [day, outBytes],
        )
        .catch(() => {});
    }
  }
  async function load() {
    if (Date.now() - loadedAt < 300000) return;
    if (loading) return loading;
    loading = (async () => {
      const result = await db.query(
        "SELECT payload,usage_date::text,usage_out FROM rumble_observatory_snapshot WHERE singleton=true",
      );
      if (result.rows[0]?.usage_date === day)
        outBytes = Math.max(outBytes, Number(result.rows[0].usage_out) || 0);
      const parsed = snapshotSchema.safeParse(result.rows[0]?.payload);
      current = parsed.success ? parsed.data : null;
      loadedAt = Date.now();
      cache.clear();
    })().finally(() => {
      loading = null;
    });
    return loading;
  }
  r.post(
    "/ingest",
    (req, res, next) => {
      if (!authorized(req.get("authorization")?.replace(/^Bearer /, "") ?? ""))
        return res.sendStatus(401);
      if (Date.now() - lastWrite < 240000)
        return res.status(429).set("Retry-After", "240").end();
      next();
    },
    express.json({ limit: "512kb", strict: true }),
    async (req, res) => {
      today();
      const parsed = snapshotSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "invalid_aggregate" });
      if (Buffer.byteLength(JSON.stringify(req.body)) > 524288)
        return res.sendStatus(413);
      if (Date.now() - lastWrite < 240000)
        return res.status(429).set("Retry-After", "240").end();
      const snap = parsed.data;
      lastWrite = Date.now();
      try {
        await db.query(
          `INSERT INTO rumble_observatory_snapshot(singleton,captured_at,payload) VALUES(true,to_timestamp($1/1000.0),$2::jsonb) ON CONFLICT(singleton) DO UPDATE SET captured_at=excluded.captured_at,payload=excluded.payload WHERE rumble_observatory_snapshot.captured_at<excluded.captured_at`,
          [snap.capturedAt, JSON.stringify(snap)],
        );
        // A stale/replayed batch never replaces the current public snapshot.
        if (!current || snap.capturedAt > current.capturedAt) {
          current = snap;
          cache.clear();
        }
        loadedAt = 0;
        ingestBytes +=
          Number(req.get("content-length")) ||
          Buffer.byteLength(JSON.stringify(req.body));
        return res.status(204).end();
      } catch {
        lastWrite = 0;
        return res.status(503).json({ error: "storage_unavailable" });
      }
    },
  );
  r.get("/discovery", async (req, res) => {
    if (!authorized(req.get("authorization")?.replace(/^Bearer /, "") ?? ""))
      return res.sendStatus(401);
    today();
    if (!getDiscovery) return res.sendStatus(503);
    const upstream = discoveryMetrics();
    const nivoraBudget =
      Number(process.env.OBSERVATORY_NIVORA_DAILY_BYTES) || 10 * 1024 * 1024;
    if (upstream.day === day && upstream.nivoraBytes >= nivoraBudget)
      return res.status(503).set("Retry-After", "3600").end();
    try {
      await load();
      if (outBytes + 512 > budget)
        return res.status(429).set("Retry-After", "3600").end();
      const source = await getDiscovery();
      if (!source) return res.status(503).set("Retry-After", "120").end();
      const lives = [...source.lives.values()].map((l: any) => ({
        username: l.username,
        videoId: l.videoId,
        videoIdNumeric: l.videoIdNumeric,
        viewersCount: l.viewersKnown === true ? l.viewersCount : null,
        title: typeof l.title === 'string' ? l.title.slice(0,160) : null,
        followers: l.followersKnown === true ? l.followers : null,
        createdAt: l.createdAt,
      }));
      const raw = Buffer.from(
        JSON.stringify({
          complete: source.complete,
          fetchedAt: source.fetchedAt,
          lives,
          upstream: discoveryMetrics(),
        }),
      );
      const gzip = gzipSync(raw);
      const compressed = !!req.acceptsEncodings("gzip");
      const body = compressed ? gzip : raw;
      if (outBytes + body.length + 512 > budget)
        return res.status(429).set("Retry-After", "3600").end();
      account(body.length + 512);
      res.set({ "Cache-Control": "no-store", Vary: "Accept-Encoding" });
      if (compressed) res.set("Content-Encoding", "gzip");
      return res.type("application/json").send(body);
    } catch {
      return res.status(503).set("Retry-After", "120").end();
    }
  });
  r.get("/diagnostics/:slug", async (req, res) => {
    if (!authorized(req.get("authorization")?.replace(/^Bearer /, "") ?? ""))
      return res.sendStatus(401);
    res.set("Cache-Control", "no-store");
    try {
      await load();
    } catch {
      return res.sendStatus(503);
    }
    const channel = current?.channels.find((c) => c.slug === req.params.slug);
    if (!channel) return res.sendStatus(404);
    return res.json({
      capturedAt: current!.capturedAt,
      slug: channel.slug,
      signals: anomaly(channel.history),
      note: "Diagnostic descriptif réservé au propriétaire. Aucun verdict ni taux de bots.",
    });
  });
  r.get("/metrics", (req, res) => {
    if (!authorized(req.get("authorization")?.replace(/^Bearer /, "") ?? ""))
      return res.sendStatus(401);
    today();
    res.set("Cache-Control", "no-store").json({
      day,
      outBytes,
      requests,
      notModified,
      ingestBytes,
      budget,
      note: "application bytes, per API process; excludes headers/CDN/assets",
    });
  });
  r.get(["/snapshot", "/channels/:slug"], async (req, res) => {
    today();
    requests++;
    res.set({
      "Cache-Control": "public, max-age=300, stale-if-error=900",
      "Access-Control-Expose-Headers":
        "ETag, X-Observatory-Captured-At, Retry-After",
      Vary: "Accept-Encoding",
    });
    try {
      await load();
    } catch {
      return res
        .status(503)
        .set("Cache-Control", "no-store")
        .json({ error: "storage_unavailable" });
    }
    const slug = req.params.slug;
    if (slug && !/^[a-z0-9_-]{1,64}$/.test(slug)) return res.sendStatus(400);
    const key = slug ?? "snapshot";
    let entry = cache.get(key);
    if (!entry) {
      const channel = slug
        ? current?.channels.find((c) => c.slug === slug)
        : null;
      if (slug && !channel)
        return res
          .status(404)
          .set("Cache-Control", "public, max-age=300")
          .end();
      const value = slug
        ? {
            capturedAt: current!.capturedAt,
            channel: { ...channel, diagnostics: publicDiagnostics(channel!.history) },
          }
        : current
          ? {
              ...current,
              channels: current.channels.map(
                ({ history, daily, sessions, metrics, recent, ...c }) => ({...c, diagnostics: publicDiagnostics(history)}),
              ),
              costs: { ...current.costs, apiDailyBudget: budget },
            }
          : {
              version: 1,
              startedAt: null,
              capturedAt: null,
              status: "awaiting_collection",
              complete: false,
              channels: [],
              latest: null,
              series: { all: [], fr: [] },
              daily: { all: [], fr: [] },
              cohorts: null,
              costs: null,
            };
      const raw = Buffer.from(JSON.stringify(value));
      const gzip = gzipSync(raw);
      entry = {
        raw,
        gzip,
        etag:
          '"' +
          createHash("sha256").update(raw).digest("hex").slice(0, 24) +
          '"',
      };
      if (gzip.length > (slug ? 16384 : 24576))
        return res
          .status(503)
          .set("Cache-Control", "no-store")
          .json({ error: "public_snapshot_budget" });
      cache.set(key, entry);
    }
    res.set("ETag", entry.etag);
    if (current)
      res.set("X-Observatory-Captured-At", String(current.capturedAt));
    if (req.get("if-none-match")?.split(/,\s*/).includes(entry.etag)) {
      if (outBytes + 512 > budget)
        return res
          .status(429)
          .set({ "Retry-After": "3600", "Cache-Control": "no-store" })
          .end();
      account(512);
      notModified++;
      return res.status(304).end();
    }
    const gzip = !!req.acceptsEncodings("gzip");
    const body = gzip ? entry.gzip : entry.raw;
    // Counter is conservative about compressed bodies and includes a 512-byte header allowance.
    if (outBytes + body.length + 512 > budget)
      return res
        .status(429)
        .set({ "Retry-After": "3600", "Cache-Control": "no-store" })
        .end();
    account(body.length + 512);
    if (gzip) res.set("Content-Encoding", "gzip");
    res.type("application/json").send(body);
  });
  return r;
}
