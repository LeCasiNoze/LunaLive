export class LunaLiveDbTransport {
    pool;
    env;
    streamer;
    timer = null;
    starting = false;
    lastId = 0;
    lastErrLogAt = 0;
    constructor(pool, env, streamer) {
        this.pool = pool;
        this.env = env;
        this.streamer = streamer;
    }
    start(onMessage) {
        if (this.timer || this.starting)
            return;
        this.starting = true;
        const poll = async () => {
            try {
                const r = await this.pool.query(`
          SELECT
            cm.id,
            cm.streamer_id,
            cm.user_id,
            cm.username,
            cm.body,
            cm.created_at,
            u.role AS user_role
          FROM chat_messages cm
          LEFT JOIN users u
            ON u.id = cm.user_id
          WHERE cm.streamer_id=$1
            AND cm.id > $2
            AND cm.deleted_at IS NULL
          ORDER BY cm.id ASC
          LIMIT $3
          `, [this.streamer.id, this.lastId, this.env.BOT_CHAT_BATCH]);
                for (const row of r.rows) {
                    const userId = Number(row.user_id);
                    const username = String(row.username);
                    const body = String(row.body);
                    // ✅ ignore system (souvent userId=0)
                    if (userId <= 0) {
                        this.lastId = Math.max(this.lastId, Number(row.id));
                        continue;
                    }
                    // ✅ ignore messages du bot (anti-boucle)
                    // Ajoute ces env côté bot si tu veux: BOT_LUNALIVE_USERNAME / BOT_LUNALIVE_USER_ID
                    const botUid = Number(this.env.BOT_LUNALIVE_USER_ID || 0);
                    const botName = String(this.env.BOT_LUNALIVE_USERNAME || "").trim().toLowerCase();
                    if ((botUid > 0 && userId === botUid) || (botName && username.toLowerCase() === botName)) {
                        this.lastId = Math.max(this.lastId, Number(row.id));
                        continue;
                    }
                    const role = String(row.user_role || "viewer");
                    const isModLike = ["mod", "moderator", "streamer_mod", "streamer_moderator"].includes(role.toLowerCase());
                    // owner: on essaie plusieurs noms possibles selon ton type StreamerRow
                    const ownerId = Number(this.streamer.ownerUserId ?? this.streamer.userId ?? this.streamer.owner_user_id ?? 0);
                    const isOwner = ownerId > 0 && userId === ownerId;
                    const id = Number(row.id);
                    const msg = {
                        id,
                        streamerId: Number(row.streamer_id),
                        userId,
                        username,
                        body,
                        createdAt: new Date(row.created_at).toISOString(),
                        role,
                        isModLike,
                        isOwner,
                    };
                    // ✅ msg.id peut être optionnel dans le type global, mais ici on a "id"
                    this.lastId = Math.max(this.lastId, id);
                    await onMessage(msg);
                }
            }
            catch (e) {
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
                    const r = await this.pool.query(`SELECT COALESCE(MAX(id),0) AS id
             FROM chat_messages
             WHERE streamer_id=$1 AND deleted_at IS NULL`, [this.streamer.id]);
                    this.lastId = Number(r.rows?.[0]?.id || 0);
                }
            }
            catch (e) {
                console.log("[bot] db_transport init lastId failed", e?.message || e);
            }
            finally {
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
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        this.starting = false;
    }
    async send(text) {
        const body = String(text || "").trim();
        if (!body)
            return;
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
        }
        catch (e) {
            console.log("[bot] send exception", e?.message || e);
        }
    }
    async sendDlive(message, extra) {
        const text = String(message || "").trim();
        if (!text)
            return;
        const base = String(this.env.BOT_API_BASE || "").replace(/\/$/, "");
        const key = String(this.env.BOT_INTERNAL_KEY || "");
        if (!base || !key) {
            console.log("[bot] sendDlive skipped: BOT_API_BASE or BOT_INTERNAL_KEY missing");
            return;
        }
        // ✅ je te conseille un endpoint interne (même protection x-bot-key)
        const url = `${base}/internal/bot/dlive/repost`;
        try {
            const r = await fetch(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-bot-key": key,
                },
                body: JSON.stringify({
                    streamerId: this.streamer.id,
                    slug: this.streamer.slug,
                    message: text.slice(0, 180),
                    trigger: extra?.trigger ?? null,
                }),
            });
            if (!r.ok) {
                const t = await r.text().catch(() => "");
                console.log("[bot] sendDlive failed", r.status, t.slice(0, 300));
            }
        }
        catch (e) {
            console.log("[bot] sendDlive exception", e?.message || e);
        }
    }
}
