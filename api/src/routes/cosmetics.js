import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";

export const cosmeticsRouter = Router();

function applyItemToEquipped(equipped, item) {
  const e = equipped && typeof equipped === "object" ? equipped : {};

  switch (item.category) {
    case "username_color":
      return { ...e, username: { ...(e.username || {}), color: item.data.color } };
    case "username_effect":
      return { ...e, username: { ...(e.username || {}), effect: item.data.effect } };
    case "frame":
      return { ...e, frame: { frameId: item.data.frameId } };
    case "avatar_hat":
      return { ...e, avatar: { ...(e.avatar || {}), hatId: item.data.hatId, hatEmoji: item.data.hatEmoji } };
    case "avatar_border":
      return { ...e, avatar: { ...(e.avatar || {}), borderId: item.data.borderId } };
    case "badge":
      // V1: 1 seul badge équipé
      return { ...e, badges: [item.data.badge] };
    case "title":
      return { ...e, title: item.data.title };
    default:
      return e;
  }
}

function removeCategoryFromEquipped(equipped, category) {
  const e = equipped && typeof equipped === "object" ? equipped : {};
  const out = { ...e };

  if (category === "username_color") {
    if (out.username) out.username = { ...out.username, color: null };
  } else if (category === "username_effect") {
    if (out.username) out.username = { ...out.username, effect: "none" };
  } else if (category === "frame") {
    delete out.frame;
  } else if (category === "avatar_hat") {
    if (out.avatar) out.avatar = { ...out.avatar, hatId: null, hatEmoji: null };
  } else if (category === "avatar_border") {
    if (out.avatar) out.avatar = { ...out.avatar, borderId: null };
  } else if (category === "badge") {
    out.badges = [];
  } else if (category === "title") {
    out.title = null;
  }

  return out;
}

cosmeticsRouter.get(
  "/me/cosmetics",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user.id;

    const owned = await pool.query(
      `SELECT item_id FROM user_cosmetics WHERE user_id=$1`,
      [userId]
    );

    const eq = await pool.query(
      `SELECT equipped FROM user_equipped_cosmetics WHERE user_id=$1`,
      [userId]
    );

    res.json({
      ok: true,
      catalog: COSMETICS_CATALOG,
      ownedIds: owned.rows.map((r) => r.item_id),
      equipped: eq.rows[0]?.equipped || {},
    });
  })
);

cosmeticsRouter.patch(
  "/me/cosmetics/equip",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user.id;
    const itemId = req.body?.itemId ?? null;

    const eqRow = await pool.query(
      `SELECT equipped FROM user_equipped_cosmetics WHERE user_id=$1`,
      [userId]
    );
    const curEquipped = eqRow.rows[0]?.equipped || {};

    if (!itemId) {
      const category = String(req.body?.category || "");
      if (!category) return res.status(400).json({ ok: false, error: "missing_category" });

      const next = removeCategoryFromEquipped(curEquipped, category);

      await pool.query(
        `INSERT INTO user_equipped_cosmetics(user_id, equipped)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET equipped=$2, updated_at=NOW()`,
        [userId, next]
      );

      return res.json({ ok: true, equipped: next });
    }

    const item = COSMETICS_CATALOG.find((x) => x.id === itemId);
    if (!item) return res.status(404).json({ ok: false, error: "item_not_found" });

    const own = await pool.query(
      `SELECT 1 FROM user_cosmetics WHERE user_id=$1 AND item_id=$2 LIMIT 1`,
      [userId, itemId]
    );
    if (!own.rows[0]) return res.status(403).json({ ok: false, error: "not_owned" });

    const next = applyItemToEquipped(curEquipped, item);

    await pool.query(
      `INSERT INTO user_equipped_cosmetics(user_id, equipped)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET equipped=$2, updated_at=NOW()`,
      [userId, next]
    );

    res.json({ ok: true, equipped: next });
  })
);
