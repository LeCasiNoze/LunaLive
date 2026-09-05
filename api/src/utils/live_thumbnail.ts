import sharp from "sharp";

export const MAX_THUMB_INPUT_BYTES = 5 * 1024 * 1024;

export async function encodeLiveThumbnail(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_THUMB_INPUT_BYTES) throw new Error("thumbnail_input_too_large");
  return sharp(input, { limitInputPixels: 16_000_000, animated: false })
    .rotate()
    .resize({ width: 640, height: 360, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 68 })
    .toBuffer();
}
