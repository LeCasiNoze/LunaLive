// api/src/routes/me_overlay.ts
import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";

import fs from "fs";
import path from "path";
import multer from "multer";
import type { Server } from "socket.io";

export const meOverlayRouter = Router();

// stock MVP en mémoire (on branchera DB ensuite)
const byUser = new Map<number, any>();

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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

/** =========================
 *  ✅ DLive followers (cache)
 *  ========================= */
const dliveCache = new Map<string, { t: number; count: number; last: any | null }>();

async function dliveGetFollowers(username: string) {
  const key = username.trim();
  if (!key) return { count: 0, last: null };

  const cached = dliveCache.get(key);
  if (cached && Date.now() - cached.t < 10_000) {
    return { count: cached.count, last: cached.last };
  }

  const query = `
    query ($username: String!) {
      user(username: $username) {
        followers(first: 1) {
          totalCount
          list { username displayname avatar }
        }
      }
    }
  `;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);

  try {
    const r = await fetch("https://graphigo.prd.dlive.tv/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { username: key } }),
      signal: ctrl.signal,
    });

    const j: any = await r.json().catch(() => null);
    const f = j?.data?.user?.followers;

    const count = Number(f?.totalCount ?? 0) || 0;
    const last = Array.isArray(f?.list) ? f.list[0] ?? null : null;

    dliveCache.set(key, { t: Date.now(), count, last });
    return { count, last };
  } finally {
    clearTimeout(to);
  }
}

/** =========================
 *  Existing config endpoints
 *  ========================= */
meOverlayRouter.get("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const cfg = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  return res.json({ ok: true, config: cfg });
});

meOverlayRouter.post("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const patch = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, patch);
  byUser.set(uid, next);
  return res.json({ ok: true });
});

meOverlayRouter.post("/view-config", (req, res) => {
  const uid = getUserId(req);
  const payload = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, { view: payload });
  byUser.set(uid, next);
  return res.json({ ok: true });
});

/** =========================
 *  ✅ followers count
 *  GET /me/overlay/followers?slug=xxx
 *  ========================= */
