import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { setMatchLegs, tournamentState } from "../belva_bracket.js";

// Page web du tournoi de Belva : bracket public ; corrections réservées au staff (admins LunaLive + BELVA_TOURNAMENT_STAFF).
export const belvaTournamentRouter = express.Router();

const isStaff = (u?: { role?: string; username?: string }) =>
  !!u && (u.role === "admin" ||
    (process.env.BELVA_TOURNAMENT_STAFF || "lecasinoze,belvaa,ricou").toLowerCase().split(",").map((s) => s.trim()).includes(String(u.username || "").toLowerCase()));

belvaTournamentRouter.get("/api/public/belva/tournament", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, state: await tournamentState(pool) });
});

belvaTournamentRouter.get("/api/belva/tournament/staff", requireAuth, (req, res) => {
  res.json({ ok: true, staff: isStaff(req.user) });
});

belvaTournamentRouter.post("/api/belva/tournament/legs", express.json(), requireAuth, async (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ ok: false, error: "forbidden" });
  try {
    await setMatchLegs(pool, String(req.body?.key || ""), req.body?.legs);
    res.json({ ok: true, state: await tournamentState(pool) });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "bad_request" });
  }
});
