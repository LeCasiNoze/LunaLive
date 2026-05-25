// Verification periodique des landings: taap.it -> notre landing -> DB.
// Tourne toutes les 2h. Sequentiel (1.5s entre chaque entree) pour ne
// pas spam taap.it.
//
// Pipeline par ref:
//   1. GET taap_url, suit les redirections (fetch redirect: follow par defaut)
//   2. URL finale = response.url ; extraire le slug (last path segment)
//   3. Lookup affi_landing_pages WHERE slug=$1 (et secondairement WHERE
//      config::jsonb ->> 'affiLink' = expected_celsius_url)
//   4. Statuts possibles:
//      - 'ok'              : taap redirige vers notre landing + DB.affiLink == expected
//      - 'taap_unreachable': taap.it KO (network / 5xx)
//      - 'taap_off_domain' : taap redirige hors lunalive.win
//      - 'landing_missing' : slug absent en DB
//      - 'celsius_changed' : DB.affiLink ≠ expected_celsius_url

import {
  ChannelType,
  type Client,
  EmbedBuilder,
  type Guild,
  TextChannel,
} from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, kvSet, one, query } from "./db.js";

const log = (...a: unknown[]) => console.log("[aurix.landings_verif]", ...a);

const VERIF_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h
const DELAY_BETWEEN_ENTRIES_MS = 1500;
const LANDING_HOSTS = ["lunalive.win", "www.lunalive.win", "lunalive.onrender.com"];

type RefRow = {
  id: number;
  pseudo: string;
  taap_url: string;
  expected_celsius_url: string;
  last_check_at: Date | null;
  last_status: string | null;
  last_details: string | null;
  last_taap_destination: string | null;
  last_landing_slug: string | null;
  last_db_affi_link: string | null;
};

type Status = "ok" | "taap_unreachable" | "taap_off_domain" | "landing_missing" | "celsius_changed";

// Source de verite: Google Sheet publiee en CSV.
// URL override-able via env var AURIX_LANDINGS_SHEET_URL.
const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQq-1sqseX8RluzBT1xAAGiosPZnu-BPoGJwuRQtEobvBLPc7ZCpYKGzkeIKYBrKw/pub?gid=1280662854&single=true&output=csv";

function sheetUrl(): string {
  return (process.env.AURIX_LANDINGS_SHEET_URL || "").trim() || DEFAULT_SHEET_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// CSV parser robuste : gere les quoted fields, les newlines dans les quotes
// et les escaped quotes ("").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const RE_CELSIUS = /^https?:\/\/celsius\.games\/[A-Za-z0-9_-]+\/?$/i;
const RE_TAAP = /^https?:\/\/taap\.it\/[A-Za-z0-9_-]+\/?$/i;
const BAD_MARKERS = /(pas\s*actif|prison|inactif|inactive)/i;

type SheetRef = { pseudo: string; celsiusUrl: string; taapUrl: string };

function extractRefsFromCsv(text: string): SheetRef[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  // Skip header row, expect columns: [Type, Nom, Lien, taplink, Lien TELEGRAM]
  const refs: SheetRef[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const pseudo = (r[1] ?? "").trim();
    const celsius = (r[2] ?? "").trim();
    const taap = (r[3] ?? "").trim();
    const telegram = (r[4] ?? "").trim();

    if (!pseudo) continue;
    if (!celsius || !RE_CELSIUS.test(celsius)) continue;
    if (!taap || !RE_TAAP.test(taap)) continue;
    // Skip si "PAS ACTIF" / "PRISON" / "INACTIF" present dans n'importe quelle colonne.
    const joined = r.join(" ");
    if (BAD_MARKERS.test(joined) && !RE_TAAP.test(BAD_MARKERS.exec(joined)?.[0] ?? "")) {
      // Faux positif possible si un pseudo s'appelle "prison" (improbable),
      // donc check additionnel: skip uniquement si marker hors des cellules URL.
      if (BAD_MARKERS.test(telegram) || BAD_MARKERS.test(taap)) continue;
    }
    refs.push({ pseudo, celsiusUrl: celsius, taapUrl: taap });
  }
  return refs;
}

export async function fetchSheetRefs(): Promise<SheetRef[]> {
  const url = sheetUrl();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return extractRefsFromCsv(text);
  } finally {
    clearTimeout(to);
  }
}

/**
 * Synchronise aurix_landing_verif_refs avec la sheet:
 *  - UPSERT chaque ref de la sheet (clef = taap_url)
 *  - DELETE les refs orphelines (plus dans la sheet)
 *  - Retourne {added, updated, deleted, total}
 */
