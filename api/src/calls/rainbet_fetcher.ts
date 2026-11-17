// api/src/calls/rainbet_fetcher.ts
// Source du catalogue des calls : liste publique des slots Rainbet.
//
// PIÈGE Cloudflare : services.rainbet.com renvoie 403 à fetch()/https de Node
// quels que soient les en-têtes (empreinte TLS de Node bloquée, testé depuis
// Windows ET Linux), alors que curl passe avec des en-têtes de navigateur.
// D'où l'appel via le binaire curl (présent dans l'image Docker de l'API).
import { execFile } from "node:child_process";
import { normText } from "./normalize.js";
import type { SlotRow } from "./catalog.js";

const API = String(process.env.RAINBET_API_URL || "https://services.rainbet.com").trim().replace(/\/+$/, "");
const COUNTRY = String(process.env.RAINBET_COUNTRY || "FR").trim();
const IMAGE_WIDTH = Math.max(64, Number(process.env.RAINBET_IMAGE_WIDTH || 256));
// Repli si /games/categories ne répond pas (id observé le 17/11/2026)
const SLOTS_CATEGORY_FALLBACK = "45f8b335-b90e-4d9c-9020-55ad084dab48";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

type RainbetGame = {
  name?: string;
  producer?: string;
  type?: string;
  custom_banner?: string | null;
  icon?: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function curlJson(url: string): Promise<any> {
  const args = [
    "-sS", "--compressed", "--max-time", "25",
    "-A", UA,
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8",
    "-H", "Origin: https://rainbet.com",
    "-H", "Referer: https://rainbet.com/",
    "-H", "sec-fetch-site: same-site",
    "-H", "sec-fetch-mode: cors",
    "-H", "sec-fetch-dest: empty",
    "-H", 'sec-ch-ua: "Chromium";v="130", "Google Chrome";v="130"',
    "-H", 'sec-ch-ua-platform: "Windows"',
    "-w", "\n%{http_code}",
    url,
  ];
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return reject(new Error(`rainbet_curl:${err.message}`));
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1));
      const body = stdout.slice(0, cut);
      if (status !== 200) return reject(new Error(`rainbet_http:${status}:${body.slice(0, 120)}`));
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error(`rainbet_json:${body.slice(0, 120)}`));
      }
    });
  });
}

async function curlJsonRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await curlJson(url);
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1500 * Math.pow(2, attempt));
    }
  }
}

function buildUrl(path: string, params: Record<string, string>) {
  const u = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function slotsCategoryId(): Promise<string> {
  try {
    const j = await curlJsonRetry(buildUrl("/v1/public/games/categories", { country: COUNTRY }), 1);
    const id = (j?.categories || []).find((c: any) => c?.code === "slots")?.id;
    if (id) return String(id);
  } catch (e: any) {
    console.warn(`[slots-updater] rainbet categories failed, fallback id: ${e?.message || e}`);
  }
  return SLOTS_CATEGORY_FALLBACK;
}

/** Bannière Rainbet (raincdn) redimensionnée, sinon icône du provider. */
export function rainbetImage(g: RainbetGame): string | null {
  const banner = String(g.custom_banner || "").trim();
  if (banner) {
    return banner.replace(
      /^(https:\/\/static\.raincdn\.com\/cdn\/)(?:raw|max-w-\d+)\//,
      `$1max-w-${IMAGE_WIDTH}/`
    );
  }
  const icon = String(g.icon || "").trim();
  return icon || null;
}

/** Tous les slots Rainbet (pagination par curseur, 64 jeux par page). */
export async function fetchRainbetSlots(): Promise<SlotRow[]> {
  const category = await slotsCategoryId();
  const interPageMs = Math.max(0, Number(process.env.RAINBET_INTER_PAGE_MS || 150));
  const out: SlotRow[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 500; page++) {
    const params: Record<string, string> = { category, country: COUNTRY, region: "", sort_by: "a-z" };
    if (cursor) params.cursor = cursor;
    const j = await curlJsonRetry(buildUrl("/v1/public/games/list", params));
    const games: RainbetGame[] = Array.isArray(j?.games) ? j.games : [];

    for (const g of games) {
      // la catégorie slots contient aussi quelques jeux de table
      if (g?.type !== "slots") continue;
      const name = normText(g.name);
      if (!name) continue;
      out.push({ name, provider: normText(g.producer) || null, imageUrl: rainbetImage(g) });
    }

    cursor = j?.next_cursor ? String(j.next_cursor) : null;
    if (!cursor || !games.length) break;
    if (interPageMs) await sleep(interPageMs);
  }

  return out;
}
