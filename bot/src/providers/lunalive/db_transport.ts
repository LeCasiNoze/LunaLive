import type { Pool } from "pg";
import type { ChatMsg, StreamerRow } from "../../core/types.js";
import type { BotEnv } from "../../env.js";

type OnMessage = (m: ChatMsg) => void | Promise<void>;

export class LunaLiveDbTransport {
  private timer: NodeJS.Timeout | null = null;
  private lastId = 0;

  constructor(
    private pool: Pool,
    private env: BotEnv,
    private streamer: StreamerRow
  ) {}

  start(onMessage: OnMessage) {
    if (this.timer) return;

    const init = async () => {
      try {
        // démarre “au présent” (évite de reprocess tout l’historique)
        const r = await this.pool.query(
          `SELECT COALESCE(MAX(id), 0) AS max_id
           FROM chat_messages
           WHERE streamer_id = $1`,
          [this.streamer.id]
        );
        const maxId = Number(r.rows?.[0]?.max_id ?? 0);
        this.lastId = Number.isFinite(maxId) ? maxId : 0;
        console.log(
          `[bot] chat transport start streamer=${this.streamer.id} lastId=${this.lastId}`
        );
      } catch (e: any) {
        console.warn(
          `[bot] chat transport init failed streamer=${this.streamer.id}: ${String(
            e?.message ?? e
          )}`
        );
      }
    };

    const poll = async () => {
      try {
        const r = await this.pool.query(
          `SELECT id, streamer_id, user_id, username, body, created_at
           FROM chat_messages
           WHERE streamer_id=$1 AND id > $2 AND deleted_at IS NULL
           ORDER BY id ASC
           LIMIT $3`,
          [this.streamer.id, this.lastId, this.env.BOT_CHAT_BATCH]
        );

        if (r.rows?.length) {
          console.log(
            `[bot] chat poll streamer=${this.streamer.id} got=${r.rows.length} (from>${this.lastId})`
          );
        }

        for (const row of r.rows) {
          const msg: ChatMsg = {
            id: Number(row.id),
            streamerId: Number(row.streamer_id),
            userId: Number(row.user_id),
            username: String(row.username),
            body: String(row.body),
            createdAt: new Date(row.created_at).toISOString(),
          };

          this.lastId = Math.max(this.lastId, msg.id);

          // ✅ log minimal pour debug commandes
          if (msg.body.startsWith("!")) {
            console.log(
              `[bot] chat cmd streamer=${msg.streamerId} #${msg.id} ${msg.username}: ${msg.body}`
            );
          }

          await onMessage(msg);
        }
      } catch (e: any) {
        console.warn(
          `[bot] chat poll failed streamer=${this.streamer.id}: ${String(
            e?.message ?? e
          )}`
        );
      }
    };

    void init().then(() => {
      this.timer = setInterval(poll, this.env.BOT_CHAT_POLL_MS);
      void poll();
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sendViaDb(body: string) {
    const botUserId = this.env.BOT_USER_ID ?? 1;
    const botUsername = this.env.BOT_USERNAME;

    await this.pool.query(
      `INSERT INTO chat_messages(streamer_id, user_id, username, body)
       VALUES ($1, $2, $3, $4)`,
      [this.streamer.id, botUserId, botUsername, body]
    );
  }

  async send(text: string) {
    const body = String(text || "").trim();
    if (!body) return;

    // 🔥 Pour l’instant: si tu n’as pas encore branché un broadcast API,
    // on écrit en DB (au moins tu verras la ligne en base).
    // (Après on fera l’envoi live via endpoint interne.)
    try {
      await this.sendViaDb(body);
      console.log(`[bot] chat send (db) streamer=${this.streamer.id}: ${body}`);
    } catch (e: any) {
      console.warn(
        `[bot] chat send failed streamer=${this.streamer.id}: ${String(
          e?.message ?? e
        )}`
      );
    }
  }
}
