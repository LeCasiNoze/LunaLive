// api/src/index.ts
import http from "http";
import { Server as IOServer } from "socket.io";

import { migrate, seedIfEmpty, pool } from "./db.js";
import { createApp } from "./app.js";
import { attachChat } from "./chat_socket.js";
import { startDlivePoller } from "./dlive_poller.js";

const port = Number(process.env.PORT || 3001);

function startStatsCleanup() {
  const run = async () => {
    // ferme les viewer sessions inactives
    await pool.query(
      `UPDATE viewer_sessions
       SET ended_at = last_heartbeat_at
       WHERE ended_at IS NULL
         AND last_heartbeat_at < (NOW() - (45 * INTERVAL '1 second'))`
    );

    // si un streamer repasse offline => clôture la live_session ouverte
    await pool.query(
      `UPDATE live_sessions ls
       SET ended_at = COALESCE(s.updated_at, NOW())
       FROM streamers s
       WHERE s.id = ls.streamer_id
         AND ls.ended_at IS NULL
         AND s.is_live = FALSE`
    );
  };

  run().catch((e) => console.warn("[stats-cleanup] first run failed", e));
  setInterval(() => run().catch((e) => console.warn("[stats-cleanup] run failed", e)), 60_000);
}

(async () => {
  await migrate();
  await seedIfEmpty();

  const app = createApp();

  const server = http.createServer(app);

  // ✅ Socket.IO CORS aligné avec le front
  const io = new IOServer(server, {
    cors: {
      origin: [
        "https://lunalive.onrender.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  app.locals.io = io;

  attachChat(io);
  startStatsCleanup();
  startDlivePoller(io);

  server.listen(port, () => console.log(`[api] listening on :${port}`));
})();
