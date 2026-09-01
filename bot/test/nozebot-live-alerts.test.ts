import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveAlertMessage, parseLunaLivePayload } from "../src/nozebot/live-alerts.js";

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
  assert.equal(embed.image?.url, snapshot.thumbnailUrl);
  assert.equal(embed.author?.icon_url, snapshot.avatarUrl);
  assert.equal(row.components.length, 2);
  assert.deepEqual(
    row.components.map((button) => "url" in button ? button.url : null),
    [messageConfig.lunaLiveUrl, messageConfig.rumbleUrl]
  );
});
