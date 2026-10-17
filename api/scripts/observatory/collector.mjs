// Node >=22.16. Explicitly started by its dedicated systemd service, never by the API.
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, stat, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { readPublicChat } from "../../dist/observatory/sse.js";
import {
  Activity,
  summarize,
  MINUTE,
  HOUR,
  paris,
  firstObservedReport,
} from "../../dist/observatory/core.js";
import { snapshotSchema } from "../../dist/observatory/schema.js";
import { dashboardMetrics } from './dashboard-metrics.mjs';

export async function runCollector(env = process.env) {
  const dir = resolve(
    env.OBSERVATORY_DATA_DIR || "/var/lib/rumble-observatory",
  );
  const secret = env.OBSERVATORY_HMAC_KEY || "",
    token = env.OBSERVATORY_INGEST_TOKEN || "";
  const endpoint = new URL(
    env.OBSERVATORY_API_URL ||
      "https://lunalive-api.onrender.com/observatory/ingest",
  );
  if (secret.length < 32 || token.length < 32 || endpoint.protocol !== "https:")
    throw new Error("collector_config_missing");
  const configFile =
    env.OBSERVATORY_CONFIG || "/etc/rumble-observatory/config.json";
  let configText = await readFile(configFile, "utf8");
  const cfg = JSON.parse(configText);
  cfg.bots = (cfg.bots || []).map((x) => x.toLowerCase());
  const discoveryUrl = env.OBSERVATORY_DISCOVERY_URL
    ? new URL(env.OBSERVATORY_DISCOVERY_URL)
    : new URL("./discovery", endpoint);
  if (
    discoveryUrl.protocol !== "https:" ||
    discoveryUrl.origin !== endpoint.origin
  )
    throw new Error("discovery_origin");
  const maxBytes = Number(env.OBSERVATORY_VPS_DAILY_BYTES) || 200 * 1024 * 1024;
  const maxDb = Number(env.OBSERVATORY_DB_BYTES) || 256 * 1024 * 1024;
  const maxChats = Math.max(
    1,
    Math.min(256, Number(env.OBSERVATORY_MAX_CHATS) || 64),
  );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Atomic in-process guard also protects manual starts; systemd adds flock.
  const pidFile = join(dir, "collector.pid");
  async function acquire() {
    try {
      const lock = await open(pidFile, "wx", 0o600);
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      await lock.close();
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const previous = JSON.parse(await readFile(pidFile, "utf8"));
      if (!Number.isInteger(previous.pid) || previous.pid < 1)
        throw new Error("invalid_collector_lock");
      let alive = true;
      try {
        process.kill(previous.pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") alive = false;
      }
      if (alive) throw new Error("collector_already_running");
      await unlink(pidFile);
      const lock = await open(pidFile, "wx", 0o600);
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      await lock.close();
    }
  }
  await acquire();
  const db = new DatabaseSync(join(dir, "observatory.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000; PRAGMA secure_delete=ON; PRAGMA auto_vacuum=INCREMENTAL;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS state(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,account TEXT NOT NULL,channel TEXT NOT NULL,at INTEGER NOT NULL,conversation INTEGER NOT NULL,excluded INTEGER NOT NULL,resolved INTEGER NOT NULL,mode TEXT NOT NULL,video TEXT); CREATE INDEX IF NOT EXISTS event_time ON events(at); CREATE INDEX IF NOT EXISTS event_cohort ON events(channel,account,at); CREATE TABLE IF NOT EXISTS points(channel TEXT NOT NULL,t INTEGER NOT NULL,p TEXT NOT NULL,PRIMARY KEY(channel,t)); CREATE TABLE IF NOT EXISTS hourly(channel TEXT NOT NULL,t INTEGER NOT NULL,p TEXT NOT NULL,PRIMARY KEY(channel,t)); CREATE TABLE IF NOT EXISTS daily(channel TEXT NOT NULL,t INTEGER NOT NULL,p TEXT NOT NULL,PRIMARY KEY(channel,t)); CREATE TABLE IF NOT EXISTS sessions(channel TEXT NOT NULL,video TEXT NOT NULL,first INTEGER NOT NULL,last INTEGER NOT NULL,sourceStart TEXT,mode TEXT NOT NULL,minuteSamples INTEGER NOT NULL DEFAULT 0,coveredSamples INTEGER NOT NULL DEFAULT 0,last_sample INTEGER,PRIMARY KEY(channel,video)); CREATE TABLE IF NOT EXISTS channels(slug TEXT PRIMARY KEY,metadata TEXT NOT NULL);",
  );
  const sessionColumns = db
    .prepare("PRAGMA table_info(sessions)")
    .all()
    .map((c) => c.name);
  if (!sessionColumns.includes('title')) db.exec('ALTER TABLE sessions ADD COLUMN title TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS followers(channel TEXT NOT NULL,t INTEGER NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(channel,t))');
  if (!sessionColumns.includes("minuteSamples"))
    db.exec(
      "ALTER TABLE sessions ADD COLUMN minuteSamples INTEGER NOT NULL DEFAULT 0",
    );
  if (!sessionColumns.includes("last_sample"))
    db.exec("ALTER TABLE sessions ADD COLUMN last_sample INTEGER");
  const eventColumns = db
    .prepare("PRAGMA table_info(events)")
    .all()
    .map((c) => c.name);
  if (!eventColumns.includes("video"))
    db.exec("ALTER TABLE events ADD COLUMN video TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS event_video_time ON events(video,at)");
  if (!sessionColumns.includes("coveredSamples"))
    db.exec(
      "ALTER TABLE sessions ADD COLUMN coveredSamples INTEGER NOT NULL DEFAULT 0",
    );
  const saveState = db.prepare(
    "INSERT INTO state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
  );
  const getState = (k) => {
    const s = db.prepare("SELECT v FROM state WHERE k=?").get(k);
    return s ? JSON.parse(s.v) : null;
  };
  let started = getState("startedAt") ?? null;
  const activity = new Activity(secret, cfg, started ?? Date.now());
  // Rehydrate only pseudonyms and one hour of observations, never connections/coverage.
  for (const row of db
    .prepare("SELECT * FROM events WHERE at>?")
    .all(Date.now() - 2 * HOUR)) {
    activity.seen.set(row.id, row.at);
    if (row.at > Date.now() - HOUR)
      activity.events.push({
        ...row,
        conversation: !!row.conversation,
        excluded: !!row.excluded,
        resolved: !!row.resolved,
      });
  }
  let costs = getState("costs") ?? {},
    stopping = false,
    discoveryBusy = false,
    pushing = false,
    sampling = false,
    paused = false,
    pauseReason = null,
    nextDiscoveryAt = 0,
    discoveryFailures = 0;
  const connections = new Map(),
    retry = new Map(),
    timers = [],
    shutdown = new AbortController();
  const day = () => {
    const d = new Date().toISOString().slice(0, 10);
    if (costs.day !== d)
      costs = {
        day: d,
        rumbleBytes: 0,
        renderBytes: 0,
        nivoraBytes: 0,
        requests: 0,
        reconnects: 0,
        dbBytes: 0,
        vpsDailyBudget: maxBytes,
        apiDailyBudget:
          Number(env.OBSERVATORY_API_DAILY_BYTES) || 20 * 1024 * 1024,
      };
  };
  day();
  const persist = () => saveState.run("costs", JSON.stringify(costs));
  const stopConnections = () => {
    for (const c of connections.values()) c.abort();
    for (const c of activity.channels.values()) c.connected = null;
  };
  const bytes = (kind, n) => {
    day();
    costs[kind] += n;
    if (costs.rumbleBytes + costs.renderBytes > maxBytes) {
      paused = true;
      pauseReason = "network";
      stopConnections();
      throw new Error("daily_byte_cap");
    }
  };
  const insertEvent = db.prepare(
    "INSERT OR IGNORE INTO events(id,account,channel,at,conversation,excluded,resolved,mode,video) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  function connect(c) {
    if (
      stopping ||
      paused ||
      connections.has(c.slug) ||
      connections.size >= maxChats ||
      !c.numeric ||
      [...connections.values()].some(
        (ac) => ac.video === c.video && !ac.signal.aborted,
      )
    )
      return;
    const wait = retry.get(c.slug);
    if (wait && Date.now() < wait.at) return;
    const ac = new AbortController();
    ac.video = c.video;
    connections.set(c.slug, ac);
    costs.requests++;
    costs.reconnects++;
    let opened = false,
      serverBackoff = 0;
    readPublicChat(
      c.numeric,
      ac.signal,
      (e) => {
        // Category discovery replaces metadata objects, resolve the current connection state.
        const current = activity.channels.get(c.slug);
        if (!current || current.video !== c.video) return;
        const events = activity.envelope(c.slug, e, Date.now());
        db.exec("BEGIN");
        try {
          for (const e of events)
            insertEvent.run(
              e.id,
              e.account,
              e.channel,
              e.at,
              +e.conversation,
              +e.excluded,
              +e.resolved,
              e.mode,
              e.video,
            );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
      (n) => {
        bytes("rumbleBytes", n);
        const current = activity.channels.get(c.slug);
        if (current?.video === c.video) current.lastFrame = Date.now();
      },
      () => {
        opened = true;
        const current = activity.channels.get(c.slug);
        if (current) {
          current.connected = Date.now();
          current.lastFrame = Date.now();
        }
      },
    )
      .catch((e) => {
        serverBackoff = Number(e?.retryAfterMs) || 0;
        if (e?.message === "activity_memory_cap") {
          paused = true;
          pauseReason = "memory";
          stopConnections();
        }
      }) // No payloads/identities in logs.
      .finally(() => {
        if (connections.get(c.slug) === ac) connections.delete(c.slug);
        const current = activity.channels.get(c.slug);
        if (current?.video === c.video) current.connected = null;
        const failures = opened ? 1 : Math.min(8, (wait?.failures ?? 0) + 1);
        retry.set(c.slug, {
          failures,
          at:
            Date.now() +
            Math.max(
              serverBackoff,
              Math.min(30 * MINUTE, 30000 * 2 ** failures),
            ) +
            Math.random() * 10000,
        });
      });
  }
  async function category() {
    if (stopping || discoveryBusy || Date.now() < nextDiscoveryAt) return;
    day();
    if (
      paused &&
      pauseReason === "network" &&
      costs.rumbleBytes + costs.renderBytes < maxBytes
    )
      paused = false;
    if (paused) return;
    discoveryBusy = true;
    let complete = false;
    const lives = new Map(),
      videos = new Set();
    try {
      // Read the existing API discovery cache; no independent category scraper or relay.
      costs.requests++;
      const r = await fetch(discoveryUrl, {
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(20000)]),
        redirect: "error",
        headers: {
          authorization: "Bearer " + token,
          accept: "application/json",
        },
      });
      if (!r.ok || !r.body) {
        nextDiscoveryAt =
          Date.now() +
          Math.max(120000, (Number(r.headers.get("retry-after")) || 0) * 1000);
        await r.body?.cancel();
        throw new Error("discovery_feed_unavailable");
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of r.body) {
        size += chunk.length;
        bytes("renderBytes", chunk.length);
        if (size > 131072) throw new Error("discovery_feed_cap");
        chunks.push(chunk);
      }
      const source = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !Array.isArray(source.lives) ||
        source.lives.length > 256 ||
        !Number.isFinite(source.fetchedAt) ||
        Date.now() - source.fetchedAt > 150000
      )
        throw new Error("discovery_feed_invalid");
      complete = source.complete === true;
      for (const live of source.lives) {
        if (
          !/^[a-zA-Z0-9_-]{1,64}$/.test(live.username) ||
          !/^v[a-z0-9]{5,20}$/.test(live.videoId) ||
          videos.has(live.videoId)
        )
          continue;
        videos.add(live.videoId);
        lives.set(live.username.toLowerCase(), {
          ...live,
          viewersCount:
            typeof live.viewersCount === "number" &&
            Number.isFinite(live.viewersCount) &&
            live.viewersCount >= 0
              ? live.viewersCount
              : null,
        });
      }
      if (source.upstream?.day === costs.day)
        costs.nivoraBytes = Math.max(
          costs.nivoraBytes,
          source.upstream.nivoraBytes || 0,
        );
    } catch {
    } finally {
      if (stopping) {
        discoveryBusy = false;
        return;
      }
      // A failure with no result does not certify an empty category or end a stream.
      const now = Date.now();
      if (started == null && (lives.size || complete)) {
        started = now;
        activity.started = now;
        saveState.run("startedAt", JSON.stringify(started));
      }
      if (lives.size || complete)
        activity.discover(lives.values(), complete, now);
      else activity.complete = false;
      for (const [slug, ac] of connections) {
        const c = activity.channels.get(slug);
        if (
          !c ||
          (complete && !activity.visible.has(slug)) ||
          now - c.seen > 150000
        ) {
          ac.abort();
        } else {
          const l = lives.get(slug);
          if (l && l.videoId !== ac.video) {
            ac.abort();
            connections.delete(slug);
            c.connected = null;
          }
        }
      }
      for (const c of activity.channels.values())
        if (now - c.seen < 150000) connect(c);
      if (lives.size || complete) {
        discoveryFailures = 0;
        nextDiscoveryAt = 0;
      } else {
        discoveryFailures++;
        nextDiscoveryAt = Math.max(
          nextDiscoveryAt,
          now +
            Math.min(30 * MINUTE, 120000 * 2 ** Math.min(discoveryFailures, 4)),
        );
      }
      discoveryBusy = false;
      persist();
    }
  }
  const writePoint = (table, channel, p) =>
    db
      .prepare(
        "INSERT INTO " +
          table +
          "(channel,t,p) VALUES(?,?,?) ON CONFLICT(channel,t) DO UPDATE SET p=excluded.p",
      )
      .run(channel, p[0], JSON.stringify(p));
  const series = (table, channel, since) =>
    db
      .prepare(
        "SELECT p FROM " + table + " WHERE channel=? AND t>=? ORDER BY t",
      )
      .all(channel, since)
      .map((x) => JSON.parse(x.p));
  async function sample() {
    if (stopping || sampling) return;
    sampling = true;
    try {
      const now = Date.now(),
        t = Math.floor(now / MINUTE) * MINUTE;
      const updatedConfig = await readFile(configFile, "utf8");
      if (updatedConfig !== configText) {
        const fresh = JSON.parse(updatedConfig),
          modes = fresh.modes ?? [];
        if (
          !Array.isArray(modes) ||
          modes.length > 1000 ||
          modes.some(
            (m, i) =>
              !["personal", "automod", "unknown"].includes(m.mode) ||
              !Number.isFinite(m.start) ||
              !Number.isFinite(m.end) ||
              m.end <= m.start ||
              (i > 0 && m.start < modes[i - 1].end),
          )
        )
          throw new Error("invalid_mode_annotation");
        Object.assign(cfg, fresh, {
          modes,
          bots: (fresh.bots ?? []).map((x) => x.toLowerCase()),
        });
        configText = updatedConfig;
        db.exec("BEGIN");
        try {
          db.prepare(
            "UPDATE events SET mode='unknown' WHERE channel='lecasinoze'",
          ).run();
          const annotate = db.prepare(
            "UPDATE events SET mode=? WHERE channel='lecasinoze' AND at>=? AND at<?",
          );
          for (const m of modes) annotate.run(m.mode, m.start, m.end);
          for (const s of db
            .prepare(
              "SELECT video,first,last FROM sessions WHERE channel='lecasinoze'",
            )
            .all()) {
            const m = modes.find((m) => s.first >= m.start && s.last < m.end);
            db.prepare(
              "UPDATE sessions SET mode=? WHERE channel='lecasinoze' AND video=?",
            ).run(m?.mode ?? "unknown", s.video);
          }
          for (const e of activity.events)
            if (e.channel === "lecasinoze")
              e.mode =
                modes.find((m) => e.at >= m.start && e.at < m.end)?.mode ??
                "unknown";
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }

      db.exec(
        "DELETE FROM events WHERE at<" +
          (t - 8 * 24 * HOUR) +
          "; DELETE FROM points WHERE t<" +
          (t - 73 * HOUR) +
          "; DELETE FROM hourly WHERE t<" +
          (t - 31 * 24 * HOUR) +
          "; DELETE FROM daily WHERE t<" +
          (t - 366 * 24 * HOUR) +
          "; DELETE FROM sessions WHERE last<" +
          (t - 31 * 24 * HOUR) +
          "; DELETE FROM followers WHERE t<" + (t-31*24*HOUR) + "; DELETE FROM channels WHERE slug NOT IN (SELECT channel FROM sessions); PRAGMA wal_checkpoint(PASSIVE); PRAGMA incremental_vacuum(128);",
      );
      if (t % HOUR === 0) db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      costs.dbBytes =
        (await stat(join(dir, "observatory.sqlite"))).size +
        (
          await stat(join(dir, "observatory.sqlite-wal")).catch(() => ({
            size: 0,
          }))
        ).size;
      if (stopping) return;
      if (costs.dbBytes > maxDb) {
        paused = true;
        stopConnections();
        throw new Error("storage_cap");
      }
      for (const c of activity.channels.values()) {
        // No connection can remain marked covered after loss of an SSE heartbeat.
        if (c.connected && now - c.lastFrame >= 180000)
          connections.get(c.slug)?.abort();
        if (!activity.visible.has(c.slug) || now - c.seen > 150000) continue;
        const p = activity.point(t, c.slug);
        writePoint("points", c.slug, p);
        const metadata = {
          slug: c.slug,
          name: c.name,
          language: c.language,
          languageConfidence: c.languageConfidence,
          mode: c.mode,
          firstSeen: c.first,
          lastSeen: c.seen,
          sourceStart: validDate(c.sourceStart),
          latest: p,
          title: c.title,
          followers: c.followers,
        };
        db.prepare(
          "INSERT INTO channels VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET metadata=excluded.metadata",
        ).run(c.slug, JSON.stringify(metadata));
        db.prepare(
          "INSERT INTO sessions(channel,video,first,last,sourceStart,mode,minuteSamples,coveredSamples,last_sample) VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(channel,video) DO UPDATE SET last=excluded.last,sourceStart=COALESCE(sessions.sourceStart,excluded.sourceStart),mode=CASE WHEN sessions.mode=excluded.mode THEN sessions.mode ELSE 'unknown' END,minuteSamples=sessions.minuteSamples+CASE WHEN COALESCE(sessions.last_sample,0)<excluded.last_sample THEN 1 ELSE 0 END,coveredSamples=sessions.coveredSamples+CASE WHEN COALESCE(sessions.last_sample,0)<excluded.last_sample THEN excluded.coveredSamples ELSE 0 END,last_sample=excluded.last_sample",
        ).run(
          c.slug,
          c.video,
          c.first,
          c.seen,
          validDate(c.sourceStart),
          c.mode,
          p[6] >= 0.9 ? 1 : 0,
          t,
        );
        if (c.title != null) db.prepare('UPDATE sessions SET title=? WHERE channel=? AND video=?').run(c.title,c.slug,c.video);
        if (c.followers != null) {
          // Keep the first actual observation in each hour. The timestamp is not rounded.
          const prior = db.prepare('SELECT t FROM followers WHERE channel=? ORDER BY t DESC LIMIT 1').get(c.slug);
          if (!prior || Math.floor(prior.t/HOUR)<Math.floor(t/HOUR)) db.prepare('INSERT OR IGNORE INTO followers VALUES(?,?,?)').run(c.slug,c.seen,c.followers);
        }
      }
      writePoint("points", "@all", activity.point(t));
      writePoint("points", "@fr", activity.point(t, undefined, "fr"));
      // Only closed buckets are rolled up. Missing minutes lower coverage, never create zeros.
      const prevHour = Math.floor(t / HOUR) * HOUR - HOUR,
        prevDay = Math.floor(t / (24 * HOUR)) * 24 * HOUR - 24 * HOUR;
      for (const slug of ["@all", "@fr", ...activity.channels.keys()]) {
        const h = series("points", slug, prevHour).filter(
          (p) => p[0] < prevHour + HOUR,
        );
        for (const p of summarize(h, HOUR)) writePoint("hourly", slug, p);
        // Daily coverage uses 24 real hours in UTC; UI labels the bucket boundary explicitly.
        const hours = series("hourly", slug, prevDay).filter(
          (p) => p[0] < prevDay + 24 * HOUR,
        );
        if (hours.length) {
          const p = summarize(hours, 24 * HOUR)[0];
          p[6] =
            Math.round((hours.reduce((s, x) => s + x[6], 0) / 24) * 1000) /
            1000;
          writePoint("daily", slug, p);
        }
      }

      persist();
    } catch {
      paused = true;
      pauseReason = "storage";
      stopConnections();
      console.warn("[observatory] collector paused: storage or sampling limit");
    } finally {
      sampling = false;
    }
  }
  function cohorts(now) {
    const result = {};
    const ownHours = series("hourly", "lecasinoze", now - 8 * 24 * HOUR);
    const covered = (date, start, end, mode) => {
      if (mode === "unknown") return false;
      const hours = ownHours.filter((p) => {
        const q = paris(p[0]);
        return (
          q.date === date &&
          q.hour >= start &&
          q.hour < end &&
          p[6] >= 0.9 &&
          cfg.modes?.some(
            (i) => i.mode === mode && p[0] >= i.start && p[0] + HOUR <= i.end,
          )
        );
      });
      // Require at least two consecutive covered hours in an explicitly attributed target session.
      // Denominators describe these observed sessions, never an unobserved calendar day.
      return hours.some((p, i) => hours[i + 1]?.[0] === p[0] + HOUR);
    };
    for (const mode of ["personal", "automod", "unknown"]) {
      // First recorded in the rolling 8-day retention window, never a claimed first visit.
      const first = db
        .prepare(
          "SELECT account,MIN(at) AS firstAt FROM events WHERE channel='lecasinoze' AND excluded=0 AND resolved=1 GROUP BY account",
        )
        .all();
      const resultMode = {
        firstObserved: 0,
        evening: 0,
        j1: 0,
        j3: 0,
        matureEvening: 0,
        matureJ1: 0,
        matureJ3: 0,
      };
      for (const f of first) {
        const initial = db
          .prepare(
            "SELECT mode FROM events WHERE channel='lecasinoze' AND account=? AND at=? LIMIT 1",
          )
          .get(f.account, f.firstAt);
        if (initial?.mode !== mode) continue;
        const p = paris(f.firstAt);
        resultMode.firstObserved++;
        const follow = db
          .prepare(
            "SELECT at FROM events WHERE channel='lecasinoze' AND account=? AND at>? AND mode=? AND excluded=0 AND resolved=1",
          )
          .all(f.account, f.firstAt, mode);
        const target = (delta) =>
          new Date(Date.parse(p.date + "T12:00:00Z") + delta * 24 * HOUR)
            .toISOString()
            .slice(0, 10);
        // Calendar-day cohorts only mature after that day has ended in Paris.
        if (
          p.hour >= 6 &&
          p.hour < 12 &&
          paris(now).date > p.date &&
          covered(p.date, 16, 24, mode)
        ) {
          resultMode.matureEvening++;
          if (
            follow.some((x) => {
              const q = paris(x.at);
              return q.date === p.date && q.hour >= 16;
            })
          )
            resultMode.evening++;
        }
        for (const d of [1, 3])
          if (paris(now).date > target(d) && covered(target(d), 6, 24, mode)) {
            resultMode["matureJ" + d]++;
            if (follow.some((x) => paris(x.at).date === target(d)))
              resultMode["j" + d]++;
          }
      }
      result[mode] = resultMode;
    }
    return result;
  }
  async function push() {
    if (stopping || pushing) return;
    pushing = true;
    try {
      const now = Date.now(),
        channels = [];
      for (const row of db
        .prepare("SELECT slug,metadata FROM channels ORDER BY slug")
        .all()) {
        const metadata = JSON.parse(row.metadata);
        // A channel's last known value is visibly stale; it is not declared offline.
        channels.push({
          ...metadata,
          ...dashboardMetrics(db,row.slug,now,started),
          recent: series('points',row.slug,now-3*HOUR).filter(p=>p[0]%(5*MINUTE)===0).slice(-36),
          history: series("hourly", row.slug, now - 72 * HOUR),
          daily: series("daily", row.slug, now - 30 * 24 * HOUR),
          sessions: db
            .prepare(
              "SELECT video,title,first,last,sourceStart,mode,minuteSamples,coveredSamples FROM sessions WHERE channel=? ORDER BY first DESC LIMIT 100",
            )
            .all(row.slug)
            .reverse()
            .map((s) => {
              const counts = db
                .prepare(
                  "SELECT COUNT(DISTINCT CASE WHEN excluded=0 AND resolved=1 THEN account END) AS net,SUM(CASE WHEN resolved=0 THEN 1 ELSE 0 END) AS unresolved,COALESCE(SUM(CASE WHEN excluded=0 AND resolved=1 THEN 1 ELSE 0 END),0) AS messages,COALESCE(SUM(CASE WHEN excluded=0 AND resolved=1 AND conversation=1 THEN 1 ELSE 0 END),0) AS conversations FROM events WHERE video=? AND at>=?",
                )
                .get(s.video, now - 8 * 24 * HOUR);
              const known =
                s.coveredSamples > 0 &&
                s.last >= now - 8 * 24 * HOUR &&
                !counts.unresolved;
              return {
                ...s,
                netDistinct8d: known ? counts.net : null,
                messages8d: known ? counts.messages : null,
                conversation8d: known ? counts.conversations : null,
              };
            }),
        });
      }
      let firstReport=getState('firstReport');
      if(!firstReport&&started!=null){firstReport=firstObservedReport(series('hourly','@fr',started-HOUR),started,now);if(firstReport)saveState.run('firstReport',JSON.stringify(firstReport));}
      const snapshot = {
        version: 1,
        firstReport,
        startedAt: started,
        capturedAt: now,
        complete: activity.complete && now - activity.discoveryAt < 150000,
        status: !started
          ? "awaiting_collection"
          : paused
            ? "paused_budget"
            : activity.complete
              ? "collecting"
              : "degraded",
        channels,
        latest: {
          all: activity.point(Math.floor(now / MINUTE) * MINUTE),
          fr: activity.point(
            Math.floor(now / MINUTE) * MINUTE,
            undefined,
            "fr",
          ),
        },
        series: {
          all: series("hourly", "@all", now - 31 * 24 * HOUR),
          fr: series("hourly", "@fr", now - 31 * 24 * HOUR),
        },
        daily: {
          all: series("daily", "@all", now - 30 * 24 * HOUR),
          fr: series("daily", "@fr", now - 30 * 24 * HOUR),
        },
        cohorts: cohorts(now),
        costs,
      };
      snapshotSchema.parse(snapshot);
      // Recent detail is optional: protect the existing hard ingestion budget first.
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 524288 || gzipSync(JSON.stringify(snapshot)).length > 65536)
        for (const channel of snapshot.channels) delete channel.recent;
      const body = Buffer.from(JSON.stringify(snapshot));
      if (body.length > 524288) throw new Error("aggregate_size_cap");
      const compressed = gzipSync(body);
      if (compressed.length > 65536) throw new Error("ingest_wire_cap");
      day();
      if (
        costs.rumbleBytes + costs.renderBytes + compressed.length + 1024 >
        maxBytes
      )
        throw new Error("push_budget");
      bytes("renderBytes", compressed.length + 1024);
      costs.requests++;
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(20000)]),
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
        body: compressed,
      });
      bytes(
        "renderBytes",
        Math.min(4096, Number(response.headers.get("content-length")) || 512),
      );
      await response.body?.cancel();
      if (!response.ok) throw new Error("ingest_failed");
    } catch {
      console.warn(
        "[observatory] aggregate not acknowledged; public data may be stale",
      );
    } finally {
      pushing = false;
      if (!stopping) persist();
    }
  }
  function validDate(value) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  async function stop() {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
    for (const t of timers) clearInterval(t);
    stopConnections();
    while (discoveryBusy || pushing || sampling)
      await new Promise((r) => setTimeout(r, 25));
    persist();
    db.close();
    if (JSON.parse(await readFile(pidFile, "utf8")).pid === process.pid)
      await unlink(pidFile);
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  }
  const onSignal = () => void stop();
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  await category();
  await sample();
  await push();
  if (stopping) return { stop };
  timers.push(
    setInterval(() => void category(), 120000),
    setInterval(() => void sample(), 60000),
    setInterval(() => void push(), 300000),
  );
  return { stop };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  runCollector().catch(() => {
    console.error("[observatory] startup failed; check private configuration");
    process.exitCode = 1;
  });
