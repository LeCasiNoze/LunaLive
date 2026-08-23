// api/src/routes/me_overlay.ts
import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";

import fs from "fs";
import path from "path";
import multer from "multer";
import type { Server } from "socket.io";
import { buildPublicUrl, deleteFromR2, getR2PublicBase, putR2Buffer, r2Enabled } from "../clips/r2.js";

export const meOverlayRouter = Router();

const EMPTY_CONFIG = { chat: {}, goal: {}, viewers: {}, alerts: {} };

function deepMerge(a: any, b: any) {
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: any = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b ?? a;
}

function getUserId(req: any): number {
  const id = Number(req.user?.id ?? req.userId ?? 0);
  return Number.isFinite(id) ? id : 0;
}

async function getWidgetConfig(userId: number) {
  const result = await pool.query(`SELECT config FROM streamer_overlay_configs WHERE user_id=$1 LIMIT 1`, [userId]);
  return result.rows?.[0]?.config || EMPTY_CONFIG;
}

async function saveWidgetConfig(userId: number, patch: any) {
  const current = await getWidgetConfig(userId);
  const next = deepMerge(current, patch || {});
  await pool.query(
    `INSERT INTO streamer_overlay_configs(user_id, config)
     VALUES($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET config=EXCLUDED.config, updated_at=NOW()`,
    [userId, JSON.stringify(next)]
  );
  return next;
}

/** =========================
 *  ✅ Upload helpers
 *  ========================= */
function publicBase(req: any) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https");
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function safeExtFromMime(kind: "image" | "sound", mime: string) {
  const m = String(mime || "").toLowerCase();

  if (kind === "image") {
    if (m.includes("gif")) return "gif";
    if (m.includes("png")) return "png";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("webp")) return "webp";
    return null;
  }

  // sound
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  return null;
}

function fileSignatureMatches(mime: string, buffer: Buffer) {
  const head = buffer.subarray(0, 16);
  if (mime === "image/png") return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === "image/gif") return head.subarray(0, 6).toString("ascii") === "GIF87a" || head.subarray(0, 6).toString("ascii") === "GIF89a";
  if (mime === "image/webp") return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP";
  if (["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(mime)) return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WAVE";
  if (mime === "audio/ogg") return head.subarray(0, 4).toString("ascii") === "OggS";
  if (mime === "audio/mpeg" || mime === "audio/mp3") return head.subarray(0, 3).toString("ascii") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  return false;
}

function applyTpl(tpl: string, vars: Record<string, any>) {
  let s = String(tpl || "");
  for (const [k, v] of Object.entries(vars || {})) {
    const val = String(v ?? "");
    s = s.replaceAll(`{${k}}`, val);
    s = s.replaceAll(`@{${k}}`, `@${val}`);
  }
  return s;
}

async function getOwnedStreamerSlugByUserId(userId: number): Promise<string | null> {
  const r = await pool.query(`SELECT slug FROM streamers WHERE user_id=$1 ORDER BY id ASC LIMIT 1`, [userId]);
  return r.rows?.[0]?.slug ? String(r.rows[0].slug) : null;
}

// multer memory (on write file nous-mêmes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** =========================
 *  Existing config endpoints
 *  ========================= */
meOverlayRouter.get("/widgets-config", a(async (req, res) => {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });
  const cfg = await getWidgetConfig(uid);
  return res.json({ ok: true, config: cfg });
}));

meOverlayRouter.post("/widgets-config", a(async (req, res) => {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });
  await saveWidgetConfig(uid, req.body ?? {});
  return res.json({ ok: true });
}));

meOverlayRouter.post("/view-config", a(async (req, res) => {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });
  await saveWidgetConfig(uid, { view: req.body ?? {} });
  return res.json({ ok: true });
}));

/** =========================
 *  Followers LunaLive
 *  GET /me/overlay/followers?slug=xxx
 *  ========================= */
