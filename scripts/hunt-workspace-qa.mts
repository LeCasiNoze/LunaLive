// Local-only integration + browser checks. No production credentials or database.
// Run with api's tsx; install @electric-sql/pglite under .qa-deps first.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.JWT_SECRET = "hunt-local-test-only-never-production";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
const { PGlite } = await import(
  pathToFileURL(
    resolve(".qa-deps/node_modules/@electric-sql/pglite/dist/index.js"),
  ).href
);
const { default: express } =
  await import("../api/node_modules/express/index.js");
const { default: cors } = await import("../api/node_modules/cors/lib/index.js");
const { pool } = await import("../api/src/db.ts");
const db = new PGlite();
const query = async (sql: string, values?: any[]) => {
  if (!values?.length && sql.includes(";")) {
    await db.exec(sql);
    return { rows: [], rowCount: 0 };
  }
  const result = await db.query(sql, values);
  return {
    rows: result.rows,
    rowCount: result.affectedRows ?? result.rows.length,
  };
};
pool.query = query as any;
pool.connect = (async () => ({ query, release() {} })) as any;
await db.exec(`
  CREATE TABLE streamers(id INT PRIMARY KEY,user_id INT,slug TEXT);
  CREATE TABLE streamer_mods(streamer_id INT,user_id INT,removed_at TIMESTAMPTZ);
  CREATE TABLE site_user_bans(user_id INT,until TIMESTAMPTZ,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ);
  CREATE TABLE slots_catalog(name_key TEXT PRIMARY KEY,name TEXT,provider TEXT,image_url TEXT);
  CREATE TABLE calls_queue(id BIGSERIAL PRIMARY KEY,streamer_id INT,slot_name TEXT,slot_key TEXT,provider TEXT,
    user_id INT,username TEXT,pos INT,bet NUMERIC,pay NUMERIC,bounty BOOLEAN,is_bonus BOOLEAN DEFAULT FALSE);
  INSERT INTO streamers VALUES(2,2,'hunt-demo');
  INSERT INTO slots_catalog VALUES('wanted dead or a wild','Wanted Dead or a Wild','Hacksaw Gaming',NULL),
    ('sweet bonanza','Sweet Bonanza','Pragmatic Play',NULL),('gates of olympus','Gates of Olympus','Pragmatic Play',NULL);
  ALTER TABLE slots_catalog ADD COLUMN provider_norm TEXT;
  ALTER TABLE slots_catalog ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  UPDATE slots_catalog SET provider_norm=provider;
`);
const { hunt2Router } = await import("../api/src/routes/hunt2.ts");
const { callsHuntRouter } = await import("../api/src/routes/calls_hunt.ts");
const { signToken, tryGetAuthUser } = await import("../api/src/auth.ts");
const { parseHuntAmount, huntStats, mapCallsHunt } =
  await import("../web/src/lib/hunt_workspace.ts");
assert.equal(parseHuntAmount("1,25"), 1.25);
for (const value of ["", "abc", "-1", "1.234", "1e5", "Infinity"])
  assert.equal(parseHuntAmount(value), null);
assert.equal(parseHuntAmount("0"), 0);
assert.equal(
  huntStats({
    phase: "open",
    opened: true,
    start: 100,
    items: [
      { id: "1", name: "x", bet: 1, pay: 0 },
      { id: "2", name: "y", bet: 2, pay: null },
    ],
  }).remainingMulti,
  50,
);
assert.equal(
  mapCallsHunt({
    mode: "closed",
    bonusDrops: [{ id: 1, slotName: "x", payEur: 0 }],
  }).phase,
  "closed",
);
console.log("PASS amount parsing, zero gain, break-even, calls mapping");