export async function syncRefsFromSheet(): Promise<{
  added: number;
  updated: number;
  deleted: number;
  total: number;
}> {
  let sheetRefs: SheetRef[];
  try {
    sheetRefs = await fetchSheetRefs();
  } catch (e) {
    log("syncRefsFromSheet fetch failed:", e);
    return { added: 0, updated: 0, deleted: 0, total: 0 };
  }

  const existing = await all<{ taap_url: string; pseudo: string; expected_celsius_url: string }>(
    "SELECT taap_url, pseudo, expected_celsius_url FROM aurix_landing_verif_refs"
  );
  const existingByTaap = new Map(existing.map((e) => [e.taap_url, e]));
  const sheetTaapUrls = new Set(sheetRefs.map((r) => r.taapUrl));

  let added = 0;
  let updated = 0;

  for (const ref of sheetRefs) {
    const e = existingByTaap.get(ref.taapUrl);
    if (!e) {
      await query(
        `INSERT INTO aurix_landing_verif_refs(pseudo, taap_url, expected_celsius_url)
         VALUES($1,$2,$3) ON CONFLICT (taap_url) DO NOTHING`,
        [ref.pseudo, ref.taapUrl, ref.celsiusUrl]
      );
      added++;
    } else if (e.pseudo !== ref.pseudo || e.expected_celsius_url !== ref.celsiusUrl) {
      await query(
        `UPDATE aurix_landing_verif_refs
            SET pseudo=$1, expected_celsius_url=$2
          WHERE taap_url=$3`,
        [ref.pseudo, ref.celsiusUrl, ref.taapUrl]
      );
      updated++;
    }
  }

  // Delete orphans (refs en DB mais plus dans la sheet).
  const orphans = existing.filter((e) => !sheetTaapUrls.has(e.taap_url));
  let deleted = 0;
  for (const o of orphans) {
    await query("DELETE FROM aurix_landing_verif_refs WHERE taap_url=$1", [o.taap_url]);
    deleted++;
  }

  log(
    `Sheet sync: total=${sheetRefs.length} added=${added} updated=${updated} deleted=${deleted}`
  );
  return { added, updated, deleted, total: sheetRefs.length };
}

/** Compat: ancien nom, redirige vers syncRefsFromSheet. */
export async function seedRefsIfEmpty(): Promise<void> {
  await syncRefsFromSheet();
}

function extractSlugFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Strip trailing slash, take last non-empty segment.
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

function hostMatchesLanding(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return LANDING_HOSTS.includes(h);
  } catch {
    return false;
  }
}

async function resolveTaap(taapUrl: string): Promise<{ ok: boolean; finalUrl?: string; reason?: string }> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(taapUrl, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    }).finally(() => clearTimeout(to));
    if (!r.ok) return { ok: false, reason: `taap.it HTTP ${r.status} (lien cassé / inexistant ?)` };

    // Si redirect HTTP a quitte taap.it, on a deja la final URL.
    try {
      const u = new URL(r.url);
      if (!u.hostname.toLowerCase().includes("taap.it")) {
        return { ok: true, finalUrl: r.url };
      }
    } catch {
      /* ignore */
    }

    // Sinon, taap.it sert un HTML avec redirect JS. On parse `var finalLink = "..."`
    // (et fallback sur `fallbackUrl` si finalLink absent).
    const body = await r.text();
    const finalMatch = body.match(/(?:var\s+finalLink|finalLink)\s*=\s*["']([^"']+)["']/);
    if (finalMatch && finalMatch[1]) {
      return { ok: true, finalUrl: finalMatch[1] };
    }
    const fbMatch = body.match(/(?:var\s+fallbackUrl|fallbackUrl)\s*=\s*["']([^"']+)["']/);
    if (fbMatch && fbMatch[1]) {
      return { ok: true, finalUrl: fbMatch[1] };
    }
    // Meta-refresh classique en backup.
    const metaMatch = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
    if (metaMatch && metaMatch[1]) {
      return { ok: true, finalUrl: metaMatch[1] };
    }

    return { ok: false, reason: "taap.it: finalLink introuvable dans le HTML" };
  } catch (e) {
    return { ok: false, reason: `network: ${String(e).slice(0, 100)}` };
  }
}

async function findLandingBySlug(slug: string): Promise<{ slug: string; affiLink: string | null } | null> {
  return one<{ slug: string; affiLink: string | null }>(
    `SELECT slug, config::jsonb ->> 'affiLink' AS "affiLink"
       FROM affi_landing_pages WHERE slug=$1 LIMIT 1`,
    [slug]
  );
}

