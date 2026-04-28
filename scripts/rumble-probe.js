// scripts/rumble-probe.js
// Sondes exhaustives des endpoints Rumble pour découvrir ce qui est accessible
// avec la session bot (cookie u_s) depuis Render-style Node fetch.
//
// Usage:
//   node scripts/rumble-probe.js [vid] [username]
//   defaults: vid=434889858 (fabio live), username=fabiozsis

const path = require("path");
require(path.join(__dirname, "..", "api", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "api", ".env"),
});
const { Pool } = require(path.join(__dirname, "..", "api", "node_modules", "pg"));

const VID = process.argv[2] || "434889858";
const USERNAME = process.argv[3] || "fabiozsis";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cleanCookie(raw) {
  return String(raw || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !/^cf_clearance=/i.test(s) && !/^__cf_bm=/i.test(s))
    .join("; ");
}

async function loadSession() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const r = await pool.query(
    "SELECT cookie, user_agent FROM rumble_bot_session ORDER BY updated_at DESC LIMIT 1"
  );
  await pool.end();
  if (!r.rows.length) throw new Error("no bot session in DB");
  return {
    cookie: cleanCookie(r.rows[0].cookie),
    ua: r.rows[0].user_agent || UA,
  };
}

async function probe(label, url, opts = {}, session) {
  const headers = {
    "user-agent": session.ua,
    accept: opts.accept || "*/*",
    "accept-language": "en-US,en;q=0.9,fr;q=0.8",
    referer: opts.referer || "https://rumble.com/",
    ...opts.headers,
  };
  if (opts.auth !== false) headers.cookie = session.cookie;

  let status = -1,
    server = "",
    cf = "",
    bodyLen = 0,
    snippet = "",
    err = "";
  try {
    const r = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
      redirect: "manual",
    });
    status = r.status;
    server = r.headers.get("server") || "";
    cf = r.headers.get("cf-ray") || r.headers.get("cf-mitigated") || "";
    const text = await r.text();
    bodyLen = text.length;
    // Extract small useful snippet (first 200 chars, no cookies)
    snippet = text
      .slice(0, 250)
      .replace(/\s+/g, " ")
      .replace(/cf_clearance=[^;\s]+/g, "[cf_clearance]")
      .replace(/u_s=[^;\s]+/g, "[u_s]");
  } catch (e) {
    err = e.message || String(e);
  }
  console.log(
    `[probe] ${label.padEnd(38)} status=${String(status).padEnd(4)} server=${(server || "-").padEnd(7)} cf=${(cf || "-").slice(0, 12).padEnd(12)} bodyLen=${String(bodyLen).padEnd(7)} ${err ? "ERR=" + err : "snip=" + snippet.slice(0, 120)}`
  );
  return { status, server, cf, bodyLen, snippet, err };
}

(async () => {
  console.log(`[probe] vid=${VID} username=${USERNAME}`);
  const session = await loadSession();
  console.log(`[probe] cookie loaded (len=${session.cookie.length})\n`);

  console.log("=== A. Slug / live discovery alternatives ===");
  await probe("rumble.com/user/{name}/live", `https://rumble.com/user/${USERNAME}/live`, {}, session);
  await probe("rumble.com/c/{name}/livestreams", `https://rumble.com/c/${USERNAME}/livestreams`, {}, session);
  await probe("rumble.com/{user}/livestream", `https://rumble.com/${USERNAME}/livestream`, {}, session);
  await probe("rumble.com/user/{name}", `https://rumble.com/user/${USERNAME}`, {}, session);
  await probe("rumble.com (homepage)", `https://rumble.com/`, {}, session);
  await probe("rumble.com/browse/live", `https://rumble.com/browse/live`, {}, session);
  await probe("search live ?q={user}", `https://rumble.com/search/all?q=${USERNAME}`, {}, session);

  console.log("\n=== B. JSON / RPC endpoints (potentially CF-light) ===");
  await probe(
    "service.php?name=user.is_live",
    `https://rumble.com/service.php?name=user.is_live&user=${USERNAME}`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "service.php?name=video.upcoming",
    `https://rumble.com/service.php?name=video.upcoming`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "service.php?name=user.subscribed",
    `https://rumble.com/service.php?name=user.subscribed`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "embedJS/u3 (HLS resolve)",
    `https://rumble.com/embedJS/u3/?v=${VID}`,
    { headers: { accept: "application/json" } },
    session
  );

  console.log("\n=== C. Chat init / viewer info ===");
  await probe(
    "chat/api/chat/{vid}/init",
    `https://web7.rumble.com/chat/api/chat/${VID}/init`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "chat/api/chat/{vid} (POST init?)",
    `https://web7.rumble.com/chat/api/chat/${VID}`,
    { method: "POST", headers: { accept: "application/json" }, body: "" },
    session
  );
  await probe(
    "chat/api/v0/init",
    `https://web7.rumble.com/chat/api/v0/init`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "chat/{vid}/info",
    `https://web7.rumble.com/chat/api/chat/${VID}/info`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "chat/{vid}/users",
    `https://web7.rumble.com/chat/api/chat/${VID}/users`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "chat/{vid}/viewers",
    `https://web7.rumble.com/chat/api/chat/${VID}/viewers`,
    { headers: { accept: "application/json" } },
    session
  );

  console.log("\n=== D. Video / live state endpoints ===");
  await probe(
    "rumble.com/v{vid}.html",
    `https://rumble.com/v${VID}.html`,
    {},
    session
  );
  await probe(
    "viewer count widget",
    `https://rumble.com/api/Live.Watching?video_id=${VID}`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "Live.Watching alt",
    `https://rumble.com/-/api/Live.Watching?video_id=${VID}`,
    { headers: { accept: "application/json" } },
    session
  );

  console.log("\n=== E. User profile / account ===");
  await probe(
    "rumble.com/account",
    `https://rumble.com/account`,
    {},
    session
  );
  await probe(
    "rumble.com/account/api/user",
    `https://rumble.com/account/api/user`,
    { headers: { accept: "application/json" } },
    session
  );
  await probe(
    "rumble.com/api/User.GetMe",
    `https://rumble.com/api/User.GetMe`,
    { headers: { accept: "application/json" } },
    session
  );

  console.log("\n=== F. Anonymous (no cookie) baselines ===");
  await probe("ANON /user/{name}/live", `https://rumble.com/user/${USERNAME}/live`, { auth: false }, session);
  await probe("ANON service.php is_live", `https://rumble.com/service.php?name=user.is_live&user=${USERNAME}`, { auth: false, headers: { accept: "application/json" } }, session);
  await probe("ANON embedJS/u3", `https://rumble.com/embedJS/u3/?v=${VID}`, { auth: false, headers: { accept: "application/json" } }, session);
  await probe("ANON chat/init", `https://web7.rumble.com/chat/api/chat/${VID}/init`, { auth: false, headers: { accept: "application/json" } }, session);

  console.log("\n[probe] done.");
})().catch((e) => {
  console.error("[probe] fatal", e);
  process.exit(1);
});
