import express from "express";
import { mustGetMyStreamer } from "../ctx.js";
import { TestSendSchema } from "../schemas.js";
import { enqueueTestSend } from "../repo.js";
import { pool } from "../../../db.js";

export const testSendRouter = express.Router();

testSendRouter.post("/test-send", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const s = await mustGetMyStreamer(req);
    const parsed = TestSendSchema.parse(req.body ?? {});
    const r = await enqueueTestSend(pool, s.id, parsed.body ?? "Test ✅");

    const idNum = Number(r.id);
    res.json({ ok: true, id: Number.isFinite(idNum) ? idNum : 0 });
  } catch (e: any) {
    const code = e?.status || (e?.name === "ZodError" ? 400 : 500);
    res.status(code).json({ ok: false, reason: e?.message || "server_error" });
  }
});
