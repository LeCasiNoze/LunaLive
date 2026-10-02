import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { addCall, deleteCallById, getCallsSettings } from "../calls/queue.js";
import { ensureDashboardSchema } from "./automod_control.js";
import { publicAutomodRuntime } from "./automod_runtime.js";
import { sessionCallCount } from "../calls/automod_session_count.js";
import { ordersForCall,mutateOrder,ingestPointsEvent } from "../automod-shop/runtime.js";
import { tickPointsRain,notifyShop } from "../automod-shop/notify.js";
import { creditPoints,walletSummary } from "../automod-shop/wallet.js";

export const automodServiceRouter = Router();
const API = "/automod-service";
type ServiceClaims = jwt.JwtPayload & { sid: string; ver: number; scope: string[] };

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function timingSafeHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function signingSecret(): string {
  const secret = process.env.AUTOMOD_SERVICE_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTOMOD_SERVICE_JWT_SECRET must contain at least 32 characters");
  return secret;
}
async function ownedStreamer(slug: string, user: any) {
  const result = await pool.query(`SELECT id, slug, user_id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
  const row = result.rows[0];
  if (!row || (user?.role !== "admin" && Number(row.user_id) !== Number(user?.id))) return null;
  return row;
}
function noStore(_req: Request, res: Response, next: NextFunction) { res.setHeader("Cache-Control", "no-store"); next(); }

// Admin lifecycle endpoints. The credential is returned only once; only its digest is stored.
automodServiceRouter.post(`${API}/credentials/:slug`, requireAuth, noStore, async (req: any, res) => {
  try {
    const streamer = await ownedStreamer(String(req.params.slug), req.user);
    if (!streamer || String(streamer.slug).toLowerCase() !== "lecasinoze") return res.status(403).json({ ok: false, error: "forbidden" });
    const serviceId = randomUUID();
    const secret = randomBytes(48).toString("base64url");
    await pool.query(`INSERT INTO automod_service_credentials(service_id,streamer_id,secret_hash) VALUES($1,$2,$3)`, [serviceId, streamer.id, digest(secret)]);
    return res.status(201).json({ ok: true, serviceId, secret, streamerSlug: streamer.slug, scopes: ["calls:read", "settings:read", "calls:sync", "session:stats:write", "automod:control:read", "automod:runtime:write"] });
  } catch { return res.status(500).json({ ok: false, error: "credential_create_failed" }); }
});

automodServiceRouter.post(`${API}/credentials/:serviceId/rotate`, requireAuth, noStore, async (req: any, res) => {
  try {
    const serviceId = String(req.params.serviceId);
    const found = await pool.query(`SELECT c.streamer_id,s.slug,s.user_id FROM automod_service_credentials c JOIN streamers s ON s.id=c.streamer_id WHERE c.service_id=$1 AND c.active=TRUE`, [serviceId]);
    const row = found.rows[0];
    if (!row || (req.user?.role !== "admin" && Number(row.user_id) !== Number(req.user?.id))) return res.status(404).json({ ok: false, error: "not_found" });
    const secret = randomBytes(48).toString("base64url");
    await pool.query(`UPDATE automod_service_credentials SET secret_hash=$2,credential_version=credential_version+1,rotated_at=NOW() WHERE service_id=$1`, [serviceId, digest(secret)]);
    return res.json({ ok: true, serviceId, secret, streamerSlug: row.slug });
  } catch { return res.status(500).json({ ok: false, error: "credential_rotation_failed" }); }
});

automodServiceRouter.delete(`${API}/credentials/:serviceId`, requireAuth, noStore, async (req: any, res) => {
  try {
    const result = await pool.query(`UPDATE automod_service_credentials c SET active=FALSE,revoked_at=NOW() FROM streamers s WHERE c.service_id=$1 AND s.id=c.streamer_id AND c.active=TRUE AND ($2::boolean OR s.user_id=$3) RETURNING c.service_id`, [String(req.params.serviceId), req.user?.role === "admin", Number(req.user?.id)]);
    if (!result.rowCount) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, revoked: true });
  } catch { return res.status(500).json({ ok: false, error: "credential_revoke_failed" }); }
});

// Bootstrap credential exchanges for a short-lived access JWT. No personal JWT is involved.
automodServiceRouter.post(`${API}/token`, noStore, async (req, res) => {
  try {
    const serviceId = typeof req.body?.serviceId === "string" ? req.body.serviceId : "";
    const secret = typeof req.body?.secret === "string" ? req.body.secret : "";
    if (!serviceId || secret.length < 40 || secret.length > 256) return res.status(401).json({ ok: false, error: "service_auth_failed" });
    const found = await pool.query(`SELECT c.secret_hash,c.credential_version,c.streamer_id,s.slug FROM automod_service_credentials c JOIN streamers s ON s.id=c.streamer_id WHERE c.service_id=$1 AND c.active=TRUE LIMIT 1`, [serviceId]);
    const row = found.rows[0];
    if (!row || !timingSafeHex(String(row.secret_hash).trim(), digest(secret))) return res.status(401).json({ ok: false, error: "service_auth_failed" });
    const scopes = ["calls:read", "settings:read", "calls:sync", "session:stats:write", "automod:control:read", "automod:runtime:write"];
    const accessToken = jwt.sign({ sid: serviceId, ver: Number(row.credential_version), streamerId: Number(row.streamer_id), slug: row.slug, scope: scopes, typ: "automod-service" }, signingSecret(), { expiresIn: "15m", issuer: "lunalive-api", audience: "automod" });
    return res.json({ ok: true, accessToken, expiresIn: 900, tokenType: "Bearer" });
  } catch { return res.status(503).json({ ok: false, error: "service_token_unavailable" }); }
});

let serviceAuthReady: Promise<void> | null = null;
async function serviceAuth(req: any, res: Response, next: NextFunction) {
  try {
    const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
    if (!token) return res.status(401).json({ ok: false, error: "service_auth_required" });
    const claims = jwt.verify(token, signingSecret(), { issuer: "lunalive-api", audience: "automod" }) as ServiceClaims;
    if (claims.typ !== "automod-service" || !Array.isArray(claims.scope)) return res.status(401).json({ ok: false, error: "service_auth_invalid" });
    serviceAuthReady ??= pool.query(`SELECT 1 FROM automod_service_credentials LIMIT 0`).then(() => undefined);
    await serviceAuthReady;
    const active = await pool.query(`SELECT c.streamer_id,c.credential_version,s.slug FROM automod_service_credentials c JOIN streamers s ON s.id=c.streamer_id WHERE c.service_id=$1 AND c.active=TRUE`, [claims.sid]);
    const row = active.rows[0];
    if (!row || Number(row.streamer_id) !== Number(claims.streamerId) || Number(row.credential_version) !== Number(claims.ver) || String(row.slug).toLowerCase() !== String(claims.slug).toLowerCase()) return res.status(401).json({ ok: false, error: "service_revoked_or_rotated" });
    req.automodService = { serviceId: claims.sid, streamerId: Number(row.streamer_id), slug: String(row.slug), scope: new Set(claims.scope) };
    return next();
  } catch { return res.status(401).json({ ok: false, error: "service_auth_invalid" }); }
}
function hasScope(req: any, scope: string): boolean { return req.automodService?.scope?.has(scope) === true; }
automodServiceRouter.use(`${API}/v1`, serviceAuth);

automodServiceRouter.get(`${API}/v1/shop/orders`,runtimeRoute(async(req:any,res)=>{
 if(!hasScope(req,"automod:runtime:write"))return res.status(403).json({ok:false});
 const callId=String(req.query.callId??'');if(!/^(?:\d+)?$/.test(callId))return res.status(400).json({ok:false});
 return res.json({ok:true,orders:await ordersForCall(pool,req.automodService.streamerId,callId)});
}));
automodServiceRouter.post(`${API}/v1/shop/orders/:id/:action`,runtimeRoute(async(req:any,res)=>{
 if(!hasScope(req,"automod:runtime:write"))return res.status(403).json({ok:false});
 if(!/^[a-f0-9-]{36}$/.test(req.params.id)||JSON.stringify(req.body??{}).length>16000)return res.status(400).json({ok:false});
 try{
  const out:any=await mutateOrder(pool,req.automodService.streamerId,req.params.id,req.params.action,req.body??{});
  if(out.changed&&req.params.action==='menu'&&out.status==='offered'){
   await notifyShop(pool,req.automodService.streamerId,`@${out.username} — Choisis ton bonus :`);
   for(let i=0;i<out.offers.length;i++){
    const f=out.offers[i];await notifyShop(pool,req.automodService.streamerId,`${i+1} : ${f.label} — ${(f.costCents/100).toFixed(2)} € (${Math.ceil(f.costCents*35/100)} points).`);
   }
   await notifyShop(pool,req.automodService.streamerId,`@${out.username} — Réponds avec le numéro avant la fin du call. Sans réponse : ${out.reservedPoints} points pour le passage prioritaire.`);
  }
  if(out.changed&&req.params.action==='complete')await notifyShop(pool,req.automodService.streamerId,`@${out.username} — Bonus terminé : ${(out.result.gainCents/100).toFixed(2)} €, +${out.result.rebatePoints} points récupérés ! ${walletSummary(out.wallet)}`);
  if(out.changed&&['confirmed','boost-applied','expire','failure'].includes(req.params.action))await notifyShop(pool,req.automodService.streamerId,`@${out.username} — ${out.status==='uncertain'?'Achat à vérifier ; aucune nouvelle tentative automatique.':out.status==='refunded'?'Réservation libérée.':out.status==='expired'?`Choix expiré : ${out.result.feePoints} points débités pour le passage prioritaire.`:`${out.spentPoints??out.result?.spentPoints??0} points débités.`} ${walletSummary(out.wallet)}`);
  return res.json({ok:true,...out});
 }catch(e){return res.status(409).json({ok:false,error:e instanceof Error?e.message:'shop_update_failed'});}
}));
automodServiceRouter.post(`${API}/v1/shop/events`,runtimeRoute(async(req:any,res)=>{
 if(!hasScope(req,"session:stats:write"))return res.status(403).json({ok:false});
 if(!Array.isArray(req.body?.events)||req.body.events.length>50)return res.status(400).json({ok:false});
 const accepted=[];
 for(const event of req.body.events){
  const result=await ingestPointsEvent(pool,req.automodService.streamerId,event);accepted.push(event.id);
  if(result.points>0&&'wallet' in result&&result.wallet)await notifyShop(pool,req.automodService.streamerId,`@${result.username} — +${result.points} points Automod ! ${walletSummary(result.wallet)}`);
 }
 return res.json({ok:true,accepted});
}));
automodServiceRouter.post(`${API}/v1/shop/tick`,runtimeRoute(async(req:any,res)=>{
 if(!hasScope(req,"automod:runtime:write"))return res.status(403).json({ok:false});
 return res.json({ok:true,rain:await tickPointsRain(pool,req.automodService.streamerId)});
}));
// Maintenance credit is restricted to the verified channel owner's Rumble identity.
// It is idempotent and unavailable to viewers or public site callers.
automodServiceRouter.post(`${API}/v1/shop/test-credit`,runtimeRoute(async(req:any,res)=>{
 if(!hasScope(req,"automod:runtime:write")||req.automodService.slug.toLowerCase()!=='lecasinoze')return res.status(403).json({ok:false});
 return res.json({ok:true,wallet:await creditPoints(pool,req.automodService.streamerId,'284177710','LeCasiNoze','maintenance-test-credit:20261002',20000,'authorized-test-credit')});
}));

automodServiceRouter.get(`${API}/v1/calls`, async (req: any, res) => {
  if (!hasScope(req, "calls:read")) return res.status(403).json({ ok: false, error: "scope_required" });
  const r = await pool.query(`SELECT q.id::text AS id,q.slot_name AS "slotName",q.provider,q.username,q.user_id::int AS "userId",q.rumble_user_id AS "rumbleUserId",q.pos,sc.image_url AS "imageUrl" FROM calls_queue q LEFT JOIN slots_catalog sc ON sc.name_key=q.slot_key WHERE q.streamer_id=$1 AND COALESCE(q.is_bonus,FALSE)=FALSE AND (q.bet IS NULL OR q.bet<=0) ORDER BY q.pos LIMIT 200`, [req.automodService.streamerId]);
  return res.json({ ok: true, items: r.rows });
});

automodServiceRouter.get(`${API}/v1/settings`, async (req: any, res) => {
  if (!hasScope(req, "settings:read")) return res.status(403).json({ ok: false, error: "scope_required" });
  return res.json({ ok: true, config: await getCallsSettings(pool, req.automodService.streamerId) });
});

function runtimeRoute(handler: (req: any, res: Response) => Promise<unknown>) {
  return (req: any, res: Response) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.status(503).json({ ok: false, error: "runtime_temporarily_unavailable" });
    });
  };
}
automodServiceRouter.get(`${API}/v1/control`, runtimeRoute(async (req: any, res) => {
  if (!hasScope(req, "automod:control:read")) return res.status(403).json({ ok: false, error: "scope_required" });
  await ensureDashboardSchema();
  const row = await pool.query(`SELECT desired_enabled,dashboard_settings,settings_revision,applied_settings_revision FROM automod_control WHERE streamer_id=$1`, [req.automodService.streamerId]);
  return res.json({ ok: true, enabled: row.rows[0]?.desired_enabled === true, settings: row.rows[0]?.dashboard_settings ?? null,
    settingsRevision: Number(row.rows[0]?.settings_revision ?? 0), appliedSettingsRevision: Number(row.rows[0]?.applied_settings_revision ?? 0) });
}));

// Credential scope is restricted to its own streamer; no personal JWT is needed.
automodServiceRouter.post(`${API}/v1/control/status`, runtimeRoute(async (req: any, res) => {
  if (!hasScope(req, "automod:runtime:write")) return res.status(403).json({ ok:false, error:"scope_required" });
  const input=req.body, runtime=publicAutomodRuntime(input);
  if(!runtime)return res.status(400).json({ok:false,error:"invalid_status"});
  const revision=Number.isSafeInteger(input.appliedSettingsRevision)&&input.appliedSettingsRevision>=0?input.appliedSettingsRevision:0;
  await ensureDashboardSchema();
  await pool.query(`INSERT INTO automod_control(streamer_id,runtime_status,runtime_seen_at,applied_settings_revision) VALUES($1,$2,NOW(),$3)
    ON CONFLICT(streamer_id) DO UPDATE SET runtime_status=EXCLUDED.runtime_status,runtime_seen_at=NOW(),applied_settings_revision=GREATEST(automod_control.applied_settings_revision,EXCLUDED.applied_settings_revision)`,[req.automodService.streamerId,JSON.stringify(runtime),revision]);
  return res.json({ok:true});
}));

automodServiceRouter.post(`${API}/v1/control/commands/claim`, runtimeRoute(async(req:any,res)=>{
  if(!hasScope(req,"automod:runtime:write"))return res.status(403).json({ok:false,error:"scope_required"});
  await ensureDashboardSchema();
  const result=await pool.query(`UPDATE automod_control_commands SET status='claimed',claimed_at=NOW() WHERE id=(
    SELECT id FROM automod_control_commands WHERE streamer_id=$1 AND status='pending' AND created_at>NOW()-INTERVAL '5 minutes' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) RETURNING id,kind`,[req.automodService.streamerId]);
  return res.json({ok:true,command:result.rows[0]?{id:String(result.rows[0].id),kind:result.rows[0].kind}:null});
}));

automodServiceRouter.post(`${API}/v1/control/commands/:id/complete`, runtimeRoute(async(req:any,res)=>{
  if(!hasScope(req,"automod:runtime:write"))return res.status(403).json({ok:false,error:"scope_required"});
  if(!/^\d+$/.test(String(req.params.id)))return res.status(400).json({ok:false,error:"invalid_id"});
  await ensureDashboardSchema();
  const updated=await pool.query(`UPDATE automod_control_commands SET status=$3,finished_at=NOW(),result=$4 WHERE streamer_id=$1 AND id=$2 AND status='claimed' RETURNING id`,
    [req.automodService.streamerId,req.params.id,req.body?.ok===true?"done":"failed",String(req.body?.result||"").slice(0,400)]);
  return res.json({ok:updated.rowCount===1});
}));

automodServiceRouter.delete(`${API}/v1/calls/:id`, async (req: any, res) => {
  if (!hasScope(req, "calls:sync")) return res.status(403).json({ ok: false, error: "scope_required" });
  const deleted = await deleteCallById(pool, req.automodService.streamerId, String(req.params.id));
  return res.json({ ok: true, deleted });
});

automodServiceRouter.post(`${API}/v1/calls`, async (req: any, res) => {
  if (!hasScope(req, "calls:sync")) return res.status(403).json({ ok: false, error: "scope_required" });
  const slotName = typeof req.body?.slotName === "string" ? req.body.slotName : "";
  const provider = typeof req.body?.provider === "string" ? req.body.provider : null;
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
  if (!/^[A-Za-z0-9-]{16,80}$/.test(requestId)) return res.status(400).json({ ok: false, error: "invalid_request_id" });
  // A durable request ledger makes retries safe even if the VPS loses the response.
  const existing = await pool.query(`SELECT r.call_id::text AS id,q.slot_name AS "slotName",q.provider,q.username,q.user_id AS "userId",q.pos FROM automod_call_requests r LEFT JOIN calls_queue q ON q.id=r.call_id AND q.streamer_id=$2 WHERE r.service_id=$1 AND r.request_id=$3`, [req.automodService.serviceId, req.automodService.streamerId, requestId]);
  if (existing.rows[0]) {
    if (!existing.rows[0].slotName) return res.status(409).json({ ok: false, error: "automod_call_finished" });
    return res.json({ ok: true, item: existing.rows[0] });
  }
  const result = await addCall(pool, req.automodService.streamerId, 0, "Automod", slotName, provider, { bypassLimit: true });
  if (!result.ok) return res.status(409).json({ ok: false, error: result.error });
  await pool.query(`INSERT INTO automod_call_requests(service_id,request_id,call_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [req.automodService.serviceId, requestId, result.item.id]);
  return res.status(201).json({ ok: true, item: { id: result.item.id, slotName: result.item.slotName, provider: result.item.provider, username: "Automod", userId: 0, pos: result.position } });
});

