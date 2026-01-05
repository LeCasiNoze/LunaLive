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

        for (const row of r.rows) {
          const msg: ChatMsg = {
            id: Number(row.id),
            streamerId: Number(row.streamer_id),
            userId: Number(row.user_id),
            username: String(row.username),
            body: String(row.body),
            createdAt: new Date(row.created_at).toISOString()
          };
          this.lastId = Math.max(this.lastId, msg.id);
          await onMessage(msg);
        }
      } catch (e) {
        // on laisse tourner, ça retentera au poll suivant
      }
    };

    this.timer = setInterval(poll, this.env.BOT_CHAT_POLL_MS);
    void poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async send(text: string) {
    const body = String(text || "").trim();
    if (!body) return;

    const botUserId = this.env.BOT_USER_ID ?? 1;
    const botUsername = this.env.BOT_USERNAME;

    // NOTE: ça écrit en DB (historique). Si ton chat live est uniquement broadcast via socket,
    // on branchera plus tard un endpoint interne API pour broadcast instantané.
    await this.pool.query(
      `INSERT INTO chat_messages(streamer_id, user_id, username, body)
       VALUES ($1, $2, $3, $4)`,
      [this.streamer.id, botUserId, botUsername, body]
    );
  }
}
