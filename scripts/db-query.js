#!/usr/bin/env node
// scripts/db-query.js
// Usage: node scripts/db-query.js "SELECT * FROM rumble_accounts"
//        node scripts/db-query.js --tables
//        node scripts/db-query.js --table <name>
//        node scripts/db-query.js --desc <name>

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(__dir, "../api");

function loadEnv() {
  try {
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
  } catch { console.error("Impossible de lire api/.env"); }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL manquant dans api/.env"); process.exit(1); }

const args = process.argv.slice(2);
let sql;
if (args[0] === "--tables") {
  sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name";
} else if (args[0] === "--table") {
  if (!args[1]) { console.error("Usage: --table <name>"); process.exit(1); }
  sql = `SELECT * FROM "${args[1]}" LIMIT 20`;
} else if (args[0] === "--desc") {
  if (!args[1]) { console.error("Usage: --desc <name>"); process.exit(1); }
  sql = `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='${args[1]}' ORDER BY ordinal_position`;
} else {
  sql = args.join(" ").trim();
}

if (!sql) {
  console.log(`Usage:\n  node scripts/db-query.js "SELECT * FROM rumble_accounts"\n  node scripts/db-query.js --tables\n  node scripts/db-query.js --table <name>\n  node scripts/db-query.js --desc <name>`);
  process.exit(0);
}

// Import pg depuis api/node_modules via file URL (compat Windows ESM)
const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const { default: pg } = await import(pgUrl).catch(async () => {
  // fallback: tenter import direct
  return import("pg");
});

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const { rows } = await pool.query(sql);
  if (rows.length === 0) console.log("(no rows)");
  else console.table(rows);
} catch (e) {
  console.error("Erreur SQL:", e.message);
} finally {
  await pool.end();
}