meOverlayRouter.get(
  "/followers",
  a(async (req, res) => {
    const slug = String(req.query.slug ?? "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });

    const q = await pool.query(
      `SELECT s.id, s.slug,
              COUNT(sf.user_id)::int AS count
       FROM streamers s
       LEFT JOIN streamer_follows sf ON sf.streamer_id=s.id
       WHERE lower(s.slug)=lower($1)
       GROUP BY s.id, s.slug
       LIMIT 1`,
      [slug]
    );
    const row = q.rows?.[0];
    if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const latest = await pool.query(
      `SELECT u.id, u.username
       FROM streamer_follows sf
       JOIN users u ON u.id=sf.user_id
       WHERE sf.streamer_id=$1
       ORDER BY sf.created_at DESC
       LIMIT 1`,
      [Number(row.id)]
    );
    const last = latest.rows?.[0] || null;

    return res.json({
      ok: true,
      slug: String(row.slug),
      count: Number(row.count || 0),
      lastFollower: last
        ? {
            username: String(last.username),
            displayname: String(last.username),
            avatar: `/avatars/u/${Number(last.id)}`,
          }
        : null,
    });
  })
);

/** =========================
 *  ✅ test alert (emit socket)
 *  POST /me/overlay/alert
 *  body: { event, name, amount?, gift?, slug? }
 *  ========================= */
meOverlayRouter.post(
  "/alert",
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const event = String(req.body?.event || "").trim().toLowerCase();
    if (event !== "follow") {
      return res.status(400).json({ ok: false, error: "bad_event" });
    }

    // slug: soit fourni, soit streamer owner
    const slug = String(req.body?.slug || "").trim() || (await getOwnedStreamerSlugByUserId(uid));
    if (!slug) return res.status(404).json({ ok: false, error: "no_streamer" });

    const name = String(req.body?.name || "TestFollower").trim();

    const cfg = await getWidgetConfig(uid);
    const aCfg = cfg.alerts || {};
    const text = applyTpl(String(aCfg.follow_tpl ?? "Merci @{user} pour le follow 💜"), { user: name });
    const imageUrl = aCfg.follow_img ?? null;
    const soundUrl = aCfg.follow_sound ?? null;
    const volume = Math.max(0, Math.min(1, Number(aCfg.sound_vol ?? 1)));
    const durationMs = Math.max(1200, Number(aCfg.follow_duration_ms ?? 4500));

    const io = (req.app?.get?.("io") || req.app?.locals?.io) as Server | undefined;
    if (!io) return res.status(500).json({ ok: false, error: "io_missing" });

    io.to(`stream:${String(slug).toLowerCase()}`).emit("obs:alert", {
      event,
      name,
      text,
      imageUrl,
      soundUrl,
      volume,
      durationMs,
      createdAt: new Date().toISOString(),
    });

    return res.json({ ok: true });
  })
);

/** =========================
 *  ✅ upload alert file
 *  POST /me/overlay/alerts/upload (multipart)
 *  fields: kind=image|sound, event=follow, file
 *  ========================= */
meOverlayRouter.post(
  "/alerts/upload",
  upload.single("file"),
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const kind = String(req.body?.kind || "").trim().toLowerCase() as "image" | "sound";
    const event = String(req.body?.event || "").trim().toLowerCase() as "follow";
    if (kind !== "image" && kind !== "sound") return res.status(400).json({ ok: false, error: "bad_kind" });
    if (event !== "follow") return res.status(400).json({ ok: false, error: "bad_event" });

    const f = req.file as any;
    if (!f || !f.buffer) return res.status(400).json({ ok: false, error: "missing_file" });

    const ext = safeExtFromMime(kind, f.mimetype);
    if (!ext) return res.status(400).json({ ok: false, error: "bad_mime" });
    if (!fileSignatureMatches(String(f.mimetype).toLowerCase(), f.buffer)) {
      return res.status(400).json({ ok: false, error: "bad_file_signature" });
    }

    const maxBytes = kind === "image" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
    if (f.size > maxBytes) return res.status(413).json({ ok: false, error: "file_too_large" });
    if (!r2Enabled()) return res.status(503).json({ ok: false, error: "storage_unavailable" });

    const configKey = kind === "image" ? "follow_img" : "follow_sound";
    const previous = await getWidgetConfig(uid);
    const previousUrl = previous.alerts?.[configKey] || null;
    const assetKey = `overlays/users/u${uid}/alerts/follow-${kind}-${Date.now()}.${ext}`;
    const uploaded = await putR2Buffer({ key: assetKey, contentType: f.mimetype, buffer: f.buffer });
    const url = buildPublicUrl(assetKey);
    if (!uploaded || !url) return res.status(503).json({ ok: false, error: "upload_failed" });

    await saveWidgetConfig(uid, { alerts: { [configKey]: url } });

    const publicBase = getR2PublicBase();
    if (previousUrl && publicBase && previousUrl.startsWith(`${publicBase}/`)) {
      const oldKey = previousUrl.slice(publicBase.length + 1).split("/").map(decodeURIComponent).join("/");
      if (oldKey && oldKey !== assetKey) void deleteFromR2(oldKey).catch(() => {});
    }

    return res.json({ ok: true, url });
  })
);

// ─── FSB Overlay — IDs autorisés (partagé entre les 3 streameurs + SamyyZsis) ─
const FSB_OVERLAY_ALLOWED_IDS = new Set([4, 15, 71]);
const FSB_OVERLAY_SLUG = "fabiozsis"; // chaîne commune

function canAccessFsbOverlay(uid: number): boolean {
  return FSB_OVERLAY_ALLOWED_IDS.has(uid);
}

/** =========================
 *  ✅ GET /me/overlay/fsb-config
 *  Charge la config overlay partagée (fabiozsis)
 *  ========================= */
