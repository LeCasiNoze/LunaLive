import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_URL || "https://lunalive.onrender.com";
const API = process.env.SITEMAP_API_BASE || process.env.VITE_API_BASE || "https://lunalive-api.onrender.com";

async function safeJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "lunalive-sitemap/1.0" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const urls = new Set();

  // pages statiques
  ["/", "/casinos", "/lives", "/streamers"].forEach((p) => urls.add(new URL(p, SITE).toString()));

  // casinos (adapte l'endpoint si besoin)
  try {
    const data = await safeJson(`${API}/casinos/list?q=&sort=top`);
    const casinos = data?.casinos || data?.items || [];
    for (const c of casinos) {
      if (c?.slug) urls.add(new URL(`/casinos/${encodeURIComponent(c.slug)}`, SITE).toString());
    }
  } catch (e) {
    console.warn("[sitemap] casinos fetch failed:", e.message);
  }

  // streamers (adapte si tu as un endpoint)
  try {
    const data = await safeJson(`${API}/streamers/list`);
    const streamers = data?.streamers || data?.items || [];
    for (const s of streamers) {
      if (s?.slug) urls.add(new URL(`/streamers/${encodeURIComponent(s.slug)}`, SITE).toString());
    }
  } catch (e) {
    console.warn("[sitemap] streamers fetch failed:", e.message);
  }

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].sort().map(u => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}
</urlset>
`;

  const out = path.join(process.cwd(), "public", "sitemap.xml");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, xml, "utf8");
  console.log("[sitemap] wrote", out, "urls:", urls.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
