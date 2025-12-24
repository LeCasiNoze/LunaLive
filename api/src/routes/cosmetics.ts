import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";

export const cosmeticsRouter = Router();

type Kind = "username" | "badge" | "title" | "frame" | "hat";

const ALLOWED_KINDS: Kind[] = ["username", "badge", "title", "frame", "hat"];

// Items gratuits (toujours équipables même sans entitlement)
const FREE: Record<Kind, string[]> = {
  username: ["default"],
  badge: ["none"],
  title: ["none"],
  frame: ["none"],
  hat: ["none"],
};

async function ensureRow(userId: number) {
  await pool.query(
    `INSERT INTO user_equipped_cosmetics (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

cosmeticsRouter.get(
  "/me/cosmetics",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;

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

    const ent = await pool.query(
      `SELECT kind, code
       FROM user_entitlements
       WHERE user_id = $1`,
      [userId]
    );

    const owned: Record<string, string[]> = {};
    for (const r of ent.rows) {
      const k = String(r.kind || "");
      const c = String(r.code || "");
      if (!k || !c) continue;
      if (!owned[k]) owned[k] = [];
      owned[k].push(c);
    }

    res.json({
      ok: true,
      owned, // { badge:[...], title:[...], ... }
      equipped: eq.rows[0] || { username: null, badge: null, title: null, frame: null, hat: null },
      free: FREE,
    });
  })
);

cosmeticsRouter.patch(
  "/me/cosmetics/equip",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;

    const kind = String(req.body?.kind || "") as Kind;
    const codeRaw = req.body?.code;
    const code = codeRaw === null ? null : String(codeRaw || "").trim();

    if (!ALLOWED_KINDS.includes(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    await ensureRow(userId);

    // null => unequip
    if (code === null) {
      const col =
        kind === "username" ? "username_code" :
        kind === "badge" ? "badge_code" :
        kind === "title" ? "title_code" :
        kind === "frame" ? "frame_code" :
        "hat_code";

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

      return res.json({ ok: true, equipped: upd.rows[0] });
    }

    // code non vide ?
    if (!code) return res.status(400).json({ ok: false, error: "bad_code" });

    // autorisé si free
    const isFree = (FREE[kind] || []).includes(code);

    // sinon il faut un entitlement
    if (!isFree) {
      const check = await pool.query(
        `SELECT 1
         FROM user_entitlements
         WHERE user_id = $1 AND kind = $2 AND code = $3
         LIMIT 1`,
        [userId, kind, code]
      );
      if (!check.rows[0]) return res.status(403).json({ ok: false, error: "not_owned" });
    }

    const col =
      kind === "username" ? "username_code" :
      kind === "badge" ? "badge_code" :
      kind === "title" ? "title_code" :
      kind === "frame" ? "frame_code" :
      "hat_code";

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

    res.json({ ok: true, equipped: upd.rows[0] });
  })
);
