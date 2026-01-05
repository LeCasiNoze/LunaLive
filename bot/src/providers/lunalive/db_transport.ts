import type { Pool } from "pg";
import type { ChatMsg, StreamerRow } from "../../core/types.js";
import type { BotEnv } from "../../env.js";

type OnMessage = (m: ChatMsg) => void | Promise<void>;

export class LunaLiveDbTransport {
  private timer: NodeJS.Timeout | null = null;
  private starting = false;
  private lastId = 0;
  private lastErrLogAt = 0;

  constructor(
    private pool: Pool,
    private env: BotEnv,
    private streamer: StreamerRow
  ) {}

  start(onMessage: OnMessage) {
    if (this.timer || this.starting) return;
    this.starting = true;

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
            createdAt: new Date(row.created_at).toISOString(),
          };
          this.lastId = Math.max(this.lastId, msg.id);
          await onMessage(msg);
        }
      } catch (e: any) {
        const now = Date.now();
        if (now - this.lastErrLogAt > 5000) {
          this.lastErrLogAt = now;
          console.log("[bot] db_transport poll failed", e?.message || e);
        }
      }
    };

    void (async () => {
      try {
        if (this.env.BOT_CHAT_START_FROM_NOW) {
          const r = await this.pool.query(
            `SELECT COALESCE(MAX(id),0) AS id
             FROM chat_messages
             WHERE streamer_id=$1 AND deleted_at IS NULL`,
            [this.streamer.id]
          );
          this.lastId = Number(r.rows?.[0]?.id || 0);
        }
      } catch (e: any) {
        console.log("[bot] db_transport init lastId failed", e?.message || e);
      } finally {
        this.timer = setInterval(poll, this.env.BOT_CHAT_POLL_MS);
        this.starting = false;
        void poll();
        console.log("[bot] db_transport started", {
          slug: this.streamer.slug,
          streamerId: this.streamer.id,
          lastId: this.lastId,
          pollMs: this.env.BOT_CHAT_POLL_MS,
        });
      }
    })();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.starting = false;
  }

  async send(text: string) {
    const body = String(text || "").trim();
    if (!body) return;

    const base = String(this.env.BOT_API_BASE || "").replace(/\/$/, "");
    const key = String(this.env.BOT_INTERNAL_KEY || "");
    if (!base || !key) {
      console.log("[bot] send skipped: BOT_API_BASE or BOT_INTERNAL_KEY missing");
      return;
    }

    const url = `${base}/internal/bot/chat/send`;

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bot-key": key,
        },
        body: JSON.stringify({
          streamerId: this.streamer.id,
          body,
        }),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.log("[bot] send failed", r.status, t.slice(0, 300));
      }
    } catch (e: any) {
      console.log("[bot] send exception", e?.message || e);
    }
  }
}
