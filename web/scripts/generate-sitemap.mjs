import fs from "node:fs";
import path from "node:path";

const SITE = (process.env.SITE_URL || "https://lunalive.onrender.com").replace(/\/+$/, "");
const API = (
  process.env.SITEMAP_API_BASE ||
  process.env.VITE_API_BASE ||
  "https://lunalive-api.onrender.com"
).replace(/\/+$/, "");

const TODAY = new Date().toISOString().slice(0, 10);

async function safeJson(url) {
  const r = await fetch(url, {
    headers: { "user-agent": "lunalive-sitemap/1.0" },
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isGoodSlug(v) {
  const slug = String(v || "").trim().toLowerCase();
  if (!slug) return false;
  if (slug === "test" || /^test\d*$/.test(slug)) return false;
  if (slug.length < 3) return false;
  return true;
}

function urlNode(loc, lastmod = TODAY) {
  return [
    "  <url>",
    `    <loc>${esc(loc)}</loc>`,
    `    <lastmod>${esc(lastmod)}</lastmod>`,
    "  </url>",
  ].join("\n");
}

async function main() {
  const urls = new Set();

  // pages publiques SEO utiles
  ["/", "/browse", "/casinos", "/shop", "/hunt"].forEach((p) => {
    urls.add(new URL(p, SITE).toString());
  });

  // pages casinos
  try {
    const data = await safeJson(`${API}/casinos/list?q=&sort=top`);
    const casinos = Array.isArray(data?.casinos)
      ? data.casinos
      : Array.isArray(data?.items)
      ? data.items
      : [];

    for (const c of casinos) {
      const slug = String(c?.slug || "").trim();
      if (!slug) continue;
      urls.add(new URL(`/casinos/${encodeURIComponent(slug)}`, SITE).toString());
    }
  } catch (e) {
    console.warn("[sitemap] casinos fetch failed:", e?.message || e);
  }

  // pages streamer
  try {
    const data = await safeJson(`${API}/streamers`);
    const arr = Array.isArray(data)
      ? data
      : Array.isArray(data?.streamers)
      ? data.streamers
      : Array.isArray(data?.items)
      ? data.items
      : [];

    for (const s of arr) {
      const slug = String(s?.slug || "").trim();
      if (!isGoodSlug(slug)) continue;
      urls.add(new URL(`/s/${encodeURIComponent(slug)}`, SITE).toString());
    }
  } catch (e) {
    console.warn("[sitemap] streamers fetch failed:", e?.message || e);
  }

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    [...urls].sort().map((u) => urlNode(u)).join("\n"),
    `</urlset>`,
    ``,
  ].join("\n");

  const out = path.join(process.cwd(), "public", "sitemap.xml");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, xml, "utf8");

  console.log("[sitemap] wrote", out, "urls:", urls.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});