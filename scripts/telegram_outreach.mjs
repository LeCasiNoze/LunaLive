// Console d'outreach Telegram — envoi DM semi-automatique depuis TA session
// Telegram Desktop (aucun bot, aucune API : on pilote l'app qui tourne déjà).
//
// Ouvre http://localhost:8747 : liste les streamers casino avec un Telegram,
// non encore contactés (depuis twitch_scout_streamers). Pour chacun : message
// pré-rempli (adapté prénom + langue), éditable. Bouton "Envoyer" :
//   1. copie le message dans le presse-papier
//   2. ouvre tg://resolve?domain=<pseudo> (Telegram s'ouvre sur la conversation)
//   3. colle (Ctrl+V) + Entrée  -> message envoyé
//   4. marque le compte "contacté" en base (ne le repropose plus)
//
// Prérequis : Telegram Desktop installé, ouvert et connecté à ta session.
// ⚠ Pendant l'envoi (~4s), ne touche ni souris ni clavier.
//
// Lancer :  node scripts/telegram_outreach.mjs   puis ouvrir http://localhost:8747

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8747;
const CELSIUS = "https://celsiuscasino.com/";
// Telegram Web (onglet navigateur). Si ta version est la "A", remplace /k/ par /a/.
const WEB_TG_BASE = "https://web.telegram.org/k/#@";
const OPEN_WAIT_MS = 3200; // temps d'ouverture du chat (même onglet) avant collage

// ---- DB ------------------------------------------------------------------
const { default: pg } = await import(pathToFileURL(path.join(ROOT, "api", "node_modules", "pg", "lib", "index.js")).href);
const env = fs.readFileSync(path.join(ROOT, "api", ".env"), "utf8");
const dbUrl = (env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL=")) || "").replace(/^DATABASE_URL=/, "").replace(/^["']|["']$/g, "").trim();
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();

