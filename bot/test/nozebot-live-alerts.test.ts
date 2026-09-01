import assert from "node:assert/strict";
import test from "node:test";
import { buildProfileEmbed } from "../src/nozebot/commands.js";
import { buildMemberWelcomeMessage } from "../src/nozebot/discord.js";
import { buildLiveAlertMessage, parseLunaLivePayload } from "../src/nozebot/live-alerts.js";
import type { LunaLiveProfile } from "../src/nozebot/lunalive-api.js";

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
