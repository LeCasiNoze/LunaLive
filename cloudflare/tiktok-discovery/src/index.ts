// TikTok discovery worker — uses Cloudflare Browser Rendering (Puppeteer) to
// render TikTok hashtag/search pages (which are SPA-only) and extract author
// uniqueIds + basic profile metadata.
//
// Routes:
//   POST /hashtag   { hashtag: "casinofr", limit?: 30 } -> { authors: string[], diag }
//   POST /search    { query: "casino fr",   limit?: 30 } -> { authors: string[], diag }
//   POST /profile   { handle: "kasinoze" }              -> { profile, diag }
//
// Auth: require header `x-tiktok-discovery-token` matching env DISCOVERY_TOKEN.

import puppeteer, { type Browser } from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  DISCOVERY_TOKEN?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST,OPTIONS",
} as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error, ...extra }, status);
}

async function withBrowser<T>(env: Env, fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch(env.BROWSER as any);
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

async function renderTikTokPage(
  browser: Browser,
  url: string,
  waitSelector: string,
  limit: number
) {
  const page = await browser.newPage();
  const diag: Record<string, unknown> = { url };
  try {
    await page.setViewport({ width: 1280, height: 1800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });

    // Stealth: hide headless markers
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["fr-FR", "fr", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 35_000 });
    diag.status = response?.status() ?? 0;

    // Initial wait for SPA to render
    await new Promise((r) => setTimeout(r, 5000));

    try {
      await page.waitForSelector(waitSelector, { timeout: 12_000 });
      diag.selectorFound = true;
    } catch {
      diag.selectorFound = false;
    }

    // Aggressive scroll to trigger lazy-loaded items
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Extract handles using multiple strategies in-page
    const result = await page.evaluate((max: number) => {
      const set = new Set<string>();
      const re = /^[A-Za-z0-9._]{1,30}$/;

      // Strategy 1: anchor hrefs to /@handle
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/@"]');
      for (const link of Array.from(links)) {
        const href = link.getAttribute("href") || "";
        const m = href.match(/\/@([A-Za-z0-9._]{1,30})/);
        if (m && re.test(m[1])) {
          set.add(m[1].toLowerCase());
          if (set.size >= max) break;
        }
      }

      // Strategy 2: regex over outerHTML for "uniqueId":"..."
      if (set.size < max) {
        const html = document.documentElement.outerHTML;
        const r1 = /"uniqueId"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
        let m: RegExpExecArray | null;
        while ((m = r1.exec(html)) && set.size < max) set.add(m[1].toLowerCase());
        const r2 = /"unique_id"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
        while ((m = r2.exec(html)) && set.size < max) set.add(m[1].toLowerCase());
      }

      // Detect login wall / blocks
      const titleText = document.title || "";
      const bodyText = (document.body?.innerText || "").slice(0, 4000).toLowerCase();
      const blocks = {
        loginWall:
          bodyText.includes("log in to tiktok") ||
          bodyText.includes("connectez-vous") ||
          bodyText.includes("connecte-toi"),
        captcha: bodyText.includes("captcha") || bodyText.includes("verify"),
        notFound:
          bodyText.includes("couldn't find this account") ||
          bodyText.includes("page not available"),
        title: titleText.slice(0, 80),
        bodyLen: document.body?.innerText?.length || 0,
        bodySample: (document.body?.innerText || "").slice(0, 400),
        anchorsCount: document.querySelectorAll('a[href*="/@"]').length,
        scriptsCount: document.querySelectorAll("script").length,
        htmlLen: document.documentElement.outerHTML.length,
      };

      return { handles: Array.from(set), blocks };
    }, limit);

    diag.handlesFound = result.handles.length;
    diag.blocks = result.blocks;
    return { authors: result.handles as string[], diag };
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeProfile(browser: Browser, handle: string) {
  const page = await browser.newPage();
  const diag: Record<string, unknown> = { handle };
  try {
    await page.setViewport({ width: 1280, height: 1800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" });

    const url = `https://www.tiktok.com/@${handle}`;
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 25_000 });
    diag.status = response?.status() ?? 0;

    const profile = await page.evaluate(() => {
      const out: any = {};
      // Try the SSR JSON first
      const script = document.getElementById(
        "__UNIVERSAL_DATA_FOR_REHYDRATION__"
      ) as HTMLScriptElement | null;
      if (script?.textContent) {
        try {
          const parsed = JSON.parse(script.textContent);
          const scope = parsed?.__DEFAULT_SCOPE__ || {};
          const ud = scope["webapp.user-detail"];
          if (ud?.userInfo?.user) {
            const u = ud.userInfo.user;
            const s = ud.userInfo.stats || {};
            out.user = {
              uniqueId: u.uniqueId,
              nickname: u.nickname,
              signature: u.signature,
              verified: !!u.verified,
              region: u.region,
              avatarLarger: u.avatarLarger || u.avatarMedium || u.avatarThumb,
              bioEmail: u.bioEmail,
            };
            out.stats = {
              followerCount: s.followerCount,
              followingCount: s.followingCount,
              heartCount: s.heartCount,
              videoCount: s.videoCount,
            };
            return out;
          }
        } catch {}
      }
      // Fallback: read DOM
      const bio = document.querySelector('[data-e2e="user-bio"]')?.textContent || "";
      const nickname =
        document.querySelector('[data-e2e="user-subtitle"]')?.textContent ||
        document.querySelector('h1[data-e2e="user-title"]')?.textContent ||
        "";
      const followers =
        document.querySelector('[data-e2e="followers-count"]')?.textContent || "";
      const following =
        document.querySelector('[data-e2e="following-count"]')?.textContent || "";
      const likes = document.querySelector('[data-e2e="likes-count"]')?.textContent || "";
      out.fallback = { bio, nickname, followers, following, likes };
      return out;
    });

    diag.hasUser = !!profile?.user;
    return { profile, diag };
  } finally {
    await page.close().catch(() => {});
  }
}

async function handleRequest(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

  const expectedToken = env.DISCOVERY_TOKEN || "";
  const presentedToken = req.headers.get("x-tiktok-discovery-token") || "";
  if (!expectedToken || presentedToken !== expectedToken) {
    return bad("unauthorized", 401);
  }

  if (req.method !== "POST") return bad("method_not_allowed", 405);

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }

  if (path === "/hashtag") {
    const tag = String(body?.hashtag || "").trim().replace(/^#+/, "").toLowerCase();
    const limit = Math.max(1, Math.min(80, Number(body?.limit) || 40));
    if (!tag || !/^[a-z0-9_]{1,40}$/i.test(tag)) return bad("invalid_hashtag");
    const result = await withBrowser(env, (b) =>
      renderTikTokPage(
        b,
        `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
        '[data-e2e="challenge-item"], [data-e2e="user-card"]',
        limit
      )
    ).catch((err) => ({ authors: [] as string[], diag: { error: String(err?.message || err) } }));
    return json({ ok: true, ...result });
  }

  if (path === "/search") {
    const query = String(body?.query || "").trim();
    const limit = Math.max(1, Math.min(80, Number(body?.limit) || 30));
    if (!query) return bad("invalid_query");
    const result = await withBrowser(env, (b) =>
      renderTikTokPage(
        b,
        `https://www.tiktok.com/search/user?q=${encodeURIComponent(query)}`,
        '[data-e2e="search-user-container"], [data-e2e="user-card"]',
        limit
      )
    ).catch((err) => ({ authors: [] as string[], diag: { error: String(err?.message || err) } }));
    return json({ ok: true, ...result });
  }

  if (path === "/profile") {
    const handle = String(body?.handle || "").trim().toLowerCase();
    if (!handle || !HANDLE_RE.test(handle)) return bad("invalid_handle");
    const result = await withBrowser(env, (b) => scrapeProfile(b, handle)).catch((err) => ({
      profile: null,
      diag: { error: String(err?.message || err) },
    }));
    return json({ ok: true, ...result });
  }

  return bad("not_found", 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(req, env);
    } catch (err: any) {
      return bad("internal_error", 500, { detail: String(err?.message || err) });
    }
  },
} satisfies ExportedHandler<Env>;
