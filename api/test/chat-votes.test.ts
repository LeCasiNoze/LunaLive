import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { handleRumblePredictionVote, settleExtPredictionBets, switchRubisBet, predictionTotals } from "../src/chat_votes/predictions_ext.js";
import { handleRumbleVoteCommand } from "../src/chat_votes/rumble_commands.js";
import { createPoll, closePoll, getOpenPoll, votePoll, handleRumblePollVote } from "../src/chat_votes/polls.js";

async function fixture(t: any) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE streamers(id BIGINT PRIMARY KEY, slug TEXT, platform TEXT, user_id INT);
    INSERT INTO streamers VALUES (1,'belvaa','rumble',50),(2,'lecasinoze','rumble',51),(3,'autre','rumble',52);
    CREATE TABLE streamer_rumble_info(streamer_id BIGINT, is_live BOOLEAN, live_video_id_numeric TEXT);
    CREATE TABLE streamer_chat_settings(streamer_id BIGINT, rumble_commands_enabled BOOLEAN);
    CREATE TABLE predictions(id BIGSERIAL PRIMARY KEY, streamer_id BIGINT, question TEXT, option1_label TEXT, option2_label TEXT,
      fixed_stake INT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), bets_close_at TIMESTAMPTZ, resolved_option INT,
      total_pool_1 INT DEFAULT 0, total_pool_2 INT DEFAULT 0, resolved_at TIMESTAMPTZ,
      ext_announced_at TIMESTAMPTZ, ext_reminded_at TIMESTAMPTZ, ext_closed_announced_at TIMESTAMPTZ);
    CREATE TABLE prediction_bets(prediction_id BIGINT, user_id INT, choice INT, amount INT, UNIQUE(prediction_id,user_id));
    CREATE TABLE prediction_ext_bets(prediction_id BIGINT, provider TEXT, external_id TEXT, username TEXT, wallet_sid BIGINT,
      choice SMALLINT, amount INT, payout INT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(prediction_id, provider, external_id));
    CREATE TABLE polls(id BIGSERIAL PRIMARY KEY, streamer_id BIGINT, question TEXT, options JSONB, status TEXT DEFAULT 'open',
      created_by BIGINT, created_at TIMESTAMPTZ DEFAULT NOW(), ends_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
      ext_announced_at TIMESTAMPTZ, ext_reminded_at TIMESTAMPTZ, ext_closed_announced_at TIMESTAMPTZ);
    CREATE UNIQUE INDEX polls_one_open ON polls(streamer_id) WHERE status='open';
    CREATE TABLE poll_votes(poll_id BIGINT, voter_key TEXT, username TEXT, choice SMALLINT, updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(poll_id, voter_key));
    INSERT INTO predictions(streamer_id,question,option1_label,option2_label,fixed_stake,status,bets_close_at)
      VALUES (1,'Le UN va être renta ?','Oui','Non',10,'open',NOW()+INTERVAL '2 minutes');
  `);
  // PGlite refuse plusieurs instructions dans une requête préparée (Postgres accepte sans paramètres).
  const client = {
    query: async (sql: string, args?: any[]) =>
      args?.length ? db.query(sql, args) : ((await db.exec(sql)).at(-1) ?? { rows: [] }),
    release() {},
  };
  const pool = { query: client.query, connect: async () => client } as any;
  const emits: { event: string; payload: any }[] = [];
  const room = { to: () => room, emit: (event: string, payload: any) => { emits.push({ event, payload }); return true; } };
  const io = { to: () => room } as any;
  return { db, pool, io, emits };
}

const msg = (uid: string, username: string, slug = "belvaa", streamerId = 1) =>
  ({ streamerId, slug, rumbleUserId: uid, username, createdAt: new Date() });
const balance = async (db: PGlite, uid: string) =>
  Number((await db.query<any>("SELECT balance FROM nozecoin_accounts WHERE rumble_user_id=$1", [uid])).rows[0]?.balance ?? 0);

test("BCoins bet from Rumble: place, switch side without double debit, insufficient balance", async (t) => {
  process.env.NOZECOINS_ENABLED = "true";
  const { db, pool } = await fixture(t);
  const pred = (await db.query<any>("SELECT * FROM predictions WHERE id=1")).rows[0];
  // coinsSchema crée les tables BCoins : on crédite ensuite un viewer.
  const first = await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 1);
  assert.match(first!, /pas assez de BCoins \(solde 0, mise 10\)\. Tape !claim/);
  await db.query("INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username,balance) VALUES (1,'111','alice',50)");
  assert.match((await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 1))!, /pari enregistré : \[1\] Oui \(10 BCoins\)/);
  assert.equal(await balance(db, "111"), 40);
  assert.match((await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 1))!, /déjà sur \[1\] Oui/);
  assert.match((await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 2))!, /camp changé : \[2\] Non/);
  assert.equal(await balance(db, "111"), 40, "switching side never debits again");
  assert.match((await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 3))!, /choix invalide/);
  const totals = await predictionTotals(pool, Number(pred.id));
  assert.deepEqual([totals.count, totals.total1, totals.total2], [1, 0, 10]);
});

test("BCoins winners share the net pot once, losers get nothing", async (t) => {
  process.env.NOZECOINS_ENABLED = "true";
  const { db, pool } = await fixture(t);
  await handleRumblePredictionVote(pool, undefined, msg("999", "init"), 1); // crée les tables BCoins
  await db.query("INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username,balance) VALUES (1,'111','alice',100),(1,'222','bob',100),(1,'333','carl',100)");
  await handleRumblePredictionVote(pool, undefined, msg("111", "alice"), 1);
  await handleRumblePredictionVote(pool, undefined, msg("222", "bob"), 1);
  await handleRumblePredictionVote(pool, undefined, msg("333", "carl"), 2);
  const pred = (await db.query<any>("SELECT * FROM predictions WHERE id=1")).rows[0];
  await settleExtPredictionBets(pool, pred, 1);
  await settleExtPredictionBets(pool, pred, 1); // rejeu : aucun double paiement
  // pot 30, taxe 3, net 27 → 13 chacun pour 2 gagnants à 10
  assert.equal(await balance(db, "111"), 90 + 13);
  assert.equal(await balance(db, "222"), 90 + 13);
  assert.equal(await balance(db, "333"), 90);
});

test("closed bets and no prediction fall through correctly", async (t) => {
  process.env.NOZECOINS_ENABLED = "true";
  const { db, pool } = await fixture(t);
  assert.equal(await handleRumblePredictionVote(pool, undefined, msg("111", "x", "autre", 3), 1), null);
  await db.exec("UPDATE predictions SET bets_close_at=NOW()-INTERVAL '5 seconds'");
  assert.match((await handleRumblePredictionVote(pool, undefined, msg("111", "x"), 1))!, /paris sont fermés/);
  const old = await handleRumbleVoteCommand(pool, undefined,
    { ...msg("111", "x"), text: "!1", createdAt: new Date(Date.now() - 10 * 60_000) });
  assert.equal(old, null, "replayed chat history never votes");
});

test("rubis bet switch moves the stake between pools", async (t) => {
  const { db, pool } = await fixture(t);
  await db.exec("INSERT INTO prediction_bets VALUES (1,7,1,25); UPDATE predictions SET total_pool_1=25");
  assert.equal(await switchRubisBet(pool, 1, 7, 1), "same");
  assert.equal(await switchRubisBet(pool, 1, 7, 2), "switched");
  assert.deepEqual((await db.query<any>("SELECT total_pool_1,total_pool_2 FROM predictions")).rows[0], { total_pool_1: 0, total_pool_2: 25 });
  assert.equal(await switchRubisBet(pool, 1, 8, 2), "none");
});

test("polls: one at a time, votes can change, close announces results", async (t) => {
  const { db, pool, io, emits } = await fixture(t);
  await assert.rejects(createPoll(pool, io, { streamerId: 1, slug: "belvaa", question: "Q ?", options: ["A", "B"], durationSec: 60, userId: 50 }), /prediction_active/);
  await db.exec("UPDATE predictions SET status='resolved'");
  await assert.rejects(createPoll(pool, io, { streamerId: 1, slug: "belvaa", question: "Q ?", options: ["A"], durationSec: 60, userId: 50 }), /two_options_min/);
  const snap = await createPoll(pool, io, { streamerId: 1, slug: "belvaa", question: "Quel jeu ?", options: ["Sweet", "Gates", "Le Bandit"], durationSec: 60, userId: 50 });
  assert.equal(snap.options.length, 3);
  assert.ok(emits.some((e) => e.event === "chat:message" && e.payload.type === "poll"));
  await assert.rejects(createPoll(pool, io, { streamerId: 1, slug: "belvaa", question: "Encore ?", options: ["A", "B"], durationSec: 60, userId: 50 }), /already_open/);

  const poll = (await getOpenPoll(pool, 1))!;
  assert.equal(await votePoll(pool, io, "belvaa", poll, "u:7", "zoe", 1), "placed");
  assert.equal(await votePoll(pool, io, "belvaa", poll, "u:7", "zoe", 1), "same");
  assert.equal(await votePoll(pool, io, "belvaa", poll, "u:7", "zoe", 3), "switched");
  assert.equal(await votePoll(pool, io, "belvaa", poll, "u:7", "zoe", 4), "invalid");
  assert.match((await handleRumblePollVote(pool, undefined, msg("111", "alice"), 3))!, /vote enregistré : \[3\] Le Bandit/);
  assert.match((await handleRumblePollVote(pool, undefined, msg("111", "alice"), 2))!, /vote changé : \[2\] Gates/);

  const closed = (await closePoll(pool, io, Number(poll.id)))!;
  assert.deepEqual(closed.counts, [0, 1, 1]);
  assert.equal(closed.status, "closed");
  assert.equal(await closePoll(pool, io, Number(poll.id)), null, "closing twice is a no-op");
  assert.ok(emits.some((e) => e.event === "chat:message" && /Sondage terminé/.test(String(e.payload?.data?.html ?? e.payload?.body ?? ""))));
  assert.equal(await handleRumblePollVote(pool, undefined, msg("111", "alice"), 1), null);
});
