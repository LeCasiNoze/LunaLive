// api/src/clips/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";

function mustEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`${name} missing`);
  return v;
}

function optEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  return v ? v : "";
}

/**
 * Feature flag:
 * - ON seulement si on a de quoi uploader (bucket+endpoint+keys)
 * - et de quoi servir au public (public base)
 */
export function r2Enabled() {
  const bucket = optEnv("R2_BUCKET");
  const endpoint = optEnv("R2_ENDPOINT");
  const ak = optEnv("R2_ACCESS_KEY_ID");
  const sk = optEnv("R2_SECRET_ACCESS_KEY");
  const pub = optEnv("R2_PUBLIC_BASE").replace(/\/$/, "");
  return !!(bucket && endpoint && ak && sk && pub);
}

export function getR2PublicBase(): string | null {
  const b = String(process.env.R2_PUBLIC_BASE || "").trim().replace(/\/$/, "");
  return b ? b : null;
}

/**
 * Build a public URL for a stored object key.
 * - keeps "/" but encodes each segment safely
 */
export function buildPublicUrl(key: string): string | null {
  const base = getR2PublicBase();
  if (!base) return null;

  const raw = String(key || "").replace(/^\/+/, "");
  if (!raw) return null;

  // encode each path segment but keep slashes
  const encoded = raw
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  return `${base}/${encoded}`;
}

export function makeS3Client(): S3Client {
  const endpoint = mustEnv("R2_ENDPOINT"); // ex: https://<accountid>.r2.cloudflarestorage.com
  const accessKeyId = mustEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = mustEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export async function putFileToR2(params: { key: string; contentType: string; filePath: string }) {
  const Bucket = mustEnv("R2_BUCKET");
  const client = makeS3Client();

  const k = String(params.key || "").replace(/^\/+/, "");
  if (!k) throw new Error("r2_key_required");

  const Body = fs.createReadStream(params.filePath);

  await client.send(
    new PutObjectCommand({
      Bucket,
      Key: k,
      Body,
      ContentType: String(params.contentType || "application/octet-stream"),
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function putR2Buffer(params: { key: string; contentType: string; buffer: Buffer; cacheControl?: string }): Promise<boolean> {
  try {
    const Bucket = mustEnv("R2_BUCKET");
    const client = makeS3Client();

    const k = String(params.key || "").replace(/^\/+/, "");
    if (!k) throw new Error("r2_key_required");

    await client.send(
      new PutObjectCommand({
        Bucket,
        Key: k,
        Body: params.buffer,
        ContentType: String(params.contentType || "application/octet-stream"),
        CacheControl: params.cacheControl || "public, max-age=31536000, immutable",
      })
    );
    return true;
  } catch (error) {
    console.error('[r2] putR2Buffer failed:', error);
    return false;
  }
}

export async function deleteFromR2(key: string) {
  const Bucket = mustEnv("R2_BUCKET");
  const client = makeS3Client();

  const k = String(key || "").replace(/^\/+/, "");
  if (!k) return;

  await client.send(
    new DeleteObjectCommand({
      Bucket,
      Key: k,
    })
  );
}
