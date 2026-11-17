import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { publicState, setMatchLegs, tournamentState } from "../belva_bracket.js";

// Page web du tournoi de Belva : bracket public ; corrections réservées au staff (admins LunaLive + BELVA_TOURNAMENT_STAFF).
export const belvaTournamentRouter = express.Router();

// Par identifiant de compte LunaLive (un pseudo peut être renommé ou réservé par n'importe qui) :
// admins, propriétaires des chaînes de Belva et de LeCasiNoze, et comptes de BELVA_TOURNAMENT_STAFF_IDS.
async function isStaff(u?: { id?: number; role?: string }) {
  if (!u?.id) return false;
  if (u.role === "admin") return true;
  if ((process.env.BELVA_TOURNAMENT_STAFF_IDS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(u.id))) return true;
  const r = await pool.query(`SELECT 1 FROM streamers WHERE user_id=$1 AND lower(slug) IN ('belvaa','lecasinoze') LIMIT 1`, [u.id]).catch(() => ({ rowCount: 0 }));
  return (r.rowCount ?? 0) > 0;
}

belvaTournamentRouter.get("/api/public/belva/tournament", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json({ ok: true, state: publicState(await tournamentState(pool)) }); }
  catch (e: any) { console.warn("[belva-tournoi] state", e?.message || e); res.status(500).json({ ok: false, error: "server_error" }); }
});

belvaTournamentRouter.get("/api/belva/tournament/staff", requireAuth, async (req, res) => {
  res.json({ ok: true, staff: await isStaff(req.user) });
});

belvaTournamentRouter.post("/api/belva/tournament/legs", express.json(), requireAuth, async (req, res) => {
  if (!(await isStaff(req.user))) return res.status(403).json({ ok: false, error: "forbidden" });
  try {
    const version = Number.isInteger(req.body?.version) ? Number(req.body.version) : undefined;
    await setMatchLegs(pool, String(req.body?.key || ""), req.body?.legs, version);
    res.json({ ok: true, state: publicState(await tournamentState(pool)) });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "bad_request" });
  }
});
