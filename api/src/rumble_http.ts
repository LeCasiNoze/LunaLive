// api/src/rumble_http.ts
// Helper HTTP cycletls partagé pour passer le TLS fingerprinting de Cloudflare
// sur rumble.com. Utilisé par le scrape (page channel/user) et le chat send/read.

// @ts-ignore - cycletls n'a pas de types TS officiels
import initCycleTLS from "cycletls";

// JA3 fingerprint Chrome 120+
export const CHROME_JA3 = "772,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0";

let cycleTlsClient: any = null;
let cycleTlsInitPromise: Promise<any> | null = null;

export async function getCycleTLS(): Promise<any> {
  if (cycleTlsClient) return cycleTlsClient;
  if (!cycleTlsInitPromise) {
    cycleTlsInitPromise = initCycleTLS().then((c: any) => {
      cycleTlsClient = c;
      return c;
    });
  }
  return cycleTlsInitPromise;
}

/**
 * Fetch HTTP via cycletls avec TLS fingerprint Chrome. Renvoie le body string ou null si error.
 */
export async function cycleFetch(url: string, opts: { method?: "get" | "post"; body?: string; headers?: Record<string, string>; userAgent?: string; cookie?: string } = {}): Promise<{ status: number; body: string | null }> {
  const cycle = await getCycleTLS();
  const userAgent = opts.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.cookie) headers["cookie"] = opts.cookie;
  try {
    const r = await cycle(url, {
      body: opts.body || "",
      ja3: CHROME_JA3,
      userAgent,
      headers,
    }, opts.method || "get");
    const status = Number(r?.status || 0);
    const body = typeof r?.body === "string" ? r.body : (r?.body ? JSON.stringify(r.body) : null);
    return { status, body };
  } catch (e) {
    console.warn("[cycleFetch] error", e);
    return { status: 0, body: null };
  }
}
