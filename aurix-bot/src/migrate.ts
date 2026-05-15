// Migration runner — applique les fichiers SQL de migrations/ (idempotent).
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

export async function runMigrations(): Promise<void> {
  const p = pool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS aurix_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let files: string[];
  try {
    files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  } catch (e) {
    console.error("[aurix.migrate] migrations dir introuvable :", migrationsDir);
    throw e;
  }

  for (const f of files) {
    const applied = await p.query("SELECT 1 FROM aurix_migrations WHERE name=$1", [f]);
    if (applied.rowCount && applied.rowCount > 0) continue;

    const sql = await readFile(path.join(migrationsDir, f), "utf8");
    console.log(`[aurix.migrate] applying ${f}`);
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO aurix_migrations(name) VALUES($1)", [f]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("[aurix.migrate] done.");
}

// Permet `npm run migrate`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
