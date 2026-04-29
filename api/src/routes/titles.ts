// api/src/routes/titles.ts
//
// Système de titres unifié (Sprint 3.5):
//   - Source 'level' : auto-évolutif via getLevelInfo (fullTitle)
//                       code spécial "level_auto"
//   - Source 'achievement' : possédés via user_entitlements (kind='title',
//                              code='title_*') quand un succès est débloqué
//   - Source 'shop' : achetés via shop, même format user_entitlements
//
// L'utilisateur choisit lequel afficher publiquement. Stockage dans
// user_equipped_cosmetics.title_code (table existante).
//   - 'level_auto' = afficher dynamiquement le titre du palier courant
//   - 'title_*'    = afficher le titre exact (entitlement requis)
//   - null/empty   = aucun titre affiché

import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { getLevelInfo } from "../economy/xp.js";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js";

export const titlesRouter = Router();
titlesRouter.use("/me/titles", requireAuth);

type TitleSource = "level" | "achievement" | "shop";
type TitleRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

type TitleEntry = {
  code: string;
  source: TitleSource;
  label: string;
  description?: string;
  rarity: TitleRarity;
  owned: boolean;
};

function rarityFromCatalog(code: string): TitleRarity {
  const item = COSMETICS_CATALOG.find((x: any) => x.kind === "title" && x.code === code);
  if (!item) return "common";
  return (item.rarity as TitleRarity) || "common";
}

function labelFromCatalog(code: string): string {
  const item = COSMETICS_CATALOG.find((x: any) => x.kind === "title" && x.code === code);
  return item?.name || code.replace(/^title_/, "").replace(/_/g, " ");
}

function sourceFromCatalog(code: string): TitleSource {
  const item = COSMETICS_CATALOG.find((x: any) => x.kind === "title" && x.code === code);
  if (!item) return "achievement";
  return item.unlock === "shop" ? "shop" : "achievement";
}

/** GET /me/titles — tous les titres possibles + équipement actuel */
titlesRouter.get(
  "/me/titles",
  a(async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // 1) XP/level pour le titre niveau
    const u = await pool.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
    const xp = Number(u.rows[0]?.xp || 0);
    const info = getLevelInfo(xp);

    // 2) Titres possédés via entitlements
    const ownedTitles = await pool.query(
      `SELECT code FROM user_entitlements WHERE user_id = $1 AND kind = 'title'`,
      [userId]
    );
    const ownedCodes = new Set<string>(ownedTitles.rows.map((r: any) => String(r.code)));

    // 3) Titre actuellement équipé
    const eq = await pool.query(
      `SELECT title_code FROM user_equipped_cosmetics WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const equippedCode: string | null = eq.rows[0]?.title_code || null;

    // 4) Construit la liste des titres affichables
    const titles: TitleEntry[] = [];

    // 4a) Le titre niveau (toujours possédé, code spécial "level_auto")
    titles.push({
      code: "level_auto",
      source: "level",
      label: info.fullTitle,
      description: `Suit ton palier (palier ${info.tier + 1} / 10)`,
      rarity:
        info.tier >= 8
          ? "legendary"
          : info.tier >= 6
          ? "epic"
          : info.tier >= 4
          ? "rare"
          : info.tier >= 2
          ? "uncommon"
          : "common",
      owned: true,
    });

    // 4b) Tous les titres du catalogue (succès + shop), marquer owned si possédé
    for (const item of COSMETICS_CATALOG as any[]) {
      if (item.kind !== "title" || !item.active) continue;
      const code = String(item.code);
      titles.push({
        code,
        source: sourceFromCatalog(code),
        label: labelFromCatalog(code),
        description: item.description || undefined,
        rarity: rarityFromCatalog(code),
        owned: ownedCodes.has(code),
      });
    }

    // 4c) Titres dans entitlements mais absents du catalogue (legacy)
    for (const code of ownedCodes) {
      if (titles.some((t) => t.code === code)) continue;
      titles.push({
        code,
        source: "achievement",
        label: code.replace(/^title_/, "").replace(/_/g, " "),
        rarity: "common",
        owned: true,
      });
    }

    return res.json({
      ok: true,
      equipped: equippedCode,
      currentLevel: info.level,
      currentLevelTitle: info.fullTitle,
      titles,
    });
  })
);

/** POST /me/titles/equip { code } — équipe un titre (ou null pour retirer) */
titlesRouter.post(
  "/me/titles/equip",
  a(async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const code = req.body?.code === null ? null : String(req.body?.code || "").trim() || null;

    // Validation: code doit être null OU 'level_auto' OU possédé en entitlements
    if (code && code !== "level_auto") {
      const r = await pool.query(
        `SELECT 1 FROM user_entitlements WHERE user_id = $1 AND kind = 'title' AND code = $2 LIMIT 1`,
        [userId, code]
      );
      if (!r.rows[0]) {
        return res.status(403).json({ ok: false, error: "not_owned" });
      }
    }

    await pool.query(
      `INSERT INTO user_equipped_cosmetics (user_id, title_code, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET title_code = $2, updated_at = NOW()`,
      [userId, code]
    );

    return res.json({ ok: true, equipped: code });
  })
);