// ---- helpers -------------------------------------------------------------
// extrait le pseudo DM-able d'un lien t.me ; renvoie null si chaîne/invite
function tgUsername(url) {
  if (!url) return null;
  const m = String(url).match(/(?:t\.me\/|telegram\.me\/)@?([^/?#\s]+)/i);
  if (!m) return null;
  const u = m[1];
  if (/^\+/.test(u) || /^joinchat$/i.test(u) || /^s$/i.test(u)) return null; // invite / lien privé
  return u.replace(/^@/, "");
}

// Classe un @pseudo Telegram via sa page publique t.me : "user" (DM-able),
// "channel"/"group" (non DM-able), "unknown" (on laisse tenter).
async function classifyTelegram(username) {
  try {
    const html = await fetch(`https://t.me/${username}`, { headers: { "user-agent": "Mozilla/5.0" } }).then((r) => r.text());
    if (/\b[\d  ,.]+\s*subscribers\b/i.test(html) || /Preview channel/i.test(html)) return "channel";
    if (/\b[\d  ,.]+\s*members\b/i.test(html)) return "group";
    if (/Send Message/i.test(html)) return "user";
    return "unknown";
  } catch { return "unknown"; }
}

function firstName(name, login) {
  const n = (name || login || "").trim();
  // garde le premier mot "propre" (sinon le login)
  const w = n.split(/[\s_|.-]+/).find((x) => /^[A-Za-zÀ-ÿ]{2,}$/.test(x));
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : (login || "there");
}

function buildMessage(r) {
  const name = firstName(r.name, r.login);
  if (r.country === "DE" || r.language === "DE") {
    return `Hey ${name}! 👋 Ich melde mich von Celsius Casino — wir arbeiten mit Casino-Streamern und finden deinen Content richtig stark. Hättest du Lust auf eine Partnerschaft mit uns?\n\nFalls ja, sag mir gern kurz: bist du interessiert, wie sehen deine Stream-Stats aus (ein Screenshot reicht), und welchen Deal würdest du dir wünschen?\n\n👉 ${CELSIUS}`;
  }
  return `Hey ${name}! 👋 I'm reaching out from Celsius Casino — we work with casino streamers and I really like your content. Would you be up for a partnership with us?\n\nIf you're interested, just let me know: are you keen, what do your stream stats look like (a screenshot is perfect), and what kind of deal you'd want?\n\n👉 ${CELSIUS}`;
}

async function listCandidates() {
  const r = await db.query(
    `SELECT login, name, country, language, followers, viewers_avg, viewers, telegram
     FROM twitch_scout_streamers
     WHERE telegram IS NOT NULL AND bot_status IS DISTINCT FROM 'bot' AND NOT COALESCE(contacted, false)
     ORDER BY COALESCE(viewers_avg, viewers, 0) DESC, followers DESC`
  );
  return r.rows.map((row) => {
    const username = tgUsername(row.telegram);
    return {
      login: row.login, name: row.name, country: row.country, language: row.language,
      followers: Number(row.followers || 0), viewersAvg: Number(row.viewers_avg || row.viewers || 0),
      telegram: row.telegram, username, dmable: !!username,
      message: buildMessage(row),
    };
  });
}

async function markContacted(login, channel) {
  await db.query(
    `UPDATE twitch_scout_streamers SET contacted=true, contacted_at=now(), contacted_channel=$2 WHERE login=$1`,
    [login, channel]
  );
}

// ---- automation Telegram (PowerShell) ------------------------------------
function sendViaTelegram(username, message) {
  return new Promise((resolve) => {
    const msgFile = path.join(os.tmpdir(), `tg_msg_${Date.now()}.txt`);
    fs.writeFileSync(msgFile, message, "utf8");
    const safeUser = username.replace(/[^A-Za-z0-9_]/g, "");
    // presse-papier depuis fichier (gère emoji + retours ligne), ouverture de la
    // conversation, focus Telegram, collage + Entrée.
    // Telegram Web, MÊME onglet : on focus la fenêtre du navigateur dont
    // l'onglet actif est Telegram Web (titre contient "Telegram"), on renavigue
    // cet onglet vers le chat via la barre d'adresse (Ctrl+L), puis collage +
    // Entrée. Aucun nouvel onglet. Le message reste dans le presse-papier
    // comme filet de sécurité si l'envoi auto rate (Ctrl+V + Entrée manuel).
    const ps = `
$ErrorActionPreference = 'Stop'
$msg = Get-Content -Raw -Encoding UTF8 '${msgFile.replace(/'/g, "''")}'
Set-Clipboard -Value $msg
$sh = New-Object -ComObject WScript.Shell
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*Telegram*' } | Select-Object -First 1
if (-not $p) { Write-Output 'NO_TG_WINDOW'; exit 0 }
$sh.AppActivate($p.Id) | Out-Null
Start-Sleep -Milliseconds 500
$sh.SendKeys('^l')
Start-Sleep -Milliseconds 350
$sh.SendKeys('${WEB_TG_BASE}${safeUser}~')
Start-Sleep -Milliseconds ${OPEN_WAIT_MS}
$sh.SendKeys('^v')
Start-Sleep -Milliseconds 900
$sh.SendKeys('~')
Write-Output 'SENT'
`.trim();
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      try { fs.unlinkSync(msgFile); } catch {}
      if (/NO_TG_WINDOW/.test(out)) return resolve({ ok: false, code, err: "Onglet Telegram Web introuvable — ouvre web.telegram.org dans un onglet ACTIF (idéalement sa propre fenêtre)." });
      resolve({ ok: code === 0 && /SENT/.test(out), code, err: err.trim().slice(0, 300) });
    });
  });
}

// ---- HTTP server ---------------------------------------------------------
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); }); }

const server = http.createServer(async (req, res) => {
  // CORS : autorise le board (lunalive.win / localhost) à déclencher l'envoi
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  try {
    if (req.url === "/" ) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(PAGE); }
    if (req.url === "/api/ping") return json(res, 200, { ok: true, service: "telegram_outreach" });
    if (req.url === "/api/list") return json(res, 200, { ok: true, items: await listCandidates() });
    if (req.url === "/api/send" && req.method === "POST") {
      const { login, message } = await body(req);
      const items = await listCandidates();
      const it = items.find((x) => x.login === login);
      if (!it) return json(res, 404, { ok: false, error: "introuvable ou déjà contacté" });
      if (!it.dmable) return json(res, 200, { ok: false, notDmable: true, error: "lien Telegram = invite/lien privé, pas un compte" });
      const cls = await classifyTelegram(it.username);
      if (cls === "channel" || cls === "group") return json(res, 200, { ok: false, notDmable: true, error: `Telegram = ${cls === "channel" ? "canal" : "groupe"} (pas un compte perso)` });
      const text = (typeof message === "string" && message.trim()) ? message : it.message; // message édité côté UI
      const r = await sendViaTelegram(it.username, text);
      if (r.ok) { await markContacted(login, "telegram"); return json(res, 200, { ok: true }); }
      return json(res, 500, { ok: false, error: r.err || `échec (code ${r.code})` });
    }
    if (req.url === "/api/skip" && req.method === "POST") {
      const { login } = await body(req);
      await markContacted(login, "skipped");
      return json(res, 200, { ok: true });
    }
    res.writeHead(404); res.end("not found");
  } catch (e) { json(res, 500, { ok: false, error: String(e?.message || e) }); }
});

