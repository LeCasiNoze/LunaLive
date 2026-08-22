// api/src/calls/commands.ts
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { emitUserToast } from "./toast.js";
import { resolveSlot } from "./catalog.js";
import {
  addCall,
  countUserCalls,
  countUserCallsByUsername,
  effectiveLimit,
  getCallsSettings,
  listCalls,
  resetCalls,
  isUserBannedFromCalls,
  deleteCallById,
  findCurrentForBet,
  findCurrentForPay,
  setCallPay,
} from "./queue.js";
import { normText } from "./normalize.js";

// ✅ NEW: pour envoyer un vrai message bot (DB + broadcast)
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";
import { sendRumbleMessageReliable } from "../rumble_chat_bridge.js";

export function parseBangCommand(text: string): { cmd: string; arg: string } | null {
  const s = normText(text);
  if (!s.startsWith("!")) return null;
  const m = s.match(/^!([a-z0-9_-]+)\s*(.*)$/i);
  if (!m) return null;
  return { cmd: String(m[1] || "").toLowerCase(), arg: String(m[2] || "") };
}

const CALLS_TALENT_CODE = "talent_calls_limit" as const;

// lvl 1 => +1, lvl 2/3 => +2
function callsLimitBonusFromLevel(level: number) {
  const lv = Math.max(0, Math.min(3, Number(level || 0)));
  if (lv >= 2) return 2;
  if (lv >= 1) return 1;
  return 0;
}

async function getUserTalentLevel(pool: Pool, userId: number, code: string): Promise<number> {
  try {
    const r = await pool.query<{ level: number }>(
      `SELECT level FROM user_talents WHERE user_id=$1 AND talent_code=$2 LIMIT 1`,
      [userId, code]
    );
    return Math.max(0, Number(r.rows?.[0]?.level || 0));
  } catch {
    // table pas migrée / pas dispo => no bonus
    return 0;
  }
}

/* =========================================================
   ✅ Bot chat helper (remplace les messages "system")
   ========================================================= */
// helper identique à chat_socket.ts
function emitChatAll(io: Server, slug: string, event: string, payload?: any) {
  const s = String(slug).trim();
  if (!s) return;
  io.to(`chat:${s}:public`).emit(event as any, payload);
  io.to(`chat:${s}:popup`).emit(event as any, payload);
}

export async function sendBotChat(
  pool: Pool,
  io: Server,
  opts: { streamerId: number; slug: string },
  body: string
) {
  const botUserId = Number(process.env.BOT_USER_ID || 0);
  const botUsername = String(process.env.BOT_USERNAME || "LunaBot");
  if (!botUserId) {
    console.warn("[calls] BOT_USER_ID missing, skip bot chat:", body);
    return;
  }

  const text = String(body || "").replace(/\r/g, "").trim().slice(0, 500);
  if (!text) return;

  const ins = await pool.query(
    `INSERT INTO chat_messages (streamer_id, user_id, username, body)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at AS "createdAt"`,
    [opts.streamerId, botUserId, botUsername, text]
  );

  const row = ins.rows?.[0];
  const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
  const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

  const msg = {
    id: Number(row?.id || 0),
    userId: botUserId,
    username: botUsername,
    body: text,
    createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    cosmetics,
    isBot: true, // ✅ utile pour le style côté front
  };

  // ✅ broadcast Luna chat
  emitChatAll(io, opts.slug, "chat:message", msg);

  // ✅ Mirror sur le chat Rumble du streamer si live actif
  void mirrorBotMessageToRumble(pool, opts.streamerId, text);
}

/**
 * Si le streamer est en live sur Rumble, tente l'envoi depuis Render puis
 * utilise automatiquement le relay résidentiel si Rumble refuse l'IP serveur.
 */
async function mirrorBotMessageToRumble(pool: Pool, streamerId: number, text: string) {
  try {
    const r = await pool.query(
      `SELECT s.platform, ri.is_live, ri.live_video_id_numeric
       FROM streamers s
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.id = $1`,
      [streamerId]
    );
    const row = r.rows?.[0];
    if (!row) return;
    if (String(row.platform || "").toLowerCase() !== "rumble") return;
    if (!row.is_live) return;
    const vid = row.live_video_id_numeric ? String(row.live_video_id_numeric) : null;
    if (!vid) return;

    await sendRumbleMessageReliable(pool, vid, String(text || "").slice(0, 200));
  } catch (e: any) {
    console.warn("[calls] mirrorBotMessageToRumble error", e?.message || e);
  }
}

