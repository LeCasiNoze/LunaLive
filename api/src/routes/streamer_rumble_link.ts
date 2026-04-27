// api/src/routes/streamer_rumble_link.ts
// Liaison de chaine Rumble (api_key + pseudo). Vérification cryptographique
// via /-livestream-api/get-data : si la clé retourne le bon username,
// alors le streamer possède bien le compte (l'api_key étant secrète et
// disponible uniquement dans le dashboard Rumble loggé).

import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const streamerRumbleLinkRouter = Router();
type AuthedReq = any;

const RUMBLE_API_BASE = "https://rumble.com/-livestream-api/get-data";

function parseRumbleUsername(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  // Accepte URL https://rumble.com/c/X, /user/X, ou juste X
  const m = s.match(/rumble\.com\/(?:c|user)\/([A-Za-z0-9_-]+)/i);
  return (m ? m[1] : s).replace(/^@/, "").trim();
}

function isValidRumbleUsername(s: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(s);
}

function isValidApiKey(s: string): boolean {
  return /^[A-Za-z0-9_-]{40,200}$/.test(s);
}

/**
 * Accepte soit une clé brute, soit une URL complète Rumble (ex:
 * https://rumble.com/-livestream-api/get-data?key=XXX). Renvoie la clé extraite
 * ou la chaîne d'origine si pas d'URL détectée.
 */
function extractApiKey(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  // URL complète : prendre la valeur du paramètre key
  const m = s.match(/[?&]key=([A-Za-z0-9_-]+)/i);
  if (m) return m[1];
  return s;
}

async function getStreamerByUserId(userId: number) {
  const r = await pool.query(
    `SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  return r.rows?.[0] ?? null;
}

/**
 * Valide une api_key Rumble en appelant /get-data. Renvoie le username
 * propriétaire de la clé, ou null si invalide.
 */
async function probeApiKey(apiKey: string): Promise<{ username: string; userId: string; channelName: string | null } | null> {
  try {
    const r = await fetch(`${RUMBLE_API_BASE}?key=${encodeURIComponent(apiKey)}`, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        origin: "https://rumble.com",
        referer: "https://rumble.com/",
      },
    });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => null);
    if (!j || j.type !== "user" || !j.username) return null;
    return {
      username: String(j.username),
      userId: String(j.user_id || ""),
      channelName: j.channel_name ? String(j.channel_name) : null,
    };
  } catch {
    return null;
  }
}

// GET /streamer/me/rumble-link
streamerRumbleLinkRouter.get("/", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamer = await getStreamerByUserId(userId);
  if (!streamer) return res.json({ ok: true, linked: false, streamer: null, account: null });

  const acc = await pool.query(
    `SELECT id, username, assigned_at, api_key IS NOT NULL AS has_api_key
     FROM rumble_accounts
     WHERE assigned_to_streamer_id = $1
     LIMIT 1`,
    [streamer.id]
  );
  const account = acc.rows?.[0] ?? null;

  return res.json({
    ok: true,
    linked: !!account,
    streamer: { id: streamer.id, slug: streamer.slug },
    account: account ? {
      username: account.username,
      hasApiKey: account.has_api_key,
      assignedAt: account.assigned_at,
    } : null,
  });
});

/**
 * POST /streamer/me/rumble-link
 * Body: { username: string, apiKey: string }
 * Vérifie et lie la chaine. Refuse si username ne match pas le owner de la clé.
 */
streamerRumbleLinkRouter.post("/", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamer = await getStreamerByUserId(userId);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const usernameRaw = String(req.body?.username || "").trim();
  const apiKeyRaw = String(req.body?.apiKey || "").trim();

  const username = parseRumbleUsername(usernameRaw);
  if (!isValidRumbleUsername(username)) {
    return res.status(400).json({ ok: false, error: "invalid_username", message: "Pseudo Rumble invalide. Format attendu: lettres, chiffres, _ ou -" });
  }
  const apiKey = extractApiKey(apiKeyRaw);
  if (!isValidApiKey(apiKey)) {
    return res.status(400).json({ ok: false, error: "invalid_api_key", message: "Clé API invalide. Colle l'URL complète ou la clé seule depuis ton dashboard Rumble → Diffusion (API) en direct" });
  }

  // Probe la clé
  const probe = await probeApiKey(apiKey);
  if (!probe) {
    return res.status(400).json({ ok: false, error: "api_key_invalid_or_expired", message: "La clé API ne fonctionne pas. Vérifie qu'elle est correcte et active." });
  }

  // Vérifie que le username entré matche le owner de la clé (case-insensitive)
  if (probe.username.toLowerCase() !== username.toLowerCase()) {
    return res.status(400).json({
      ok: false,
      error: "username_mismatch",
      message: `La clé API appartient au compte "${probe.username}", pas à "${username}". Vérifie que tu utilises la clé du bon compte.`,
    });
  }

  // Vérifie que cette clé n'est pas déjà utilisée par un autre streamer
  const inUse = await pool.query(
    `SELECT assigned_to_streamer_id FROM rumble_accounts
     WHERE api_key = $1 AND assigned_to_streamer_id IS NOT NULL AND assigned_to_streamer_id <> $2
     LIMIT 1`,
    [apiKey, streamer.id]
  );
  if (inUse.rows[0]) {
    return res.status(409).json({ ok: false, error: "api_key_already_linked", message: "Cette clé API est déjà utilisée par un autre streamer LunaLive." });
  }

  // Upsert: si le streamer avait déjà un rumble_account, on update; sinon on insert
  const existing = await pool.query(
    `SELECT id FROM rumble_accounts WHERE assigned_to_streamer_id = $1 LIMIT 1`,
    [streamer.id]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE rumble_accounts
       SET username = $2, api_key = $3, assigned_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, probe.username, apiKey]
    );
  } else {
    await pool.query(
      `INSERT INTO rumble_accounts (username, api_key, assigned_to_streamer_id, assigned_at)
       VALUES ($1, $2, $3, NOW())`,
      [probe.username, apiKey, streamer.id]
    );
  }

  // Bascule platform à 'rumble' + nettoie un éventuel rumble_username scrape-only
  await pool.query(
    `UPDATE streamers
     SET platform = 'rumble',
         rumble_username = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [streamer.id]
  );

  return res.json({
    ok: true,
    linked: true,
    streamer: { id: streamer.id, slug: streamer.slug },
    account: {
      username: probe.username,
      rumbleUserId: probe.userId,
      channelName: probe.channelName,
    },
    message: `Chaine Rumble "${probe.username}" liée avec succès`,
  });
});

// DELETE /streamer/me/rumble-link
streamerRumbleLinkRouter.delete("/", requireAuth, async (req: AuthedReq, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const streamer = await getStreamerByUserId(userId);
  if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  await pool.query(
    `UPDATE rumble_accounts
     SET assigned_to_streamer_id = NULL, released_at = NOW()
     WHERE assigned_to_streamer_id = $1`,
    [streamer.id]
  );

  return res.json({ ok: true, linked: false });
});
