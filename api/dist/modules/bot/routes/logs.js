import express from "express";
import { mustGetMyStreamer } from "../ctx.js";
import { LogsQuerySchema } from "../schemas.js";
import { listLogs, clearLogs } from "../repo.js";
import { pool } from "../../../db.js";
export const logsRouter = express.Router();
logsRouter.get("/logs", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const q = LogsQuerySchema.parse(req.query ?? {});
        const logs = await listLogs(pool, s.id, q.limit);
        res.json({ ok: true, logs });
    }
    catch (e) {
        const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
        res.status(code).json({ ok: false, reason: e?.message || "server_error" });
    }
});
logsRouter.post("/logs/clear", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        await clearLogs(pool, s.id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
    }
});
