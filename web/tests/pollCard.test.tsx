// Run with an esbuild bundle (CSS loader: empty), then node --test the bundle.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PollCard, { pollFromPayload } from "../src/components/chat/PollCard";

const payload = {
  id: 7, question: "Quelle machine ?", options: ["Sweet", "Gates", "Le Bandit"],
  counts: [1, 3, 0], total: 4, endsAtMs: Date.now() + 60_000, status: "open", myChoice: 2,
};

test("payload mapping keeps the viewer's own vote across broadcasts", () => {
  const mine = pollFromPayload(payload)!;
  assert.equal(mine.myChoice, 2);
  // le broadcast ne porte pas myChoice : le vote du viewer est conservé
  const next = pollFromPayload({ ...payload, counts: [2, 3, 0], total: 5, myChoice: undefined }, mine)!;
  assert.deepEqual([next.myChoice, next.total, next.counts[0]], [2, 5, 2]);
  assert.equal(pollFromPayload({ id: 0 }), null);
});

test("open poll renders vote buttons, percentages and the Rumble hint", () => {
  const html = renderToStaticMarkup(<PollCard poll={pollFromPayload(payload)} onVote={() => {}} />);
  assert.equal((html.match(/<button/g) || []).length, 3);
  assert.match(html, /75%/);
  assert.match(html, /Rumble : !1 à !3/);
  assert.match(html, /Tu peux changer ton vote/);
  assert.match(html, /is-mine/);
});

test("closed poll crowns the winner and is not clickable; read-only never shows buttons", () => {
  const closed = renderToStaticMarkup(<PollCard poll={pollFromPayload({ ...payload, status: "closed" })} onVote={() => {}} />);
  assert.equal((closed.match(/<button/g) || []).length, 0);
  assert.match(closed, /Terminé/);
  assert.match(closed, /is-winner/);
  const overlay = renderToStaticMarkup(<PollCard poll={pollFromPayload(payload)} readOnly />);
  assert.equal((overlay.match(/<button/g) || []).length, 0);
});
