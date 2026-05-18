import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(__dir, "../api");

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

const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const bcryptUrl = pathToFileURL(resolve(apiDir, "node_modules/bcryptjs/index.js")).href;
const { default: pg } = await import(pgUrl);
const bcryptMod = await import(bcryptUrl);
const bcrypt = bcryptMod.default || bcryptMod;
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { rows } = await pool.query("SELECT password_hash FROM users WHERE id=15");
const h = rows[0].password_hash;
console.log("Hash:", h);

const base = [
  "azerty1","Azerty1","AZERTY1","azerty1 "," azerty1","azerty1\n",
  "azerty","azerty12","azerty123","azerty!","Azerty1!","azerty1!",
  "aerty1","azery1","azerty11","azerty2","azerty0","Aerty1","zerty1","azerty7","azerty10","azerty69","azerty01",
  "fabio","Fabio","fabiozsis","Fabiozsis","fabiozsis1","Fabiozsis1","Fabio1","fabio1",
  "azertyuiop","password","Password","Password1","123456","123456789","password1",
  "qwerty","qwerty1","Qwerty1","motdepasse","Motdepasse",
  "wxcvbn","wxcvbn1","WXCVBN","wxc","WXCVBN1",
  "AZERTY","Azerty","Azerty123","azerty123!","azertyy1","azertyyy1"
];

// also test with leading/trailing space variants for top guesses
const variants = [];
for (const c of base) {
  variants.push(c);
  variants.push(c + " ");
  variants.push(" " + c);
}

let matched = false;
for (const c of variants) {
  const ok = await bcrypt.compare(c, h);
  if (ok) { console.log("MATCH ->", JSON.stringify(c)); matched = true; }
}
if (!matched) console.log("No match in candidate list.");
await pool.end();