const tokens = [0, 1, 2, 3].map((id) =>
  signToken({ id, username: `HuntDemo${id}`, role: "viewer" }),
);
const app = express();
app.use(cors());
app.use(express.json());
const writes: string[] = [];
app.use((req: any, _res: any, next: any) => {
  if (req.method !== "GET" && req.method !== "OPTIONS") writes.push(req.path);
  next();
});
app.get("/me", (req: any, res: any) => {
  const u = tryGetAuthUser(req);
  res.json({
    ok: true,
    user: {
      ...u,
      rubis: 250,
      emailVerified: true,
      tokens: {},
      coupons: {},
      breakdown: {},
      ...(u?.id === 2 ? { streamerSlug: "hunt-demo" } : {}),
    },
  });
});
app.use("/calls", callsHuntRouter);
app.use(hunt2Router);
app.use((_req: any, res: any) =>
  res.status(404).json({ ok: false, error: "not_in_local_fixture" }),
);
const server = app.listen(5199, "127.0.0.1");
await new Promise<void>((r) => server.on("listening", r));
async function request(
  id: number,
  path: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(`http://127.0.0.1:5199${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${tokens[id]}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as any };
}
const must = async (
  id: number,
  path: string,
  body?: unknown,
  method?: string,
) => {
  const result = await request(id, path, body, method);
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.data;
};
let browser: any;
try {
  await must(1, "/api/hunt2/state");
  await must(1, "/api/hunt2/set-start", { start: 500, expected: null });
  const one = await must(1, "/api/hunt2/add", {
    name: "Wanted Dead or a Wild",
  });
  const two = await must(1, "/api/hunt2/add", { name: "Sweet Bonanza" });
  await must(1, "/api/hunt2/set-bet", { id: one.id, bet: 2, expected: null });
  await must(1, "/api/hunt2/set-bet", { id: two.id, bet: 1, expected: null });
  const conflicts = await Promise.all([
    request(1, "/api/hunt2/set-bet", { id: one.id, bet: 3, expected: 2 }),
    request(1, "/api/hunt2/set-bet", { id: one.id, bet: 4, expected: 2 }),
  ]);
  assert.deepEqual(conflicts.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request(3, "/api/hunt2/set-bet", {
        id: one.id,
        bet: 99,
        expected: 3,
      })
    ).status,
    409,
  );
  await must(1, "/api/hunt2/open", {});
  await must(1, "/api/hunt2/set-start", { start: 600, expected: 500 });
  assert.equal((await must(1, "/api/hunt2/state")).state.phase, "open");
  await must(1, "/api/hunt2/set-pay", { id: one.id, pay: 0, expected: null });
  await must(1, "/api/hunt2/set-pay", { id: two.id, pay: 900, expected: null });
  assert.equal((await must(1, "/api/hunt2/state")).state.phase, "open");
  await must(1, "/api/hunt2/close", {});
  await must(1, "/api/hunt2/close", {});
  assert.equal((await must(1, "/api/hunt2/my-hunts")).items.length, 1);
  assert.equal((await must(1, "/api/hunt2/my-hunts")).items[0].total_pay, 900);
  console.log(
    "PASS classic routes: atomic conflict, account isolation, start keeps phase, zero payout, archive",
  );

  const cp = "/calls/hunt-demo/hunt";
  await must(2, cp + "/state");
  await must(2, cp + "/start", { startEur: 400, expected: null });
  const a = await must(2, cp + "/add", { name: "Wanted Dead or a Wild" });
  const b = await must(2, cp + "/add", { name: "Sweet Bonanza" });
  await must(2, cp + `/bonus/${a.id}`, { betEur: 2, expected: null }, "PATCH");
  await must(2, cp + `/bonus/${b.id}`, { betEur: 1, expected: null }, "PATCH");
  assert.equal(
    (await request(1, cp + "/pay", { id: a.id, payEur: 22, expected: null }))
      .status,
    403,
  );
  await must(2, cp + "/open", { opening: true });
  await must(2, cp + "/open", { opening: true });
  assert.equal((await must(2, cp + "/state")).mode, "open");
  await must(2, cp + "/pay", { id: a.id, payEur: 0, expected: null });
  assert.equal(
    (await request(2, cp + "/pay", { id: a.id, payEur: 300, expected: null }))
      .status,
    409,
  );
  assert.equal(
    (await must(2, cp + "/state")).bonusDrops.find((it: any) => it.id === b.id)
      .payEur,
    null,
  );
  await must(2, cp + "/pay", { id: b.id, payEur: 520, expected: null });
  await must(2, cp + "/close", {});
  await must(2, cp + "/close", {});
  assert.equal((await must(2, cp + "/state")).mode, "closed");
  assert.equal((await must(2, "/api/hunt2/my-hunts")).items.length, 1);
  console.log(
    "PASS calls routes: owner authorization, idempotent opening/closing, exact bonus payout, conflict, preserved queue/archive",
  );

  // Re-open only these isolated fixtures for the two browser sessions.
  await must(1, "/api/hunt2/revert", {});
  await db.query("UPDATE hunt_session_items SET pay=NULL WHERE user_id=1");
  const playwrightPath =
    process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/Lucas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  // Block real APIs and tracking. Only public fonts may leave localhost.
  await context.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (
      ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
        url.hostname,
      )
    )
      return route.continue();
    return route.abort();
  });
  await context.addInitScript((token: string) => {
    localStorage.setItem("lunalive_token_v1", token);
  }, tokens[1]);
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  p1.on("pageerror", (e: Error) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.stack);
  });
  p2.on("pageerror", (e: Error) => errors.push(e.message));
  await p1.goto("http://127.0.0.1:5198/hunt");
  await p2.goto("http://127.0.0.1:5198/hunt");
  await p1.getByLabel("Mise de Sweet Bonanza", { exact: true }).waitFor();
  const countBeforeReads = writes.length;
  await p1.reload();
  await p1.getByLabel("Mise de Sweet Bonanza", { exact: true }).waitFor();
  assert.equal(
    writes.filter((x) => x.startsWith("/api/hunt2") || x.includes("/hunt/"))
      .length,
    writes
      .slice(0, countBeforeReads)
      .filter((x) => x.startsWith("/api/hunt2") || x.includes("/hunt/")).length,
    "Reload must never write hunt state",
  );
  await p1.getByLabel("Mise de Sweet Bonanza", { exact: true }).fill("1,50");
  await p1.getByRole("heading", { name: "Tes machines" }).click();
  await p2.waitForFunction(
    () =>
      (
        document.querySelector(
          '[aria-label="Mise de Sweet Bonanza"]',
        ) as HTMLInputElement
      )?.value === "1.5",
    { timeout: 15000 },
  );
  await p2.getByLabel("Mise de Sweet Bonanza", { exact: true }).fill("2,50");
  await must(1, "/api/hunt2/set-bet", { id: two.id, bet: 3, expected: 1.5 });
  await p2.getByText(/Modifié ailleurs/).waitFor({ timeout: 15000 });
  assert.equal(
    await p2.getByLabel("Mise de Sweet Bonanza", { exact: true }).inputValue(),
    "2,50",
  );
  await p2
    .getByRole("button", {
      name: "Annuler la saisie : Mise de Sweet Bonanza",
      exact: true,
    })
    .click();
  assert.equal(
    await p2.getByLabel("Mise de Sweet Bonanza", { exact: true }).inputValue(),
    "3",
  );
  await p1.getByLabel("Rechercher une machine").fill("Gates of Olympus");
  await p1
    .getByRole("button", { name: "Ajouter au hunt", exact: true })
    .click();
  await p2
    .getByLabel("Mise de Gates of Olympus", { exact: true })
    .waitFor({ timeout: 15000 });
  await p1.getByLabel("Mise de Gates of Olympus", { exact: true }).fill("1");
  await p1.getByRole("heading", { name: "Tes machines" }).click();
  await p1.getByRole("button", { name: "Passer à l'ouverture" }).waitFor();
  await mkdir(resolve("exports/hunt-workspace-qa"), { recursive: true });
  await p1.screenshot({
    path: resolve("exports/hunt-workspace-qa/farm-desktop.png"),
    fullPage: true,
  });
  await p2.getByLabel("Mise de Sweet Bonanza", { exact: true }).fill("4");
  await p1.getByRole("button", { name: "Passer à l'ouverture" }).click();
  await p2
    .getByText(/Le hunt a changé sur un autre écran/)
    .waitFor({ timeout: 15000 });
  assert.equal(
    await p2.getByLabel("Mise de Sweet Bonanza", { exact: true }).inputValue(),
    "4",
  );
  await p2
    .getByRole("button", {
      name: "Annuler la saisie : Mise de Sweet Bonanza",
      exact: true,
    })
    .click();
  await p2
    .getByRole("heading", { name: "Ouverture des bonus", exact: true })
    .waitFor({ timeout: 15000 });
  await p1
    .getByLabel("Gain de Wanted Dead or a Wild", { exact: true })
    .fill("0");
  await p1
    .getByRole("button", { name: "Valider le gain", exact: true })
    .click();
  await p1.screenshot({
    path: resolve("exports/hunt-workspace-qa/open-desktop.png"),
    fullPage: true,
  });
  await p1.setViewportSize({ width: 390, height: 844 });
  await p1.screenshot({
    path: resolve("exports/hunt-workspace-qa/open-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await p1.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "No mobile horizontal overflow",
  );
  await p1.getByRole("button", { name: "01 Farm" }).click();
  await p1.getByLabel("Mise de Sweet Bonanza", { exact: true }).waitFor();
  await p1.screenshot({
    path: resolve("exports/hunt-workspace-qa/farm-mobile.png"),
    fullPage: true,
  });
  const stateBeforeArchive = (await must(1, "/api/hunt2/state")).state;
  await p1.getByRole("button", { name: "Historique", exact: true }).click();
  await p1
    .getByRole("button", { name: /Hunt #/ })
    .first()
    .click();
  await p1.getByRole("dialog").waitFor();
  await p1.screenshot({
    path: resolve("exports/hunt-workspace-qa/history-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(
    (await must(1, "/api/hunt2/state")).state,
    stateBeforeArchive,
    "Archive viewing must preserve active hunt",
  );
  await p1.getByRole("button", { name: "Fermer", exact: true }).click();
  await p1.getByRole("button", { name: "Hunt en cours", exact: true }).click();
  await p1.getByLabel("Budget de départ", { exact: true }).fill("650");
  await context.setOffline(true);
  await p1
    .getByText("Connexion interrompue", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.equal(
    await p1.getByLabel("Budget de départ", { exact: true }).inputValue(),
    "650",
  );
  await context.setOffline(false);
  await p1
    .getByText("Synchronisé", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.equal(
    await p1.getByLabel("Budget de départ", { exact: true }).inputValue(),
    "650",
  );
  await p1
    .getByRole("button", {
      name: "Annuler la saisie : Budget de départ",
      exact: true,
    })
    .click();
  await p1.getByRole("button", { name: "Nouveau hunt", exact: true }).click();
  await p1.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.deepEqual(
    (await must(1, "/api/hunt2/state")).state,
    stateBeforeArchive,
  );
  await p1.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await p1.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "320px layout fits",
  );
  await p1.getByRole("button", { name: "Nouveau hunt", exact: true }).click();
  await p1.getByRole("button", { name: "Confirmer", exact: true }).click();
  await p1
    .getByRole("heading", { name: "Le premier bonus ouvre le bal." })
    .waitFor();
  const afterReset = await must(1, "/api/hunt2/my-hunts");
  assert.deepEqual(
    afterReset.items[0].snapshot.items,
    stateBeforeArchive.items,
    "New hunt creates a complete safety copy",
  );
  console.log(
    "PASS offline draft recovery, cancel reset is read-only, 320px mobile, safety copy before new hunt",
  );
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "PASS two-browser collaboration: bet/add/phase/pay sync, preserved conflicting draft, read-only reload/history, mobile layout, no runtime errors",
  );
  console.log("Screenshots: exports/hunt-workspace-qa");
} catch (error) {
  await mkdir(resolve("exports/hunt-workspace-qa"), { recursive: true });
  for (const [i, page] of (browser?.contexts()[0]?.pages() || []).entries()) {
    console.log(
      "Browser failure",
      page.url(),
      (await page.locator("body").innerText()).slice(0, 2500),
    );
    await page.screenshot({
      path: resolve(`exports/hunt-workspace-qa/failure-${i}.png`),
      fullPage: true,
    });
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
  await pool.end();
}
