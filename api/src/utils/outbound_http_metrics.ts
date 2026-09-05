import { channel } from "node:diagnostics_channel";

// Application bytes only, not Render's billable total (TLS and TCP overhead
// are not visible here). Never record paths, query strings, headers or bodies.
export function startOutboundHttpMetrics() {
  const buckets = new Map<string, { requests: number; applicationBytes: number }>();
  const sent = channel("undici:client:sendHeaders");
  const listener = (message: unknown) => {
    try {
      const { request, headers } = message as { request: { origin: string; contentLength?: number }; headers: string };
      const origin = new URL(String(request.origin)).origin;
      const key = buckets.has(origin) || buckets.size < 100 ? origin : "other";
      const bucket = buckets.get(key) || { requests: 0, applicationBytes: 0 };
      bucket.requests += 1;
      bucket.applicationBytes += Buffer.byteLength(headers || "") + Math.max(0, Number(request.contentLength) || 0);
      buckets.set(key, bucket);
    } catch { /* Diagnostics must never affect outgoing requests. */ }
  };
  sent.subscribe(listener);
  const timer = setInterval(() => {
    const destinations = [...buckets].sort((a, b) => b[1].applicationBytes - a[1].applicationBytes);
    buckets.clear();
    if (destinations.length) console.log("[outbound-http-5m]", JSON.stringify(destinations));
  }, 5 * 60_000);
  timer.unref();
  return () => { clearInterval(timer); sent.unsubscribe(listener); buckets.clear(); };
}