meOverlayRouter.get(
  "/followers",
  a(async (req, res) => {
    const slug = String(req.query.slug ?? "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });

    // ⚠️ IMPORTANT:
    // Adapte cette requête si chez toi le provider username est dans une table de link.
    // Ici je pars sur streamers.provider_channel_slug (souvent utilisé partout).
    const q = await pool.query(
      `SELECT provider_channel_slug
         FROM streamers
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );

    const providerUsername = String(q.rows?.[0]?.provider_channel_slug ?? "").trim();
    if (!providerUsername) {
      return res.status(404).json({ ok: false, error: "no_provider_link" });
    }

    const { count, last } = await dliveGetFollowers(providerUsername);

    return res.json({
      ok: true,
      slug,
      providerUsername,
      count,
      lastFollower: last
        ? {
            username: last.username ?? null,
            displayname: last.displayname ?? null,
            avatar: last.avatar ?? null,
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
    if (event !== "follow" && event !== "donation") {
      return res.status(400).json({ ok: false, error: "bad_event" });
    }

    // slug: soit fourni, soit streamer owner
    const slug = String(req.body?.slug || "").trim() || (await getOwnedStreamerSlugByUserId(uid));
    if (!slug) return res.status(404).json({ ok: false, error: "no_streamer" });

    const name = String(req.body?.name || (event === "donation" ? "TestDonor" : "TestFollower")).trim();
    const amount = Number(req.body?.amount ?? 0) || 0;
    const gift = String(req.body?.gift || "Lemon").trim();

    const cfg = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
    const aCfg = cfg.alerts || {};

    const tpl =
      event === "donation"
        ? String(aCfg.donation_tpl ?? "Merci {user} pour {amount} {gift} !")
        : String(aCfg.follow_tpl ?? "Merci @{user} pour le follow 💜");

    const text = applyTpl(tpl, { user: name, amount, gift });

    const imageUrl = event === "donation" ? (aCfg.donation_img ?? null) : (aCfg.follow_img ?? null);
    const soundUrl = event === "donation" ? (aCfg.donation_sound ?? null) : (aCfg.follow_sound ?? null);

    const volume =
      event === "donation"
        ? Math.max(0, Math.min(1, Number(aCfg.donation_vol ?? 0.9)))
        : Math.max(0, Math.min(1, Number(aCfg.sound_vol ?? 1)));

    const durationMs =
      event === "donation"
        ? Math.max(1200, Number(aCfg.donation_duration_ms ?? 5500))
        : Math.max(1200, Number(aCfg.follow_duration_ms ?? 4500));

    const io = (req.app?.get?.("io") || req.app?.locals?.io) as Server | undefined;
    if (!io) return res.status(500).json({ ok: false, error: "io_missing" });

    io.to(`stream:${String(slug).toLowerCase()}`).emit("obs:alert", {
      event,
      name,
      amount,
      gift,
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
 *  fields: kind=image|sound, event=follow|donation, file
 *  ========================= */
meOverlayRouter.post(
  "/alerts/upload",
  upload.single("file"),
  a(async (req: any, res) => {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const kind = String(req.body?.kind || "").trim().toLowerCase() as "image" | "sound";
    const event = String(req.body?.event || "").trim().toLowerCase() as "follow" | "donation";
    if (kind !== "image" && kind !== "sound") return res.status(400).json({ ok: false, error: "bad_kind" });
    if (event !== "follow" && event !== "donation") return res.status(400).json({ ok: false, error: "bad_event" });

    const f = req.file as any;
    if (!f || !f.buffer) return res.status(400).json({ ok: false, error: "missing_file" });

    const ext = safeExtFromMime(kind, f.mimetype);
    if (!ext) return res.status(400).json({ ok: false, error: "bad_mime" });

    const dir = path.join(process.cwd(), "uploads", "alerts", `u${uid}`);
    fs.mkdirSync(dir, { recursive: true });

    const fname = `${event}-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const abs = path.join(dir, fname);
    fs.writeFileSync(abs, f.buffer);

    // URL publique via API (/uploads/...)
    const url = `${publicBase(req)}/uploads/alerts/u${uid}/${fname}`;

    // ✅ persiste direct dans config mémoire
    const key = `${event}_${kind === "image" ? "img" : "sound"}`; // follow_img, follow_sound, donation_img, donation_sound
    const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
    const next = deepMerge(prev, { alerts: { [key]: url } });
    byUser.set(uid, next);

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
    const config = r.rows?.[0]?.overlay_config ?? null;
    return res.json({ ok: true, config });
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

/** =========================
 *  ✅ Live config push (designer → OBS overlay via socket) + persistance DB
 *  POST /me/overlay/push-config
 *  body: { config: OverlayConfig, slug?: string }
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

    // Pour les users FSB, on push toujours sur la room fabiozsis
    let slug: string;
    if (canAccessFsbOverlay(uid)) {
      slug = FSB_OVERLAY_SLUG;
      // Persister aussi en DB
      await pool.query(
        `UPDATE streamers SET overlay_config = $1 WHERE lower(slug) = lower($2)`,
        [JSON.stringify(config), FSB_OVERLAY_SLUG]
      );
    } else {
      slug = String(req.body?.slug || "").trim() || (await getOwnedStreamerSlugByUserId(uid)) || "";
      if (!slug) return res.status(404).json({ ok: false, error: "no_streamer" });
    }

    const io = (req.app?.get?.("io") || req.app?.locals?.io) as Server | undefined;
    if (!io) return res.status(500).json({ ok: false, error: "io_missing" });

    io.to(`stream:${String(slug).toLowerCase()}`).emit("obs:config", { config });

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
