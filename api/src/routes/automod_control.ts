import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";
import { isMailReady, sendMail } from "../utils/mailer.js";
import { renderLunaLiveEmail } from "../utils/lunalive_email.js";
import { createHmac, randomBytes } from "node:crypto";

export const automodControlRouter = Router();
let schemaReady: Promise<unknown> | null = null;
function ensureSchema() { return schemaReady ??= pool.query(`CREATE TABLE IF NOT EXISTS automod_control (
  streamer_id BIGINT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
  desired_enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_by BIGINT NULL,
  captcha_active BOOLEAN NOT NULL DEFAULT FALSE,
  captcha_detected_at TIMESTAMPTZ NULL,
  captcha_notified_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS captcha_active BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS captcha_detected_at TIMESTAMPTZ NULL;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS captcha_notified_at TIMESTAMPTZ NULL;`); }
function captchaConfig(){const key=String(process.env.AUTOMOD_CAPTCHA_SIGNING_KEY||"").trim();const base=String(process.env.AUTOMOD_CAPTCHA_PUBLIC_BASE||"https://vps-92b153fc.vps.ovh.net/automod-captcha/").trim();try{const target=new URL(base);return key.length>=32&&target.protocol==="https:"?{key,target}:null;}catch{return null;}}
function captchaUrl(){const config=captchaConfig();if(!config)return null;const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+10*60,nonce:randomBytes(18).toString("base64url")})).toString("base64url");const signature=createHmac("sha256",config.key).update(payload).digest("base64url");config.target.searchParams.set("ticket",`${payload}.${signature}`);return config.target.href;}
async function streamerForSlug(slug:string){ const r=await pool.query(`SELECT id,user_id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,[slug]); return r.rows[0]??null; }
async function canControl(user:any,streamer:any){ if(!user||!streamer)return false; if(user.role==="admin"||Number(user.id)===Number(streamer.user_id))return true;
  const r=await pool.query(`SELECT 1 FROM streamer_mods WHERE streamer_id=$1 AND user_id=$2 AND removed_at IS NULL LIMIT 1`,[streamer.id,user.id]); return Boolean(r.rowCount); }
automodControlRouter.get("/fsb/automod",requireAuth,requireFsbAccess,async(_req,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});
  const r=await pool.query(`SELECT desired_enabled,updated_at,captcha_active,captcha_detected_at FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null,captchaActive:r.rows[0]?.captcha_active===true,captchaDetectedAt:r.rows[0]?.captcha_detected_at??null,captchaAvailable:captchaConfig()!==null});});
automodControlRouter.put("/fsb/automod",requireAuth,requireFsbAccess,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});const enabled=req.body?.enabled===true;
  const r=await pool.query(`INSERT INTO automod_control(streamer_id,desired_enabled,updated_by) VALUES($1,$2,$3) ON CONFLICT(streamer_id) DO UPDATE SET desired_enabled=EXCLUDED.desired_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING desired_enabled,updated_at`,[s.id,enabled,req.user?.id??null]);
  return res.json({ok:true,enabled:r.rows[0].desired_enabled,updatedAt:r.rows[0].updated_at});});
automodControlRouter.get("/automod/control/:slug",requireAuth,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug(String(req.params.slug||""));if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!(await canControl(req.user,s)))return res.status(403).json({ok:false,error:"forbidden"});
  const r=await pool.query(`SELECT desired_enabled,updated_at FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null});});

automodControlRouter.post("/fsb/automod/captcha-access",requireAuth,requireFsbAccess,async(req:any,res)=>{const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!(await canControl(req.user,s)))return res.status(403).json({ok:false,error:"forbidden"});const url=captchaUrl();if(!url)return res.status(503).json({ok:false,error:"captcha_access_unavailable"});res.setHeader("Cache-Control","private, no-store");res.setHeader("Pragma","no-cache");return res.json({ok:true,url,expiresInSeconds:600});});

automodControlRouter.post("/automod/captcha/:slug",requireAuth,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug(String(req.params.slug||""));if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!(await canControl(req.user,s)))return res.status(403).json({ok:false,error:"forbidden"});
  if(String(req.params.slug||"").trim().toLowerCase()!=="lecasinoze")return res.status(404).json({ok:false,error:"streamer_not_found"});
  const active=req.body?.active===true;const previous=await pool.query(`SELECT captcha_active,captcha_notified_at FROM automod_control WHERE streamer_id=$1`,[s.id]);const prev=previous.rows[0];
  await pool.query(`INSERT INTO automod_control(streamer_id,captcha_active,captcha_detected_at) VALUES($1,$2,CASE WHEN $2 THEN NOW() ELSE NULL END) ON CONFLICT(streamer_id) DO UPDATE SET captcha_active=EXCLUDED.captcha_active,captcha_detected_at=CASE WHEN EXCLUDED.captcha_active THEN COALESCE(automod_control.captcha_detected_at,NOW()) ELSE NULL END,updated_at=NOW()`,[s.id,active]);
  const url=captchaUrl();let notified=false;const last=prev?.captcha_notified_at?new Date(prev.captcha_notified_at).getTime():0;
  if(active&&url&&(!prev?.captcha_active||Date.now()-last>30*60_000)&&isMailReady()){
    const owner=await pool.query(`SELECT u.email FROM streamers s JOIN users u ON u.id=s.user_id WHERE s.id=$1 LIMIT 1`,[s.id]);const email=String(owner.rows[0]?.email||"").trim();
    if(email){const subject="Action requise : CAPTCHA Automod";const text=`Un CAPTCHA bloque l’Automod. Ouvre ${url} pour le valider.`;const html=renderLunaLiveEmail({preheader:"Un CAPTCHA bloque actuellement l’Automod.",eyebrow:"AUTOMOD",title:"Validation CAPTCHA requise",paragraphs:["L’Automod a suspendu les actualisations pour conserver le challenge affiché.","Ouvre le bureau sécurisé, valide le CAPTCHA dans la page existante, puis laisse l’Automod reprendre automatiquement."],action:{label:"Valider le CAPTCHA",url},footer:"Lien privé réservé au contrôle de l’Automod LeCasiNoze."});
      try{await sendMail(email,subject,text,html);await pool.query(`UPDATE automod_control SET captcha_notified_at=NOW() WHERE streamer_id=$1`,[s.id]);notified=true;}catch(error){console.error("[automod] captcha email failed",error);}}}
  return res.json({ok:true,active,notified});});
