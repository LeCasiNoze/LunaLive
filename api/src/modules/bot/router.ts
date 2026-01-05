import express from "express";
import { pool } from "../../db.js";

import {
  BOT_TEXT_MAX,
  CommandCreateSchema,
  CommandPatchSchema,
  AutopostCreateSchema,
  AutopostPatchSchema,
  LogsQuerySchema,
  TestSendSchema,
} from "./schemas.js";

import {
  getMyStreamer,
  listCommands,
  createCommand,
  patchCommand,
  deleteCommand,
  listAutoposts,
  createAutopost,
  patchAutopost,
  deleteAutopost,
  listLogs,
  clearLogs,
  enqueueTestSend,
} from "./repo.js";

export const meBotRouter = express.Router();

// helper
async function mustGetMyStreamerId(req: any) {
  const userId = Number(req.user?.id);
  if (!Number.isFinite(userId)) throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });

  const s = await getMyStreamer(pool, userId);
  if (!s) throw Object.assign(new Error("NO_STREAMER"), { status: 403 });
  return s;
}

/* Overview */
meBotRouter.get("/overview", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);

    const cmds = await listCommands(pool, s.id);
    const autos = await listAutoposts(pool, s.id);
    const logs = await listLogs(pool, s.id, 1); // juste pour savoir si table existe, count rapide après

    // count logs : on fait léger, sinon c'est du SQL spécifique table.
    // Ici MVP: on renvoie logs.length ? 1 : 0, et le front peut demander /logs.
    // Si tu veux un vrai COUNT, on le fera après quand on sait la table exacte.
    res.json({
      ok: true,
      streamer: { id: s.id, slug: s.slug },
      counts: { commands: cmds.length, autoposts: autos.length, logs: logs.length ? 1 : 0 },
      limits: { textMax: BOT_TEXT_MAX },
    });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Commands */
meBotRouter.get("/commands", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const items = await listCommands(pool, s.id);
    res.json({ ok: true, items, limits: { textMax: BOT_TEXT_MAX } });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/commands", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const parsed = CommandCreateSchema.parse(req.body ?? {});
    const item = await createCommand(pool, s.id, {
      trigger: parsed.trigger,
      response: parsed.response,
      enabled: parsed.enabled ?? true,
      cooldownSec: parsed.cooldownSec ?? 3,
    });
    res.json({ ok: true, item });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.patch("/commands/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const parsed = CommandPatchSchema.parse(req.body ?? {});
    const item = await patchCommand(pool, s.id, id, {
      trigger: parsed.trigger,
      response: parsed.response,
      enabled: parsed.enabled as any,
      cooldownSec: parsed.cooldownSec as any,
    });
    res.json({ ok: true, item });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.delete("/commands/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const r = await deleteCommand(pool, s.id, id);
    res.json({ ok: true, deleted: r.deleted });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Autoposts */
meBotRouter.get("/autoposts", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const items = await listAutoposts(pool, s.id);
    res.json({ ok: true, items, limits: { textMax: BOT_TEXT_MAX } });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/autoposts", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const parsed = AutopostCreateSchema.parse(req.body ?? {});
    const item = await createAutopost(pool, s.id, {
      message: parsed.message,
      everySec: parsed.everySec,
      enabled: parsed.enabled ?? true,
    });
    res.json({ ok: true, item });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.patch("/autoposts/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const parsed = AutopostPatchSchema.parse(req.body ?? {});
    const item = await patchAutopost(pool, s.id, id, {
      message: parsed.message,
      everySec: parsed.everySec,
      enabled: parsed.enabled as any,
    });
    res.json({ ok: true, item });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.delete("/autoposts/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const r = await deleteAutopost(pool, s.id, id);
    res.json({ ok: true, deleted: r.deleted });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Logs */
meBotRouter.get("/logs", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const q = LogsQuerySchema.parse(req.query ?? {});
    const items = await listLogs(pool, s.id, q.limit);
    res.json({ ok: true, items });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/logs/clear", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const r = await clearLogs(pool, s.id);
    res.json({ ok: true, cleared: true, table: r.table });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Test send (outbox) */
meBotRouter.post("/test-send", async (req, res) => {
  try {
    const s = await mustGetMyStreamerId(req);
    const parsed = TestSendSchema.parse(req.body ?? {});
    const r = await enqueueTestSend(pool, s.id, parsed.body ?? "Test ✅");
    res.json({ ok: true, enqueued: true, id: r.id });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});
