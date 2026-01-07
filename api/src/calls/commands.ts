// api/src/calls/commands.ts
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { emitUserToast } from "./toast.js";
import { resolveSlot } from "./catalog.js";
import {
  addCall,
  countUserCalls,
  effectiveLimit,
  getCallsSettings,
  listCalls,
  resetCalls,
  isUserBannedFromCalls,
} from "./queue.js";
import { normText } from "./normalize.js";
import { chatStore } from "../chat_store.js";

export function parseBangCommand(text: string): { cmd: string; arg: string } | null {
  const s = normText(text);
  if (!s.startsWith("!")) return null;
  const m = s.match(/^!([a-z0-9_-]+)\s*(.*)$/i);
  if (!m) return null;
  return { cmd: String(m[1] || "").toLowerCase(), arg: String(m[2] || "") };
}

export async function handleCallsCommand(opts: {
  pool: Pool;
  io: Server;

  slug: string;
  streamerId: number;

  actorUserId: number;
  actorUsername: string;
  actorRole: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;

  cmd: string;
  arg: string;
}): Promise<
  | { handled: true; showOriginalInChat: boolean }
  | { handled: false }
> {
  const { pool, io, slug, streamerId, actorUserId, actorUsername, actorRole, canMod, cmd, arg } = opts;

  if (cmd !== "call" && cmd !== "listec" && cmd !== "resetc") return { handled: false };

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

  // permissions
  if (cmd === "resetc") {
    if (!canMod) {
      emitUserToast(io, actorUserId, { kind: "error", title: "Accès refusé", message: "Réservé aux modérateurs." });
      return { handled: true, showOriginalInChat };
    }

    await resetCalls(pool, streamerId);

    const sys = chatStore.addSystem(slug, `🧹 Calls reset par @${actorUsername}`);
    io.to(`chat:${slug}`).emit("chat:message", sys);
    io.to(`chat:${slug}`).emit("calls:changed", { action: "reset" });

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
      const sys = chatStore.addSystem(slug, `📋 Calls: aucun call en file.`);
      io.to(`chat:${slug}`).emit("chat:message", sys);
      return { handled: true, showOriginalInChat };
    }

    const extra = items.length > max ? items.length - max : 0;
    const view = items.slice(0, max);

    const line = view
      .map((x, i) => `${i + 1}) ${x.slotName}${x.provider ? ` (${x.provider})` : ""} — @${x.username}`)
      .join(" • ");

    const sys = chatStore.addSystem(slug, `📋 Calls: ${line}${extra ? ` • … +${extra}` : ""}`);
    io.to(`chat:${slug}`).emit("chat:message", sys);

    return { handled: true, showOriginalInChat };
  }

  // cmd === call
  // user banned (ban_key username / userId) => passe username pour être exact
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
  const lim = effectiveLimit(settings.perUserLimit);
  const bypassLimit = canMod || actorRole === "admin" || actorRole === "streamer";
  if (!bypassLimit && lim > 0) {
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

  // add (gère bans slot/provider/policy/limit côté addCall aussi)
  const add = await addCall(pool, streamerId, actorUserId, actorUsername, resolved.name, resolved.provider, {
    bypassLimit,
  });

  if (!add.ok) {
    if (add.error === "already_in_queue") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Déjà en file", message: "Cette machine est déjà call." });
      return { handled: true, showOriginalInChat };
    }
    if (add.error === "limit_reached") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Limite atteinte", message: "Tu as atteint ta limite de calls." });
      return { handled: true, showOriginalInChat };
    }
    if (add.error === "user_banned") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Tu ne peux pas utiliser les calls." });
      return { handled: true, showOriginalInChat };
    }
    if (add.error === "slot_banned") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Machine interdite." });
      return { handled: true, showOriginalInChat };
    }
    if (add.error === "provider_banned") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Provider interdit." });
      return { handled: true, showOriginalInChat };
    }
    if (add.error === "provider_not_allowed") {
      emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Ce provider n’est pas autorisé ici." });
      return { handled: true, showOriginalInChat };
    }

    emitUserToast(io, actorUserId, { kind: "error", title: "Erreur", message: "Impossible d'ajouter le call." });
    return { handled: true, showOriginalInChat };
  }

  if (settings.showAcceptPublic) {
    const sys = chatStore.addSystem(
      slug,
      `🎰 Call ajouté : "${add.item.slotName}"${add.item.provider ? ` (${add.item.provider})` : ""} — @${actorUsername}`
    );
    io.to(`chat:${slug}`).emit("chat:message", sys);
  }

  io.to(`chat:${slug}`).emit("calls:changed", { action: "add" });

  return { handled: true, showOriginalInChat };
}