async function verifyOneRef(ref: RefRow): Promise<{ status: Status; details: string; taapDest: string | null; landingSlug: string | null; dbAffiLink: string | null }> {
  // 1. Resolve taap.it
  const taap = await resolveTaap(ref.taap_url);
  if (!taap.ok) {
    return {
      status: "taap_unreachable",
      details: taap.reason ?? "taap.it injoignable",
      taapDest: null,
      landingSlug: null,
      dbAffiLink: null,
    };
  }
  const finalUrl = taap.finalUrl!;

  // 2. Check domain
  if (!hostMatchesLanding(finalUrl)) {
    return {
      status: "taap_off_domain",
      details: `redirige vers ${new URL(finalUrl).hostname} (hors lunalive.win)`,
      taapDest: finalUrl,
      landingSlug: null,
      dbAffiLink: null,
    };
  }

  // 3. Extract slug, lookup DB
  const slug = extractSlugFromUrl(finalUrl);
  if (!slug) {
    return {
      status: "landing_missing",
      details: `slug introuvable dans l'URL finale (${finalUrl})`,
      taapDest: finalUrl,
      landingSlug: null,
      dbAffiLink: null,
    };
  }
  const landing = await findLandingBySlug(slug);
  if (!landing) {
    return {
      status: "landing_missing",
      details: `landing absente en DB (slug=${slug})`,
      taapDest: finalUrl,
      landingSlug: slug,
      dbAffiLink: null,
    };
  }

  // 4. Compare DB.affiLink vs expected_celsius_url
  const dbAffi = landing.affiLink ?? "";
  const expected = ref.expected_celsius_url;
  // Comparaison case-insensitive sur le slug celsius (le slug peut etre
  // mixed-case, on tolere les variations).
  if (dbAffi && dbAffi.toLowerCase() === expected.toLowerCase()) {
    return {
      status: "ok",
      details: "taap → landing OK · DB.affiLink == attendu",
      taapDest: finalUrl,
      landingSlug: slug,
      dbAffiLink: dbAffi,
    };
  }
  return {
    status: "celsius_changed",
    details: `DB.affiLink = "${dbAffi}" ≠ attendu "${expected}"`,
    taapDest: finalUrl,
    landingSlug: slug,
    dbAffiLink: dbAffi,
  };
}

export async function verifyAllRefs(): Promise<{ total: number; counts: Record<Status, number> }> {
  const refs = await all<RefRow>(
    "SELECT * FROM aurix_landing_verif_refs ORDER BY id ASC"
  );
  const counts: Record<Status, number> = {
    ok: 0,
    taap_unreachable: 0,
    taap_off_domain: 0,
    landing_missing: 0,
    celsius_changed: 0,
  };
  for (const ref of refs) {
    try {
      const r = await verifyOneRef(ref);
      counts[r.status]++;
      await query(
        `UPDATE aurix_landing_verif_refs
           SET last_check_at=NOW(), last_status=$1, last_details=$2,
               last_taap_destination=$3, last_landing_slug=$4, last_db_affi_link=$5
         WHERE id=$6`,
        [r.status, r.details, r.taapDest, r.landingSlug, r.dbAffiLink, ref.id]
      );
    } catch (e) {
      log(`verify ref #${ref.id} (${ref.pseudo}) failed:`, e);
    }
    await sleep(DELAY_BETWEEN_ENTRIES_MS);
  }
  return { total: refs.length, counts };
}

// ─────────── Discord channel + sticky embed ───────────

async function getVerifChannel(guild: Guild): Promise<TextChannel | null> {
  const id = await kvGet("channel_landing_verif_id");
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  if (!ch || ch.type !== ChannelType.GuildText) return null;
  return ch as TextChannel;
}

function statusBadge(s: string | null): string {
  if (s === "ok") return "✅";
  if (s === "celsius_changed") return "🟡";
  if (s === "landing_missing") return "🔴";
  if (s === "taap_off_domain") return "🔴";
  if (s === "taap_unreachable") return "⚠️";
  return "⚪";
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  const t = new Date(d);
  return (
    String(t.getHours()).padStart(2, "0") +
    ":" +
    String(t.getMinutes()).padStart(2, "0")
  );
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const t = new Date(d);
  return (
    String(t.getDate()).padStart(2, "0") +
    "/" +
    String(t.getMonth() + 1).padStart(2, "0") +
    " " +
    fmtTime(d)
  );
}

function landingUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `https://lunalive.win/r/${slug}`;
}

