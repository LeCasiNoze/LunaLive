// api/src/cosmetics/routes.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import { COSMETICS_CATALOG, type CosmeticKind } from "./catalog";
import { cosmeticsUnlockAllFor } from "./unlockAll";
import { db } from "../db"; // adapte si ton export diffère

export const cosmeticsRouter = Router();

type Kind = CosmeticKind;

type CatalogItem = {
  kind: Kind;
  code: string;
  name: string;
  rarity: any;
  unlock: any;
  priceRubis: number | null;
  pricePrestige?: number | null;
  active: boolean;
  meta?: any;
};

// Si ton auth met req.user => OK. Sinon, dis-moi où c’est fait et je l’adapte.
function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ ok: false, error: "auth_required" });
  next();
}

const byKind = (kind: Kind) => COSMETICS_CATALOG.filter((x) => x.active && x.kind === kind);

function tryGetAuthUser(req: any): { id: number } | null {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const au = jwt.verify(m[1], secret) as any;
    const id = Number(au?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id };
  } catch {
    return null;
  }
}

function clampBadgeText(s: string) {
  const t = String(s || "")
    .trim()
    .replace(/[^\w\-]/g, "");
  const out = (t || "SUB").slice(0, 8);
  return out.toUpperCase();
}

async function getActiveSubBadgesForUser(userId: number): Promise<CatalogItem[]> {
  const q = await db.query(
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
    if (badge.enabled === false) continue;

    const badgeText = clampBadgeText(badge.text || "SUB");
    const borderColor = String(badge.borderColor || "#7C4DFF");
    const textColor = String(badge.textColor || "#FFFFFF");
    const displayName = String(r.displayName || slug);

    out.push({
      kind: "badge",
      code: `badge_sub_${slug.toLowerCase()}`,
      name: `Badge sub ${badgeText} — ${displayName}`,
      rarity: "sub",
      unlock: "sub",
      priceRubis: null,
      active: true,
      meta: { badgeText, borderColor, textColor, streamerSlug: slug, streamerName: displayName },
    });
  }
  return out;
}

function isSubBadgeCode(code: string) {
  const p = "badge_sub_";
  if (!code.startsWith(p)) return null;
  const slug = code.slice(p.length).trim();
  if (!slug) return null;
  return slug;
}

async function userHasActiveSubToSlug(userId: number, slug: string): Promise<boolean> {
  const q = await db.query(
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

cosmeticsRouter.get("/cosmetics/catalog", async (req, res) => {
  const staticItems = COSMETICS_CATALOG.filter((x) => x.active) as any[];

  const au = tryGetAuthUser(req);
  let dyn: CatalogItem[] = [];
  if (au?.id) dyn = await getActiveSubBadgesForUser(au.id);

  // merge unique
  const map = new Map<string, any>();
  for (const it of [...staticItems, ...dyn]) {
    if (!it?.active) continue;
    map.set(`${it.kind}:${it.code}`, it);
  }

  res.json({ ok: true, items: Array.from(map.values()) });
});

cosmeticsRouter.get("/me/cosmetics", requireAuth, async (req: any, res) => {
  const user = req.user as { id: number; username: string; role: string };

  const unlockAll = cosmeticsUnlockAllFor(user.username);

  // ensure row exists
  await db.query(
    `INSERT INTO user_equipped_cosmetics (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

  const row = await db.query(
    `SELECT username_code, badge_code, title_code, frame_code, hat_code
     FROM user_equipped_cosmetics
     WHERE user_id=$1`,
    [user.id]
  );

  const equipped = row.rows?.[0] ?? {
    username_code: null,
    badge_code: null,
    title_code: null,
    frame_code: null,
    hat_code: null,
  };

  const subBadges = await getActiveSubBadgesForUser(user.id);

  // Owned V1: unlockAll donne tout le statique; et sub badges sont toujours owned si sub actif
  const owned = {
    username: unlockAll ? byKind("username").map((x) => x.code) : ([] as string[]),
    badge: [] as string[],
    title: unlockAll ? byKind("title").map((x) => x.code) : ([] as string[]),
    frame: unlockAll ? byKind("frame").map((x) => x.code) : ([] as string[]),
    hat: unlockAll ? byKind("hat").map((x) => x.code) : ([] as string[]),
  };

  if (unlockAll) {
    owned.badge = byKind("badge").map((x) => x.code);
  }
  // + sub dyn
  {
    const set = new Set<string>(owned.badge);
    for (const it of subBadges) set.add(it.code);
    owned.badge = Array.from(set);
  }

  res.json({
    ok: true,
    owned,
    equipped: {
      username: equipped.username_code ?? null,
      badge: equipped.badge_code ?? null,
      title: equipped.title_code ?? null,
      frame: equipped.frame_code ?? null,
      hat: equipped.hat_code ?? null,
    },
    unlockAll,
  });
});

cosmeticsRouter.patch("/me/cosmetics/equip", requireAuth, async (req: any, res) => {
  const user = req.user as { id: number; username: string; role: string };
  const unlockAll = cosmeticsUnlockAllFor(user.username);

  const kind = String(req.body?.kind || "") as Kind;
  const code = req.body?.code === null ? null : String(req.body?.code || "").trim();

  if (!["username", "badge", "title", "frame", "hat"].includes(kind)) {
    return res.status(400).json({ ok: false, error: "bad_kind" });
  }

  if (code) {
    // ✅ badge_sub_* : autorisé si sub actif (même sans unlockAll)
    if (kind === "badge") {
      const slug = isSubBadgeCode(code);
      if (slug && !unlockAll) {
        const ok = await userHasActiveSubToSlug(user.id, slug);
        if (!ok) return res.status(403).json({ ok: false, error: "not_owned" });
      } else {
        // sinon: normal catalogue
        const item = COSMETICS_CATALOG.find((x) => x.active && x.code === code);
        if (!item) return res.status(400).json({ ok: false, error: "unknown_code" });
        if (item.kind !== kind) return res.status(400).json({ ok: false, error: "kind_mismatch" });
        if (!unlockAll) return res.status(403).json({ ok: false, error: "not_owned" });
      }
    } else {
      const item = COSMETICS_CATALOG.find((x) => x.active && x.code === code);
      if (!item) return res.status(400).json({ ok: false, error: "unknown_code" });
      if (item.kind !== kind) return res.status(400).json({ ok: false, error: "kind_mismatch" });
      if (!unlockAll) return res.status(403).json({ ok: false, error: "not_owned" });
    }
  }

  // ensure row exists
  await db.query(
    `INSERT INTO user_equipped_cosmetics (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

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

  await db.query(
    `UPDATE user_equipped_cosmetics
     SET ${col} = $2, updated_at = NOW()
     WHERE user_id = $1`,
    [user.id, code]
  );

  const row = await db.query(
    `SELECT username_code, badge_code, title_code, frame_code, hat_code
     FROM user_equipped_cosmetics
     WHERE user_id=$1`,
    [user.id]
  );

  const equipped = row.rows?.[0] ?? {};

  res.json({
    ok: true,
    equipped: {
      username: equipped.username_code ?? null,
      badge: equipped.badge_code ?? null,
      title: equipped.title_code ?? null,
      frame: equipped.frame_code ?? null,
      hat: equipped.hat_code ?? null,
    },
  });
});
