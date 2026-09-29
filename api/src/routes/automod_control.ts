import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";

export const automodControlRouter = Router();
let schemaReady: Promise<unknown> | null = null;
function ensureSchema() { return schemaReady ??= pool.query(`CREATE TABLE IF NOT EXISTS automod_control (
  streamer_id BIGINT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
  desired_enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_by BIGINT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); }
async function streamerForSlug(slug:string){ const r=await pool.query(`SELECT id,user_id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,[slug]); return r.rows[0]??null; }
async function canControl(user:any,streamer:any){ if(!user||!streamer)return false; if(user.role==="admin"||Number(user.id)===Number(streamer.user_id))return true;
  const r=await pool.query(`SELECT 1 FROM streamer_mods WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL LIMIT 1`,[streamer.id,user.id]); return Boolean(r.rowCount); }
automodControlRouter.get("/fsb/automod",requireAuth,requireFsbAccess,async(_req,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});
  const r=await pool.query(`SELECT desired_enabled,updated_at FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null});});
automodControlRouter.put("/fsb/automod",requireAuth,requireFsbAccess,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});const enabled=req.body?.enabled===true;
  const r=await pool.query(`INSERT INTO automod_control(streamer_id,desired_enabled,updated_by) VALUES($1,$2,$3) ON CONFLICT(streamer_id) DO UPDATE SET desired_enabled=EXCLUDED.desired_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING desired_enabled,updated_at`,[s.id,enabled,req.user?.id??null]);
  return res.json({ok:true,enabled:r.rows[0].desired_enabled,updatedAt:r.rows[0].updated_at});});
automodControlRouter.get("/automod/control/:slug",requireAuth,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug(String(req.params.slug||""));if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!(await canControl(req.user,s)))return res.status(403).json({ok:false,error:"forbidden"});
  const r=await pool.query(`SELECT desired_enabled,updated_at FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null});});