async function ensurePcallSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_pcall_cooldowns (
      streamer_id INT NOT NULL,
      user_id INT NOT NULL,
      next_at_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);
}

async function getPcallNextAt(pool: Pool, streamerId: number, userId: number) {
  await ensurePcallSchema(pool);
  const r = await pool.query<{ next_at_ms: string | number }>(
    `SELECT next_at_ms FROM calls_pcall_cooldowns WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
    [streamerId, userId]
  );
  return Number(r.rows?.[0]?.next_at_ms || 0);
}

async function setPcallCooldown(pool: Pool, streamerId: number, userId: number, nextAtMs: number) {
  await ensurePcallSchema(pool);
  await pool.query(
    `INSERT INTO calls_pcall_cooldowns(streamer_id, user_id, next_at_ms)
     VALUES ($1,$2,$3)
     ON CONFLICT (streamer_id, user_id) DO UPDATE SET next_at_ms = EXCLUDED.next_at_ms`,
    [streamerId, userId, nextAtMs]
  );
}

// minimal (évite “relation hunt_sessions does not exist”)
async function ensureHuntSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hunt_sessions (
      user_id      INT PRIMARY KEY,
      phase        TEXT NOT NULL DEFAULT 'edit',
      opened       BOOLEAN NOT NULL DEFAULT FALSE,
      start        NUMERIC NULL,
      archive_id   BIGINT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getHuntMeta(pool: Pool, ownerUserId: number) {
  await ensureHuntSchema(pool);
  const r = await pool.query(`SELECT phase, opened, start FROM hunt_sessions WHERE user_id=$1`, [ownerUserId]);
  const row = r.rows?.[0];
  return {
    phase: String(row?.phase || "edit"),
    opened: !!row?.opened,
    start: row?.start == null ? null : Number(row.start),
  };
}

type PlanCode = "viewer" | "streamer";

async function hasActivePremiumViewer(pool: Pool, userId: number): Promise<boolean> {
  const r = await pool.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM user_subscriptions
      WHERE user_id = $1
        AND plan_code = 'viewer'
        AND status IN ('active','trialing')
        AND (current_period_end IS NULL OR current_period_end > NOW())
    ) AS ok;
    `,
    [userId]
  );
  return Boolean(r.rows?.[0]?.ok);
}

// TODO: tu branches quand tu auras la table de "sub à la chaîne"
async function hasChannelSub(pool: Pool, userId: number, streamerId: number): Promise<boolean> {
  return false;
}

// règle cooldown:
// - talent lvl3 OU premium viewer => 1h30 (par chaîne)
// - sub à la chaîne => 6h (cooldown partagé entre toutes les chaînes subbed)
function pcallCooldownMs(channelSub: boolean) {
  return channelSub ? 6 * 60 * 60 * 1000 : 90 * 60 * 1000;
}

// clé cooldown:
// - sub à la chaîne => scope global (streamer_id=0)
// - sinon => par chaîne
function pcallScopeStreamerId(streamerId: number, channelSub: boolean) {
  return channelSub ? 0 : streamerId;
}

