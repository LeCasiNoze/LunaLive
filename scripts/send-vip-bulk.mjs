// scripts/send-vip-bulk.mjs
// Envoi du mail VIP welcome à TOUS les leads de affi_vip_leads + 1 copie a
// kasinoze@gmail.com (pour verif manuelle). Via Brevo HTTP API.
//
// Usage : node scripts/send-vip-bulk.mjs        (envoie a tous)
//         node scripts/send-vip-bulk.mjs --dry  (dry-run, n'envoie rien)
//         node scripts/send-vip-bulk.mjs --copy-only  (envoie seulement la copie test)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Parse api/.env manuellement
const envText = fs.readFileSync(path.join(ROOT, "api/.env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM = "Aurix VIP <aurixvip@gmail.com>";
const COPY_TO = "kasinoze@gmail.com";

if (!BREVO_API_KEY) {
  console.error("❌ BREVO_API_KEY manquant"); process.exit(1);
}

// Require le module pg depuis api/ pour query la DB
const apiRequire = createRequire(path.join(ROOT, "api/package.json"));
const { Client } = apiRequire("pg");

const DRY = process.argv.includes("--dry");
const COPY_ONLY = process.argv.includes("--copy-only");

const html = fs.readFileSync(path.join(ROOT, "email-templates/vip-welcome.html"), "utf8");
const subject = "👑 Bienvenue au Club VIP Celsius Casino";
const text = `Bienvenue au Club VIP - Celsius Casino

Votre demande a ete recue. Vous faites desormais partie d'un cercle privilegie.

Vos avantages exclusifs :
- Bonus exclusifs (offres dediees invisibles du public)
- Boost sur depot (% bonus recharge sur chaque depot)
- Bonus wager x1 (sommes retirables avec 1 seule mise)
- Cashback augmente (% remboursement booste sur pertes)
- Retraits prioritaires (traitement express sous 24h)
- Host dedie 24/7 (ligne directe sur Telegram)

EXCLUSIVITE CELSIUS - VIP Transfert
Vous jouez deja sur un autre casino ? Nous transferons votre progression
complete (niveau VIP, statut, historique) directement sur Celsius Casino.

Etape finale : Contactez votre VIP Host Manager sur Telegram
https://t.me/Aurix_VipManager
Ou cherchez : @Aurix_VipManager
`;

function parseFrom(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]?.trim() || "Aurix VIP", email: m[2].trim() };
  return { name: "Aurix VIP", email: s };
}
const from = parseFrom(EMAIL_FROM);

async function sendOne(to) {
  if (DRY) { console.log(`  [DRY] would send to ${to}`); return { ok: true, dry: true }; }
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY, "accept": "application/json" },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: [{ email: to }],
      subject, textContent: text, htmlContent: html,
    }),
  });
  const body = await r.text();
  if (!r.ok) return { ok: false, err: `${r.status}: ${body.slice(0, 200)}` };
  return { ok: true, body };
}

// ─── Recupere les leads
let leads = [];
if (!COPY_ONLY) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("❌ DATABASE_URL manquant"); process.exit(1); }
  const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes("sslmode=") || dbUrl.includes("render.com") ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  const { rows } = await client.query("SELECT email, created_at FROM affi_vip_leads ORDER BY created_at ASC");
  leads = rows;
  await client.end();
  console.log(`📋 ${leads.length} leads trouves en DB :`);
  for (const l of leads) console.log(`   - ${l.email}`);
}

// ─── Envoi
console.log(`\n📤 Sender : ${from.name} <${from.email}>`);
console.log(`   Dry run : ${DRY ? "OUI" : "non"}`);
console.log("");

let success = 0, fail = 0;

for (const lead of leads) {
  process.stdout.write(`  → ${lead.email} ... `);
  const res = await sendOne(lead.email);
  if (res.ok) { console.log("✅"); success++; }
  else { console.log(`❌ ${res.err}`); fail++; }
  // Throttle pour eviter rate-limit Brevo
  await new Promise(r => setTimeout(r, 800));
}

// Copie a kasinoze
console.log(`\n📋 Copie de verification :`);
process.stdout.write(`  → ${COPY_TO} ... `);
const cp = await sendOne(COPY_TO);
if (cp.ok) { console.log("✅"); success++; }
else { console.log(`❌ ${cp.err}`); fail++; }

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ Succes : ${success}`);
console.log(`❌ Echecs : ${fail}`);
