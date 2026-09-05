import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { encodeLiveThumbnail, MAX_THUMB_INPUT_BYTES } from "./live_thumbnail.js";

test("full-HD previews are JPEG thumbnails, not full-size originals", async () => {
  const input = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#7c3aed" } }).png().toBuffer();
  const output = await encodeLiveThumbnail(input);
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 360);
  assert.ok(output.length < input.length);
});

test("small and portrait images retain their proportions without enlargement", async () => {
  for (const [width, height] of [[120, 60], [800, 1600]]) {
    const input = await sharp({ create: { width, height, channels: 3, background: "#331155" } }).png().toBuffer();
    const output = await sharp(await encodeLiveThumbnail(input)).metadata();
    assert.ok(output.width! <= Math.min(width, 640));
    assert.ok(output.height! <= Math.min(height, 360));
    assert.equal(output.width! / output.height!, width / height);
  }
});

test("invalid and oversized provider images are rejected", async () => {
  await assert.rejects(encodeLiveThumbnail(Buffer.from("not an image")));
  await assert.rejects(encodeLiveThumbnail(Buffer.alloc(MAX_THUMB_INPUT_BYTES + 1)), /thumbnail_input_too_large/);
});