function buildEmbed(refs: RefRow[]): EmbedBuilder {
  const counts: Record<string, number> = {
    ok: 0,
    celsius_changed: 0,
    landing_missing: 0,
    taap_off_domain: 0,
    taap_unreachable: 0,
    unchecked: 0,
  };
  for (const r of refs) {
    const key = r.last_status ?? "unchecked";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const lastCheck = refs.reduce<Date | null>((acc, r) => {
    if (!r.last_check_at) return acc;
    const d = new Date(r.last_check_at);
    return acc && acc > d ? acc : d;
  }, null);

  const summary = [
    `**${refs.length}** landings suivies · *dernière passe : ${fmtDate(lastCheck)}*`,
    `✅ \`${counts.ok}\`  ·  🟡 \`${counts.celsius_changed}\`  ·  🔴 \`${counts.landing_missing + counts.taap_off_domain}\`  ·  ⚠️ \`${counts.taap_unreachable}\`  ·  ⚪ \`${counts.unchecked}\``,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🔎  Landing Verif")
    .setDescription(summary)
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • Vérification automatique toutes les 2h` });

  // Lignes compactes, regroupees par section status.
  const order: { key: string; label: string; rows: RefRow[] }[] = [
    { key: "issues", label: "Problèmes (à traiter)", rows: refs.filter((r) => r.last_status && r.last_status !== "ok") },
    { key: "ok", label: `Tout OK (${counts.ok})`, rows: refs.filter((r) => r.last_status === "ok") },
    { key: "unchecked", label: "Pas encore vérifiées", rows: refs.filter((r) => !r.last_status) },
  ];

  for (const sec of order) {
    if (sec.rows.length === 0) continue;
    const lines = sec.rows.map((r) => {
      const badge = statusBadge(r.last_status);
      const lUrl = landingUrl(r.last_landing_slug);
      const linksParts: string[] = [];
      linksParts.push(`[taap](${r.taap_url})`);
      if (lUrl) linksParts.push(`[landing](${lUrl})`);
      linksParts.push(`[affi](${r.expected_celsius_url})`);
      const issueSuffix =
        r.last_status && r.last_status !== "ok" && r.last_details ? ` — *${r.last_details}*` : "";
      return `${badge} **${r.pseudo}** · ${fmtTime(r.last_check_at)} · ${linksParts.join(" · ")}${issueSuffix}`;
    });
    // Split en sous-fields de <=1024 chars.
    const chunks: string[] = [];
    let cur = "";
    for (const ln of lines) {
      const next = cur ? `${cur}\n${ln}` : ln;
      if (next.length > 1000) {
        chunks.push(cur);
        cur = ln;
      } else {
        cur = next;
      }
    }
    if (cur) chunks.push(cur);
    chunks.forEach((c, i) => {
      embed.addFields({
        name: i === 0 ? sec.label : "​",
        value: c,
      });
    });
  }

  if (refs.length === 0) {
    embed.addFields({ name: "​", value: "*Aucune landing référencée.*" });
  }

  return embed;
}

export async function ensureVerifBoard(guild: Guild): Promise<void> {
  const ch = await getVerifChannel(guild);
  if (!ch) return;

  const me = guild.members.me;
  if (!me) return;

  const refs = await all<RefRow>("SELECT * FROM aurix_landing_verif_refs ORDER BY pseudo ASC");
  const embed = buildEmbed(refs);

  const existingId = await kvGet("landing_verif_message_id");
  if (existingId) {
    try {
      const m = await ch.messages.fetch(existingId);
      if (m.author.id === me.id) {
        await m.edit({ embeds: [embed] });
        return;
      }
    } catch {
      /* deleted, fall through */
    }
  }
  const m = await ch.send({ embeds: [embed] });
  await kvSet("landing_verif_message_id", m.id);
}

// ─────────── Cron ───────────

let cronTimer: NodeJS.Timeout | null = null;

export function startLandingVerifCron(client: Client): void {
  if (cronTimer) return;
  log("Cron landing verif démarré (toutes les 2h).");
  // Première passe au boot, après 30s pour laisser le bot finir d'init.
  setTimeout(() => {
    void runOnePass(client).catch((e) => log("first pass error:", e));
  }, 30_000);
  cronTimer = setInterval(() => {
    void runOnePass(client).catch((e) => log("cron pass error:", e));
  }, VERIF_INTERVAL_MS);
}

async function runOnePass(client: Client): Promise<void> {
  log("Verification pass started.");
  await syncRefsFromSheet();
  const r = await verifyAllRefs();
  const guildId = process.env.AURIX_GUILD_ID;
  let guild: Guild | undefined;
  if (guildId) guild = client.guilds.cache.get(guildId);
  if (!guild) guild = client.guilds.cache.first();
  if (guild) await ensureVerifBoard(guild);
  log(`Pass done: ${r.total} refs, counts=${JSON.stringify(r.counts)}`);
}

export async function triggerManualCheck(client: Client): Promise<{ total: number; counts: Record<Status, number> }> {
  await syncRefsFromSheet();
  const r = await verifyAllRefs();
  const guildId = process.env.AURIX_GUILD_ID;
  let guild: Guild | undefined;
  if (guildId) guild = client.guilds.cache.get(guildId);
  if (!guild) guild = client.guilds.cache.first();
  if (guild) await ensureVerifBoard(guild);
  return r;
}
