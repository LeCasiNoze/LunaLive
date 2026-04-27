// api/src/rumble_browser.ts
// Wrapper Puppeteer headless pour scraper Rumble en bypassant Cloudflare.
// CF bloque les fetch standard et même cycletls depuis les IPs Render.
// Un Chromium réel (avec son JS engine) résout le challenge CF naturellement.

// @ts-ignore - puppeteer-extra n'a pas de types officiels
import puppeteerExtra from "puppeteer-extra";
// @ts-ignore - stealth plugin sans types
import StealthPlugin from "puppeteer-extra-plugin-stealth";
// @ts-ignore - puppeteer-core utilisé comme moteur sous-jacent
import puppeteerCore from "puppeteer-core";
// @ts-ignore - chromium serverless
import chromium from "@sparticuz/chromium";

// Branche puppeteer-extra sur puppeteer-core + stealth
puppeteerExtra.use(StealthPlugin());

// Utilise puppeteer-extra avec le moteur core
const puppeteer = puppeteerExtra;
puppeteer.use = puppeteerExtra.use;

let browserInstance: any = null;
let browserPromise: Promise<any> | null = null;

async function getBrowser() {
  if (browserInstance) {
    try {
      // Vérifie que le browser est toujours connecté
      const pages = await browserInstance.pages();
      if (pages) return browserInstance;
    } catch {
      browserInstance = null;
    }
  }
  if (!browserPromise) {
    browserPromise = (async () => {
      console.log("[rumble_browser] launching chromium...");
      const executablePath = await chromium.executablePath();
      const browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
        defaultViewport: { width: 1920, height: 1080 },
        executablePath,
        headless: true,
        // Force le moteur puppeteer-core (puppeteer-extra le détecte automatiquement)
        ignoreDefaultArgs: ["--enable-automation"],
      } as any);
      void puppeteerCore; // garde l'import pour le bundle Node
      browserInstance = browser;
      browser.on("disconnected", () => {
        console.warn("[rumble_browser] browser disconnected");
        browserInstance = null;
        browserPromise = null;
      });
      console.log("[rumble_browser] chromium launched");
      return browser;
    })().catch((e) => {
      console.error("[rumble_browser] launch failed", e);
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

/**
 * Scrape une page Rumble via Chromium headless. Renvoie le HTML après que CF
 * ait laissé passer (le challenge JS est résolu automatiquement par le browser).
 * Renvoie null si même Chromium se fait bloquer.
 */
export async function fetchRumblePageViaBrowser(path: string): Promise<string | null> {
  const url = `https://rumble.com${path}`;
  let page: any = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    // Bloque les ressources lourdes pour accélérer (on veut juste le HTML)
    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const t = req.resourceType();
      if (t === "image" || t === "media" || t === "font" || t === "stylesheet") req.abort();
      else req.continue();
    });

    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    const status = resp ? resp.status() : 0;

    // Si CF challenge → attendre que le JS le résolve et que la vraie page apparaisse
    let html = await page.content();
    const isCfChallenge =
      status === 403 ||
      status === 503 ||
      /Just a moment|cf-browser-verification|challenge-platform/i.test(html);

    if (isCfChallenge) {
      console.log(`[rumble_browser] ${path} CF challenge detected, waiting…`);
      try {
        // Attend que le DOM contienne un élément qu'on n'a pas pendant le challenge
        await page.waitForFunction(
          () => !!document.querySelector('[data-video-id], a[href*="/v"], main')
            && !/Just a moment|challenge-platform/i.test(document.documentElement.innerHTML),
          { timeout: 20_000 }
        );
        html = await page.content();
        const newStatus = page.url().includes("rumble.com") ? 200 : 0;
        console.log(`[rumble_browser] ${path} CF challenge resolved status≈${newStatus} bytes=${html.length}`);
        return html;
      } catch {
        console.warn(`[rumble_browser] ${path} CF challenge unresolved after 20s`);
        return null;
      }
    }

    if (status >= 200 && status < 300) {
      console.log(`[rumble_browser] ${path} status=${status} bytes=${html.length}`);
      return html;
    }
    console.warn(`[rumble_browser] ${path} status=${status}`);
    return null;
  } catch (e: any) {
    console.warn(`[rumble_browser] ${path} error`, e?.message || e);
    return null;
  } finally {
    try { await page?.close(); } catch {}
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
    browserPromise = null;
  }
}
