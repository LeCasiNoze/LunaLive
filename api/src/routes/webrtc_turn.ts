// api/src/routes/webrtc_turn.ts
//
// Endpoint pour distribuer des credentials ICE (TURN + STUN) aux pages
// WebRTC côté client (actuellement FSB stream-control).
//
// Cloudflare Realtime TURN :
//   - App créée dans le dashboard → on a TOKEN_ID + API_TOKEN (secret)
//   - On appelle POST /v1/turn/keys/{TOKEN_ID}/credentials/generate-ice-servers
//     qui renvoie un objet { iceServers: { urls, username, credential } }
//     directement injectable dans `new RTCPeerConnection({ iceServers })`.
//
// On gate l'endpoint par requireAuth + requireFsbAccess : seuls les users FSB
// peuvent minter des creds → pas de risque d'abus du quota (1 TB/mois free).
//
// Cache mémoire : on re-utilise le même bundle de creds pendant
// CACHE_TTL_MS (20h, en dessous du TTL 24h demandé à CF) pour éviter
// de cogner l'API CF à chaque rechargement de page.

import { Router } from "express";
import { requireAuth } from "../auth.js";
import { requireFsbAccess } from "./fsb_guard.js";
import { a } from "../utils/async.js";

export const webrtcTurnRouter = Router();

const CF_TURN_TOKEN_ID = process.env.CLOUDFLARE_TURN_TOKEN_ID || "";
const CF_TURN_API_TOKEN = process.env.CLOUDFLARE_TURN_API_TOKEN || "";

const CRED_TTL_SECONDS = 86_400;       // 24h — TTL demandé à CF
const CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20h — on rafraîchit avant expiration

// Fallback universel (STUN-only) — utilisé si CF n'est pas configuré ou
// renvoie une erreur. N'aide pas les NAT symétriques mais évite de planter
// la page WebRTC pour les users sur NAT permissif.
const FALLBACK_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type CachedBundle = {
  iceServers: RTCIceServer[];
  fetchedAt: number;
  source: "cloudflare" | "fallback";
};

let cache: CachedBundle | null = null;

async function fetchCloudflareIceServers(): Promise<RTCIceServer[] | null> {
  if (!CF_TURN_TOKEN_ID || !CF_TURN_API_TOKEN) return null;

  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(
    CF_TURN_TOKEN_ID
  )}/credentials/generate-ice-servers`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: CRED_TTL_SECONDS }),
    });
  } catch (e) {
    console.error("[webrtc_turn] CF fetch network error:", e);
    return null;
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error(
      "[webrtc_turn] CF API error:",
      resp.status,
      txt.slice(0, 500)
    );
    return null;
  }

  const json = (await resp.json().catch(() => null)) as any;
  const ice = json?.iceServers;
  if (!ice) {
    console.error("[webrtc_turn] CF response missing iceServers:", json);
    return null;
  }

  // CF peut renvoyer soit un objet unique, soit un tableau — on normalise.
  const arr = Array.isArray(ice) ? ice : [ice];

  // On préfixe avec des STUN Google en secours (gratuit, latence réduite pour
  // NAT permissifs qui n'ont pas besoin du relay CF).
  return [
    { urls: "stun:stun.l.google.com:19302" },
    ...arr.map((s: any) => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    })),
  ];
}

async function getIceBundle(): Promise<CachedBundle> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;

  const fresh = await fetchCloudflareIceServers();
  if (fresh && fresh.length > 0) {
    cache = { iceServers: fresh, fetchedAt: now, source: "cloudflare" };
    return cache;
  }

  // Pas de cache agressif en cas de fallback — on retente dans 5 min.
  return {
    iceServers: FALLBACK_ICE,
    fetchedAt: now - (CACHE_TTL_MS - 5 * 60 * 1000),
    source: "fallback",
  };
}

webrtcTurnRouter.get(
  "/me/webrtc/ice-servers",
  requireAuth,
  requireFsbAccess,
  a(async (_req, res) => {
    const bundle = await getIceBundle();
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.json({
      ok: true,
      iceServers: bundle.iceServers,
      source: bundle.source,
      ttl: CRED_TTL_SECONDS,
    });
  })
);
