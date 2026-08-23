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
async function mustGetMyStreamer(req: any) {
  const userId = Number(req.user?.id);
  if (!Number.isFinite(userId)) throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });

  const s = await getMyStreamer(pool, userId);
  if (!s) throw Object.assign(new Error("NO_STREAMER"), { status: 403 });
  return s; // { id, slug }
}

/* Overview */
meBotRouter.get("/overview", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);

    const [cmds, autos, logs] = await Promise.all([
      listCommands(pool, s.id),
      listAutoposts(pool, s.id),
      listLogs(pool, s.id, 1),
    ]);

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

/* Configuration initiale du dashboard en un seul aller-retour. */
meBotRouter.get("/dashboard", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const [commands, autoposts] = await Promise.all([
      listCommands(pool, s.id),
      listAutoposts(pool, s.id),
    ]);

    res.json({
      ok: true,
      streamer: { id: String(s.id), slug: s.slug },
      counts: { commands: commands.length, autoposts: autoposts.length },
      commands,
      autoposts,
      limits: { textMax: BOT_TEXT_MAX },
    });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Commands */
meBotRouter.get("/commands", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const commands = await listCommands(pool, s.id);
    res.json({ ok: true, commands, limits: { textMax: BOT_TEXT_MAX } });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/commands", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const parsed = CommandCreateSchema.parse(req.body ?? {});
    const command = await createCommand(pool, s.id, {
      trigger: parsed.trigger,
      response: parsed.response,
      enabled: parsed.enabled ?? true,
      cooldownSec: parsed.cooldownSec ?? 3,
    });
    res.json({ ok: true, command });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.patch("/commands/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const parsed = CommandPatchSchema.parse(req.body ?? {});
    const command = await patchCommand(pool, s.id, id, {
      trigger: parsed.trigger,
      response: parsed.response,
      enabled: parsed.enabled as any,
      cooldownSec: parsed.cooldownSec as any,
    });
    res.json({ ok: true, command });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.delete("/commands/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
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
    const s = await mustGetMyStreamer(req);
    const autoposts = await listAutoposts(pool, s.id);
    res.json({ ok: true, autoposts, limits: { textMax: BOT_TEXT_MAX } });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/autoposts", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const parsed = AutopostCreateSchema.parse(req.body ?? {});
    const autopost = await createAutopost(pool, s.id, {
      message: parsed.message,
      everySec: parsed.everySec,
      enabled: parsed.enabled ?? true,
    });
    res.json({ ok: true, autopost });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.patch("/autoposts/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "BAD_ID" });

    const parsed = AutopostPatchSchema.parse(req.body ?? {});
    const autopost = await patchAutopost(pool, s.id, id, {
      message: parsed.message,
      everySec: parsed.everySec,
      enabled: parsed.enabled as any,
    });
    res.json({ ok: true, autopost });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.delete("/autoposts/:id", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
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
    const s = await mustGetMyStreamer(req);
    const q = LogsQuerySchema.parse(req.query ?? {});
    const logs = await listLogs(pool, s.id, q.limit);
    res.json({ ok: true, logs });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});

meBotRouter.post("/logs/clear", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    await clearLogs(pool, s.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});

/* Test send (outbox) */
meBotRouter.post("/test-send", async (req, res) => {
  try {
    const s = await mustGetMyStreamer(req);
    const parsed = TestSendSchema.parse(req.body ?? {});
    const r = await enqueueTestSend(pool, s.id, parsed.body ?? "Test ✅");
    res.json({ ok: true, id: r.id });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});
export default meBotRouter;
