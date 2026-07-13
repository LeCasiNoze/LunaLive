// Twitch casino streamer scout — EN / DE outreach board.
//
// Découvre des streamers casino (catégorie Slots), estime la part de vrais
// spectateurs vs bots via un échantillon de chat, et extrait un contact
// (Telegram > mail > Discord > Instagram). Sortie: JSON + CSV + board HTML.
//
// Découverte:
//   - mode "session": passe une session Twitch connectée pour lire le
//     directory gambling (masqué aux requêtes anonymes). Fournir le cookie
//     `auth-token` de twitch.tv via  --auth <token>  ou  scripts/.twitch_auth
//   - mode "seed" (défaut si pas d'auth): part d'une liste de streamers
//     casino connus et les enrichit. Prouve le pipeline sans credential.
//
// Usage:
//   node scripts/twitch_casino_scout.mjs [--auth <token>] [--langs EN,DE]
//        [--min <viewers>] [--top <N>] [--sample <sec>] [--no-chat] [--live-only]
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "scripts");
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // public web client-id (lecture)
const GQL = "https://gql.twitch.tv/gql";
// hash de la requête persistée DirectoryPage_Game (validée: renvoie du réel)
const DIR_HASH = "c7c9d5aad09155c4161d2382092dc44610367f3536aac39019ec2582ae5065f9";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ---- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf("--" + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : def; }
let AUTH = arg("auth", null);
if (!AUTH) { try { AUTH = fs.readFileSync(path.join(OUT_DIR, ".twitch_auth"), "utf8").trim() || null; } catch {} }
const LANGS = String(arg("langs", "EN,DE")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const MIN_VIEWERS = Number(arg("min", 15));
const TOP = Number(arg("top", 60));           // max chaînes par langue en mode session
const SAMPLE_SEC = Number(arg("sample", 30));  // durée échantillon chat par chaîne live
const NO_CHAT = arg("no-chat", false) === true;
const NO_PUSH = arg("no-push", false) === true;
const LIVE_ONLY = arg("live-only", false) === true;
const CATEGORY_SLUG = String(arg("category", "slots"));

// liste seed (mode sans session) — le tool valide chaque login, les inconnus tombent
const SEED = {
  EN: ["roshtein","trainwreckstv","classybeef","xposed","deuceace","vondice","ayezee","watchgamestv","casinodaddy","fruityslots","letsgiveitaspin","davidlabowsky","m0e_tv","spintwix","nickslots","slotmojo","craigsroom","jarttu84","thesgc","stevewilldoit","bidule","yassuo"],
  DE: ["knossi","casinofieber","scurrows","casinotest24","spielothek","buffti","montanablack88","letshugotv","reeze","dafunktastic"],
};

// ---- GQL ----------------------------------------------------------------
async function gql(body) {
  const headers = { "Client-ID": CLIENT_ID, "Content-Type": "application/json", "User-Agent": UA };
  if (AUTH) headers["Authorization"] = "OAuth " + AUTH.replace(/^OAuth\s+/i, "");
  const res = await fetch(GQL, { method: "POST", headers, body: JSON.stringify(body) });
  return res.json().catch(() => null);
}

async function directory(langCode) {
  // renvoie [{login, viewers, title}] pour la catégorie, filtré par langue
  const out = new Map();
  let cursor = null;
  for (let page = 0; page < 6 && out.size < TOP; page++) {
    const variables = {
      imageWidth: 50, slug: CATEGORY_SLUG,
      options: { sort: "VIEWER_COUNT", recommendationsContext: { platform: "web" }, requestID: "scout", freeformTags: null, tags: [], broadcasterLanguages: [langCode] },
      sortTypeIsRecency: false, limit: 30, includeIsDJ: false,
    };
    if (cursor) variables.cursor = cursor;
    const r = await gql([{ operationName: "DirectoryPage_Game", variables, extensions: { persistedQuery: { version: 1, sha256Hash: DIR_HASH } } }]);
    const one = Array.isArray(r) ? r[0] : r;
    const edges = one?.data?.game?.streams?.edges || [];
    if (!edges.length) break;
    let added = 0;
    for (const e of edges) {
      const login = e.node?.broadcaster?.login;
      if (login && !out.has(login)) { out.set(login, { login, viewers: e.node.viewersCount, title: e.node.title }); added++; }
      cursor = e.cursor || cursor;
    }
    if (!added) break; // cursor non supporté par le hash → on garde la 1re page
  }
  return [...out.values()];
}

// ---- enrichissement -----------------------------------------------------
const ENRICH_Q = `query($login:String!){ user(login:$login){
  id login displayName description
  roles{ isPartner isAffiliate }
  followers{ totalCount }
  broadcastSettings{ language title }
  stream{ id viewersCount type game{ name } createdAt }
  channel{ socialMedias{ name title url } }
  panels{ id ... on DefaultPanel{ title description linkURL } }
} }`;

async function enrich(login) {
  const r = await gql({ query: ENRICH_Q, variables: { login } });
  const u = r?.data?.user;
  if (!u) return null;
  const socials = (u.channel?.socialMedias || []).map((s) => ({ name: s.name, url: s.url }));
  // texte brut où chercher des contacts: bio + panels (linkURL + description)
  const linkUrls = [];
  const blobs = [u.description || ""];
  for (const p of u.panels || []) { if (p.linkURL) linkUrls.push(p.linkURL); if (p.description) blobs.push(p.description); }
  for (const s of socials) linkUrls.push(s.url);
  return {
    login: u.login,
    name: u.displayName || u.login,
    language: u.broadcastSettings?.language || null,
    partner: !!u.roles?.isPartner,
    affiliate: !!u.roles?.isAffiliate,
    followers: u.followers?.totalCount || 0,
    live: !!u.stream,
    viewers: u.stream?.viewersCount || 0,
    game: u.stream?.game?.name || null,
    title: u.stream ? u.broadcastSettings?.title : (u.broadcastSettings?.title || ""),
    contacts: extractContacts(linkUrls, blobs.join("\n"), socials),
    socials,
    // texte conservé pour recalculer le pays sans re-enrichir quand l'heuristique évolue
    search_text: (blobs.join(" ") + " " + linkUrls.join(" ") + " " + (u.broadcastSettings?.title || "")).replace(/\s+/g, " ").trim().slice(0, 1500),
  };
}

// Twitch n'a pas de langue "UK" : les britanniques streament en EN. On devine
// le pays via des signaux dans bio/panels/titre. UK reste une estimation à
// confirmer à l'oeil ; on ne jette jamais un EN, on le classe "EN?" par défaut.
function countryGuess(text, language) {
  if (language === "DE") return "DE";
  if (language && language !== "EN") return language;
  const t = " " + text + " ";
  // signaux UK forts : jeu responsable britannique + £ + toponymes/domaines UK
  if (/£|\bgbp\b|\buk\b|united kingdom|\bbritish\b|\.co\.uk|\bengland\b|\bscotland\b|\bwales\b|gamstop|begambleaware|gamble\s?aware|\bukgc\b|\bgamcare\b/i.test(t)) return "UK";
  if (/\busd\b|\bunited states\b|\bamerica\b|\bnfl\b|\bnba\b|begambleaware.*us|\.com\/us/i.test(t)) return "US";
  return "EN?";
}

// ---- extraction contacts (priorité telegram > mail > discord > instagram)
function extractContacts(urls, text, socials) {
  const c = { telegram: null, email: null, discord: null, instagram: null, other: [] };
  const push = (kind, val) => { if (val && !c[kind]) c[kind] = val; };
  const classify = (url) => {
    if (!url) return;
    const u = url.trim();
    if (/(?:t\.me\/|telegram\.(?:me|org)\/)/i.test(u)) push("telegram", u);
    else if (/^mailto:/i.test(u)) push("email", u.replace(/^mailto:/i, ""));
    else if (/discord\.(?:gg|com\/invite|com\/users)/i.test(u)) push("discord", u);
    else if (/instagram\.com\//i.test(u)) push("instagram", u);
    else if (/^https?:\/\//i.test(u)) c.other.push(u);
  };
  for (const s of socials) { // le "name" désambigüise t.me vs autre
    if (/^t$|telegram/i.test(s.name)) push("telegram", s.url);
    else classify(s.url);
  }
  for (const u of urls) classify(u);
  // texte libre (bio + panels): emails, t.me, @insta bruts
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const tgRe = /(?:t\.me\/|telegram[:\s]+@?)([a-z0-9_]{4,})/gi;
  let m;
  while ((m = emailRe.exec(text))) push("email", m[0]);
  while ((m = tgRe.exec(text))) push("telegram", m[0].includes("t.me") ? "https://" + m[0].replace(/^https?:\/\//, "") : "https://t.me/" + m[1]);
  const igRe = /instagram\.com\/([a-z0-9._]{2,30})/gi;
  while ((m = igRe.exec(text))) push("instagram", "https://instagram.com/" + m[1]);
  c.primary = c.telegram ? { kind: "telegram", value: c.telegram }
    : c.email ? { kind: "email", value: c.email }
    : c.discord ? { kind: "discord", value: c.discord }
    : c.instagram ? { kind: "instagram", value: c.instagram } : null;
  return c;
}

// ---- échantillon chat (IRC anonyme) -> vrais viewers vs bots -------------
function sampleChat(channel, ms) {
  return new Promise((resolve) => {
    let ws;
    const users = new Set();
    const texts = [];
    let msgs = 0, opened = false;
    const done = () => { try { ws.close(); } catch {} resolve(finalize()); };
    const finalize = () => {
      const dup = texts.length ? +(1 - new Set(texts).size / texts.length).toFixed(2) : 0;
      return { channel, opened, msgs, unique: users.size, msgsPerMin: +(msgs / (ms / 60000)).toFixed(1), dupRate: dup };
    };
    try { ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443"); }
    catch { return resolve(finalize()); }
    ws.onopen = () => { opened = true; ws.send("NICK justinfan" + (10000 + (channel.length * 131) % 80000)); ws.send("JOIN #" + channel.toLowerCase()); };
    ws.onmessage = (ev) => {
      for (const line of String(ev.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        const m = line.match(/^:(\w+)!\w+@[\w.]+ PRIVMSG #\S+ :(.*)$/);
        if (m) { users.add(m[1]); msgs++; texts.push(m[2].trim().toLowerCase()); }
      }
    };
    ws.onerror = () => done();
    setTimeout(done, ms);
  });
}

// verdict authenticité. Signal principal = ratio followers/viewers : un vrai
// canal a beaucoup plus de followers cumulés que de viewers simultanés. Un
// ratio < ~1 (plus de viewers que de followers au total) = viewers achetés.
// Le chat (souvent mort sur les slots) sert de signal secondaire.
function authenticityVerdict(r) {
  const { followers, viewers } = r;
  const s = r.chat;
  const fvr = viewers > 0 ? followers / Math.max(1, viewers) : null; // ratio foll/viewers
  const chatters = s?.unique ?? 0, msgs = s?.msgs ?? 0;
  if (!r.live) return { label: "offline", score: "na", note: "", fvr };
  if (fvr !== null && viewers >= 40 && fvr < 1.2)
    return { label: "🚫 viewers achetés", score: "bot", note: `${followers} followers pour ${viewers} viewers (ratio ${fvr.toFixed(2)})`, fvr };
  if (fvr !== null && viewers >= 40 && fvr < 4)
    return { label: "⚠ ratio douteux", score: "warn", note: `${followers} foll / ${viewers} v (ratio ${fvr.toFixed(1)}) · chat ${chatters} pers.`, fvr };
  if (s?.opened && chatters >= 4 && viewers > 0 && chatters / viewers * 100 >= 3)
    return { label: "✅ audience réelle", score: "ok", note: `${chatters} chatters, ${msgs} msg/30s · ratio ${fvr?.toFixed(0)}`, fvr };
  if (s?.opened)
    return { label: "⚪ crédible (chat calme)", score: "neutral", note: `${followers} foll · ${chatters} chatters/30s · ratio ${fvr?.toFixed(0)}`, fvr };
  return { label: "non échantillonné", score: "na", note: "", fvr };
}

// accumule les viewers live vus au fil des runs -> moyenne + pic enregistrés
function recordViewers(rec, viewers) {
  if (typeof viewers !== "number" || viewers <= 0) return;
  rec.viewers_sum = (rec.viewers_sum || 0) + viewers;
  rec.viewers_samples = (rec.viewers_samples || 0) + 1;
  rec.viewers_avg = Math.round(rec.viewers_sum / rec.viewers_samples);
  rec.viewers_peak = Math.max(rec.viewers_peak || 0, viewers);
}

// ---- pool de concurrence ------------------------------------------------
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ---- main ---------------------------------------------------------------
const log = (...a) => console.error(...a);
const NOW = new Date().toISOString().slice(0, 16).replace("T", " ");
const DB_PATH = path.join(OUT_DIR, "twitch_casino_db.json");
const loadDb = () => { try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch { return {}; } };
const saveDb = (db) => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

log(`[${NOW}] Mode: ${AUTH ? "SESSION" : "SEED"} | langues ${LANGS.join(",")} | échantillon chat ${NO_CHAT ? "off" : SAMPLE_SEC + "s"}`);
const db = loadDb();
const dbCount0 = Object.keys(db).length;

// 1) découverte live par langue
const discovered = new Map(); // login -> {viewers,title}
let discoveryOk = false;
for (const lang of LANGS) {
  let found = [];
  if (AUTH) { found = await directory(lang); log(`  directory ${lang}: ${found.length}`); if (found.length) discoveryOk = true; }
  else { found = (SEED[lang] || []).map((login) => ({ login })); discoveryOk = true; }
  for (const f of found) if (!discovered.has(f.login)) discovered.set(f.login, f);
}
// garde-fou run horaire : découverte vide = VPN retombé FR ou cookie expiré.
// On ne touche PAS à la base pour ne pas tout écraser, on ressort proprement.
if (AUTH && !discoveryOk) {
  log(`\n⚠ Découverte vide sur toutes les langues — VPN probablement retombé sur la France, ou cookie auth-token expiré.`);
  log(`  Base existante (${dbCount0} streamers) laissée intacte. Rien écrit. Nouvel essai au prochain run.`);
  process.exit(0);
}
log(`Live découverts: ${discovered.size} | base actuelle: ${dbCount0}`);

// 2) qui traiter : validé (a un contact) -> skip cher ; sinon (nouveau / sans contact) -> (re)traiter
const toProcess = [];
let skipped = 0;
for (const [login, d] of discovered) {
  const rec = db[login];
  if (rec && rec.has_contact && rec.bot_status && rec.bot_status !== "unknown") {
    rec.live = true; rec.viewers = d.viewers ?? rec.viewers; rec.last_seen = NOW; rec.seen_count = (rec.seen_count || 0) + 1;
    recordViewers(rec, d.viewers);
    skipped++;
  } else { toProcess.push({ login, d }); }
}
log(`À (re)traiter: ${toProcess.length} | déjà validés, ignorés: ${skipped}`);

// 3) enrichir les à-traiter
const enriched = (await pool(toProcess, 8, async ({ login, d }) => {
  try { const e = await enrich(login); if (e) e._dViewers = d.viewers; return e; } catch { return null; }
})).filter(Boolean);

// 4) chat : uniquement live, viewers suffisants, pas déjà connu bot, pas déjà échantillonné
const needChat = [];
if (!NO_CHAT) for (const e of enriched) {
  const rec = db[e.login] || {};
  if (e.live && e.viewers >= MIN_VIEWERS && rec.bot_status !== "bot" && !rec.chat) needChat.push(e);
}
if (needChat.length) { log(`Échantillon chat: ${needChat.length} chaînes (${SAMPLE_SEC}s, 6 en //)...`); await pool(needChat, 6, async (e) => { e.chat = await sampleChat(e.login, SAMPLE_SEC * 1000); }); }

// 5) fusion dans la base
for (const e of enriched) {
  const rec = db[e.login] || { login: e.login, first_seen: NOW, seen_count: 0 };
  Object.assign(rec, {
    login: e.login, name: e.name, language: e.language, country: e.country,
    partner: e.partner, followers: e.followers,
    live: e.live, viewers: e.viewers, game: e.game, title: e.title,
    contacts: e.contacts, has_contact: !!e.contacts?.primary, socials: e.socials, search_text: e.search_text,
    chat: e.chat || rec.chat || null, last_seen: NOW, last_enriched: NOW, seen_count: (rec.seen_count || 0) + 1,
  });
  if (e.live) recordViewers(rec, e.viewers);
  db[e.login] = rec;
}
// tout ce qui n'est pas live ce run repasse offline (données conservées)
const liveSet = new Set(discovered.keys());
for (const login of Object.keys(db)) if (!liveSet.has(login)) db[login].live = false;

// 6) verdict + statut bot (figé une fois "bot") + pays recalculé (heuristique à jour)
for (const r of Object.values(db)) {
  r.country = countryGuess(r.search_text || r.title || "", r.language);
  r.verdict = authenticityVerdict(r);
  if (r.verdict.score === "bot") r.bot_status = "bot";
  else if (r.bot_status !== "bot" && (r.verdict.score === "ok" || r.verdict.score === "neutral")) r.bot_status = "ok";
  else if (!r.bot_status) r.bot_status = "unknown";
}
saveDb(db);

// 7) sorties depuis la base complète
const all = Object.values(db).sort((a, b) => (b.live - a.live) || (b.viewers - a.viewers) || (b.followers - a.followers));
fs.writeFileSync(path.join(OUT_DIR, "twitch_casino_scout_out.json"), JSON.stringify(all, null, 2));
writeCsv(all);
writeHtml(all);

// 7bis) push en base Postgres (pour le FSB Board). Silencieux si indispo.
if (!NO_PUSH) await pushToPostgres(all);

const liveN = all.filter((r) => r.live).length;
const withContact = all.filter((r) => r.has_contact).length;
const bots = all.filter((r) => r.bot_status === "bot").length;
log(`\n=== base: ${all.length} streamers | ${liveN} live | ${withContact} avec contact | ${bots} bots écartés ===`);
console.log("live\tpays\tviewers\tfoll\tcontact\tverdict\tlogin");
for (const r of all.filter((x) => x.live).slice(0, 60)) {
  const c = r.contacts?.primary;
  console.log(`${r.live ? "🔴" : "·"}\t${r.country || r.language || "?"}\t${r.viewers}\t${r.followers}\t${c ? c.kind + ":" + c.value.slice(0, 30) : "—"}\t${r.verdict?.label || ""}\t${r.login}`);
}
log(`\nÉcrit: twitch_casino_db.json (base), twitch_casino_scout_out.json, twitch_casino_streamers.csv, twitch_casino_board.html`);

// ---- writers ------------------------------------------------------------
// ---- push Postgres (alimente le FSB Board) -------------------------------
async function pushToPostgres(rows) {
  let pg;
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, "api", "node_modules", "pg", "lib", "index.js")).href);
    pg = mod.default;
  } catch { log("  (pg indisponible — push DB ignoré)"); return; }
  let dbUrl = "";
  try {
    const env = fs.readFileSync(path.join(ROOT, "api", ".env"), "utf8");
    dbUrl = (env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL=")) || "").replace(/^DATABASE_URL=/, "").replace(/^["']|["']$/g, "").trim();
  } catch {}
  if (!dbUrl) { log("  (DATABASE_URL absent — push DB ignoré)"); return; }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS twitch_scout_streamers (
      login text PRIMARY KEY, name text, country text, language text,
      partner boolean, followers integer,
      live boolean, viewers integer, viewers_avg integer, viewers_peak integer, viewers_samples integer,
      game text, title text,
      contact_type text, contact_value text, telegram text, email text, discord text, instagram text,
      has_contact boolean, bot_status text, verdict_label text, verdict_score text,
      first_seen timestamptz, last_seen timestamptz, seen_count integer,
      updated_at timestamptz DEFAULT now(),
      contacted boolean DEFAULT false, contacted_at timestamptz, contacted_channel text
    )`);
    // colonnes outreach : ajoutées après coup si la table existait déjà. JAMAIS
    // écrasées par l'upsert du scout (le statut contacté vient de l'outil DM).
    await client.query(`ALTER TABLE twitch_scout_streamers ADD COLUMN IF NOT EXISTS contacted boolean DEFAULT false`);
    await client.query(`ALTER TABLE twitch_scout_streamers ADD COLUMN IF NOT EXISTS contacted_at timestamptz`);
    await client.query(`ALTER TABLE twitch_scout_streamers ADD COLUMN IF NOT EXISTS contacted_channel text`);
    for (const r of rows) {
      const c = r.contacts || {};
      await client.query(
        `INSERT INTO twitch_scout_streamers
         (login,name,country,language,partner,followers,live,viewers,viewers_avg,viewers_peak,viewers_samples,game,title,contact_type,contact_value,telegram,email,discord,instagram,has_contact,bot_status,verdict_label,verdict_score,first_seen,last_seen,seen_count,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,now())
         ON CONFLICT (login) DO UPDATE SET
           name=EXCLUDED.name,country=EXCLUDED.country,language=EXCLUDED.language,partner=EXCLUDED.partner,followers=EXCLUDED.followers,
           live=EXCLUDED.live,viewers=EXCLUDED.viewers,viewers_avg=EXCLUDED.viewers_avg,viewers_peak=EXCLUDED.viewers_peak,viewers_samples=EXCLUDED.viewers_samples,
           game=EXCLUDED.game,title=EXCLUDED.title,contact_type=EXCLUDED.contact_type,contact_value=EXCLUDED.contact_value,
           telegram=EXCLUDED.telegram,email=EXCLUDED.email,discord=EXCLUDED.discord,instagram=EXCLUDED.instagram,
           has_contact=EXCLUDED.has_contact,bot_status=EXCLUDED.bot_status,verdict_label=EXCLUDED.verdict_label,verdict_score=EXCLUDED.verdict_score,
           last_seen=EXCLUDED.last_seen,seen_count=EXCLUDED.seen_count,updated_at=now()`,
        [r.login, r.name, r.country || null, r.language || null, !!r.partner, r.followers || 0,
         !!r.live, r.viewers || 0, r.viewers_avg || null, r.viewers_peak || null, r.viewers_samples || null,
         r.game || null, r.title || null, c.primary?.kind || null, c.primary?.value || null,
         c.telegram || null, c.email || null, c.discord || null, c.instagram || null,
         !!r.has_contact, r.bot_status || null, r.verdict?.label || null, r.verdict?.score || null,
         r.first_seen || null, r.last_seen || null, r.seen_count || 1]
      );
    }
    log(`  → poussé ${rows.length} streamers en base (twitch_scout_streamers)`);
  } catch (e) { log(`  ⚠ push DB échoué: ${e.message}`); }
  finally { try { await client.end(); } catch {} }
}

function csvCell(v) { const s = String(v ?? ""); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function writeCsv(rows) {
  const head = ["login", "name", "pays", "langue", "live", "viewers", "followers", "partner", "bot_status", "verdict", "contact_type", "contact", "telegram", "email", "discord", "instagram", "first_seen", "last_seen", "seen_count", "title"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const c = r.contacts || {};
    lines.push([r.login, r.name, r.country || "", r.language || "", r.live ? "live" : "off", r.viewers, r.followers, r.partner ? "yes" : "", r.bot_status || "", r.verdict?.label || "", c.primary?.kind || "", c.primary?.value || "", c.telegram || "", c.email || "", c.discord || "", c.instagram || "", r.first_seen || "", r.last_seen || "", r.seen_count || "", r.title || ""].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(OUT_DIR, "twitch_casino_streamers.csv"), lines.join("\n"));
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
function writeHtml(rows) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  const contactCell = (r) => {
    const c = r.contacts || {};
    const chip = (kind, val, label) => val ? `<a class="chip ${kind}" href="${esc(val.startsWith("http") || kind !== "email" ? (kind === "email" ? "mailto:" + val : val) : "mailto:" + val)}" target="_blank" rel="noopener">${label}</a>` : "";
    return [chip("telegram", c.telegram, "Telegram"), chip("email", c.email, "Mail"), chip("discord", c.discord, "Discord"), chip("instagram", c.instagram, "Insta")].filter(Boolean).join(" ") || '<span class="muted">—</span>';
  };
  const verdictClass = (r) => r.verdict?.score || "neutral";
  const flag = (c) => c === "UK" ? "🇬🇧 UK" : c === "DE" ? "🇩🇪 DE" : c === "US" ? "🇺🇸 US" : c === "EN?" ? "EN ?" : (c || "?");
  const body = rows.map((r) => `<tr data-country="${r.country || r.language || "?"}" data-lang="${r.language || "?"}" data-live="${r.live ? 1 : 0}" data-score="${r.verdict?.score || "na"}" data-contact="${r.has_contact ? 1 : 0}" data-tg="${r.contacts?.telegram ? 1 : 0}" data-mail="${r.contacts?.email ? 1 : 0}">
    <td><a class="name" href="https://twitch.tv/${esc(r.login)}" target="_blank" rel="noopener">${esc(r.name)}</a><div class="sub">${esc(r.login)}${r.partner ? ' <span class="v">✓</span>' : ""}</div></td>
    <td class="nowrap">${flag(r.country)}</td>
    <td class="num">${r.live ? `<span class="live">🔴 ${r.viewers.toLocaleString()}</span>` : '<span class="muted">off</span>'}</td>
    <td class="num">${r.followers.toLocaleString()}</td>
    <td><span class="verdict ${verdictClass(r)}">${esc(r.verdict?.label || "")}</span><div class="sub">${esc(r.verdict?.note || "")}</div></td>
    <td>${contactCell(r)}</td>
    <td class="sub nowrap">${esc(r.last_seen || "")}<div class="sub">×${r.seen_count || 1}</div></td>
    <td class="sub title">${esc((r.title || "").slice(0, 80))}</td>
  </tr>`).join("\n");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Casino scout — Twitch UK/DE</title>
<style>
:root{--bg:#0e1015;--card:#171a22;--line:#252a35;--fg:#e7e9ee;--mut:#8b93a5;--acc:#c8a24a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 'DM Sans',system-ui,Arial,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
h1{margin:0 0 4px;font:600 20px 'Space Grotesk',system-ui}.meta{color:var(--mut);font-size:13px}
.bar{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.bar button{background:var(--card);border:1px solid var(--line);color:var(--fg);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px}
.bar button.on{border-color:var(--acc);color:var(--acc)}
.bar input{background:var(--card);border:1px solid var(--line);color:var(--fg);padding:6px 12px;border-radius:8px;min-width:180px}
.wrap{overflow-x:auto;padding:0 12px 60px}
table{border-collapse:collapse;width:100%;min-width:900px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{position:sticky;top:96px;background:var(--bg);color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;user-select:none}
tr:hover td{background:#12151c}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.name{color:var(--fg);font-weight:600;text-decoration:none}.name:hover{color:var(--acc)}
.sub{color:var(--mut);font-size:12px}.title{max-width:260px}.muted{color:#555}.nowrap{white-space:nowrap}
.live{color:#ff5c5c;font-weight:600;white-space:nowrap}.v{color:#7ecbff}
.chip{display:inline-block;padding:3px 8px;border-radius:6px;font-size:12px;text-decoration:none;margin:1px 0;border:1px solid var(--line)}
.chip.telegram{background:#1c2f45;color:#7ec8ff;border-color:#2a4a6b}
.chip.email{background:#3a2a12;color:#f0c07a;border-color:#5b4322}
.chip.discord{background:#2a2b4a;color:#a8adf7;border-color:#3d3f6b}
.chip.instagram{background:#3a1830;color:#f28ac7;border-color:#5b2749}
.verdict{font-size:12px;font-weight:600}.verdict.ok{color:#6ee7a8}.verdict.warn{color:#ffbf5c}.verdict.bot{color:#ff6b6b}.verdict.neutral{color:#cbd2e0}.verdict.na{color:var(--mut)}
</style></head><body>
<header>
  <h1>Casino scout — Twitch UK / DE</h1>
  <div class="meta">${rows.length} streamers cumulés · ${rows.filter((r) => r.live).length} live maintenant · ${rows.filter((r) => r.has_contact).length} avec contact · ${rows.filter((r) => r.bot_status === "bot").length} bots écartés · MAJ ${now} · contact prioritaire Telegram › Mail › Discord › Insta</div>
  <div class="bar">
    <button data-f="target" class="on">Cibles (UK+DE, vrais, contact)</button>
    <button data-f="all">Tous</button>
    <button data-f="UK">🇬🇧 UK</button>
    <button data-f="DE">🇩🇪 DE</button>
    <button data-f="ENtri">EN ? (à trier)</button>
    <button data-f="real">Sans viewers achetés</button>
    <button data-f="live">Live maintenant</button>
    <button data-f="contact">A un contact</button>
    <input id="q" placeholder="filtrer (login, titre)…">
  </div>
</header>
<div class="wrap"><table id="t">
<thead><tr><th data-k="name">Streamer</th><th>Pays</th><th data-k="viewers" class="num">Live</th><th data-k="foll" class="num">Followers</th><th>Chat / bots</th><th>Contact</th><th>Vu</th><th>Titre</th></tr></thead>
<tbody>${body}</tbody></table></div>
<script>
const rowsEl=[...document.querySelectorAll('#t tbody tr')];
let filt='target';
function apply(){const q=document.getElementById('q').value.toLowerCase();for(const tr of rowsEl){let ok=true;
 if(filt==='live')ok=tr.dataset.live==='1';
 else if(filt==='real')ok=tr.dataset.score!=='bot';
 else if(filt==='contact')ok=tr.dataset.contact==='1';
 else if(filt==='UK')ok=tr.dataset.country==='UK';
 else if(filt==='DE')ok=tr.dataset.country==='DE';
 else if(filt==='ENtri')ok=tr.dataset.country==='EN?'&&tr.dataset.score!=='bot';
 else if(filt==='target')ok=(tr.dataset.country==='UK'||tr.dataset.country==='DE')&&tr.dataset.score!=='bot'&&tr.dataset.contact==='1';
 if(ok&&q)ok=tr.innerText.toLowerCase().includes(q);tr.style.display=ok?'':'none';}}
document.querySelectorAll('.bar button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.bar button').forEach(x=>x.classList.remove('on'));b.classList.add('on');filt=b.dataset.f;apply();});
document.getElementById('q').oninput=apply;
document.querySelectorAll('th[data-k]').forEach(th=>{let asc=false;th.onclick=()=>{asc=!asc;const k=th.dataset.k;const tb=document.querySelector('#t tbody');[...rowsEl].sort((a,b)=>{const g=(tr)=>{if(k==='viewers')return +tr.querySelector('.live')?.textContent.replace(/[^0-9]/g,'')||0;if(k==='foll')return +tr.children[3].textContent.replace(/[^0-9]/g,'')||0;return tr.innerText.toLowerCase();};const x=g(a),y=g(b);return(typeof x==='number'?x-y:String(x).localeCompare(y))*(asc?1:-1);}).forEach(tr=>tb.appendChild(tr));};});
</script></body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, "twitch_casino_board.html"), html);
}
