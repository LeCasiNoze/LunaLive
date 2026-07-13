// api/src/socket_emit.ts
import type { Server } from "socket.io";
import { pool } from "./db.js";

function slugRoom(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

// Colonnes type/data ajoutées à chat_messages pour PERSISTER les cartes de
// célébration (elles réapparaissent à l'ouverture du chat sur un autre
// appareil). Idempotent, exécuté une fois.
let __specialColsReady = false;
async function ensureSpecialCols() {
  if (__specialColsReady) return;
  await pool.query(`ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS data JSONB;`);
  __specialColsReady = true;
}

// Célébrations = persistées dans l'historique. Les actionnables (rain/roue/
// prédiction/coffre) restent éphémères (live/interactifs, inutile en historique).
const PERSISTED_TYPES = new Set<string>(["raid", "follow", "combo", "sub", "don", "boss", "level"]);

async function persistAndBroadcastSpecial(io: Server, s: string, type: string, data: any, username: string) {
  try {
    await ensureSpecialCols();
    const sr = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [s]);
    const streamerId = Number(sr.rows?.[0]?.id || 0);
    if (!streamerId) return;
    const ins = await pool.query(
      `INSERT INTO chat_messages (streamer_id, user_id, username, body, type, data)
       VALUES ($1, 0, $2, '', $3, $4::jsonb)
       RETURNING id, created_at`,
      [streamerId, String(username || "LunaLive"), type, JSON.stringify(data || {})]
    );
    const row = ins.rows?.[0];
    if (!row) return;
    // broadcast avec le VRAI id → live et historique partagent le même id (pas
    // de doublon quand un client reçoit le live puis recharge).
    const msg = {
      id: Number(row.id), userId: 0, username: String(username || "LunaLive"),
      body: "", createdAt: new Date(row.created_at).toISOString(), type, data: data || {},
    };
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit("chat:message", msg);
  } catch (e) {
    console.error("[emitSpecialCard persist] error", e);
  }
}

export function emitChatAll(io: Server, slug: string, event: string, payload: any) {
  const s = slugRoom(slug);
  io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit(event, payload);
}

export function emitStream(io: Server, slug: string, event: string, payload: any) {
  const s = slugRoom(slug);
  io.to(`stream:${s}`).emit(event, payload);
}

// si tu veux “tout le monde” (chat + stream)
export function emitChatAndStream(io: Server, slug: string, event: string, payload: any) {
  emitChatAll(io, slug, event, payload);
  emitStream(io, slug, event, payload);
}

// ─────────────────────────────────────────────────────────────────────────
// Carte SPÉCIALE (raid/follow/sub/don/boss/level/combo/rain/wheel/predict/
// chest) émise dans le chat depuis n'importe quel système LunaLive (follow,
// achat de sub, boss vaincu, level up, lancement rain…). Même format que
// POST /internal/bot/chat/special, factorisé. Éphémère (non persisté).
export type SpecialType =
  | "raid" | "follow" | "combo" | "sub" | "don"
  | "chest" | "rain" | "wheel" | "predict" | "boss" | "level";

// Ligne "système" (kind "sys") ou "recap" dans le flux du chat (ex.
// "X a récupéré ses rubis", "Rain terminée — N ont partagé…"). Éphémère.
let __sysSeq = 0;
export function emitChatLine(
  io: Server | null | undefined,
  slug: string,
  kind: "sys" | "recap",
  html: string
): boolean {
  if (!io) return false;
  const s = slugRoom(slug);
  if (!s) return false;
  __sysSeq = (__sysSeq + 1) % 100000;
  const id = -(Date.now() * 100000 + 50000 + __sysSeq);
  const msg = {
    id, userId: 0, username: "LunaLive", body: "",
    createdAt: new Date().toISOString(), type: kind, data: { html },
  };
  try {
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit("chat:message", msg);
    return true;
  } catch {
    return false;
  }
}

let __specialSeq = 0;
export function emitSpecialCard(
  io: Server | null | undefined,
  slug: string,
  type: SpecialType,
  data: Record<string, any> = {},
  username = "LunaLive"
): boolean {
  if (!io) return false;
  const s = slugRoom(slug);
  if (!s) return false;
  const d = data && typeof data === "object" ? data : {};

  // Célébrations : persistées (historique) + broadcast avec le vrai id.
  if (PERSISTED_TYPES.has(type)) {
    void persistAndBroadcastSpecial(io, s, type, d, String(username || "LunaLive"));
    return true;
  }

  // Actionnables/live : éphémère, id synthétique négatif (jamais en collision
  // avec les BIGSERIAL positifs).
  __specialSeq = (__specialSeq + 1) % 100000;
  const id = -(Date.now() * 100000 + __specialSeq);
  const msg = {
    id, userId: 0, username: String(username || "LunaLive"),
    body: "", createdAt: new Date().toISOString(),
    type, data: d,
  };
  try {
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit("chat:message", msg);
    return true;
  } catch {
    return false;
  }
}
