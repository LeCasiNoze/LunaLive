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
  // Priorité Opera (demandé par user), puis Brave/Chrome en fallback.
  const candidates = [
    `${process.env.LOCALAPPDATA}\\Programs\\Opera GX\\opera.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Opera\\opera.exe`,
    "C:\\Program Files\\Opera GX\\opera.exe",
    "C:\\Program Files\\Opera\\opera.exe",
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

// Profil persistant : une fois logué + MFA validé une seule fois, Rumble
// "trust" ce device → refreshes suivants sans MFA.
const PROFILE_DIR = resolve(__dir, ".rumble-bot-profile");

/**
 * Récupère un cookie frais. Stratégie :
 *  1. Ouvre le profil persistant (headless si déjà setup, sinon headed pour MFA)
 *  2. Visite rumble.com/account
 *  3. Si redirigé vers login → fait le login + attend MFA (user input requis)
 *  4. Extrait u_s + autres cookies → return
 *
 * Param `forceHeaded` : ouvre le browser visible (pour setup initial / MFA).
 */
export async function getFreshCookie(opts = {}) {
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

  // Premier run : profil pas encore créé → headed obligatoire pour MFA
  const isFirstRun = !existsSync(PROFILE_DIR);
  const headless = opts.forceHeaded ? false : !isFirstRun;

  if (isFirstRun) {
    console.log(`[rumble-login] ⚠️  Premier setup — ouverture browser visible pour MFA`);
    console.log(`[rumble-login]    Une fois logué (avec code email), ferme le navigateur, le profil sera sauvegardé.`);
  } else {
    console.log(`[rumble-login] launching ${exe.split("\\").pop()} ${headless ? "headless" : "headed"} (profile=${PROFILE_DIR.split("\\").pop()})`);
  }

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: exe,
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "fr-FR",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = await browser.newPage();

    // Test rapide : si on est DÉJÀ logué (profil contient cookies valides),
    // on saute le login form et on récupère le cookie directement.
    await page.goto("https://rumble.com/account", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    if (!page.url().includes("auth.rumble.com") && !page.url().includes("login")) {
      const cookies = await browser.cookies();
      const rumbleCookies = cookies.filter((c) => /rumble\.com$/.test(c.domain) || c.domain === "rumble.com" || c.domain === ".rumble.com");
      const us = rumbleCookies.find((c) => c.name === "u_s");
      if (us) {
        const cookieStr = rumbleCookies.map((c) => `${c.name}=${c.value}`).join("; ");
        await browser.close();
        console.log(`[rumble-login] ✓ session existante valide — u_s=${us.value.slice(0, 6)}…${us.value.slice(-4)}`);
        return cookieStr;
      }
    }

    // Sinon : login form
    console.log(`[rumble-login] session invalide → fill login form`);
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

    // Attendre redirect vers rumble.com (login OK) ou rester sur auth (échec / MFA)
    // En headed mode, on laisse 3 min pour que l'user tape le code email MFA.
    const waitTimeout = headless ? 25000 : 180_000;
    await page.waitForURL((url) => !url.toString().includes("auth.rumble.com"), { timeout: waitTimeout }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const url = page.url();
    if (url.includes("auth.rumble.com") || url.includes("/login")) {
      // Check for captcha / error
      const captchaEl = await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="cloudflare"], div[class*="captcha"]').count();
      const errorTxt = await page.locator('.error, [class*="error"], [class*="alert"]').first().textContent().catch(() => "");
      console.warn(`[rumble-login] login échec — url=${url} captcha=${captchaEl > 0} err="${(errorTxt || "").slice(0, 100)}"`);
      console.warn(`[rumble-login] Si MFA requis, relance le script avec --headed (visible) pour taper le code email.`);
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
  const forceHeaded = process.argv.includes("--headed") || process.argv.includes("--setup");
  console.log(`[cli] starting login ${forceHeaded ? "(HEADED mode for MFA)" : "test"}...`);
  getFreshCookie({ forceHeaded }).then((c) => {
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
