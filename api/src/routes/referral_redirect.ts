import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";

export const referralRedirectRouter = Router();

// GET /r/:slug  -> redirect vers /signup?ref=<slug>
referralRedirectRouter.get(
  "/r/:slug",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(404).send("Not found");

    // optionnel: vérifier que le streamer existe (sinon redirect home)
    const r = await pool.query(
      `SELECT 1 FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
      [slug]
    );
    if (!r.rows?.[0]) {
      const fb = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win");
      return res.redirect(302, fb);
    }

    const web = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
    const url = `${web}/signup?ref=${encodeURIComponent(slug)}`;
    return res.redirect(302, url);
  })
);
