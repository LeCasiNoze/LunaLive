// api/src/routes/me_overlay.ts

import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";

export const meOverlayRouter = Router();

// stock MVP en mémoire (on branchera DB ensuite)
const byUser = new Map<number, any>();

function deepMerge(a: any, b: any) {
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: any = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b ?? a;
}

function getUserId(req: any): number {
  const id = Number(req.user?.id ?? req.userId ?? 0);
  return Number.isFinite(id) ? id : 0;
}

/** =========================
 *  ✅ DLive followers (cache)
 *  ========================= */
const dliveCache = new Map<
  string,
  { t: number; count: number; last: any | null }
>();

async function dliveGetFollowers(username: string) {
  const key = username.trim();
  if (!key) return { count: 0, last: null };

  const cached = dliveCache.get(key);
  if (cached && Date.now() - cached.t < 10_000) {
    return { count: cached.count, last: cached.last };
  }

  const query = `
    query ($username: String!) {
      user(username: $username) {
        followers(first: 1) {
          totalCount
          list { username displayname avatar }
        }
      }
    }
  `;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);

  try {
    const r = await fetch("https://graphigo.prd.dlive.tv/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { username: key } }),
      signal: ctrl.signal,
    });

    const j: any = await r.json().catch(() => null);
    const f = j?.data?.user?.followers;

    const count = Number(f?.totalCount ?? 0) || 0;
    const last = Array.isArray(f?.list) ? f.list[0] ?? null : null;

    dliveCache.set(key, { t: Date.now(), count, last });
    return { count, last };
  } finally {
    clearTimeout(to);
  }
}

/** =========================
 *  Existing config endpoints
 *  ========================= */
meOverlayRouter.get("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const cfg = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  return res.json({ ok: true, config: cfg });
});

meOverlayRouter.post("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const patch = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, patch);
  byUser.set(uid, next);
  return res.json({ ok: true });
});

meOverlayRouter.post("/view-config", (req, res) => {
  const uid = getUserId(req);
  const payload = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, { view: payload });
  byUser.set(uid, next);
  return res.json({ ok: true });
});

/** =========================
 *  ✅ NEW: followers count
 *  GET /me/overlay/followers?slug=xxx
 *  ========================= */
meOverlayRouter.get(
  "/followers",
  a(async (req, res) => {
    const slug = String(req.query.slug ?? "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });

    // ⚠️ IMPORTANT:
    // Adapte cette requête si chez toi le provider username est dans une table de link.
    // Ici je pars sur streamers.provider_channel_slug (souvent utilisé partout).
    const q = await pool.query(
      `SELECT provider_channel_slug
         FROM streamers
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );

    const providerUsername = String(q.rows?.[0]?.provider_channel_slug ?? "").trim();
    if (!providerUsername) {
      return res.status(404).json({ ok: false, error: "no_provider_link" });
    }

    const { count, last } = await dliveGetFollowers(providerUsername);

    return res.json({
      ok: true,
      slug,
      providerUsername,
      count,
      lastFollower: last
        ? {
            username: last.username ?? null,
            displayname: last.displayname ?? null,
            avatar: last.avatar ?? null,
          }
        : null,
    });
  })
);
