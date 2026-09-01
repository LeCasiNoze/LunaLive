import assert from "node:assert/strict";
import test from "node:test";
import { settle, type BJGame, type Card } from "../src/discord/games_blackjack.js";
import { rollSlotOutcome } from "../src/discord/games_slot.js";

function game(player: Card[], dealer: Card[]): BJGame {
  return {
    cfg: { mainBet: 20, pairsBet: 0, plus3Bet: 0 },
    deck: [],
    dealer,
    hands: [{ cards: player, bet: 20, doubled: false, stood: true, finished: true }],
    active: 0,
    finished: true,
    sidebetLines: [],
    sidebetNet: 0,
    sidebetPayouts: { pairsCredit: 0, plus3Credit: 0, plus3Kind: null },
    mainNet: 0,
  };
}

test("a natural blackjack pays 3:2 when the dealer has no blackjack", () => {
  const result = settle(game(
    [{ r: "A", s: "♠" }, { r: "K", s: "♦" }],
    [{ r: "10", s: "♣" }, { r: "Q", s: "♥" }]
  ));
  assert.equal(result.isNaturalBlackjack, true);
  assert.equal(result.mainNet, 30);
  assert.equal(result.perHand[0].kind, "win");
});

test("two natural blackjacks push instead of paying the player twice", () => {
  const result = settle(game(
    [{ r: "A", s: "♠" }, { r: "K", s: "♦" }],
    [{ r: "A", s: "♣" }, { r: "Q", s: "♥" }]
  ));
  assert.equal(result.mainNet, 0);
  assert.equal(result.perHand[0].kind, "push");
});

test("slot outcome boundaries stay deterministic", () => {
  assert.equal(rollSlotOutcome(() => 0).code, "fucked");
  assert.equal(rollSlotOutcome(() => 0.05).code, "zero");
  assert.equal(rollSlotOutcome(() => 0.988).code, "777");
  assert.equal(rollSlotOutcome(() => 0.9999).code, "max");
});
