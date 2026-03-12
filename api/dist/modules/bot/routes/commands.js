import express from "express";
import { mustGetMyStreamer } from "../ctx.js";
import { BOT_TEXT_MAX, CommandCreateSchema, CommandPatchSchema } from "../schemas.js";
import { listCommands, createCommand, patchCommand, deleteCommand } from "../repo.js";
import { pool } from "../../../db.js";
export const commandsRouter = express.Router();
commandsRouter.get("/commands", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const commands = await listCommands(pool, s.id);
        res.json({ ok: true, commands, limits: { textMax: BOT_TEXT_MAX } });
    }
    catch (e) {
        res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
    }
});
commandsRouter.post("/commands", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const parsed = CommandCreateSchema.parse(req.body ?? {});
        const command = await createCommand(pool, s.id, {
            trigger: parsed.trigger,
            response: parsed.response,
            enabled: parsed.enabled ?? true,
            cooldownSec: parsed.cooldownSec ?? 3,
        });
        res.json({ ok: true, command });
    }
    catch (e) {
        const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
        res.status(code).json({ ok: false, reason: e?.message || "server_error" });
    }
});
commandsRouter.patch("/commands/:id", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const id = String(req.params.id || "").trim();
        if (!id)
            return res.status(400).json({ ok: false, reason: "BAD_ID" });
        const parsed = CommandPatchSchema.parse(req.body ?? {});
        const command = await patchCommand(pool, s.id, id, {
            trigger: parsed.trigger,
            response: parsed.response,
            enabled: parsed.enabled,
            cooldownSec: parsed.cooldownSec,
        });
        res.json({ ok: true, command });
    }
    catch (e) {
        const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
        res.status(code).json({ ok: false, reason: e?.message || "server_error" });
    }
});
commandsRouter.delete("/commands/:id", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const s = await mustGetMyStreamer(req);
        const id = String(req.params.id || "").trim();
        if (!id)
            return res.status(400).json({ ok: false, reason: "BAD_ID" });
        const r = await deleteCommand(pool, s.id, id);
        res.json({ ok: true, deleted: r.deleted });
    }
    catch (e) {
        res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
    }
});
