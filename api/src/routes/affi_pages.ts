import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";

export const publicAffiPagesRouter = Router();
export const fsbAffiPagesRouter = Router();
fsbAffiPagesRouter.use(requireAuth, requireFsbAccess);

const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }, z.string().max(max).nullable());

// V1 = string flat config | V2 = arbre de blocs (objets imbriqués).
// On accepte les deux via z.record(any) — la validation profonde est faite
// côté front-end via les types V2*.
const configSchema = z.record(z.string(), z.any()).default({});

const pageInputSchema = z.object({
  slug: optionalTrimmedString(160).optional().default(null),
  model: z.coerce.number().int().min(1).max(20),
  variant: optionalTrimmedString(32).optional().default(null),
  brandName: z.preprocess((value) => String(value == null ? "" : value).trim(), z.string().min(1).max(160)),
  title: z.preprocess((value) => String(value == null ? "" : value).trim(), z.string().min(1).max(220)),
  config: configSchema,
  // editor_version : 1 (legacy V1) ou 2 (nouveau editor). Default 1 pour
  // rétro-compat avec les payloads V1 qui ne fournissent pas le champ.
  editorVersion: z.coerce.number().int().min(1).max(2).optional().default(1),
});

function slugifySegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSlug(value: string | null | undefined) {
  const text = slugifySegment(String(value || ""));
  return text || "landing";
}

async function resolveUniqueSlug(baseSlug: string, excludeId?: number | null) {
  let candidate = normalizeSlug(baseSlug);
  let suffix = 2;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id
         FROM affi_landing_pages
        WHERE lower(slug) = lower($1)
          AND ($2::bigint IS NULL OR id <> $2::bigint)
        LIMIT 1`,
      [candidate, excludeId ?? null]
    );

    if (!rows[0]) return candidate;
    candidate = `${normalizeSlug(baseSlug)}-${suffix}`;
    suffix += 1;
  }
}

function pageRowToJson(row: any) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    model: Number(row.model),
    variant: row.variant ? String(row.variant) : null,
    brandName: String(row.brandName || row.brand_name || ""),
    title: String(row.title || ""),
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? row.config
        : {},
    editorVersion: Number(row.editorVersion ?? row.editor_version ?? 1),
    ownerUserId: Number(row.ownerUserId || row.owner_user_id || 0),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

publicAffiPagesRouter.get(
  "/public/affi-pages/:slug",
  a(async (req, res) => {
    const slug = normalizeSlug(String(req.params.slug || ""));
    const { rows } = await pool.query(
      `SELECT
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM affi_landing_pages
       WHERE lower(slug) = lower($1)
       LIMIT 1`,
      [slug]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, page: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.get(
  "/fsb/affi-pages",
  a(async (_req: any, res) => {
    const { rows } = await pool.query(
      `SELECT
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM affi_landing_pages
       ORDER BY updated_at DESC, id DESC
       LIMIT 250`
    );

    return res.json({ ok: true, items: rows.map(pageRowToJson) });
  })
);

fsbAffiPagesRouter.post(
  "/fsb/affi-pages",
  a(async (req: any, res) => {
    const input = pageInputSchema.parse(req.body || {});
    // V2 : si l'user a fourni un slug explicite, on le respecte tel quel
    // (juste rendu unique si collision). V1 : comportement legacy de fallback.
    const baseSlug =
      input.slug ||
      (input.editorVersion === 2
        ? input.brandName  // V2 sans slug = fallback brandName
        : [input.brandName, input.model === 5 ? input.variant || "gold" : `model${input.model}`]
            .filter(Boolean)
            .join("-"));

    const slug = await resolveUniqueSlug(baseSlug);

    const { rows } = await pool.query(
      `INSERT INTO affi_landing_pages (
         owner_user_id,
         slug,
         model,
         variant,
         brand_name,
         title,
         config,
         editor_version
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING
         id,
         slug,
         model,
         variant,
         brand_name AS "brandName",
         title,
         config,
         editor_version AS "editorVersion",
         owner_user_id AS "ownerUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        Number(req.user?.id || 0),
        slug,
        input.model,
        input.variant,
        input.brandName,
        input.title,
        JSON.stringify(input.config),
        input.editorVersion,
      ]
    );

    return res.status(201).json({ ok: true, item: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.put(
  "/fsb/affi-pages/:id",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const input = pageInputSchema.parse(req.body || {});
    // V2 : règle absolue — on ne re-génère JAMAIS le slug auto pour les pages
    // V2 (URL verrouillée). Si l'input fournit un slug, on l'applique tel quel
    // (juste rendu unique en cas de collision). Si pas de slug fourni, on
    // garde l'existant en DB.
    let slug: string;
    if (input.editorVersion === 2) {
      if (input.slug) {
        slug = await resolveUniqueSlug(input.slug, id);
      } else {
        const { rows: existing } = await pool.query(`SELECT slug FROM affi_landing_pages WHERE id=$1 LIMIT 1`, [id]);
        slug = existing[0]?.slug || (await resolveUniqueSlug(input.brandName, id));
      }
    } else {
      const baseSlug =
        input.slug ||
        [input.brandName, input.model === 5 ? input.variant || "gold" : `model${input.model}`]
          .filter(Boolean)
          .join("-");
      slug = await resolveUniqueSlug(baseSlug, id);
    }

    const { rows } = await pool.query(
      `UPDATE affi_landing_pages
          SET slug = $2,
              model = $3,
              variant = $4,
              brand_name = $5,
              title = $6,
              config = $7::jsonb,
              editor_version = $8,
              updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          slug,
          model,
          variant,
          brand_name AS "brandName",
          title,
          config,
          editor_version AS "editorVersion",
          owner_user_id AS "ownerUserId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
      [id, slug, input.model, input.variant, input.brandName, input.title, JSON.stringify(input.config), input.editorVersion]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: pageRowToJson(rows[0]) });
  })
);

fsbAffiPagesRouter.delete(
  "/fsb/affi-pages/:id",
  a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const { rowCount } = await pool.query(`DELETE FROM affi_landing_pages WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true });
  })
);