automodServiceRouter.put(`${API}/v1/session-stats/:sessionId`, async (req: any, res) => {
  if (!hasScope(req, "session:stats:write")) return res.status(403).json({ ok: false, error: "scope_required" });
  const sessionId = String(req.params.sessionId);
  const payload = req.body;
  if (!/^[A-Za-z0-9-]{8,100}$/.test(sessionId) || !payload || payload.sessionId !== sessionId || !Array.isArray(payload.topGains) || payload.topGains.length > 5 || !Number.isSafeInteger(payload.bonusCount) || payload.bonusCount < 0 || JSON.stringify(payload).length > 65_536) return res.status(400).json({ ok: false, error: "invalid_session_stats" });
  const startedAt = Date.parse(payload.sessionStartedAt);
  if (!Number.isFinite(startedAt) || startedAt > Date.now()) return res.status(400).json({ok:false,error:"invalid_session_start"});
  const count = await sessionCallCount(pool, req.automodService.streamerId, sessionId, new Date(startedAt).toISOString());
  Object.assign(payload, count);
  await pool.query(`INSERT INTO automod_session_sync(streamer_id,session_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(streamer_id,session_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`, [req.automodService.streamerId, sessionId, JSON.stringify(payload)]);
  return res.json({ ok: true, sessionId, synced: true, callCount: count.callCount });
});
