// Envoi de la liste refill au manager via Telegram Bot API (officielle, REST).
// Pas de dependance externe — utilise fetch natif Node.
const log = (...a) => console.log("[aurix.telegram]", ...a);
const logError = (...a) => console.error("[aurix.telegram]", ...a);
const TG_API_BASE = "https://api.telegram.org";
const TG_MSG_MAX_LEN = 4096;
function getCreds() {
    const token = (process.env.AURIX_TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (process.env.AURIX_TELEGRAM_REFILL_CHAT_ID || "").trim();
    if (!token || !chatId)
        return null;
    return { token, chatId };
}
export function isTelegramConfigured() {
    return getCreds() !== null;
}
function chunkByLines(text, max = TG_MSG_MAX_LEN - 100) {
    if (text.length <= max)
        return [text];
    const lines = text.split("\n");
    const chunks = [];
    let cur = "";
    for (const line of lines) {
        if ((cur ? cur.length + 1 : 0) + line.length > max) {
            if (cur)
                chunks.push(cur);
            // Si la ligne seule depasse max (rare), on coupe brutalement.
            if (line.length > max) {
                for (let i = 0; i < line.length; i += max) {
                    chunks.push(line.slice(i, i + max));
                }
                cur = "";
            }
            else {
                cur = line;
            }
        }
        else {
            cur = cur ? `${cur}\n${line}` : line;
        }
    }
    if (cur)
        chunks.push(cur);
    return chunks;
}
async function sendOne(token, chatId, text) {
    try {
        const r = await fetch(`${TG_API_BASE}/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
            }),
        });
        const j = (await r.json().catch(() => ({})));
        if (!r.ok || j.ok === false) {
            return { ok: false, reason: `HTTP ${r.status} ${j.description ?? ""}`.trim() };
        }
        return { ok: true };
    }
    catch (e) {
        return { ok: false, reason: String(e) };
    }
}
/** Envoie un texte (eventuellement long) en plusieurs messages Telegram. */
export async function sendTelegramText(text) {
    const creds = getCreds();
    if (!creds)
        return { ok: false, reason: "AURIX_TELEGRAM_* env vars non configurees" };
    const chunks = chunkByLines(text);
    for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : "";
        const res = await sendOne(creds.token, creds.chatId, prefix + chunks[i]);
        if (!res.ok)
            return res;
    }
    return { ok: true };
}
function parseEur(s) {
    if (!s)
        return null;
    const m = s.match(/[\d][\d\s.,]*/);
    if (!m)
        return null;
    const raw = m[0].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
}
function buildRefillMessage(args) {
    const lines = [];
    lines.push(`Bonjour ${args.managerMention} 👋`);
    lines.push("");
    lines.push(`Voici la liste des refills pour aujourd'hui, ${args.dayDateFr} :`);
    lines.push("");
    // Groupe par montant. Clef = amount STRING (preserve la forme '1000€').
    const groups = new Map();
    for (const it of args.items) {
        const k = (it.amount && it.amount.trim()) || args.fixedAmount;
        if (!groups.has(k))
            groups.set(k, []);
        groups.get(k).push(it);
    }
    // Tri des groupes : par montant parse, DESC (les gros refills en premier).
    const sortedKeys = [...groups.keys()].sort((a, b) => (parseEur(b) ?? 0) - (parseEur(a) ?? 0));
    for (const k of sortedKeys) {
        const group = groups.get(k);
        const plural = group.length > 1 ? "s" : "";
        lines.push(`💰 ${group.length} demande${plural} — refill : ${k}`);
        lines.push("");
        group.forEach((it, i) => {
            const wagerTxt = (it.wager && it.wager.trim()) || "no wag";
            const amountTxt = (it.amount && it.amount.trim()) || args.fixedAmount;
            const email = it.email || "-";
            // Format demande:  "1. dealjb : xxxx@hotmail.com — 1000€ (no wag)"
            lines.push(`${i + 1}. ${it.displayName} : ${email} — ${amountTxt} (${wagerTxt})`);
        });
        lines.push("");
    }
    lines.push("");
    lines.push("Merci d'avance pour le traitement.");
    lines.push("Si vous le souhaitez vous pouvez notifier les streamers que leur refill est fait avec /done :)");
    lines.push("");
    lines.push("Bonne journée à vous ! ☀️");
    lines.push("");
    lines.push("— Aurix");
    return lines.join("\n");
}
let listenerStarted = false;
export function startTelegramListener(handler) {
    if (listenerStarted)
        return;
    listenerStarted = true;
    void runListenerLoop(handler);
    log("Telegram listener démarré (long-polling).");
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function runListenerLoop(handler) {
    for (;;) {
        if (!isTelegramConfigured()) {
            await sleep(60_000);
            continue;
        }
        try {
            await pollOnce(handler);
        }
        catch (e) {
            logError("listener poll error:", e);
            await sleep(5_000);
        }
    }
}
async function pollOnce(handler) {
    const creds = getCreds();
    if (!creds)
        return;
    const { kvGet, kvSet } = await import("./db.js");
    const offsetStr = await kvGet("telegram_update_offset");
    const offset = offsetStr ? Number(offsetStr) : 0;
    const url = `${TG_API_BASE}/bot${creds.token}/getUpdates` +
        `?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent('["message"]')}`;
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({})));
    if (!j.ok || !Array.isArray(j.result))
        return;
    for (const u of j.result) {
        const newOffset = u.update_id + 1;
        await kvSet("telegram_update_offset", String(newOffset));
        const msg = u.message;
        if (!msg || !msg.text || !msg.chat)
            continue;
        // Securite: ne traite que les messages venant du chat autorise.
        if (String(msg.chat.id) !== creds.chatId)
            continue;
        try {
            await handler(msg.text);
        }
        catch (e) {
            logError("handler error:", e);
        }
    }
}
/**
 * Construit + envoie le message refill du jour au manager Telegram.
 * Retourne { ok } pour que le caller puisse decider de la suite (auto-mark
 * batch sent, notifier les tickets, etc).
 */
export async function sendRefillBatchToTelegram(args) {
    if (!isTelegramConfigured()) {
        log("Telegram non configure (skip).");
        return { ok: false, reason: "telegram_not_configured" };
    }
    const text = buildRefillMessage(args);
    const res = await sendTelegramText(text);
    if (res.ok) {
        log(`Refill batch #${args.batchId} envoye sur Telegram (${args.count} demandes).`);
    }
    else {
        logError(`Echec envoi Telegram batch #${args.batchId}: ${res.reason}`);
    }
    return res;
}