const PAGE = `<!doctype html><meta charset=utf-8><title>Outreach Telegram — Celsius</title><style>
:root{--bg:#0e1015;--card:#171a22;--line:#252a35;--fg:#e7e9ee;--mut:#8b93a5;--acc:#7ec8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Arial,sans-serif}
header{padding:18px 22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
h1{margin:0;font-size:18px}.mut{color:var(--mut);font-size:13px}
.warn{margin:10px 22px;padding:10px 14px;border-radius:10px;background:#3a2a12;border:1px solid #5b4322;color:#f0c07a;font-size:13px}
.wrap{padding:16px 22px 60px;display:grid;gap:12px;max-width:900px}
.item{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:16px}
.top{display:flex;gap:12px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
.name{font-weight:700}.name a{color:var(--acc);text-decoration:none}
.meta{color:var(--mut);font-size:12px}
textarea{width:100%;margin-top:10px;background:#0e1119;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:10px;font:inherit;min-height:120px;resize:vertical}
.actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center}
button{border:1px solid var(--line);background:#1c2530;color:var(--fg);border-radius:9px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer}
button.primary{background:linear-gradient(135deg,#2a6cf0,#1e88e5);border-color:#2a6cf0}
button:disabled{opacity:.5;cursor:default}
.st{font-size:12px;color:var(--mut)}.ok{color:#6ee7a8}.ko{color:#fc8181}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mut)}
.nodm{background:#3a1820;border-color:#5b2734;color:#f28a9c}
</style>
<header><h1>📨 Outreach Telegram — Celsius</h1><div class=mut id=count>chargement…</div></header>
<div class=warn>⚠ Sois connecté à <b>Telegram Web</b> (web.telegram.org) dans ton navigateur. Pendant l'envoi (~5s), ne touche ni souris ni clavier — le collage part dans l'onglet Telegram qui vient de s'ouvrir. Si l'envoi auto rate, le message est dans le presse-papier : Ctrl+V + Entrée.</div>
<div class=wrap id=list></div>
<script>
async function load(){
 const r=await fetch('/api/list');const d=await r.json();const items=d.items||[];
 document.getElementById('count').textContent=items.length+' streamers à contacter (Telegram, non contactés)';
 const L=document.getElementById('list');L.innerHTML='';
 for(const it of items){
  const el=document.createElement('div');el.className='item';
  el.innerHTML=\`<div class=top><div class=name><a href="https://twitch.tv/\${it.login}" target=_blank>\${it.name||it.login}</a> <span class=meta>· \${it.country||'?'} · \${(it.followers||0).toLocaleString()} foll · \${(it.viewersAvg||0).toLocaleString()} viewers moy.</span></div>
   <div>\${it.dmable?\`<span class=badge>@\${it.username}</span>\`:'<span class="badge nodm">chaîne/invite — pas DM-able</span>'}</div></div>
   <textarea>\${it.message}</textarea>
   <div class=actions>
     <button class=primary \${it.dmable?'':'disabled'} data-act=send>Envoyer sur Telegram</button>
     <button data-act=skip>Ignorer</button>
     <span class=st></span>
   </div>\`;
  const ta=el.querySelector('textarea'),st=el.querySelector('.st');
  el.querySelector('[data-act=send]').onclick=async(e)=>{
    const b=e.target;b.disabled=true;st.textContent='envoi… ne touche à rien';st.className='st';
    const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:it.login,message:ta.value})});
    const d=await r.json();
    if(d.ok){st.textContent='✓ envoyé';st.className='st ok';setTimeout(()=>el.remove(),900);}
    else{st.textContent='✗ '+(d.error||'échec');st.className='st ko';b.disabled=false;}
  };
  el.querySelector('[data-act=skip]').onclick=async()=>{await fetch('/api/skip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:it.login})});el.remove();};
  L.appendChild(el);
 }
 if(!items.length)L.innerHTML='<div class=mut>Rien à contacter. Lance le scout ou décoche des filtres.</div>';
}
load();
</script>`;

server.listen(PORT, () => {
  console.log(`\n📨 Pont outreach Telegram actif sur http://localhost:${PORT}`);
  console.log(`   Prérequis : être connecté à Telegram Web (web.telegram.org) dans ton navigateur.`);
  console.log(`   Tu peux piloter l'envoi depuis le board (bouton "📨 DM Telegram") ou via cette page.\n`);
});
