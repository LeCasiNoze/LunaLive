#!/usr/bin/env node
// Usage: DLIVE_BOT_AUTH=<jwt> node dlive-test-send.js <displayname> <username>
// Ex:    DLIVE_BOT_AUTH=<jwt> node dlive-test-send.js LeCasiNoze dlive-nvuugsuvmg

const DLIVE_ENDPOINT = "https://graphigo.prd.dlive.tv/";

const PROMO_BASE_1 =
  "Si tu cherches une nouvelle plateforme, LunaLive.win est là — fluide, bot casino, clip auto + post IG etc";
const PROMO_MSG_2 =
  "Si ça t'intéresse, mp-moi via les réseaux dans ma bio — LunaLive est gratuit et ouvert à tous 🙌";

function buildMsg1(displayname) {
  return `Salut @${displayname} ! ${PROMO_BASE_1}`.slice(0, 130);
}

function getAuth() {
  const raw = String(process.env.DLIVE_BOT_AUTH || "").trim();
  if (!raw) throw new Error("DLIVE_BOT_AUTH manquant");
  return raw.replace(/^bearer\s+/i, "").trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resolveUsername(displayname) {
  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://dlive.tv" },
    body: JSON.stringify({ query: `query($dn:String!){userByDisplayName(displayname:$dn){username}}`, variables: { dn: displayname } }),
  });
  const j = await r.json();
  return j?.data?.userByDisplayName?.username || null;
}

async function followStreamer(username) {
  try {
    const r = await fetch(DLIVE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: getAuth(),
        origin: "https://dlive.tv",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        query: `mutation { follow(streamer: "${username}") { err { message code } } }`,
      }),
    });
    const j = await r.json();
    const err = j?.data?.follow?.err;
    if (err) console.log(`→ follow err: ${JSON.stringify(err)}`);
    return !err;
  } catch (e) {
    console.warn("follow error:", e.message);
    return false;
  }
}

async function send(username, message) {
  const payload = {
    operationName: "SendStreamChatMessage",
    variables: {
      input: { streamer: username, message: message.slice(0, 180), roomRole: "Moderator", subscribing: true },
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "848cbe91a57458ed402716e7b57b7a128c3b5a8385a6ebe14d9deff8d1eda73c",
      },
    },
  };

  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "*/*",
      authorization: getAuth(),
      "content-type": "application/json",
      Origin: "https://dlive.tv",
      Referer: `https://dlive.tv/${username}`,
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });

  const body = await r.json().catch(() => null);
  const err = body?.data?.sendStreamchatMessage?.err ?? null;
  return { ok: r.ok, status: r.status, err, id: body?.data?.sendStreamchatMessage?.message?.id ?? null };
}

async function main() {
  const displayname = process.argv[2];
  if (!displayname) {
    console.error("Usage: node dlive-test-send.js <displayname>");
    console.error("Ex:    node dlive-test-send.js LeCasiNoze");
    process.exit(1);
  }

  // Résolution automatique du username immutable via userByDisplayName
  console.log(`Résolution username pour "${displayname}"...`);
  const username = await resolveUsername(displayname);
  if (!username) { console.error("Impossible de résoudre le username DLive"); process.exit(1); }
  console.log(`→ username: ${username}`);

  const msg1 = buildMsg1(displayname);
  const msg2 = PROMO_MSG_2;

  console.log(`\nTarget  : ${displayname} (${username})`);

  console.log(`\n[STEP 1] Follow ${username}...`);
  const followed = await followStreamer(username);
  console.log(`→ follow: ${followed ? "✓ OK" : "✗ FAIL (non bloquant)"}`);
  await sleep(500);

  console.log(`\n[STEP 2] Msg1 (${msg1.length}c): ${msg1}`);
  const r1 = await send(username, msg1);
  console.log(`→ ${r1.ok ? "✓ OK" : "✗ FAIL"} err=${JSON.stringify(r1.err)} id=${r1.id}`);

  const step2ok = r1.ok && !r1.err;
  if (!step2ok) { console.log("\n✗ Échec msg1 — arrêt"); return; }

  await sleep(1500);
  console.log(`\n[STEP 3] Msg2 (${msg2.length}c): ${msg2}`);
  const r2 = await send(username, msg2);
  console.log(`→ ${r2.ok ? "✓ OK" : "✗ FAIL"} [${r2.status}] err=${JSON.stringify(r2.err)} id=${r2.id}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
