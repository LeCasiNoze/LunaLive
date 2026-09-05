import assert from "node:assert/strict";
import test from "node:test";
import { hasReadableHlsSegment } from "./hls_probe.js";

test("a valid segment stops probing and its body is cancelled", async () => {
  let calls = 0;
  let cancelled = 0;
  const fetcher = (async (_url, init) => {
    calls++;
    assert.equal((init?.headers as Record<string, string>).range, "bytes=0-0");
    return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 206 });
  }) as typeof fetch;
  assert.equal(await hasReadableHlsSegment("https://cdn.example/live/", ["1.ts", "2.ts", "3.ts", "4.ts"], fetcher), true);
  assert.equal(calls, 1);
  assert.equal(cancelled, 1);
});

test("unavailable segments fall back, but a wholly unavailable stream stays offline", async () => {
  let calls = 0;
  const fetcher = (async () => new Response(null, { status: ++calls === 2 ? 200 : 404 })) as typeof fetch;
  assert.equal(await hasReadableHlsSegment("https://cdn.example/", ["1.ts", "2.ts", "3.ts"], fetcher), true);
  assert.equal(calls, 2);
  assert.equal(await hasReadableHlsSegment("https://cdn.example/", ["1.ts", "2.ts"], async () => new Response(null, { status: 404 })), false);
});

test("all segment attempts share one six-second timeout", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const fetcher = (async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  }) as typeof fetch;
  const probe = hasReadableHlsSegment("https://cdn.example/", ["1.ts", "2.ts", "3.ts"], fetcher);
  context.mock.timers.tick(6_000);
  assert.equal(await probe, false);
  assert.equal(calls, 1);
});
