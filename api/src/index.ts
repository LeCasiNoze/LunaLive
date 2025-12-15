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

(async () => {
  await migrate();
  await seedIfEmpty();
  app.listen(port, () => console.log(`[api] listening on :${port}`));
})();
