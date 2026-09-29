import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";
import { isMailReady, sendMail } from "../utils/mailer.js";
import { renderLunaLiveEmail } from "../utils/lunalive_email.js";
import { createHmac, randomBytes } from "node:crypto";

export const automodControlRouter = Router();
let schemaReady: Promise<unknown> | null = null;
let dashboardSchemaReady: Promise<unknown> | null = null;
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
function canAccessCaptcha(user:any,streamer:any){return Boolean(user&&streamer&&(user.role==="admin"||Number(user.id)===Number(streamer.user_id)));}
type DashboardSettings = { allowedProviders: Array<"pragmatic"|"hacksaw"|"nolimit">; stakeCents: number; slotDurationMs: number; goldenEnabled: boolean };
function parseDashboardSettings(value:unknown):DashboardSettings|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const providers=row.allowedProviders;
  if(!Array.isArray(providers)||providers.length<1||providers.length>3||providers.some(v=>v!=="pragmatic"&&v!=="hacksaw"&&v!=="nolimit")||new Set(providers).size!==providers.length)return null;
  if(!Number.isSafeInteger(row.stakeCents)||Number(row.stakeCents)<1||Number(row.stakeCents)>10_000)return null;
  if(!Number.isSafeInteger(row.slotDurationMs)||Number(row.slotDurationMs)<60_000||Number(row.slotDurationMs)>120*60_000)return null;
  if(typeof row.goldenEnabled!=="boolean")return null;
  return {allowedProviders:providers as DashboardSettings["allowedProviders"],stakeCents:Number(row.stakeCents),slotDurationMs:Number(row.slotDurationMs),goldenEnabled:row.goldenEnabled};
}
function ensureDashboardSchema(){return dashboardSchemaReady??=ensureSchema().then(()=>pool.query(`
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS dashboard_settings JSONB NULL;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS settings_revision BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS applied_settings_revision BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS runtime_status JSONB NULL;
  ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS runtime_seen_at TIMESTAMPTZ NULL;
  CREATE TABLE IF NOT EXISTS automod_control_commands (
    id BIGSERIAL PRIMARY KEY,
    streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('restart_chrome','skip_call')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','done','failed')),
    requested_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL,
    result TEXT NULL
  );
  CREATE INDEX IF NOT EXISTS automod_control_commands_pending ON automod_control_commands(streamer_id,id) WHERE status='pending';
`));}
async function dashboardStreamer(req:any,res:any){const s=await streamerForSlug("lecasinoze");if(!s){res.status(404).json({ok:false,error:"streamer_not_found"});return null;}if(!canAccessCaptcha(req.user,s)){res.status(403).json({ok:false,error:"forbidden"});return null;}await ensureDashboardSchema();return s;}
automodControlRouter.get("/fsb/automod",requireAuth,requireFsbAccess,async(_req,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});
  const r=await pool.query(`SELECT desired_enabled,updated_at,captcha_active,captcha_detected_at FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null,captchaActive:r.rows[0]?.captcha_active===true,captchaDetectedAt:r.rows[0]?.captcha_detected_at??null,captchaAvailable:captchaConfig()!==null});});
automodControlRouter.put("/fsb/automod",requireAuth,requireFsbAccess,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});const enabled=req.body?.enabled===true;
  const r=await pool.query(`INSERT INTO automod_control(streamer_id,desired_enabled,updated_by) VALUES($1,$2,$3) ON CONFLICT(streamer_id) DO UPDATE SET desired_enabled=EXCLUDED.desired_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING desired_enabled,updated_at`,[s.id,enabled,req.user?.id??null]);
  return res.json({ok:true,enabled:r.rows[0].desired_enabled,updatedAt:r.rows[0].updated_at});});
automodControlRouter.get("/automod/control/:slug",requireAuth,async(req:any,res)=>{await ensureDashboardSchema();const s=await streamerForSlug(String(req.params.slug||""));if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!(await canControl(req.user,s)))return res.status(403).json({ok:false,error:"forbidden"});
  const r=await pool.query(`SELECT desired_enabled,updated_at,dashboard_settings,settings_revision FROM automod_control WHERE streamer_id=$1`,[s.id]);return res.json({ok:true,enabled:r.rows[0]?.desired_enabled===true,updatedAt:r.rows[0]?.updated_at??null,settings:r.rows[0]?.dashboard_settings??null,settingsRevision:Number(r.rows[0]?.settings_revision??0)});});

automodControlRouter.post("/fsb/automod/captcha-access",requireAuth,requireFsbAccess,async(req:any,res)=>{const s=await streamerForSlug("lecasinoze");if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!canAccessCaptcha(req.user,s))return res.status(403).json({ok:false,error:"forbidden"});const url=captchaUrl();if(!url)return res.status(503).json({ok:false,error:"captcha_access_unavailable"});res.setHeader("Cache-Control","private, no-store");res.setHeader("Pragma","no-cache");return res.json({ok:true,url,expiresInSeconds:600});});

automodControlRouter.post("/automod/captcha/:slug",requireAuth,async(req:any,res)=>{await ensureSchema();const s=await streamerForSlug(String(req.params.slug||""));if(!s)return res.status(404).json({ok:false,error:"streamer_not_found"});if(!canAccessCaptcha(req.user,s))return res.status(403).json({ok:false,error:"forbidden"});
  if(String(req.params.slug||"").trim().toLowerCase()!=="lecasinoze")return res.status(404).json({ok:false,error:"streamer_not_found"});
  const active=req.body?.active===true;const previous=await pool.query(`SELECT captcha_active,captcha_notified_at FROM automod_control WHERE streamer_id=$1`,[s.id]);const prev=previous.rows[0];
  await pool.query(`INSERT INTO automod_control(streamer_id,captcha_active,captcha_detected_at) VALUES($1,$2,CASE WHEN $2 THEN NOW() ELSE NULL END) ON CONFLICT(streamer_id) DO UPDATE SET captcha_active=EXCLUDED.captcha_active,captcha_detected_at=CASE WHEN EXCLUDED.captcha_active THEN COALESCE(automod_control.captcha_detected_at,NOW()) ELSE NULL END,updated_at=NOW()`,[s.id,active]);
  const url=captchaUrl();let notified=false;const last=prev?.captcha_notified_at?new Date(prev.captcha_notified_at).getTime():0;
  if(active&&url&&(!prev?.captcha_active||Date.now()-last>30*60_000)&&isMailReady()){
    const owner=await pool.query(`SELECT u.email FROM streamers s JOIN users u ON u.id=s.user_id WHERE s.id=$1 LIMIT 1`,[s.id]);const email=String(owner.rows[0]?.email||"").trim();
    if(email){const subject="Action requise : CAPTCHA Automod";const text=`Un CAPTCHA bloque l’Automod. Ouvre ${url} pour le valider.`;const html=renderLunaLiveEmail({preheader:"Un CAPTCHA bloque actuellement l’Automod.",eyebrow:"AUTOMOD",title:"Validation CAPTCHA requise",paragraphs:["L’Automod a suspendu les actualisations pour conserver le challenge affiché.","Ouvre le bureau sécurisé, valide le CAPTCHA dans la page existante, puis laisse l’Automod reprendre automatiquement."],action:{label:"Valider le CAPTCHA",url},footer:"Lien privé réservé au contrôle de l’Automod LeCasiNoze."});
      try{await sendMail(email,subject,text,html);await pool.query(`UPDATE automod_control SET captcha_notified_at=NOW() WHERE streamer_id=$1`,[s.id]);notified=true;}catch(error){console.error("[automod] captcha email failed",error);}}}
  return res.json({ok:true,active,notified});});

automodControlRouter.get("/fsb/automod/dashboard",requireAuth,requireFsbAccess,async(req:any,res)=>{
  const s=await dashboardStreamer(req,res);if(!s)return;
  const [control,commands]=await Promise.all([
    pool.query(`SELECT desired_enabled,updated_at,captcha_active,captcha_detected_at,dashboard_settings,settings_revision,applied_settings_revision,runtime_status,runtime_seen_at FROM automod_control WHERE streamer_id=$1`,[s.id]),
    pool.query(`SELECT id,kind,status,created_at,finished_at,result FROM automod_control_commands WHERE streamer_id=$1 ORDER BY id DESC LIMIT 12`,[s.id]),
  ]);
  const row=control.rows[0];
  res.setHeader("Cache-Control","private, no-store");
  return res.json({ok:true,enabled:row?.desired_enabled===true,updatedAt:row?.updated_at??null,captchaActive:row?.captcha_active===true,captchaDetectedAt:row?.captcha_detected_at??null,captchaAvailable:captchaConfig()!==null,
    settings:row?.dashboard_settings??null,settingsRevision:Number(row?.settings_revision??0),appliedSettingsRevision:Number(row?.applied_settings_revision??0),
    runtime:row?.runtime_status??null,runtimeSeenAt:row?.runtime_seen_at??null,commands:commands.rows.map(c=>({id:String(c.id),kind:c.kind,status:c.status,createdAt:c.created_at,finishedAt:c.finished_at,result:c.result}))});
});

automodControlRouter.put("/fsb/automod/settings",requireAuth,requireFsbAccess,async(req:any,res)=>{
  const s=await dashboardStreamer(req,res);if(!s)return;
  const settings=parseDashboardSettings(req.body);if(!settings)return res.status(400).json({ok:false,error:"Paramètres invalides : un provider au moins, mise de 0,01 à 100 €, durée de 1 à 120 min."});
  const result=await pool.query(`INSERT INTO automod_control(streamer_id,dashboard_settings,settings_revision) VALUES($1,$2,1)
    ON CONFLICT(streamer_id) DO UPDATE SET dashboard_settings=EXCLUDED.dashboard_settings,settings_revision=automod_control.settings_revision+1
    RETURNING settings_revision`,[s.id,JSON.stringify(settings)]);
  return res.json({ok:true,settings,settingsRevision:Number(result.rows[0].settings_revision)});
});

automodControlRouter.post("/fsb/automod/commands",requireAuth,requireFsbAccess,async(req:any,res)=>{
  const s=await dashboardStreamer(req,res);if(!s)return;
  const kind=req.body?.kind;
  if(kind!=="restart_chrome"&&kind!=="skip_call")return res.status(400).json({ok:false,error:"Commande Automod inconnue."});
  const pending=await pool.query(`SELECT id FROM automod_control_commands WHERE streamer_id=$1 AND kind=$2 AND status IN ('pending','claimed') AND created_at>NOW()-INTERVAL '3 minutes' LIMIT 1`,[s.id,kind]);
  if(pending.rowCount)return res.status(409).json({ok:false,error:"Cette commande est déjà en cours."});
  const result=await pool.query(`INSERT INTO automod_control_commands(streamer_id,kind,requested_by) VALUES($1,$2,$3) RETURNING id`,[s.id,kind,req.user.id]);
  return res.status(202).json({ok:true,id:String(result.rows[0].id),kind});
});

automodControlRouter.post("/automod/status/:slug",requireAuth,async(req:any,res)=>{
  if(String(req.params.slug||"").toLowerCase()!=="lecasinoze")return res.status(404).json({ok:false,error:"streamer_not_found"});
  const s=await dashboardStreamer(req,res);if(!s)return;
  const input=req.body;
  if(!input||typeof input!=="object"||Array.isArray(input))return res.status(400).json({ok:false,error:"invalid_status"});
  const phase=["idle","starting","running","stopping","error"].includes(input.phase)?input.phase:"error";
  const slot=input.slot&&typeof input.slot==="object"?{name:String(input.slot.name||"").slice(0,120),provider:String(input.slot.provider||"").slice(0,30),callId:String(input.slot.callId||"").slice(0,40),requestedBy:String(input.slot.requestedBy||"").slice(0,80)}:null;
  const logs=Array.isArray(input.logs)?input.logs.slice(-12).map((entry:any)=>({at:String(entry?.at||"").slice(0,40),message:String(entry?.message||"").slice(0,350)})):[];
  const runtime={phase,publisherActive:input.publisherActive===true,queueWritable:input.queueWritable===true,slot,slotPhase:String(input.slotPhase||"").slice(0,40),roundsPlayed:Number.isSafeInteger(input.roundsPlayed)?input.roundsPlayed:0,
    slotDeadlineAt:Number.isSafeInteger(input.slotDeadlineAt)?input.slotDeadlineAt:null,bonusActive:input.bonusActive===true,lastError:String(input.lastError||"").slice(0,500),logs,
    config:input.config&&typeof input.config==="object"?{allowedProviders:input.config.allowedProviders,stakeCents:input.config.stakeCents,slotDurationMs:input.config.slotDurationMs,goldenEnabled:input.config.goldenEnabled}:null};
  const revision=Number.isSafeInteger(input.appliedSettingsRevision)&&input.appliedSettingsRevision>=0?input.appliedSettingsRevision:0;
  await pool.query(`INSERT INTO automod_control(streamer_id,runtime_status,runtime_seen_at,applied_settings_revision) VALUES($1,$2,NOW(),$3)
    ON CONFLICT(streamer_id) DO UPDATE SET runtime_status=EXCLUDED.runtime_status,runtime_seen_at=NOW(),applied_settings_revision=GREATEST(automod_control.applied_settings_revision,EXCLUDED.applied_settings_revision)`,[s.id,JSON.stringify(runtime),revision]);
  return res.json({ok:true});
});

automodControlRouter.post("/automod/commands/claim/:slug",requireAuth,async(req:any,res)=>{
  if(String(req.params.slug||"").toLowerCase()!=="lecasinoze")return res.status(404).json({ok:false,error:"streamer_not_found"});
  const s=await dashboardStreamer(req,res);if(!s)return;
  const result=await pool.query(`UPDATE automod_control_commands SET status='claimed',claimed_at=NOW() WHERE id=(
    SELECT id FROM automod_control_commands WHERE streamer_id=$1 AND status='pending' AND created_at>NOW()-INTERVAL '5 minutes' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) RETURNING id,kind`,[s.id]);
  return res.json({ok:true,command:result.rows[0]?{id:String(result.rows[0].id),kind:result.rows[0].kind}:null});
});

automodControlRouter.post("/automod/commands/:id/complete/:slug",requireAuth,async(req:any,res)=>{
  if(String(req.params.slug||"").toLowerCase()!=="lecasinoze")return res.status(404).json({ok:false,error:"streamer_not_found"});
  const s=await dashboardStreamer(req,res);if(!s)return;
  if(!/^\d+$/.test(String(req.params.id)))return res.status(400).json({ok:false,error:"invalid_id"});
  const ok=req.body?.ok===true;const result=String(req.body?.result||"").slice(0,400);
  const updated=await pool.query(`UPDATE automod_control_commands SET status=$3,finished_at=NOW(),result=$4 WHERE streamer_id=$1 AND id=$2 AND status='claimed' RETURNING id`,[s.id,req.params.id,ok?"done":"failed",result]);
  return res.json({ok:updated.rowCount===1});
});
