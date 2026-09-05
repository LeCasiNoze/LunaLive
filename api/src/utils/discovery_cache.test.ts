import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryCache } from "./discovery_cache.js";

test("concurrent callers share discovery, including negative results, until expiry", async () => {
  let now = 0;
  let calls = 0;
  const cached = createDiscoveryCache<string | null>(90_000, 2, () => now);
  const discover = async () => { calls++; return null; };
  const first = cached("radio", discover);
  assert.equal(cached("radio", discover), first);
  assert.equal(await first, null);
  now = 89_999;
  assert.equal(await cached("radio", discover), null);
  assert.equal(calls, 1);
  now = 90_000;
  assert.equal(await cached("radio", async () => { calls++; return "new-live"; }), "new-live");
  assert.equal(calls, 2);
});

test("rejected discoveries are retried and the cache has a finite capacity", async () => {
  const cached = createDiscoveryCache<string>(90_000, 2);
  await assert.rejects(cached("one", async () => { throw new Error("failed"); }));
  assert.equal(await cached("one", async () => "recovered"), "recovered");
  await cached("two", async () => "two");
  await cached("three", async () => "three");
  assert.equal(await cached("one", async () => "new-query"), "new-query");
});
