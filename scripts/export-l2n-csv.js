#!/usr/bin/env node
// Export L2N visitors CSV — version enrichie pour le owner Celsius
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(__dir, "../api");

function loadEnv() {
  const raw = readFileSync(resolve(apiDir, ".env"), "utf-8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const { default: pg } = await import(pgUrl);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Agrege par ip_hash : first/last click, count, device, referrer, UTM
// + suggested search window (first click - 5min, last click + 30min) en heure Paris
const sql = `
WITH agg AS (
  SELECT
    ip_hash,
    MIN(created_at) AS first_click,
    MAX(created_at) AS last_click,
    COUNT(*) AS clicks,
    MAX(user_agent) AS user_agent,
    MAX(referrer) AS referrer,
    MAX(utm_source) AS utm_source,
    MAX(utm_medium) AS utm_medium,
    MAX(utm_campaign) AS utm_campaign
  FROM affi_landing_events
  WHERE slug='uhyeqttnllm4' AND event='click_cta'
  GROUP BY ip_hash
)
SELECT
  row_number() OVER (ORDER BY first_click) AS n,
  ip_hash,
  to_char(first_click AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS first_click_utc,
  to_char(last_click  AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS last_click_utc,
  to_char(first_click AT TIME ZONE 'Europe/Paris','YYYY-MM-DD HH24:MI:SS') AS first_click_paris,
  to_char(last_click  AT TIME ZONE 'Europe/Paris','YYYY-MM-DD HH24:MI:SS') AS last_click_paris,
  to_char((first_click - INTERVAL '5 minutes') AT TIME ZONE 'Europe/Paris','YYYY-MM-DD HH24:MI:SS') AS search_window_start_paris,
  to_char((last_click  + INTERVAL '30 minutes') AT TIME ZONE 'Europe/Paris','YYYY-MM-DD HH24:MI:SS') AS search_window_end_paris,
  clicks,
  CASE
    WHEN user_agent ILIKE '%iPhone%' THEN 'iPhone'
    WHEN user_agent ILIKE '%Android%' THEN 'Android'
    WHEN user_agent ILIKE '%Windows%' THEN 'Windows'
    WHEN user_agent ILIKE '%Mac OS X%' THEN 'Mac'
    ELSE 'Other'
  END AS device,
  COALESCE(referrer,'(direct - bio link ou app native)') AS referrer,
  COALESCE(utm_source,'') AS utm_source,
  COALESCE(utm_medium,'') AS utm_medium,
  COALESCE(utm_campaign,'') AS utm_campaign,
  user_agent
FROM agg
ORDER BY first_click`;

const { rows } = await pool.query(sql);
const cols = [
  "n","ip_hash",
  "first_click_utc","last_click_utc",
  "first_click_paris","last_click_paris",
  "search_window_start_paris","search_window_end_paris",
  "clicks","device",
  "referrer","utm_source","utm_medium","utm_campaign",
  "user_agent",
];
const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
console.log(cols.join(","));
for (const r of rows) console.log(cols.map(k => esc(r[k])).join(","));
await pool.end();
