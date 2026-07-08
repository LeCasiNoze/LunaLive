import { createClipForStreamer, normalizeClipTitle } from "../../shared/clip_service.js";
export async function tryHandleClipCommand(p) {
    const { msg, prefix } = p;
    const body = String(msg.body || "").trim();
    if (!body.startsWith(prefix))
        return false;
    const raw = body.slice(prefix.length).trimStart();
    if (!/^clip(\s|$)/i.test(raw))
        return false;
    const allowEveryone = p.allowEveryone ?? true;
    if (!allowEveryone)
        return false;
    const title = normalizeClipTitle(raw.replace(/^clip\s*/i, ""));
    try {
        const res = await createClipForStreamer({
            pool: p.pool,
            streamerId: p.streamer.id,
            title: title || null,
            author: msg.username || null,
        });
        if (!res.ok) {
            if (res.reason === "duplicate") {
                await p.send("— 🎬 Clip déjà noté (fenêtre proche).");
            }
            else if (res.reason === "live_not_active") {
                await p.send("— ⏹️ Clip: pas de live détecté (aucun timecode).");
            }
            else {
                await p.send(`— ❌ Clip: erreur (${res.reason})`);
            }
            return true;
        }
        // L'ancien calcul d'offset était cassé (toujours 30s = "00:30"). Suppression :
        // on s'aligne sur le format du bridge Rumble qui affiche juste le titre.
        await p.send(`— 🎬 Clip enregistré${title ? ` : "${title}"` : ""}`);
        return true;
    }
    catch (e) {
        await p.send(`— ❌ Clip: erreur (${e?.message || "inconnue"})`);
        return true;
    }
}
