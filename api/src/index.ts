import express from "express";
import cors from "cors";
import { migrate, seedIfEmpty, pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/lives", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers
     FROM streamers
     WHERE is_live = TRUE
     ORDER BY viewers DESC`
  );
  res.json(rows);
});

app.get("/streamers/:slug", async (req, res) => {
  const slug = String(req.params.slug || "");
  const { rows } = await pool.query(
    `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers
     FROM streamers
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
  res.json(rows[0]);
});

const port = Number(process.env.PORT || 3001);

app.patch("/admin/streamers/:slug", async (req, res) => {
  const key = String(req.headers["x-admin-key"] || "");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const slug = String(req.params.slug || "");
  const viewers =
    req.body.viewers === undefined ? undefined : Number(req.body.viewers);
  const title =
    req.body.title === undefined ? undefined : String(req.body.title);
  const isLive =
    req.body.is_live === undefined ? undefined : Boolean(req.body.is_live);

  // rien à update
  if (viewers === undefined && title === undefined && isLive === undefined) {
    return res.status(400).json({ ok: false, error: "no_fields" });
  }

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (Number.isFinite(viewers)) {
    fields.push(`viewers = $${i++}`);
    values.push(viewers);
  }
  if (title !== undefined) {
    fields.push(`title = $${i++}`);
    values.push(title);
  }
  if (isLive !== undefined) {
    fields.push(`is_live = $${i++}`);
    values.push(isLive);
  }

  fields.push(`updated_at = NOW()`);

  values.push(slug);

  const { rows } = await pool.query(
    `UPDATE streamers
     SET ${fields.join(", ")}
     WHERE slug = $${i}
     RETURNING id::text AS id, slug, display_name AS "displayName", title, viewers`,
    values
  );

  if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, streamer: rows[0] });
});

(async () => {
  await migrate();
  await seedIfEmpty();
  app.listen(port, () => console.log(`[api] listening on :${port}`));
})();
