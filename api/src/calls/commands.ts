// api/src/calls/commands.ts
import type { Pool } from "pg";
import type { Server } from "socket.io";
import { emitUserToast } from "./toast.js";
import { resolveSlot } from "./catalog.js";
import {
  addCall,
  countUserCalls,
  deleteCallById,
  effectiveLimit,
  getCallsSettings,
  isProviderBanned,
  isSlotBanned,
  isUserBannedFromCalls,
  listCalls,
  resetCalls,
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
  | { handled: true; showOriginalInChat: boolean } // handled & should we still send the original message?
  | { handled: false }
> {
  const { pool, io, slug, streamerId, actorUserId, actorUsername, actorRole, canMod, cmd, arg } = opts;

  if (cmd !== "call" && cmd !== "listec" && cmd !== "resetc") return { handled: false };

  const settings = await getCallsSettings(pool, streamerId);
  const showOriginalInChat = !!settings.showCmdInChat; // option future, par défaut false

  // calls disabled
  if (!settings.enabled) {
    if (cmd === "listec" || cmd === "call") {
      emitUserToast(io, actorUserId, {
        kind: "error",
        title: "Calls désactivés",
        message: "Le streamer a désactivé les calls pour le moment.",
      });
    }
    if (cmd === "resetc") {
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
  // bans
  if (await isUserBannedFromCalls(pool, streamerId, actorUserId)) {
    emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Tu ne peux pas utiliser les calls." });
    return { handled: true, showOriginalInChat };
  }

  const raw = normText(arg);
  if (!raw) {
    emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Ex: !call Fruit Party" });
    return { handled: true, showOriginalInChat };
  }

  // limit (mods/streamer/admin => pas de limite, selon ton “mods peuvent tout faire”)
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
    emitUserToast(io, actorUserId, { kind: "error", title: "Machine introuvable", message: "Essaie un nom plus précis." });
    return { handled: true, showOriginalInChat };
  }

  // slot/provider bans
  // (slotKey check se fait côté addCall via unique + key; mais ban doit checker key)
  const slotKey = resolved.name.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  if (await isSlotBanned(pool, streamerId, slotKey)) {
    emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Machine interdite." });
    return { handled: true, showOriginalInChat };
  }
  if (resolved.provider && (await isProviderBanned(pool, streamerId, resolved.provider))) {
    emitUserToast(io, actorUserId, { kind: "error", title: "Call refusé", message: "Provider interdit." });
    return { handled: true, showOriginalInChat };
  }

  // insert
  const r = await pool.query("BEGIN");
  try {
    const add = await addCall(pool, streamerId, actorUserId, actorUsername, resolved.name, resolved.provider);
    if (!add.ok) {
      await pool.query("ROLLBACK");
      if (add.error === "already_in_queue") {
        emitUserToast(io, actorUserId, { kind: "error", title: "Déjà en file", message: "Cette machine est déjà call." });
        return { handled: true, showOriginalInChat };
      }
      emitUserToast(io, actorUserId, { kind: "error", title: "Erreur", message: "Impossible d'ajouter le call." });
      return { handled: true, showOriginalInChat };
    }

    await pool.query("COMMIT");

    if (settings.showAcceptPublic) {
      const sys = chatStore.addSystem(
        slug,
        `🎰 Call ajouté : "${add.item.slotName}"${add.item.provider ? ` (${add.item.provider})` : ""} — @${actorUsername}`
      );
      io.to(`chat:${slug}`).emit("chat:message", sys);
    }

    io.to(`chat:${slug}`).emit("calls:changed", { action: "add" });

    return { handled: true, showOriginalInChat };
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    emitUserToast(io, actorUserId, { kind: "error", title: "Erreur", message: "Impossible d'ajouter le call." });
    return { handled: true, showOriginalInChat };
  }
}
