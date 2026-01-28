// api/src/routes/cosmetics.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";

export const cosmeticsRouter = Router();

type Kind = "username" | "badge" | "title" | "frame" | "hat";

type CatalogItem = {
  kind: Kind;
  code: string;
  name: string;
  rarity: string;
  unlock: string;
  priceRubis: number | null;
  pricePrestige?: number | null;
  active: boolean;
  meta?: any;
};

type AuthUser = { id: number; username?: string; role?: string };

const ALLOWED_KINDS: Kind[] = ["username", "badge", "title", "frame", "hat"];

// Items gratuits (toujours équipables)
const FREE: Record<Kind, string[]> = {
  username: ["default"],
  badge: ["none"],
  title: ["none"],
  frame: ["none"],
  hat: ["none"],
};

// ──────────────────────────────────────────
// DEV: unlock all (by username)
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

function tryGetAuthUser(req: any): AuthUser | null {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(m[1], secret) as any;
  } catch {
    return null;
  }
}

async function getReqUsername(req: any): Promise<string | null> {
  const u = req.user?.username;
  if (typeof u === "string" && u.trim()) return u;

  const userId = Number(req.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const r = await pool.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.username ?? null;
}

function clampBadgeText(s: string) {
  const t = String(s || "")
    .trim()
    .replace(/[^\w\-]/g, "");
  const out = (t || "SUB").slice(0, 8);
  return out.toUpperCase();
}

function emptyOwned(): Record<Kind, string[]> {
  return { username: [], badge: [], title: [], frame: [], hat: [] };
}

function buildOwnedAllActive(staticItems: CatalogItem[], extraItems: CatalogItem[] = []): Record<Kind, string[]> {
  const owned = emptyOwned();

  for (const it of [...staticItems, ...extraItems]) {
    if (!it?.active) continue;
    if (!ALLOWED_KINDS.includes(it.kind)) continue;
    (owned[it.kind] ??= []).push(it.code);
  }
  return owned;
}

function catalogHas(staticItems: CatalogItem[], kind: Kind, code: string) {
  return staticItems.some((x) => x && x.active && x.kind === kind && x.code === code);
}

function isSubBadgeCode(code: string) {
  const p = "badge_sub_";
  if (!code.startsWith(p)) return null;
  const slug = code.slice(p.length).trim();
  if (!slug) return null;
  return slug;
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

async function getActiveSubBadgesForUser(userId: number): Promise<CatalogItem[]> {
  const q = await pool.query(
    `SELECT s.slug, s.display_name AS "displayName", s.appearance
     FROM streamer_subscriptions ss
     JOIN streamers s ON s.id = ss.streamer_id
     WHERE ss.user_id = $1
       AND ss.expires_at > NOW()
       AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
     ORDER BY lower(s.slug) ASC`,
    [userId]
  );

  const out: CatalogItem[] = [];
  for (const r of q.rows as any[]) {
    const slug = String(r.slug || "").trim();
    if (!slug) continue;

    const ap = r.appearance || {};
    const badge = ap?.chat?.sub?.badge || {};

    // si le streamer a désactivé le badge sub, on ne le propose pas
    if (badge.enabled === false) continue;

    const badgeText = clampBadgeText(badge.text || "SUB");
    const borderColor = String(badge.borderColor || "#7C4DFF");
    const textColor = String(badge.textColor || "#FFFFFF");

    const displayName = String(r.displayName || slug);

    out.push({
      kind: "badge",
      code: `badge_sub_${slug.toLowerCase()}`,
      name: badgeText, // ✅ LEQ / SPY (et basta)
      rarity: "sub",
      unlock: "sub",
      priceRubis: null,
      active: true,
      meta: {
        badgeText,            // ✅ utile pour le rendu badge
        borderColor,
        textColor,
        streamerSlug: slug,
        streamerName: displayName, // ✅ tu gardes l’info si tu veux l’afficher ailleurs
      },
    });
  }
  return out;
}

async function userHasActiveSubToSlug(userId: number, slug: string): Promise<boolean> {
  const q = await pool.query(
    `SELECT 1
     FROM streamer_subscriptions ss
     JOIN streamers s ON s.id = ss.streamer_id
     WHERE ss.user_id = $1
       AND ss.expires_at > NOW()
       AND lower(s.slug) = lower($2)
     LIMIT 1`,
    [userId, slug]
  );
  return !!q.rows?.[0];
}

// ──────────────────────────────────────────
// GET /cosmetics/catalog
// - Public : catalogue statique
// - Si Bearer token : on ajoute les badges sub dynamiques
// ──────────────────────────────────────────
cosmeticsRouter.get(
  "/cosmetics/catalog",
  a(async (req: any, res) => {
    const staticItems = (COSMETICS_CATALOG || []).filter((x: any) => x && x.active) as CatalogItem[];

    const au = tryGetAuthUser(req);
    let dyn: CatalogItem[] = [];
    if (au?.id) {
      dyn = await getActiveSubBadgesForUser(Number(au.id));
    }

    // merge unique by kind+code (évite doublons)
    const map = new Map<string, CatalogItem>();
    for (const it of [...staticItems, ...dyn]) {
      if (!it?.active) continue;
      map.set(`${it.kind}:${it.code}`, it);
    }

    res.json({ ok: true, items: Array.from(map.values()) });
  })
);

// ──────────────────────────────────────────
// GET /me/cosmetics
// - owned via user_entitlements + badges sub actifs
// ──────────────────────────────────────────
cosmeticsRouter.get(
  "/me/cosmetics",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

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

    const equipped =
      eq.rows?.[0] || ({ username: null, badge: null, title: null, frame: null, hat: null } as any);

    // owned via entitlements
    const ent = await pool.query(
      `SELECT kind, code
       FROM user_entitlements
       WHERE user_id = $1`,
      [userId]
    );

    const owned = emptyOwned();
    for (const r of ent.rows as any[]) {
      const k = String(r.kind || "") as Kind;
      const c = String(r.code || "");
      if (!k || !c) continue;
      if (!ALLOWED_KINDS.includes(k)) continue;
      owned[k].push(c);
    }

    // ✅ owned badges via active subs
    const subBadges = await getActiveSubBadgesForUser(userId);
    {
      const set = new Set<string>(owned.badge);
      for (const it of subBadges) set.add(it.code);
      owned.badge = Array.from(set);
    }

    // ✅ DEV unlock-all: merge avec tout le catalogue actif (statique + subBadges)
    if (unlockAll) {
      const staticItems = (COSMETICS_CATALOG || []).filter((x: any) => x && x.active) as CatalogItem[];
      const all = buildOwnedAllActive(staticItems, subBadges);
      for (const k of Object.keys(all) as Kind[]) {
        const cur = new Set<string>(owned[k] || []);
        for (const code of all[k] || []) cur.add(code);
        owned[k] = Array.from(cur);
      }
    }

    res.json({
      ok: true,
      owned,
      equipped,
      free: FREE,
      unlockAll,
    });
  })
);

// ──────────────────────────────────────────
// PATCH /me/cosmetics/equip
// - autorise badge_sub_<slug> si sub actif
// - sinon, check catalog + entitlements
// ──────────────────────────────────────────
cosmeticsRouter.patch(
  "/me/cosmetics/equip",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

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

    const isFree = (FREE[kind] || []).includes(code);

    // ✅ badge_sub_<slug> : autorisé si sub actif
    if (kind === "badge") {
      const slug = isSubBadgeCode(code);
      if (slug && !unlockAll) {
        const ok = await userHasActiveSubToSlug(userId, slug);
        if (!ok) return res.status(403).json({ ok: false, error: "not_owned" });

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
        return res.json({ ok: true, equipped: upd.rows?.[0] });
      }
    }

    // ✅ validation catalogue statique (évite typos/cheat) — pour les non-sub
    if (!isFree) {
      const staticItems = (COSMETICS_CATALOG || []).filter((x: any) => x && x.active) as CatalogItem[];
      if (!catalogHas(staticItems, kind, code)) {
        return res.status(400).json({ ok: false, error: "unknown_code" });
      }
    }

    // entitlement requis (sauf free / unlockAll)
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
