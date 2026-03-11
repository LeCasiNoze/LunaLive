// api/src/routes/slots.ts
import express from "express";
import { pool } from "../db.js";
import { searchSlots } from "../calls/catalog.js";
import { requireAuth } from "../auth.js";
import { runSlotsUpdate } from "../calls/updater.js";
export const slotsRouter = express.Router();
// public search (suggestions)
slotsRouter.get("/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const limit = Math.max(1, Math.min(20, Number(req.query.limit || 10)));
        if (!q)
            return res.json({ ok: true, items: [] });
        const items = await searchSlots(pool, q, limit);
        res.json({ ok: true, items });
    }
    catch (e) {
        res.json({ ok: false, error: String(e?.message || "search_failed") });
    }
});
// manual update (auth required + admin)
slotsRouter.post("/update", requireAuth, async (req, res) => {
    try {
        const u = req.user;
        if (!u)
            return res.status(401).json({ ok: false, error: "unauthorized" });
        if (u.role !== "admin")
            return res.status(403).json({ ok: false, error: "forbidden" });
        const r = await runSlotsUpdate(pool);
        res.json(r);
    }
    catch (e) {
        res.json({ ok: false, error: String(e?.message || "update_failed") });
    }
});
