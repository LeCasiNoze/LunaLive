import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const apiRequire = createRequire(path.join(root, "api", "package.json"));
const { Agent } = apiRequire("undici");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  })
);

const apiBase = String(args.get("api") || "https://lunalive-api.onrender.com").replace(/\/$/, "");
const slug = String(args.get("slug") || "lunalive");
const stageSpec = String(args.get("stages") || "1:45,10:60");
const rampSeconds = Math.max(1, Number(args.get("ramp-seconds") || 10));
const maxErrorRate = Math.max(0.001, Number(args.get("max-error-rate") || 0.01));
const maxStartupP95Ms = Math.max(1_000, Number(args.get("max-startup-p95-ms") || 8_000));
const maxSegmentRatio = Math.max(0.2, Number(args.get("max-segment-ratio") || 1.2));
const requestTimeoutMs = Math.max(5_000, Number(args.get("request-timeout-ms") || 20_000));
const forcedVariant = args.has("variant") ? Number(args.get("variant")) : null;
const forcedQuality = args.has("quality") ? String(args.get("quality")).toLowerCase() : null;
const runId = `llhls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const stages = stageSpec.split(",").map((part) => {
  const [viewersRaw, secondsRaw] = part.split(":");
  const viewers = Number(viewersRaw);
  const seconds = Number(secondsRaw);
  if (!Number.isInteger(viewers) || viewers < 1 || !Number.isFinite(seconds) || seconds < 20) {
    throw new Error(`Invalid stage: ${part}`);
  }
  return { viewers, seconds };
});

const dispatcher = new Agent({
  connections: Math.min(2_048, Math.max(64, Math.max(...stages.map((s) => s.viewers)) * 2)),
  pipelining: 1,
  connect: { timeout: 8_000 },
});

const measurements = {
  manifestMs: [],
  segmentMs: [],
  startupMs: [],
  segmentRatio: [],
};
const counters = {
  manifestAttempts: 0,
  manifestErrors: 0,
  manifestBytes: 0,
  segmentAttempts: 0,
  segmentErrors: 0,
  segmentBytes: 0,
  deadlineMisses: 0,
};
const errorKinds = {};
const viewers = [];
let hlsUrl = "";
let stopping = false;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function metric(values, digits = 0) {
  const round = (value) => Number(value.toFixed(digits));
  return {
    count: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    p99: round(percentile(values, 99)),
    max: round(values.length ? Math.max(...values) : 0),
  };
}

function recordError(error) {
  const key = String(error?.message || error || "unknown").slice(0, 160);
  errorKinds[key] = (errorKinds[key] || 0) + 1;
}

function parsePlaylist(text, playlistUrl) {
  const lines = text.split(/\r?\n/);
  const targetMatch = text.match(/^#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/m);
  const sequenceMatch = text.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/m);
  const targetDuration = Number(targetMatch?.[1] || 6);
  const mediaSequence = Number(sequenceMatch?.[1] || 0);
  const segments = [];
  let duration = targetDuration;
  let segmentIndex = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      duration = Number(line.slice(8).split(",")[0]) || targetDuration;
      continue;
    }
    if (line.startsWith("#")) continue;
    segments.push({
      sequence: mediaSequence + segmentIndex,
      duration,
      url: new URL(line, playlistUrl).toString(),
    });
    segmentIndex += 1;
    duration = targetDuration;
  }

  if (!segments.length) throw new Error("manifest_without_segments");
  return { targetDuration, segments };
}

function parseMaster(text, playlistUrl) {
  if (!text.includes("#EXT-X-STREAM-INF")) return [];
  const lines = text.split(/\r?\n/);
  const variants = [];
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const bandwidth = Number(line.match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1] || 0);
      const resolution = line.match(/(?:^|,)RESOLUTION=(\d+)x(\d+)/);
      pending = {
        bandwidth,
        width: Number(resolution?.[1] || 0),
        height: Number(resolution?.[2] || 0),
      };
      continue;
    }
    if (line.startsWith("#") || !pending) continue;
    variants.push({ ...pending, url: new URL(line, playlistUrl).toString() });
    pending = null;
  }
  return variants;
}

function pickVariant(variants) {
  if (!variants.length) return null;
  if (forcedQuality === "source") {
    return [...variants].sort((a, b) => b.bandwidth - a.bandwidth)[0];
  }
  const maxHeight = forcedQuality ? Number(forcedQuality) : 720;
  const eligible = variants.filter((variant) => variant.height > 0 && variant.height <= maxHeight);
  return [...(eligible.length ? eligible : variants)].sort(
    (a, b) => b.height - a.height || b.bandwidth - a.bandwidth
  )[0];
}

async function fetchBytes(url, kind) {
  const started = performance.now();
  const attemptKey = `${kind}Attempts`;
  const errorKey = `${kind}Errors`;
  const bytesKey = `${kind}Bytes`;
  counters[attemptKey] += 1;
  let response;
  try {
    response = await fetch(url, {
      dispatcher,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: {
        accept: kind === "manifest" ? "application/vnd.apple.mpegurl,*/*" : "*/*",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`${kind}_http_${response.status}`);
    const body = await response.arrayBuffer();
    const elapsed = performance.now() - started;
    measurements[`${kind}Ms`].push(elapsed);
    counters[bytesKey] += body.byteLength;
    return { body, elapsed, headers: response.headers };
  } catch (error) {
    counters[errorKey] += 1;
    recordError(error);
    throw error;
  }
}

async function resolveLiveHls() {
  const response = await fetch(`${apiBase}/streamers/${encodeURIComponent(slug)}`, {
    dispatcher,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { accept: "application/json", "user-agent": "LunaLive-HLS-capacity-test/1.0" },
  });
  if (!response.ok) throw new Error(`streamer_http_${response.status}`);
  const data = await response.json();
  if (!data?.isLive) throw new Error(`${slug}_is_not_live`);
  const resolved = String(data.rumbleHlsUrl || data.hlsUrl || "").trim();
  if (!resolved) throw new Error("live_hls_url_missing");
  return { url: resolved, title: data.title || "", viewers: Number(data.viewers || 0) };
}

function createViewer(index) {
  const state = {
    index,
    active: true,
    startedAt: performance.now(),
    firstSegmentAt: 0,
    nextSequence: null,
    mediaUrl: null,
    timer: null,
    inFlight: false,
  };

  const schedule = (ms) => {
    if (!state.active || stopping) return;
    state.timer = setTimeout(() => void tick(), Math.max(250, ms));
  };

  const tick = async () => {
    if (!state.active || stopping || state.inFlight) return;
    state.inFlight = true;
    let nextDelayMs = 3_000;
    try {
      let playlistUrl = state.mediaUrl || hlsUrl;
      let manifest = await fetchBytes(playlistUrl, "manifest");
      let manifestText = Buffer.from(manifest.body).toString("utf8");
      if (!state.mediaUrl) {
        const variants = parseMaster(manifestText, playlistUrl);
        if (variants.length) {
          const chosen = pickVariant(variants);
          if (!chosen) throw new Error("master_without_eligible_variant");
          state.mediaUrl = chosen.url;
          playlistUrl = chosen.url;
          manifest = await fetchBytes(playlistUrl, "manifest");
          manifestText = Buffer.from(manifest.body).toString("utf8");
        } else {
          state.mediaUrl = playlistUrl;
        }
      }
      const parsed = parsePlaylist(manifestText, playlistUrl);
      nextDelayMs = Math.max(1_000, parsed.targetDuration * 1_000);
      const newest = parsed.segments.at(-1);
      if (state.nextSequence == null) {
        // Hls.js démarre au bord du direct. Une première frame complète suffit
        // à mesurer le startup; les ticks suivants maintiennent le buffer.
        state.nextSequence = newest.sequence;
      }

      const due = parsed.segments.filter((segment) => segment.sequence >= state.nextSequence);
      for (const segment of due) {
        const result = await fetchBytes(segment.url, "segment");
        const ratio = result.elapsed / (segment.duration * 1_000);
        measurements.segmentRatio.push(ratio);
        if (ratio > maxSegmentRatio) counters.deadlineMisses += 1;
        state.nextSequence = segment.sequence + 1;
        if (!state.firstSegmentAt) {
          state.firstSegmentAt = performance.now();
          measurements.startupMs.push(state.firstSegmentAt - state.startedAt);
        }
      }
    } catch {
      nextDelayMs = Math.min(5_000, nextDelayMs);
    } finally {
      state.inFlight = false;
      schedule(nextDelayMs * (0.9 + Math.random() * 0.2));
    }
  };

  schedule(Math.random() * 750);
  return {
    stop() {
      state.active = false;
      if (state.timer) clearTimeout(state.timer);
    },
  };
}

function baseline() {
  return {
    at: performance.now(),
    counters: { ...counters },
    lengths: Object.fromEntries(Object.entries(measurements).map(([key, values]) => [key, values.length])),
  };
}

function summary(stage, base) {
  const elapsedSec = Math.max(0.001, (performance.now() - base.at) / 1_000);
  const stageCounters = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, value - (base.counters[key] || 0)])
  );
  const attempts = stageCounters.manifestAttempts + stageCounters.segmentAttempts;
  const errors = stageCounters.manifestErrors + stageCounters.segmentErrors;
  const stageMeasurements = Object.fromEntries(
    Object.entries(measurements).map(([key, values]) => [key, values.slice(base.lengths[key] || 0)])
  );
  return {
    runId,
    stage,
    activeViewers: viewers.length,
    elapsedSec: Number(elapsedSec.toFixed(1)),
    errorRate: attempts ? Number((errors / attempts).toFixed(5)) : 0,
    aggregateMbps: Number(
      ((((stageCounters.manifestBytes + stageCounters.segmentBytes) * 8) / elapsedSec) / 1_000_000).toFixed(2)
    ),
    counters: stageCounters,
    latencyMs: {
      manifest: metric(stageMeasurements.manifestMs),
      segment: metric(stageMeasurements.segmentMs),
      startup: metric(stageMeasurements.startupMs),
    },
    segmentDownloadOverDuration: metric(stageMeasurements.segmentRatio, 3),
    errorKinds: { ...errorKinds },
  };
}

async function rampTo(target) {
  const missing = target - viewers.length;
  if (missing <= 0) return;
  const delayMs = Math.max(10, (rampSeconds * 1_000) / missing);
  for (let i = 0; i < missing && !stopping; i += 1) {
    viewers.push(createViewer(viewers.length + 1));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main() {
  const live = await resolveLiveHls();
  hlsUrl = live.url;
  if (forcedQuality != null) {
    if (!["source", "1080", "720", "360"].includes(forcedQuality)) throw new Error("invalid_quality");
    if (/chunklist_i\d+_/i.test(hlsUrl)) {
      const prefix = forcedQuality === "source" ? "chunklist_" : `chunklist_${forcedQuality}p_`;
      hlsUrl = hlsUrl.replace(/chunklist_(?:\d+p_)?i\d+_/i, `${prefix}i0_`);
    }
  }
  if (forcedVariant != null) {
    if (!Number.isInteger(forcedVariant) || forcedVariant < 0) throw new Error("invalid_variant");
    if (!/chunklist_i\d+_/i.test(hlsUrl)) throw new Error("variant_pattern_not_found");
    hlsUrl = hlsUrl.replace(/chunklist_i\d+_/i, `chunklist_i${forcedVariant}_`);
  }
  console.log(JSON.stringify({
    event: "start",
    runId,
    apiBase,
    slug,
    liveTitle: live.title,
    reportedViewers: live.viewers,
    hlsHost: new URL(hlsUrl).host,
    forcedQuality,
    forcedVariant,
    stages,
    rampSeconds,
    maxErrorRate,
    maxStartupP95Ms,
    maxSegmentRatio,
  }));

  try {
    for (const stage of stages) {
      if (stopping) break;
      const base = baseline();
      await rampTo(stage.viewers);
      const stageStarted = Date.now();
      console.log(JSON.stringify({ event: "stage_started", ...stage, at: new Date().toISOString() }));

      while (!stopping && Date.now() - stageStarted < stage.seconds * 1_000) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const current = summary(stage, base);
        console.log(JSON.stringify({ event: "sample", at: new Date().toISOString(), ...current }));
        const enoughRequests = current.counters.manifestAttempts + current.counters.segmentAttempts >= 30;
        const startupEvaluable = current.latencyMs.startup.count >= Math.min(20, stage.viewers);
        if (
          enoughRequests &&
          (
            current.errorRate > maxErrorRate ||
            (startupEvaluable && current.latencyMs.startup.p95 > maxStartupP95Ms) ||
            (
              current.segmentDownloadOverDuration.count >= 20 &&
              current.segmentDownloadOverDuration.p95 > maxSegmentRatio
            )
          )
        ) {
          stopping = true;
          console.error(JSON.stringify({
            event: "threshold_exceeded",
            at: new Date().toISOString(),
            maxErrorRate,
            maxStartupP95Ms,
            maxSegmentRatio,
            ...current,
          }));
        }
      }
      console.log(JSON.stringify({ event: "stage_finished", at: new Date().toISOString(), ...summary(stage, base) }));
    }
  } finally {
    for (const viewer of viewers) viewer.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await dispatcher.close();
  }
}

process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

await main();
