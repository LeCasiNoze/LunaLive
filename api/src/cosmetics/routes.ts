// api/src/cosmetics/routes.ts
import { Router } from "express";
import { COSMETICS_CATALOG, type CosmeticKind } from "./catalog";
import { cosmeticsUnlockAllFor } from "./unlockAll";
import { db } from "../db"; // adapte si ton export diffère

export const cosmeticsRouter = Router();

// Si ton auth met req.user => OK. Sinon, dis-moi où c’est fait et je te l’adapte.
function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ ok: false, error: "auth_required" });
  next();
}

const byKind = (kind: CosmeticKind) =>
  COSMETICS_CATALOG.filter((x) => x.active && x.kind === kind);

cosmeticsRouter.get("/cosmetics/catalog", (req, res) => {
  res.json({ ok: true, items: COSMETICS_CATALOG.filter((x) => x.active) });
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

  // Owned (V1): on ne branche pas encore les achats/achievements ici.
  // -> donc: personne n'a rien sauf si unlockAll.
  const owned = {
    username: unlockAll ? byKind("username").map((x) => x.code) : ([] as string[]),
    badge: unlockAll ? byKind("badge").map((x) => x.code) : ([] as string[]),
    title: unlockAll ? byKind("title").map((x) => x.code) : ([] as string[]),
    frame: unlockAll ? byKind("frame").map((x) => x.code) : ([] as string[]),
    hat: unlockAll ? byKind("hat").map((x) => x.code) : ([] as string[]),
  };

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
    // bonus debug (le front peut ignorer)
    unlockAll,
  });
});

cosmeticsRouter.patch("/me/cosmetics/equip", requireAuth, async (req: any, res) => {
  const user = req.user as { id: number; username: string; role: string };
  const unlockAll = cosmeticsUnlockAllFor(user.username);

  const kind = String(req.body?.kind || "") as CosmeticKind;
  const code = req.body?.code === null ? null : String(req.body?.code || "");

  if (!["username", "badge", "title", "frame", "hat"].includes(kind)) {
    return res.status(400).json({ ok: false, error: "bad_kind" });
  }

  if (code) {
    const item = COSMETICS_CATALOG.find((x) => x.active && x.code === code);
    if (!item) return res.status(400).json({ ok: false, error: "unknown_code" });
    if (item.kind !== kind) return res.status(400).json({ ok: false, error: "kind_mismatch" });

    // V1: si pas unlockAll => on bloque tout ce qui est pas possédé
    // Comme on n'a pas encore la table d'ownership, on autorise uniquement unlockAll.
    if (!unlockAll) {
      return res.status(403).json({ ok: false, error: "not_owned" });
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
