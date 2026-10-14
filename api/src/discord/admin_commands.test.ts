import assert from "node:assert/strict";
import test from "node:test";
import type { Interaction } from "discord.js";
import { SLASH_COMMANDS } from "./constants.js";
import { routeAdminInteraction } from "./admin_commands.js";

test("les commandes agence ne sont plus publiées et ne déclenchent plus de traitement", async () => {
  for (const commandName of ["frais", "agence", "landing", "dette", "tiktok", "todo"]) {
    assert.equal(SLASH_COMMANDS.some(command => command.name === commandName), false);
    const interaction = { isChatInputCommand: () => true, commandName } as unknown as Interaction;
    assert.equal(await routeAdminInteraction(interaction), false);
  }
  assert.equal(await routeAdminInteraction({ isChatInputCommand: () => false } as unknown as Interaction), false);
});

test("les fonctions communautaires et la modération restent proposées", () => {
  for (const commandName of ["help", "link", "claim", "slot", "blackjack", "profil", "purge"]) {
    assert.equal(SLASH_COMMANDS.some(command => command.name === commandName), true);
  }
});

test("purge conserve son traitement de modération, sans aucun appel Discord réel", async () => {
  let deferred = false, count = 0, reply = "";
  const interaction = {
    isChatInputCommand: () => true, commandName: "purge", user: { id: "682472610868887567" },
    options: { getInteger: () => 3 },
    channel: { bulkDelete: async (amount: number) => { count = amount; return { size: amount }; } },
    deferReply: async () => { deferred = true; },
    editReply: async (payload: { content: string }) => { reply = payload.content; },
  } as unknown as Interaction;
  assert.equal(await routeAdminInteraction(interaction), true);
  assert.equal(deferred, true);
  assert.equal(count, 3);
  assert.match(reply, /3 messages/);
});
