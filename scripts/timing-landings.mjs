// Mesure le vrai temps de chargement d'une landing depuis un browser réel.
// Lance Chrome local via playwright-core et timing API navigation.
//
// Usage: node scripts/timing-landings.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error("Chrome introuvable");
}

const URLS = [
  { label: "Landaurax / (index)", url: "https://landaurax.onrender.com/" },
  { label: "Landaurax /uhyeqttnllv3 (V2 Cyclope-like L2N)", url: "https://landaurax.onrender.com/uhyeqttnllv3" },
  { label: "Landaurax /vkrhhcexyzv3 (Cyclope V2)", url: "https://landaurax.onrender.com/vkrhhcexyzv3" },
  { label: "Landaurax /4bdv-golden-chest-gold (4BDV V1)", url: "https://landaurax.onrender.com/4bdv-golden-chest-gold" },
  { label: "Landaurax /__directoire", url: "https://landaurax.onrender.com/__directoire" },
];

const RUNS_PER_URL = 3;

async function measureOne(browser, url, runIdx) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Force pas de cache pour mesurer cold-cache experience
  await context.clearCookies();
  if (runIdx === 0) {
    // Premiere run = vraiment cold (clear cache)
    const client = await context.newCDPSession(page);
    await client.send("Network.clearBrowserCache");
    await client.send("Network.clearBrowserCookies");
  }

  const start = Date.now();
  const result = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const ttDOM = Date.now() - start;

  // Wait for network idle (proxy de "page entierement chargee, incl. lazy chunks")
  let ttIdle = ttDOM;
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    ttIdle = Date.now() - start;
  } catch (_) { /* timeout, on garde ttDOM */ }

  // Recupere les Navigation Timing API metrics
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return null;
    const paints = performance.getEntriesByType("paint");
    const fp = paints.find((p) => p.name === "first-paint")?.startTime ?? null;
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
    return {
      ttfb: nav.responseStart - nav.requestStart,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      loadEvent: nav.loadEventEnd - nav.startTime,
      firstPaint: fp,
      firstContentfulPaint: fcp,
      transferSize: nav.transferSize ?? null,
    };
  });

  await context.close();
  return { status: result?.status() ?? null, ttDOM, ttIdle, timing };
}

(async () => {
  const exe = findChrome();
  const browser = await chromium.launch({ executablePath: exe, headless: true });

  console.log("=".repeat(70));
  console.log("MESURE LATENCE LANDINGS (3 runs/URL, run #1 = cold cache)");
  console.log("=".repeat(70));

  for (const { label, url } of URLS) {
    console.log(`\n● ${label}`);
    console.log(`  ${url}`);
    for (let i = 0; i < RUNS_PER_URL; i++) {
      try {
        const r = await measureOne(browser, url, i);
        const t = r.timing || {};
        const tag = i === 0 ? "COLD" : "WARM";
        console.log(
          `  [${tag} run ${i + 1}] http=${r.status} | ttfb=${(t.ttfb ?? 0).toFixed(0)}ms | FCP=${(t.firstContentfulPaint ?? 0).toFixed(0)}ms | DOMLoaded=${(t.domContentLoaded ?? 0).toFixed(0)}ms | networkIdle=${r.ttIdle}ms${t.transferSize ? ` | size=${(t.transferSize / 1024).toFixed(1)}KB` : ""}`
        );
      } catch (e) {
        console.log(`  [run ${i + 1}] ERROR: ${e.message}`);
      }
    }
  }

  await browser.close();
  console.log("\n" + "=".repeat(70));
})();
