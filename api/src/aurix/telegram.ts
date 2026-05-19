// Envoi de la liste refill au manager via Telegram Bot API (officielle, REST).
// Pas de dependance externe — utilise fetch natif Node.

const log = (...a: unknown[]) => console.log("[aurix.telegram]", ...a);
const logError = (...a: unknown[]) => console.error("[aurix.telegram]", ...a);

const TG_API_BASE = "https://api.telegram.org";
const TG_MSG_MAX_LEN = 4096;

type TelegramSendResult = { ok: true } | { ok: false; reason: string };

function getCreds(): { token: string; chatId: string } | null {
  const token = (process.env.AURIX_TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.AURIX_TELEGRAM_REFILL_CHAT_ID || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function isTelegramConfigured(): boolean {
  return getCreds() !== null;
}

function chunkByLines(text: string, max = TG_MSG_MAX_LEN - 100): string[] {
  if (text.length <= max) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if ((cur ? cur.length + 1 : 0) + line.length > max) {
      if (cur) chunks.push(cur);
      // Si la ligne seule depasse max (rare), on coupe brutalement.
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) {
          chunks.push(line.slice(i, i + max));
        }
        cur = "";
      } else {
        cur = line;
      }
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function sendOne(token: string, chatId: string, text: string): Promise<TelegramSendResult> {
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
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!r.ok || j.ok === false) {
      return { ok: false, reason: `HTTP ${r.status} ${j.description ?? ""}`.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/** Envoie un texte (eventuellement long) en plusieurs messages Telegram. */
export async function sendTelegramText(text: string): Promise<TelegramSendResult> {
  const creds = getCreds();
  if (!creds) return { ok: false, reason: "AURIX_TELEGRAM_* env vars non configurees" };

  const chunks = chunkByLines(text);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : "";
    const res = await sendOne(creds.token, creds.chatId, prefix + chunks[i]);
    if (!res.ok) return res;
  }
  return { ok: true };
}

/**
 * Construit + envoie le message refill du jour au manager Telegram.
 * No-op + warn log si vars Telegram pas configurees (le cutoff Discord
 * continue de fonctionner normalement).
 */
export async function sendRefillBatchToTelegram(args: {
  batchId: number;
  cutoffLocal: string;
  zone: string;
  managerMention: string;
  plainList: string; // deja formate (buildPlainListForManager)
  fixedAmount: string;
  count: number;
}): Promise<void> {
  if (!isTelegramConfigured()) {
    log("Telegram non configure (skip).");
    return;
  }

  const header = [
    `🔔 Aurix — Refills du jour`,
    `Batch #${args.batchId} verrouille a ${args.cutoffLocal} (${args.zone}).`,
    `Manager: ${args.managerMention}`,
    `${args.count} demande(s) x ${args.fixedAmount}.`,
    "",
  ].join("\n");

  const fullText = header + args.plainList;
  const res = await sendTelegramText(fullText);
  if (res.ok) {
    log(`Refill batch #${args.batchId} envoye sur Telegram (${args.count} demandes).`);
  } else {
    logError(`Echec envoi Telegram batch #${args.batchId}: ${res.reason}`);
  }
}
