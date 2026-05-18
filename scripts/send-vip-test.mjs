// scripts/send-vip-test.mjs
// Envoie l'email VIP welcome via Brevo HTTP API (necessite BREVO_API_KEY).
// Usage : node scripts/send-vip-test.mjs <email>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Parse api/.env manuellement
const envText = fs.readFileSync(path.join(ROOT, "api/.env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}

const to = process.argv[2] || "kasinoze@gmail.com";
const BREVO_API_KEY = process.env.BREVO_API_KEY;
// Force le sender VALIDE chez Brevo (l'EMAIL_FROM de api/.env est faux,
// il pointe sur "LunaLive.dark.amazing04@gmail.com" qui n'est PAS un sender
// validé. Le sender validé est "dark.amazing04@gmail.com").
const EMAIL_FROM = "LunaLive <dark.amazing04@gmail.com>";

if (!BREVO_API_KEY) {
  console.error("❌ BREVO_API_KEY manquant dans api/.env");
  process.exit(1);
}

// Parse "Name <email>" → { name, email }
function parseFrom(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]?.trim() || "LunaLive", email: m[2].trim() };
  return { name: "LunaLive", email: s };
}
const from = parseFrom(EMAIL_FROM);

const html = fs.readFileSync(path.join(ROOT, "email-templates/vip-welcome.html"), "utf8");
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
Aucune perte. Reprenez la ou vous etiez, avec des conditions plus avantageuses.

Etape finale : Contactez votre VIP Host Manager sur Telegram
https://t.me/Aurix_VipManager
Ou cherchez : @Aurix_VipManager

Reponse 24h - Confidentiel - Sans engagement

---
Reserve aux 18+. Les jeux d'argent comportent des risques.
Aide : 09 74 75 13 13 - joueurs-info-service.fr
(c) LunaLive
`;

const payload = {
  sender: { name: from.name, email: from.email },
  to: [{ email: to }],
  subject: "👑 Bienvenue au Club VIP Celsius Casino",
  textContent: text,
  htmlContent: html,
};

console.log(`📤 Envoi via Brevo HTTP API a ${to}`);
console.log(`   From: ${from.name} <${from.email}>`);

const r = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "api-key": BREVO_API_KEY,
    "accept": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await r.text();
if (!r.ok) {
  console.error(`❌ Brevo ${r.status}:`, body);
  process.exit(1);
}
console.log(`✅ Email envoye`);
console.log(`   Brevo response:`, body);
