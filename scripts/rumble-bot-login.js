/**
 * scripts/rumble-bot-login.js
 *
 * Re-login automatique du compte bot Rumble (LunaLive_Bot) via Playwright,
 * en utilisant le binaire Brave/Chrome déjà installé (pas de download).
 *
 * Utilisé par le relay quand le cookie u_s est mort. Lit username/password
 * depuis api/.env (RUMBLE_BOT_EMAIL, RUMBLE_BOT_PASSWORD).
 *
 * Exporte deux fonctions :
 *   - getFreshCookie()  → renvoie un cookie string complet, ou null
 *   - main(args)        → CLI standalone (pour test manuel)
 */
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

// Charge .env api si dispo
try {
  const envPath = resolve(root, "api/.env");
  if (existsSync(envPath)) {
    const txt = readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
      if (m && !process.env[m[1]]) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  }
} catch {}

function findBrowserExecutable() {
  const candidates = [
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

/**
 * Re-login via Playwright + browser local. Retourne le cookie string complet
 * (toutes les paires) ou null si échec.
 */
export async function getFreshCookie() {
  const email = process.env.RUMBLE_BOT_EMAIL;
  const password = process.env.RUMBLE_BOT_PASSWORD;
  if (!email || !password) {
    console.warn("[rumble-login] RUMBLE_BOT_EMAIL/PASSWORD manquants dans api/.env");
    return null;
  }
  const exe = findBrowserExecutable();
  if (!exe) {
    console.warn("[rumble-login] aucun Chrome/Brave trouvé localement");
    return null;
  }

  console.log(`[rumble-login] launching ${exe.split("\\").pop()} headless`);
  const browser = await chromium.launchPersistentContext("", {
    executablePath: exe,
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "fr-FR",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = await browser.newPage();

    // Va direct sur auth.rumble.com avec redirect_uri (URL utilisée par le bouton login)
    await page.goto("https://auth.rumble.com/?theme=s&redirect_uri=https%3A%2F%2Frumble.com%2F&lang=en_US", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Attend que les inputs soient visibles (le DOM peut être un peu lent)
    await page.waitForSelector('input', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Selectors robustes : Rumble auth utilise différents `name` selon version
    const userField = page.locator('input[name="username"], input[name="email"], input[type="email"], input[autocomplete="username"]').first();
    const passField = page.locator('input[name="password"], input[type="password"], input[autocomplete="current-password"]').first();

    await userField.waitFor({ state: "visible", timeout: 10000 });
    await userField.fill(email);
    await passField.fill(password);

    // Submit (bouton ou Enter)
    const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Connexion")').first();
    const hasSubmit = await submit.count();
    if (hasSubmit > 0) {
      await submit.click();
    } else {
      await passField.press("Enter");
    }

    // Attendre redirect vers rumble.com (login OK) ou rester sur auth (échec)
    await page.waitForURL((url) => !url.toString().includes("auth.rumble.com"), { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const url = page.url();
    if (url.includes("auth.rumble.com") || url.includes("/login")) {
      // Check for captcha / error
      const captchaEl = await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="cloudflare"], div[class*="captcha"]').count();
      const errorTxt = await page.locator('.error, [class*="error"], [class*="alert"]').first().textContent().catch(() => "");
      console.warn(`[rumble-login] login échec — url=${url} captcha=${captchaEl > 0} err="${(errorTxt || "").slice(0, 100)}"`);
      await browser.close();
      return null;
    }

    // Récupère tous les cookies pour rumble.com
    const cookies = await browser.cookies();
    const rumbleCookies = cookies.filter((c) => /rumble\.com$/.test(c.domain) || c.domain === "rumble.com" || c.domain === ".rumble.com");

    const us = rumbleCookies.find((c) => c.name === "u_s");
    if (!us) {
      console.warn(`[rumble-login] u_s introuvable après login (cookies=${rumbleCookies.map((c) => c.name).join(",")})`);
      await browser.close();
      return null;
    }

    // Assemble en cookie string format navigateur
    const cookieStr = rumbleCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    await browser.close();
    console.log(`[rumble-login] ✓ u_s récupéré (${us.value.slice(0, 6)}…${us.value.slice(-4)}, ${rumbleCookies.length} cookies total)`);
    return cookieStr;
  } catch (e) {
    console.error("[rumble-login] error", e?.message || e);
    try { await browser.close(); } catch {}
    return null;
  }
}

// CLI mode (détecte exécution directe vs import)
const __isMain = import.meta.url.endsWith("rumble-bot-login.js") &&
  process.argv[1] && process.argv[1].endsWith("rumble-bot-login.js");
if (__isMain) {
  console.log("[cli] starting login test...");
  getFreshCookie().then((c) => {
    if (c) {
      console.log("[cli] SUCCESS — cookie length:", c.length);
    } else {
      console.error("[cli] FAIL");
      process.exit(1);
    }
    process.exit(0);
  }).catch((e) => {
    console.error("[cli] UNHANDLED", e);
    process.exit(1);
  });
}
