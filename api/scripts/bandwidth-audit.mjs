// Application payload counters, not a replacement for Render billing metrics.
// No URLs, query strings, credentials, headers or payload contents are logged.
// Disable with BANDWIDTH_AUDIT=0. Only loaded by the production start command.
import { channel } from "node:diagnostics_channel";

const buckets = new Map();
function add(label, bytes = 0, requests = 0, unknownBodies = 0) {
  const row = buckets.get(label) || { bytes: 0, requests: 0, unknownBodies: 0 };
  row.bytes += bytes;
  row.requests += requests;
  row.unknownBodies += unknownBodies;
  buckets.set(label, row);
}
function size(chunk, encoding) {
  if (typeof chunk === "string") return Buffer.byteLength(chunk, typeof encoding === "string" ? encoding : "utf8");
  return ArrayBuffer.isView(chunk) ? chunk.byteLength : 0;
}
function feature(raw = "") {
  const path = raw.split("?", 1)[0];
  if (path.includes("automod-service")) return "automod-service";
  if (path.includes("automod")) return "automod-public";
  if (path.includes("/calls")) return "calls";
  if (/\/clips\/[^/]+\/mp4\/?$/.test(path)) return "clips-video";
  if (path.startsWith("/hls")) return "live-hls";
  if (path.includes("lunaclip")) return "lunaclip-admin";
  if (path.includes("recruitment") || path.includes("rumble-outreach")) return "recruitment";
  if (path.includes("creator-tools")) return "creator-tools";
  if (path.includes("discord")) return "discord";
  if (path.includes("celsius")) return "celsius";
  if (path.startsWith("/_next/image")) return "images";
  if (path.startsWith("/_next/static")) return "static";
  if (/thumb|avatar|emote|\.webp$|\.png$|\.jpg$/.test(path)) return "images";
  if (path.includes("slot")) return "slots";
  if (path.startsWith("/socket.io")) return "socket-polling";
  if (path.includes("internal") || path.startsWith("/bot")) return "internal-bot";
  if (path.startsWith("/admin")) return "admin-pages";
  if (path.startsWith("/app")) return "affiliate-pages";
  if (path.includes("clip")) return "clips-metadata";
  if (path.includes("stream") || path.includes("live")) return "streams";
  return "other";
}
function destination(origin) {
  const host = new URL(origin).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return "loopback";
  if (host.endsWith(".supabase.co")) return "supabase";
  if (host.endsWith(".r2.cloudflarestorage.com")) return "r2";
  if (host === "rumble.com" || host.endsWith(".rumble.com")) return "rumble";
  if (host === "discord.com" || host.endsWith(".discord.com")) return "discord";
  if (host.endsWith(".jina.ai")) return "jina";
  if (host.endsWith(".onrender.com")) return "render-public";
  if (host.endsWith(".nivora.net") || host === "nivora.net") return "nivora";
  if (host.endsWith(".googleapis.com")) return "google";
  return "other-external";
}
function observe(name, callback) {
  channel(name).subscribe((event) => {
    // Instrumentation must never affect delivery or expose an exception's data.
    try { callback(event); } catch { /* unsupported runtime/event shape */ }
  });
}

if (process.env.BANDWIDTH_AUDIT !== "0") {
  observe("http.server.request.start", ({ request, response }) => {
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket?.remoteAddress);
    const label = `${local ? "response-loopback" : "response"}:${feature(request.url)}`;
    add(label, 0, 1);
    let nested = false;
    for (const method of ["write", "end"]) {
      const original = response[method];
      response[method] = function (chunk, encoding, ...rest) {
        const parent = nested;
        nested = true;
        try {
          const result = original.call(this, chunk, encoding, ...rest);
          if (!parent && request.method !== "HEAD" && this.statusCode >= 200 && ![204, 304].includes(this.statusCode)) {
            try { add(label, size(chunk, encoding)); } catch { /* no delivery impact */ }
          }
          return result;
        } finally { nested = parent; }
      };
    }
  });

  const sockets = new WeakMap();
  observe("undici:client:sendHeaders", ({ request, socket }) => {
    const label = `fetch:${destination(request.origin)}`;
    add(label, 0, 1);
    let state = sockets.get(socket);
    if (state) { state.label = label; return; }
    state = { label };
    sockets.set(socket, state);
    // Count plaintext supplied to the socket, without consuming or cloning
    // bodies. TLS/TCP overhead is excluded. Includes HTTP headers and
    // streamed uploads on Node versions without bodyChunkSent diagnostics.
    const original = socket.write;
    socket.write = function (chunk, encoding, ...rest) {
      const result = original.call(this, chunk, encoding, ...rest);
      try { add(state.label, size(chunk, encoding)); } catch { /* no delivery impact */ }
      return result;
    };
  });
  observe("http.client.request.start", ({ request }) => {
    // Native HTTP clients (e.g. S3 SDK): declared payload size after completion.
    const label = `native:${destination(`${request.protocol || "https:"}//${request.host}`)}`;
    request.once("finish", () => {
      try {
        const length = request.getHeader("content-length");
        const known = length !== undefined && Number.isFinite(Number(length));
        add(label, known ? Number(length) : 0, 1, !known && !["GET", "HEAD"].includes(request.method) ? 1 : 0);
      } catch { /* no delivery impact */ }
    });
  });
  let since = Date.now();
  const flush = () => {
    const now = Date.now();
    console.log("[bandwidth-audit]", JSON.stringify({ since, until: now, pid: process.pid, role: process.env.BANDWIDTH_AUDIT_ROLE || "api", buckets: Object.fromEntries(buckets) }));
    buckets.clear();
    since = now;
  };
  setTimeout(flush, 60_000).unref();
  setInterval(flush, 300_000).unref();
  console.log("[bandwidth-audit] enabled; payload bytes only; 5 minute windows; node", process.version);
}
