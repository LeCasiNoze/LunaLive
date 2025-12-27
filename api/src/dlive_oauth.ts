let cache: null | { token: string; expiresAtMs: number } = null;

export async function getDliveAppAccessToken(): Promise<string | null> {
  const id = process.env.DLIVE_CLIENT_ID || process.env.DLIVE_APP_ID;
  const secret = process.env.DLIVE_CLIENT_SECRET || process.env.DLIVE_APP_SECRET;
  if (!id || !secret) return null;

  if (cache && Date.now() < cache.expiresAtMs) return cache.token;

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  const r = await fetch("https://dlive.tv/o/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  if (!r.ok) throw new Error(`dlive_token_http_${r.status}`);

  const j = (await r.json()) as any;
  const token = typeof j?.access_token === "string" ? j.access_token : null;
  const expiresIn = Number(j?.expires_in ?? 0);

  if (!token) throw new Error("dlive_token_missing_access_token");

  // marge 60s
  const ttlMs = Math.max(60_000, expiresIn * 1000 - 60_000);
  cache = { token, expiresAtMs: Date.now() + ttlMs };
  return token;
}
