// api/src/rumble_browser.ts
// Wrapper Puppeteer headless pour scraper Rumble en bypassant Cloudflare.
// CF bloque les fetch standard et même cycletls depuis les IPs Render.
// Un Chromium réel (avec son JS engine) résout le challenge CF naturellement.

// @ts-ignore - puppeteer-core types ok mais on garde simple
import puppeteer from "puppeteer-core";
// @ts-ignore - chromium serverless
import chromium from "@sparticuz/chromium";

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
        ],
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: true,
      });
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
    if (status >= 200 && status < 300) {
      const html = await page.content();
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
