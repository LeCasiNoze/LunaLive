import express from "express";
import { mustGetMyStreamer } from "../ctx.js";
import { BOT_TEXT_MAX, AutopostCreateSchema, AutopostPatchSchema } from "../schemas.js";
import { listAutoposts, createAutopost, patchAutopost, deleteAutopost } from "../repo.js";
import { pool } from "../../../db.js";
export const autopostsRouter = express.Router();
autopostsRouter.get("/autoposts", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const autoposts = await listAutoposts(pool, s.id);
        res.json({ ok: true, autoposts, limits: { textMax: BOT_TEXT_MAX } });
    }
    catch (e) {
        res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
    }
});
autopostsRouter.post("/autoposts", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const parsed = AutopostCreateSchema.parse(req.body ?? {});
        const autopost = await createAutopost(pool, s.id, {
            message: parsed.message,
            everySec: parsed.everySec,
            enabled: parsed.enabled ?? true,
        });
        res.json({ ok: true, autopost });
    }
    catch (e) {
        const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
        res.status(code).json({ ok: false, reason: e?.message || "server_error" });
    }
});
autopostsRouter.patch("/autoposts/:id", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const id = String(req.params.id || "").trim();
        if (!id)
            return res.status(400).json({ ok: false, reason: "BAD_ID" });
        const parsed = AutopostPatchSchema.parse(req.body ?? {});
        const autopost = await patchAutopost(pool, s.id, id, {
            message: parsed.message,
            everySec: parsed.everySec,
            enabled: parsed.enabled,
        });
        res.json({ ok: true, autopost });
    }
    catch (e) {
        const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
        res.status(code).json({ ok: false, reason: e?.message || "server_error" });
    }
});
autopostsRouter.delete("/autoposts/:id", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const id = String(req.params.id || "").trim();
        if (!id)
            return res.status(400).json({ ok: false, reason: "BAD_ID" });
        const r = await deleteAutopost(pool, s.id, id);
        res.json({ ok: true, deleted: r.deleted });
    }
    catch (e) {
        res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
    }
});
