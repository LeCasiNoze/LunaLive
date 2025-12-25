// api/src/routes/cosmetics.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js"; // ✅ IMPORTANT (catalog unique)

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

// ──────────────────────────────────────────
// DEV: unlock all
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
  if (typeof u === "string" && u.trim()) return u;

  const userId = req.user?.id;
  if (!userId) return null;

  const r = await pool.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.username ?? null;
}

function buildOwnedAllActive(): Record<string, string[]> {
  const owned: Record<string, string[]> = {
    username: [],
    badge: [],
    title: [],
    frame: [],
    hat: [],
  };

  for (const it of COSMETICS_CATALOG) {
    if (!it?.active) continue;
    if (!ALLOWED_KINDS.includes(it.kind as Kind)) continue;
    (owned[it.kind] ??= []).push(it.code);
  }
  return owned;
}

function catalogHas(kind: Kind, code: string) {
  return COSMETICS_CATALOG.some((x) => x && x.active && x.kind === kind && x.code === code);
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
// GET /me/cosmetics
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

    // owned via entitlements
    const ent = await pool.query(
      `SELECT kind, code
       FROM user_entitlements
       WHERE user_id = $1`,
      [userId]
    );

    const owned: Record<string, string[]> = {};
    for (const r of ent.rows as any[]) {
      const k = String(r.kind || "");
      const c = String(r.code || "");
      if (!k || !c) continue;
      if (!owned[k]) owned[k] = [];
      owned[k].push(c);
    }

    // ✅ DEV unlock-all: merge “owned” avec tout le catalogue actif
    if (unlockAll) {
      const all = buildOwnedAllActive();
      for (const k of Object.keys(all)) {
        const cur = new Set<string>(owned[k] || []);
        for (const code of all[k] || []) cur.add(code);
        owned[k] = Array.from(cur);
      }
    }
    res.json({
      ok: true,
      owned,
      equipped: eq.rows?.[0] || { username: null, badge: null, title: null, frame: null, hat: null },
      free: FREE,
      unlockAll, // debug (front peut ignorer)
    });
  })
);

// ──────────────────────────────────────────
// PATCH /me/cosmetics/equip
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

    // autorisé si free
    const isFree = (FREE[kind] || []).includes(code);

    // ✅ validation catalogue (évite typos/cheat)
    if (!isFree) {
      if (!catalogHas(kind, code)) {
        return res.status(400).json({ ok: false, error: "unknown_code" });
      }
    }

    // sinon il faut un entitlement (sauf unlockAll)
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
