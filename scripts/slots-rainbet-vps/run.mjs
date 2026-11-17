// Crawl du catalogue Rainbet depuis le VPS : Cloudflare refuse les IP de
// Render (403 même via curl), mais accepte le VPS. On exécute ici le même
// code compilé que l'API (api/dist/calls/updater.js et ses dépendances,
// copiés dans ce dossier) contre la base de prod.
import pg from "pg";
import { runSlotsUpdate } from "./updater.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  application_name: "lunalive-slots-rainbet",
  max: 2,
  connectionTimeoutMillis: 15000,
});

try {
  const r = await runSlotsUpdate(pool);
  if (!r.ok) {
    console.error(`[slots-rainbet] failed: ${r.error}`);
    process.exitCode = 1;
  } else {
    console.log(`[slots-rainbet] ok providers=${r.totalProviders} fetched=${r.totalFetched} inserted=${r.totalInserted} failed=${r.failedProviders}`);
    if (r.failedProviders > 0) process.exitCode = 1;
  }
} finally {
  await pool.end();
}
