const log = (...args: unknown[]) => console.log("[aurix.nivora-refills]", ...args);

type NivoraBatchResponse = {
  empty?: boolean;
  batch?: { id: string; cutoff_at: string };
  requests?: Array<{
    amount: number | string;
    wager: string | null;
    casino_email: string;
    casino_username: string;
    brand: { name: string } | null;
    profile: { username: string } | null;
  }>;
};

type NivoraCompletionResponse = {
  empty: boolean;
  notifications?: Array<{
    brandName: string;
    amount: number;
    discordUserId: string;
    ticketChannelId: string;
  }>;
};

export type NivoraRefillBatch = {
  id: string;
  requests: NonNullable<NivoraBatchResponse["requests"]>;
};

function enabled() {
  return process.env.NIVORA_REFILLS_VIA_AURIX === "1";
}

function config() {
  const base = process.env.NIVORA_API_BASE?.replace(/\/$/, "");
  const key = process.env.NIVORA_BOT_INTERNAL_KEY;
  return base && key ? { base, key } : null;
}

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Nivora refill bridge is not configured.");
  const response = await fetch(`${cfg.base}/api/internal/discord`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nivora-bot-key": cfg.key },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Nivora API returned ${response.status}.`);
  return data as T;
}

export async function pendingNivoraRefills(): Promise<NivoraRefillBatch | null> {
  if (!enabled()) return null;
  const result = await request<NivoraBatchResponse>({ action: "refill-batch" });
  if (result.empty || !result.batch || !result.requests?.length) return null;
  return { id: result.batch.id, requests: result.requests };
}

export async function markNivoraBatchSent(batchId: string): Promise<void> {
  if (!enabled()) return;
  await request({ action: "mark-refill-batch-sent", batchId });
}

async function notifyNivoraTicket(notification: NonNullable<NivoraCompletionResponse["notifications"]>[number]) {
  const token = process.env.NIVORA_DISCORD_BOT_TOKEN;
  if (!token) throw new Error("NIVORA_DISCORD_BOT_TOKEN is not configured for refill completion.");
  const response = await fetch(`https://discord.com/api/v10/channels/${notification.ticketChannelId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bot ${token}` },
    body: JSON.stringify({
      content: `<@${notification.discordUserId}>`,
      allowed_mentions: { users: [notification.discordUserId] },
      embeds: [{
        color: 0x35D6B5,
        title: "Refill completed",
        description: `Your ${notification.brandName} refill of EUR ${notification.amount.toFixed(2)} has been completed.`,
      }],
    }),
  });
  if (!response.ok) throw new Error(`Discord ticket notification failed (${response.status}).`);
}

export async function completeNivoraBatchAndNotify(): Promise<{ completed: boolean; notified: number }> {
  if (!enabled()) return { completed: false, notified: 0 };
  const result = await request<NivoraCompletionResponse>({ action: "complete-refill-batch" });
  if (result.empty) return { completed: false, notified: 0 };
  let notified = 0;
  for (const notification of result.notifications ?? []) {
    try {
      await notifyNivoraTicket(notification);
      notified += 1;
    } catch (error) {
      log("Nivora ticket notification skipped", notification.ticketChannelId, error);
    }
  }
  return { completed: true, notified };
}
