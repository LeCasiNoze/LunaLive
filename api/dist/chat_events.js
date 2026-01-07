import { chatStore } from "./chat_store.js";
export function emitSystemChat(io, slug, text) {
    if (!io)
        return;
    const msg = chatStore.addSystem(String(slug), String(text));
    io.to(`chat:${String(slug)}`).emit("chat:message", msg);
}
export function formatSubSystemMessage(p) {
    const months = Math.max(1, Math.floor(Number(p.months ?? 1) || 1));
    const dur = months === 1 ? "1 mois" : `${months} mois`;
    const origin = p.origin ? ` — origine: ${p.origin}` : "";
    if (p.giftedBy) {
        return `🎁 ${p.giftedBy} offre un SUB (${dur}) à ${p.user} sur ${p.streamer}${origin}`;
    }
    return `⭐ ${p.user} s’abonne à ${p.streamer} (${dur})${origin}`;
}