meOverlayRouter.get(
  "/fsb-config",
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid || !canAccessFsbOverlay(uid)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const r = await pool.query(
      `SELECT overlay_config FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
      [FSB_OVERLAY_SLUG]
    );
    const blob = r.rows?.[0]?.overlay_config ?? null;
    // Désencapsule le wrapper v2 si présent → renvoie une OverlayConfig flat.
    const isV2 = blob && typeof blob === "object" && blob._wrapper === "v2";
    const config = isV2 ? blob.active : blob;
    const byMode = isV2 ? blob.byMode : null;
    return res.json({ ok: true, config, byMode });
  })
);

/** =========================
 *  ✅ PUT /me/overlay/fsb-config
 *  Sauvegarde la config overlay partagée (fabiozsis)
 *  body: { config: OverlayConfig }
 *  ========================= */
meOverlayRouter.put(
  "/fsb-config",
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid || !canAccessFsbOverlay(uid)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const config = req.body?.config;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ ok: false, error: "missing_config" });
    }

    await pool.query(
      `UPDATE streamers SET overlay_config = $1 WHERE lower(slug) = lower($2)`,
      [JSON.stringify(config), FSB_OVERLAY_SLUG]
    );

    return res.json({ ok: true });
  })
);

/** Extrait le slug depuis la chatUrl de la config (ex: ?slug=lecasinoze) */
function slugFromConfigChatUrl(config: any): string {
  try {
    const chatUrl = String(config?.chat?.chatUrl || "");
    if (!chatUrl) return "";
    const u = new URL(chatUrl);
    return u.searchParams.get("slug") ?? "";
  } catch {
    return "";
  }
}

/** =========================
 *  ✅ Live config push (designer → OBS overlay via socket) + persistance DB
 *  POST /me/overlay/push-config
 *  body: { config: OverlayConfig, slug?: string }
 *
 *  Pour les users FSB : persist sous fabiozsis en DB
 *  + push socket sur le slug de la chatUrl (là où l'overlay écoute réellement)
 *  ========================= */
meOverlayRouter.post(
  "/push-config",
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const config = req.body?.config;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ ok: false, error: "missing_config" });
    }
    // byMode = { solo?, double?, triple? } — layouts customisés pour l'auto-switch
    // overlay (rendu adapté au nombre de cams actives en temps réel).
    const byMode = req.body?.byMode && typeof req.body.byMode === "object" ? req.body.byMode : null;

    const io = (req.app?.get?.("io") || req.app?.locals?.io) as Server | undefined;
    if (!io) return res.status(500).json({ ok: false, error: "io_missing" });

    // On stocke config + byMode dans le même JSON (overlay_config) sous une
    // structure enveloppe { active, byMode } — rétro-compat : les anciens reads
    // qui s'attendent à une OverlayConfig flat reçoivent toujours `active` (non
    // wrappé) côté OverlayPage qui sait gérer les deux formats.
    const persistedBlob = byMode ? { _wrapper: "v2" as const, active: config, byMode } : config;

    if (canAccessFsbOverlay(uid)) {
      // Persist en DB sous fabiozsis
      await pool.query(
        `UPDATE streamers SET overlay_config = $1 WHERE lower(slug) = lower($2)`,
        [JSON.stringify(persistedBlob), FSB_OVERLAY_SLUG]
      );

      // Slugs sur lesquels émettre : slug du chat (overlay écoute là) + fabiozsis
      const chatSlug = slugFromConfigChatUrl(config) || FSB_OVERLAY_SLUG;
      const slugsToNotify = [...new Set([chatSlug.toLowerCase(), FSB_OVERLAY_SLUG.toLowerCase()])];

      const broadcast = { config, byMode };
      for (const s of slugsToNotify) {
        // Room authentifiée (stream:join avec token owner/admin)
        io.to(`stream:${s}`).emit("obs:config", broadcast);
        // Room publique (obs:subscribe sans auth) — pour l'OverlayPage dans OBS
        io.to(`obsview:${s}`).emit("obs:config", broadcast);
      }
      // Room partagée designer FSB — sync en temps réel entre tous les users FSB ouverts
      io.to("fsb:designer").emit("obs:config", broadcast);

      return res.json({ ok: true, slug: chatSlug });
    }

    // Utilisateur normal (non-FSB)
    const slug = String(req.body?.slug || "").trim() || (await getOwnedStreamerSlugByUserId(uid)) || "";
    if (!slug) return res.status(404).json({ ok: false, error: "no_streamer" });

    io.to(`stream:${slug.toLowerCase()}`).emit("obs:config", { config, byMode });
    io.to(`obsview:${slug.toLowerCase()}`).emit("obs:config", { config, byMode });
    return res.json({ ok: true, slug });
  })
);

/** =========================
 *  ✅ Upload fond d'overlay
 *  POST /me/overlay/bg/upload (multipart)
 *  field: file (image)
 *  ========================= */
meOverlayRouter.post(
  "/bg/upload",
  upload.single("file"),
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const f = req.file as any;
    if (!f || !f.buffer) return res.status(400).json({ ok: false, error: "missing_file" });

    const ext = safeExtFromMime("image", f.mimetype);
    if (!ext) return res.status(400).json({ ok: false, error: "bad_mime" });

    const dir = path.join(process.cwd(), "uploads", "overlay-bg", `u${uid}`);
    fs.mkdirSync(dir, { recursive: true });

    const fname = `bg-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const abs = path.join(dir, fname);
    fs.writeFileSync(abs, f.buffer);

    const url = `${publicBase(req)}/uploads/overlay-bg/u${uid}/${fname}`;
    return res.json({ ok: true, url });
  })
);
