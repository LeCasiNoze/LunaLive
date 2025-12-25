// api/src/routes/cosmetics.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG, type CosmeticItem, type CosmeticKind } from "../cosmetics/catalog.js";

export const cosmeticsRouter = Router();

const KINDS: CosmeticKind[] = ["username", "badge", "title", "frame", "hat"];

// (optionnel) items "free" (si ton UI en a besoin)
// Perso chez toi: null = retirer, donc on peut laisser vide.
const FREE: Record<CosmeticKind, string[]> = {
  username: [],
  badge: [],
  title: [],
  frame: [],
  hat: [],
};

// ─────────────────────────────────────────────
// DB safety (au cas où migrations pas faites)
// ─────────────────────────────────────────────
let ensured = false;
async function ensureTablesOnce() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, kind, code)
    );

    CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      username_code TEXT NULL,
      badge_code    TEXT NULL,
      title_code    TEXT NULL,
      frame_code    TEXT NULL,
      hat_code      TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  ensured = true;
}

async function ensureEquippedRow(userId: number) {
  await ensureTablesOnce();
  await pool.query(
    `
    INSERT INTO user_equipped_cosmetics (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `,
    [userId]
  );
}

function isActiveItem(it: any): it is CosmeticItem {
  return !!it && it.active === true && KINDS.includes(it.kind);
}

function catalogHas(kind: CosmeticKind, code: string) {
  return COSMETICS_CATALOG.some((x) => x.active && x.kind === kind && x.code === code);
}

function buildOwnedMap(rows: Array<{ kind: string; code: string }>) {
  const owned: Record<string, string[]> = {};
  for (const r of rows) {
    const k = String(r.kind || "");
    const c = String(r.code || "");
    if (!k || !c) continue;
    if (!owned[k]) owned[k] = [];
    owned[k].push(c);
  }
  return owned;
}

function colForKind(kind: CosmeticKind) {
  return kind === "username"
    ? "username_code"
    : kind === "badge"
    ? "badge_code"
    : kind === "title"
    ? "title_code"
    : kind === "frame"
    ? "frame_code"
    : "hat_code";
}

// ─────────────────────────────────────────────
// ✅ GET /cosmetics/catalog  (PUBLIC)
// -> DOIT renvoyer TOUT le catalogue actif (incluant titles)
// ─────────────────────────────────────────────
cosmeticsRouter.get(
  "/cosmetics/catalog",
  a(async (_req, res) => {
    const items = COSMETICS_CATALOG.filter(isActiveItem);
    res.json({ ok: true, items });
  })
);

// ─────────────────────────────────────────────
// GET /me/cosmetics (AUTH)
// ─────────────────────────────────────────────
cosmeticsRouter.get(
  "/me/cosmetics",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

    await ensureEquippedRow(userId);

    const ent = await pool.query<{ kind: string; code: string }>(
      `SELECT kind, code FROM user_entitlements WHERE user_id=$1`,
      [userId]
    );

    const eq = await pool.query<{
      username: string | null;
      badge: string | null;
      title: string | null;
      frame: string | null;
      hat: string | null;
    }>(
      `
      SELECT username_code AS "username",
             badge_code    AS "badge",
             title_code    AS "title",
             frame_code    AS "frame",
             hat_code      AS "hat"
      FROM user_equipped_cosmetics
      WHERE user_id=$1
      LIMIT 1
    `,
      [userId]
    );

    res.json({
      ok: true,
      owned: buildOwnedMap(ent.rows),
      equipped: eq.rows?.[0] ?? { username: null, badge: null, title: null, frame: null, hat: null },
      free: FREE,
    });
  })
);

// ─────────────────────────────────────────────
// PATCH /me/cosmetics/equip  (AUTH)
// body: { kind, code } où code peut être null (retirer)
// ─────────────────────────────────────────────
cosmeticsRouter.patch(
  "/me/cosmetics/equip",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ ok: false, error: "unauthorized" });

    const kind = String(req.body?.kind || "") as CosmeticKind;
    const raw = req.body?.code;
    const code = raw === null ? null : String(raw || "").trim();

    if (!KINDS.includes(kind)) return res.status(400).json({ ok: false, error: "bad_kind" });

    await ensureEquippedRow(userId);

    const col = colForKind(kind);

    // retirer
    if (code === null) {
      const upd = await pool.query(
        `
        UPDATE user_equipped_cosmetics
        SET ${col} = NULL, updated_at = NOW()
        WHERE user_id=$1
        RETURNING username_code AS "username",
                  badge_code    AS "badge",
                  title_code    AS "title",
                  frame_code    AS "frame",
                  hat_code      AS "hat"
      `,
        [userId]
      );

      return res.json({ ok: true, equipped: upd.rows[0] });
    }

    if (!code) return res.status(400).json({ ok: false, error: "bad_code" });

    const isFree = (FREE[kind] || []).includes(code);

    // si pas free: doit exister dans le catalogue
    if (!isFree && !catalogHas(kind, code)) {
      return res.status(400).json({ ok: false, error: "unknown_code" });
    }

    // si pas free: doit être possédé
    if (!isFree) {
      const own = await pool.query(
        `SELECT 1 FROM user_entitlements WHERE user_id=$1 AND kind=$2 AND code=$3 LIMIT 1`,
        [userId, kind, code]
      );
      if (!own.rows?.[0]) return res.status(403).json({ ok: false, error: "not_owned" });
    }

    const upd = await pool.query(
      `
      UPDATE user_equipped_cosmetics
      SET ${col} = $2, updated_at = NOW()
      WHERE user_id=$1
      RETURNING username_code AS "username",
                badge_code    AS "badge",
                title_code    AS "title",
                frame_code    AS "frame",
                hat_code      AS "hat"
    `,
      [userId, code]
    );

    res.json({ ok: true, equipped: upd.rows[0] });
  })
);
