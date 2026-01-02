// api/src/routes/cosmetics.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";

export const cosmeticsRouter = Router();

type Kind = "username" | "badge" | "title" | "frame" | "hat";
const ALLOWED_KINDS: Kind[] = ["username", "badge", "title", "frame", "hat"];

// Items gratuits (toujours équipables même sans entitlement)
const BASE_FREE: Record<Kind, string[]> = {
  username: ["default"],
  badge: ["none"],
  title: ["none"],
  frame: ["none"],
  hat: ["none"],
};

// ──────────────────────────────────────────
// DEV: unlock all (comma-separated usernames)
// ──────────────────────────────────────────
const DEV_UNLOCK_ALL_SET = new Set(
  String(process.env.DEV_UNLOCK_ALL_FOR || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function devUnlockAll(username: string | null | undefined) {
  if (!username) return false;
  return DEV_UNLOCK_ALL_SET.has(username.trim().toLowerCase());
}

async function getReqUsername(req: any): Promise<string | null> {
  const u = req.user?.username;
  if (typeof u === "string" && u.trim()) return u.trim();

  const userId = Number(req.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const r = await pool.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.username ?? null;
}

function buildOwnedAllActive(): Record<Kind, string[]> {
  const owned: Record<Kind, string[]> = {
    username: [],
    badge: [],
    title: [],
    frame: [],
    hat: [],
  };

  for (const it of COSMETICS_CATALOG as any[]) {
    if (!it?.active) continue;
    const k = it.kind as Kind;
    if (!ALLOWED_KINDS.includes(k)) continue;
    owned[k].push(String(it.code));
  }
  return owned;
}

function catalogHas(kind: Kind, code: string) {
  return (COSMETICS_CATALOG as any[]).some(
    (x) => x && x.active && x.kind === kind && String(x.code) === code
  );
}

// ──────────────────────────────────────────
// DB helpers
// ──────────────────────────────────────────
async function ensureRow(userId: number) {
  await pool.query(
    `INSERT INTO user_equipped_cosmetics (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

// ──────────────────────────────────────────
// SUB BADGES helpers
// ──────────────────────────────────────────
function subSlugFromBadge(code: string) {
  const m = code.match(/^badge_sub_(.+)$/);
  return m ? m[1] : null;
}

async function hasActiveSubToSlug(userId: number, slug: string) {
  const r = await pool.query(
    `SELECT 1
     FROM streamer_subscriptions ss
     JOIN streamers s ON s.id = ss.streamer_id
     WHERE ss.user_id = $1
       AND ss.expires_at > NOW()
       AND lower(s.slug) = lower($2)
     LIMIT 1`,
    [userId, slug]
  );
  return !!r.rows?.[0];
}

async function getActiveSubBadgeCodes(userId: number): Promise<string[]> {
  const q = await pool.query(
    `SELECT s.slug
     FROM streamer_subscriptions ss
     JOIN streamers s ON s.id = ss.streamer_id
     WHERE ss.user_id = $1
       AND ss.expires_at > NOW()`,
    [userId]
  );
  return q.rows
    .map((r: any) => `badge_sub_${String(r.slug || "").trim()}`)
    .filter((x: string) => x !== "badge_sub_");
}

// ──────────────────────────────────────────
// GET /cosmetics/catalog (public)
// -> retourne catalogue + badges sub dynamiques
// ──────────────────────────────────────────
cosmeticsRouter.get(
  "/cosmetics/catalog",
  a(async (_req, res) => {
    const s = await pool.query(
      `SELECT slug, display_name
       FROM streamers
       WHERE (suspended_until IS NULL OR suspended_until < NOW())
       ORDER BY slug ASC`
    );

    const subBadges = s.rows
      .map((r: any) => {
        const slug = String(r.slug || "").trim();
        if (!slug) return null;
        const displayName = String(r.display_name || slug).trim();

        return {
          kind: "badge",
          code: `badge_sub_${slug}`,
          name: `Badge sub — ${displayName}`,
          rarity: "silver",
          unlock: "system",
          priceRubis: null,
          active: true,
          meta: { subOf: slug },
        };
      })
      .filter(Boolean);

    // merge + dedupe (kind:code)
    const map = new Map<string, any>();
    for (const it of [...(COSMETICS_CATALOG as any[]), ...(subBadges as any[])]) {
      if (!it?.active) continue;
      const k = `${it.kind}:${it.code}`;
      if (!map.has(k)) map.set(k, it);
    }

    res.json({ ok: true, items: Array.from(map.values()) });
  })
);

// ──────────────────────────────────────────
// GET /me/cosmetics (auth)
// -> owned (entitlements) + equipped + free (incl. badges sub actifs)
// ──────────────────────────────────────────
cosmeticsRouter.get(
  "/me/cosmetics",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const username = await getReqUsername(req);
    const unlockAll = devUnlockAll(username);

    await ensureRow(userId);

    const eq = await pool.query(
      `SELECT username_code AS "username",
              badge_code    AS "badge",
              title_code    AS "title",
              frame_code    AS "frame",
              hat_code      AS "hat"
       FROM user_equipped_cosmetics
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    // owned via entitlements
    const ent = await pool.query(
      `SELECT kind, code
       FROM user_entitlements
       WHERE user_id = $1`,
      [userId]
    );

    // ✅ IMPORTANT: owned doit exister (sinon TS18004)
    const owned: Record<Kind, string[]> = {
      username: [],
      badge: [],
      title: [],
      frame: [],
      hat: [],
    };

    for (const r of ent.rows as any[]) {
      const k = String(r.kind || "") as Kind;
      const c = String(r.code || "");
      if (!k || !c) continue;
      if (!ALLOWED_KINDS.includes(k)) continue;
      owned[k].push(c);
    }

    // DEV unlock-all: merge owned avec tout le catalogue actif
    if (unlockAll) {
      const all = buildOwnedAllActive();
      for (const k of Object.keys(all) as Kind[]) {
        const cur = new Set<string>(owned[k] || []);
        for (const code of all[k] || []) cur.add(code);
        owned[k] = Array.from(cur);
      }
    }

    // ✅ free = base + badges sub actifs
    const subBadges = await getActiveSubBadgeCodes(userId);
    const free: Record<Kind, string[]> = {
      ...BASE_FREE,
      badge: Array.from(new Set([...(BASE_FREE.badge || []), ...subBadges])),
    };

    res.json({
      ok: true,
      owned,
      equipped:
        eq.rows?.[0] || { username: null, badge: null, title: null, frame: null, hat: null },
      free,
      unlockAll, // debug (front peut ignorer)
    });
  })
);

// ──────────────────────────────────────────
// PATCH /me/cosmetics/equip (auth)
// -> autorise badge_sub_<slug> si sub actif (ou unlockAll)
// ──────────────────────────────────────────
cosmeticsRouter.patch(
  "/me/cosmetics/equip",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const username = await getReqUsername(req);
    const unlockAll = devUnlockAll(username);

    const kind = String(req.body?.kind || "") as Kind;
    const codeRaw = req.body?.code;
    const code = codeRaw === null ? null : String(codeRaw || "").trim();

    if (!ALLOWED_KINDS.includes(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    await ensureRow(userId);

    const col =
      kind === "username"
        ? "username_code"
        : kind === "badge"
        ? "badge_code"
        : kind === "title"
        ? "title_code"
        : kind === "frame"
        ? "frame_code"
        : "hat_code";

    // null => unequip
    if (code === null) {
      const upd = await pool.query(
        `UPDATE user_equipped_cosmetics
         SET ${col} = NULL, updated_at = NOW()
         WHERE user_id = $1
         RETURNING username_code AS "username",
                   badge_code    AS "badge",
                   title_code    AS "title",
                   frame_code    AS "frame",
                   hat_code      AS "hat"`,
        [userId]
      );
      return res.json({ ok: true, equipped: upd.rows?.[0] });
    }

    if (!code) return res.status(400).json({ ok: false, error: "bad_code" });

    // ✅ base free
    let isFree = (BASE_FREE[kind] || []).includes(code);

    // ✅ special: badge_sub_<slug> autorisé si sub actif
    if (kind === "badge" && code.startsWith("badge_sub_")) {
      const slug = subSlugFromBadge(code);
      if (!slug) return res.status(400).json({ ok: false, error: "bad_code" });

      const ok = await hasActiveSubToSlug(userId, slug);
      if (!ok && !unlockAll) return res.status(403).json({ ok: false, error: "not_owned" });

      isFree = true; // treat as free if active sub (or unlockAll)
    }

    // ✅ validation catalogue (évite typos/cheat)
    // (on skip pour badge_sub_ car validé via join streamer_subscriptions)
    if (!isFree && !(kind === "badge" && code.startsWith("badge_sub_"))) {
      if (!catalogHas(kind, code)) {
        return res.status(400).json({ ok: false, error: "unknown_code" });
      }
    }

    // entitlement required (sauf free / unlockAll)
    if (!isFree && !unlockAll) {
      const check = await pool.query(
        `SELECT 1
         FROM user_entitlements
         WHERE user_id = $1 AND kind = $2 AND code = $3
         LIMIT 1`,
        [userId, kind, code]
      );
      if (!check.rows?.[0]) return res.status(403).json({ ok: false, error: "not_owned" });
    }

    const upd = await pool.query(
      `UPDATE user_equipped_cosmetics
       SET ${col} = $2, updated_at = NOW()
       WHERE user_id = $1
       RETURNING username_code AS "username",
                 badge_code    AS "badge",
                 title_code    AS "title",
                 frame_code    AS "frame",
                 hat_code      AS "hat"`,
      [userId, code]
    );

    res.json({ ok: true, equipped: upd.rows?.[0] });
  })
);
