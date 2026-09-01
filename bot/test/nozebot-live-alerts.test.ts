import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { buildBlackjackMessage, buildProfileEmbed } from "../src/nozebot/commands.js";
import { buildMemberWelcomeMessage } from "../src/nozebot/discord.js";
import { buildLiveAlertMessage, parseLunaLivePayload } from "../src/nozebot/live-alerts.js";
import type { LunaLiveProfile } from "../src/nozebot/lunalive-api.js";
import type { LunaLiveBlackjack } from "../src/nozebot/lunalive-api.js";

const sourceConfig = {
  streamerSlug: "lecasinoze",
  apiBase: "https://lunalive-api.onrender.com",
};

const messageConfig = {
  roleId: "1188926242519523328",
  lunaLiveUrl: "https://lunalive.win/s/lecasinoze",
  rumbleUrl: "https://rumble.com/user/LeCasiNoze/live",
};

test("parses LeCasiNoze from LunaLive and creates a stable live key", () => {
  const snapshot = parseLunaLivePayload([
    {
      slug: "another-streamer",
      title: "Ignore me",
    },
    {
      slug: "LeCasiNoze",
      displayName: "LeCasiNoze",
      title: "Le grand retour",
      viewers: 321,
      liveStartedAt: "2026-09-01T20:00:00.000Z",
      thumbUrl: "/thumbs/lecasinoze.jpg",
      avatarUrl: "/avatars/lecasinoze.png",
    },
  ], sourceConfig);

  assert.ok(snapshot);
  assert.equal(snapshot.liveKey, "lecasinoze:2026-09-01T20:00:00.000Z");
  assert.equal(snapshot.title, "Le grand retour");
  assert.equal(snapshot.viewers, 321);
  assert.equal(
    snapshot.thumbnailUrl,
    "https://lunalive-api.onrender.com/thumbs/lecasinoze.jpg?v=1788292800"
  );
  assert.equal(snapshot.avatarUrl, "https://lunalive-api.onrender.com/avatars/lecasinoze.png");
});

test("returns null while LeCasiNoze is offline", () => {
  assert.equal(parseLunaLivePayload([{ slug: "someone-else" }], sourceConfig), null);
});

test("builds a premium two-platform card and only authorizes the first ping", () => {
  const snapshot = parseLunaLivePayload([
    {
      slug: "lecasinoze",
      displayName: "LeCasiNoze",
      title: "Le grand retour",
      viewers: 42,
      liveStartedAt: "2026-09-01T20:00:00.000Z",
      thumbUrl: "/thumbs/lecasinoze.jpg",
      avatarUrl: "/avatars/lecasinoze.png",
    },
  ], sourceConfig);
  assert.ok(snapshot);

  const initial = buildLiveAlertMessage(snapshot, messageConfig, true);
  const update = buildLiveAlertMessage(snapshot, messageConfig, false);
  const embed = initial.embeds[0].toJSON();
  const row = initial.components[0].toJSON();

  assert.deepEqual(initial.allowedMentions, { roles: [messageConfig.roleId] });
  assert.deepEqual(update.allowedMentions, { parse: [] });
  assert.equal(embed.color, 0x9d7cff);
  assert.equal(embed.title, "🔴 Le grand retour");
  assert.equal(embed.description, undefined);
  assert.equal(embed.fields?.[0]?.value, "La plateforme pour les vrais bg");
  assert.equal(embed.fields?.[1]?.value, "La classique");
  assert.equal(embed.image?.url, snapshot.thumbnailUrl);
  assert.equal(embed.author?.icon_url, snapshot.avatarUrl);
  assert.equal(row.components.length, 2);
  assert.deepEqual(
    row.components.map((button) => "url" in button ? button.url : null),
    [messageConfig.lunaLiveUrl, messageConfig.rumbleUrl]
  );
});

test("builds the public welcome with only the new member mention enabled", () => {
  assert.deepEqual(buildMemberWelcomeMessage("123456789"), {
    content: "<@123456789>, bienvenue dans la maison !",
    allowedMentions: { parse: [], users: ["123456789"] },
  });
});

test("builds a rich profile from the shared LunaLive data", () => {
  const profile: LunaLiveProfile = {
    userId: 7,
    username: "LeCasiNoze",
    rubis: 1234,
    xp: 250,
    level: 8,
    levelTitle: "Nouveau-Né IX",
    pctToNext: 62,
    xpToNext: 42,
    isMaxLevel: false,
    watchSecondsTotal: 9000,
    chatMessagesTotal: 321,
    callsTotal: 12,
    predictionsTotal: 5,
    predictionWinsTotal: 2,
    wheelSpinsTotal: 14,
    dailyBonusClaimsTotal: 9,
    rubisEarnedTotal: 1800,
    rubisSpentTotal: 566,
    achievementsByTier: {
      bronze: { unlocked: 4, total: 10 },
      silver: { unlocked: 2, total: 8 },
      gold: { unlocked: 1, total: 6 },
      master: { unlocked: 0, total: 2 },
    },
    achievementsTotalUnlocked: 7,
    achievementsTotalAll: 26,
    entitlementsTotal: 3,
    questsCompletedTotal: 11,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-09-01T00:00:00.000Z",
    equippedTitleCode: null,
    followsCount: 2,
  };

  const embed = buildProfileEmbed(profile, "https://cdn.discordapp.com/avatar.png").toJSON();
  assert.equal(embed.color, 0x9d7cff);
  assert.equal(embed.title, "LeCasiNoze");
  assert.match(embed.description || "", /Niveau 8/);
  assert.match(embed.description || "", /42 XP/);
  assert.equal(embed.fields?.length, 6);
  assert.match(embed.fields?.[0]?.value || "", /1[\s ]?234 Rubis/);
  assert.match(embed.footer?.text || "", /Données synchronisées/);
});

test("renders a persistent blackjack table with real card artwork", async () => {
  const game: LunaLiveBlackjack = {
    sessionId: "12345678-1234-1234-1234-123456789abc",
    status: "active",
    mode: "plus",
    dealer: { cards: [{ r: "K", s: "♠" }, null], total: null },
    hands: [{
      cards: [{ r: "A", s: "♥" }, { r: "7", s: "♦" }],
      total: 18,
      bet: 20,
      doubled: false,
      finished: false,
      active: true,
    }],
    sideBetLines: ["**Perfect Pairs** — aucun gain (−3)", "**21+3** — aucun gain (−2)"],
    actions: { hit: true, stand: true, double: true, split: false },
    balance: 97553,
    cooldownEndsAt: "2026-09-03T08:00:00.000Z",
    result: null,
  };
  const message = await buildBlackjackMessage(game, "LeCasiNoze");
  const attachment = message.files[0].attachment;
  assert.ok(Buffer.isBuffer(attachment));
  assert.deepEqual([...attachment.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(attachment.length > 20_000);
  if (process.env.BLACKJACK_PREVIEW_PATH) {
    await writeFile(process.env.BLACKJACK_PREVIEW_PATH, attachment);
  }
  const embed = message.embeds[0].toJSON();
  assert.equal(embed.image?.url, `attachment://nozebot-blackjack-${game.sessionId}.png`);
  assert.equal(message.components[0].components[3].data.disabled, true);
});
