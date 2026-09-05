import assert from "node:assert/strict";
import test from "node:test";
import { channel } from "node:diagnostics_channel";
import { startOutboundHttpMetrics } from "./outbound_http_metrics.js";

test("outbound diagnostics aggregate bytes without logging secrets and can stop", (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  const logs: unknown[][] = [];
  context.mock.method(console, "log", (...args: unknown[]) => logs.push(args));
  const stop = startOutboundHttpMetrics();
  const sent = channel("undici:client:sendHeaders");
  sent.publish({ request: { origin: "https://example.com/private?token=secret", contentLength: 12 }, headers: "Authorization: secret" });
  sent.publish({ request: { origin: "https://example.com", contentLength: 0 }, headers: "GET /" });
  assert.doesNotThrow(() => sent.publish({}));
  context.mock.timers.tick(300_000);
  const output = JSON.stringify(logs);
  assert.ok(!output.includes("secret"));
  assert.ok(!output.includes("private"));
  const entries = JSON.parse(logs[0][1] as string);
  assert.deepEqual(entries, [["https://example.com", { requests: 2, applicationBytes: 38 }]]);
  stop();
  sent.publish({ request: { origin: "https://example.com" }, headers: "GET /" });
  context.mock.timers.tick(300_000);
  assert.equal(logs.length, 1);
});