export async function handleCallsCommand(opts: {
  pool: Pool;
  io: Server;

  slug: string;
  streamerId: number;
  streamerOwnerUserId: number | null;

  actorUserId: number;
  actorUsername: string;
  actorRole: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;

  cmd: string;
  arg: string;
}): Promise<{ handled: true; showOriginalInChat: boolean } | { handled: false }> {
  const {
    pool,
    io,
    slug,
    streamerId,
    streamerOwnerUserId,
    actorUserId,
    actorUsername,
    actorRole,
    canMod,
    cmd,
    arg,
  } = opts;

  // Ces deux actions sensibles se pilotent uniquement depuis l'interface.
  // On les intercepte aussi pour éviter qu'elles apparaissent comme de simples
  // messages si quelqu'un utilise encore l'ancienne commande.
  if (cmd === "bonus" || cmd === "open") {
    if (actorUserId > 0) {
      emitUserToast(io, actorUserId, {
        kind: "info",
        title: "Commande retirée",
        message: "Cette action se fait maintenant depuis l’onglet Hunt de LunaBot.",
      });
    }
    return { handled: true, showOriginalInChat: false };
  }

  const isHuntCmd = cmd === "pass" || cmd === "pay";
  const isCallCmd = cmd === "call" || cmd === "pcall" || cmd === "rcall" || cmd === "listec" || cmd === "resetc";
  if (!isCallCmd && !isHuntCmd) return { handled: false };

  const settings = await getCallsSettings(pool, streamerId);
  const showOriginalInChat = !!settings.showCmdInChat;

  // calls disabled
  if (!settings.enabled) {
    if (cmd === "listec" || cmd === "call") {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: "Calls désactivés",
        message: "Le streamer a désactivé les calls pour le moment.",
      });
    } else {
      emitUserToast(io, actorUserId, { kind: "error", title: "Calls désactivés" });
    }
    return { handled: true, showOriginalInChat };
  }

  // ──────────────────────────────────────────
  // Hunt sync gate
  // ──────────────────────────────────────────
  const ownerUserId = streamerOwnerUserId != null ? Number(streamerOwnerUserId) : null;

  async function isSyncActive(): Promise<boolean> {
    if (!settings.syncHunt) return false;
    if (!ownerUserId) return false;

    const hm = await getHuntMeta(pool, ownerUserId);
    return (Number(hm.start) || 0) > 0; // ✅ “hunt déclaré”
  }

  // ──────────────────────────────────────────
  // Permissions helpers
  // ──────────────────────────────────────────
  const canHuntControl = canMod || actorRole === "admin" || actorRole === "streamer";

  // ──────────────────────────────────────────
  // Hunt commands
  // ──────────────────────────────────────────
  if (cmd === "pass") {
    if (!canHuntControl) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Accès refusé", message: "Réservé aux mods/streamer." });
      return { handled: true, showOriginalInChat };
    }
    if (!(await isSyncActive())) {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: "Sync Hunt inactif",
        message: "Active Sync Hunt + démarre un Hunt (Start) pour utiliser !pass.",
      });
      return { handled: true, showOriginalInChat };
    }

    const cur = await findCurrentForBet(pool, streamerId);
    if (!cur) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Rien à passer", message: "Aucun call en attente." });
      return { handled: true, showOriginalInChat };
    }

    await deleteCallById(pool, streamerId, cur.id);

    await sendBotChat(pool, io, { streamerId, slug }, `⏭️ Pass: "${cur.slotName}" — supprimé de la liste.`);

    io.to(`obsview:${slug}`).emit("calls:changed", { action: "sync" });
    io.to(`chat:${slug}`).emit("calls:changed", { action: "pass" });
    io.to(`chat:${slug}`).emit("hunt:changed", { action: "pass" });

    return { handled: true, showOriginalInChat };
  }

  if (cmd === "pay") {
    if (!canHuntControl) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Accès refusé", message: "Réservé aux mods/streamer." });
      return { handled: true, showOriginalInChat };
    }
    if (!(await isSyncActive())) {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: "Sync Hunt inactif",
        message: "Active Sync Hunt + démarre un Hunt (Start) pour utiliser !pay.",
      });
      return { handled: true, showOriginalInChat };
    }

    // ensure hunt is open (sinon on pay dans le vide)
    const hm = await getHuntMeta(pool, ownerUserId!);
    if (String(hm.phase) !== "open") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Hunt pas ouvert", message: "Ouvre le hunt depuis l’interface LunaBot." });
      return { handled: true, showOriginalInChat };
    }

    const pay = Number(String(arg || "").trim().replace(",", "."));
    if (!(pay >= 0)) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Pay invalide", message: "Ex: !pay 12.5" });
      return { handled: true, showOriginalInChat };
    }

    const cur = await findCurrentForPay(pool, streamerId);
    if (!cur) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Aucune machine", message: "Plus rien à payer." });
      return { handled: true, showOriginalInChat };
    }

    await setCallPay(pool, streamerId, cur.id, pay);

    await sendBotChat(
      pool,
      io,
      { streamerId, slug },
      `💰 Pay: "${cur.slotName}"${cur.provider ? ` (${cur.provider})` : ""} — ${pay}€`
    );

    io.to(`obsview:${slug}`).emit("calls:changed", { action: "sync" });
    io.to(`chat:${slug}`).emit("calls:changed", { action: "pay" });
    io.to(`chat:${slug}`).emit("hunt:changed", { action: "pay" });

    return { handled: true, showOriginalInChat };
  }

  // ──────────────────────────────────────────
  // Existing calls commands (call/listec/resetc)
  // ──────────────────────────────────────────
  if (cmd === "resetc") {
    if (!canMod) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Accès refusé", message: "Réservé aux modérateurs." });
      return { handled: true, showOriginalInChat };
    }

    await resetCalls(pool, streamerId);

    await sendBotChat(pool, io, { streamerId, slug }, `🧹 Calls reset par @${actorUsername}`);

    io.to(`obsview:${slug}`).emit("calls:changed", { action: "sync" });
    io.to(`chat:${slug}`).emit("calls:changed", { action: "reset" });
    io.to(`chat:${slug}`).emit("hunt:changed", { action: "reset" });

    return { handled: true, showOriginalInChat };
  }

  if (cmd === "listec") {
    if (!settings.allowListec) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Commande désactivée" });
      return { handled: true, showOriginalInChat };
    }

    const max = Math.max(1, Math.min(50, Number(settings.listecMax || 10)));
    const items = await listCalls(pool, streamerId, max + 1, 0);

    if (!items.length) {
      await sendBotChat(pool, io, { streamerId, slug }, `📋 Calls: aucun call en file.`);
      return { handled: true, showOriginalInChat };
    }

    const extra = items.length > max ? items.length - max : 0;
    const view = items.slice(0, max);

    const line = view
      .map((x, i) => `${i + 1}) ${x.slotName}${x.provider ? ` (${x.provider})` : ""} — @${x.username}`)
      .join(" • ");

    await sendBotChat(pool, io, { streamerId, slug }, `📋 Calls: ${line}${extra ? ` • … +${extra}` : ""}`);

    return { handled: true, showOriginalInChat };
  }

  // cmd === call
  if (await isUserBannedFromCalls(pool, streamerId, actorUserId, actorUsername)) {
    emitUserToast(io, actorUserId, {
      kind: "error",
      title: "Call refusé",
      message: "Tu ne peux pas utiliser les calls.",
    });
    return { handled: true, showOriginalInChat };
  }

  const raw = normText(arg);
  if (!raw) {
    emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Ex: !call Fruit Party" });
    return { handled: true, showOriginalInChat };
  }

  // limit (mods/streamer/admin => pas de limite)
  // viewers DLive (actorUserId=0) => bypassLimit dans addCall car on fait le check ici par username
  const isDliveViewer = actorUserId === 0;
  const bypassLimit = canMod || actorRole === "admin" || actorRole === "streamer" || isDliveViewer;

  let lim = effectiveLimit(settings.perUserLimit);

  // talent_calls_limit => ajoute des slots par rapport à la limite streamer
  // (pas applicable aux viewers DLive sans compte Luna)
  if (!isDliveViewer && !bypassLimit && lim > 0) {
    const level = await getUserTalentLevel(pool, actorUserId, CALLS_TALENT_CODE);
    const bonus = callsLimitBonusFromLevel(level);
    lim = lim + bonus;
  }

  // Pour les viewers DLive, on vérifie la limite par username (pas par userId=0 partagé)
  if (isDliveViewer && lim > 0 && actorUsername) {
    const n = await countUserCallsByUsername(pool, streamerId, actorUsername);
    if (n >= lim) {
      await sendBotChat(pool, io, { streamerId, slug }, `❌ @${actorUsername} : tu as déjà ${n}/${lim} calls en file.`);
      return { handled: true, showOriginalInChat };
    }
  } else if (!bypassLimit && lim > 0) {
    const n = await countUserCalls(pool, streamerId, actorUserId);
    if (n >= lim) {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: "Limite atteinte",
        message: `Tu as déjà ${n}/${lim} calls en file.`,
      });
      return { handled: true, showOriginalInChat };
    }
  }

  // ──────────────────────────────────────────
  // pcall (paycall): unlock lvl 3 + cooldown 1h30 + insertion 2e
  // ──────────────────────────────────────────
  const isPcall = cmd === "pcall";
  const isRcall = cmd === "rcall";

  if (isPcall || isRcall) {
    const level = await getUserTalentLevel(pool, actorUserId, CALLS_TALENT_CODE);

    const premiumViewer = await hasActivePremiumViewer(pool, actorUserId);
    const channelSub = await hasChannelSub(pool, actorUserId, streamerId);

    const unlocked = premiumViewer || channelSub || Number(level) >= 3;

    if (!unlocked) {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: isPcall ? "Pay Call verrouillé" : "Random Call verrouillé",
        message: "Il faut talent Calls niveau 3, être sub à la chaîne, ou avoir Premium viewer.",
      });
      return { handled: true, showOriginalInChat };
    }

    const scopeId = pcallScopeStreamerId(streamerId, channelSub);
    const nextAt = await getPcallNextAt(pool, scopeId, actorUserId);
    const now = Date.now();

    if (nextAt && now < nextAt) {
      const leftMin = Math.max(1, Math.ceil((nextAt - now) / 60000));
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: (isPcall ? "Pay Call" : "Random Call") + " en cooldown",
        message: `Reviens dans ${leftMin} min.`,
      });
      return { handled: true, showOriginalInChat };
    }

    // Random call = placeholder pour l’instant (pas de logique de choix encore)
    if (isRcall) {
      emitUserToast(io, actorUserId, { kind: "info", title: "🎲 Random Call", message: "Bientôt dispo." });

      // on met quand même le cooldown (même gate que pcall)
      await setPcallCooldown(pool, scopeId, actorUserId, now + pcallCooldownMs(channelSub));
      return { handled: true, showOriginalInChat };
    }
  }

  // resolve slot (exact ou fuzzy)
  const resolved = await resolveSlot(pool, raw);
  if (!resolved) {
    emitUserToast(io, actorUserId, {
      kind: "error",
      title: "Machine introuvable",
      message: "Essaie un nom plus précis.",
    });
    return { handled: true, showOriginalInChat };
  }

  const add = await addCall(pool, streamerId, actorUserId, actorUsername, resolved.name, resolved.provider, {
    bypassLimit,
    perUserLimit: lim,
    insertAfterCurrent: cmd === "pcall",
  });

  if (!add.ok) {
    const m = add.error;
    if (m === "already_in_queue")
      emitUserToast(io, actorUserId, { kind: "error", title: "Déjà en file", message: "Cette machine est déjà call." });
    else if (m === "limit_reached")
      emitUserToast(io, actorUserId, { kind: "error", title: "Limite atteinte", message: "Tu as atteint ta limite de calls." });
    else if (m === "user_banned")
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Tu ne peux pas utiliser les calls." });
    else if (m === "slot_banned")
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Machine interdite." });
    else if (m === "provider_banned")
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Provider interdit." });
    else if (m === "provider_not_allowed")
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Ce provider n’est pas autorisé ici." });
    else emitUserToast(io, actorUserId, { kind: "error", title: "Erreur", message: "Impossible d'ajouter le call." });
    return { handled: true, showOriginalInChat };
  }

  if (cmd === "pcall") {
    const channelSub = await hasChannelSub(pool, actorUserId, streamerId);
    const scopeId = pcallScopeStreamerId(streamerId, channelSub);
    await setPcallCooldown(pool, scopeId, actorUserId, Date.now() + pcallCooldownMs(channelSub));
  }

  if (settings.showAcceptPublic) {
    await sendBotChat(
      pool,
      io,
      { streamerId, slug },
      `🎰 Call ajouté : "${add.item.slotName}"${add.item.provider ? ` (${add.item.provider})` : ""} — @${actorUsername}`
    );
  }

  io.to(`obsview:${slug}`).emit("calls:changed", { action: "add" });
  io.to(`chat:${slug}`).emit("calls:changed", { action: "add" });

  // si sync active => hunt UI est la même liste, donc on ping aussi hunt:changed
  if (await isSyncActive()) {
    io.to(`chat:${slug}`).emit("hunt:changed", { action: "add" });
  }

  return { handled: true, showOriginalInChat };
}
