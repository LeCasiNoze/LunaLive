// api/src/index.ts
import http from "http";
import path from "path";
import express from "express";
import { Server as IOServer } from "socket.io";
import { migrate, pool } from "./db.js";
import { createApp } from "./app.js";
import { attachChat } from "./chat_socket.js";
import { startDlivePoller } from "./dlive_poller.js";
import { startChestJobs } from "./chest_jobs.js";
import { ensureBotClips } from "./bot_clips/store.js";
import { startClipsVodLinker } from "./bot_clips/vod_linker.js";
import { ensureCallsSchema } from "./calls/schema.js";
import { runSlotsUpdate } from "./calls/updater.js";
import { startClipsMp4Renderer, startClipsMp4Cleanup } from "./clips/clip_mp4_worker.js";
import { startAgendaNotifPoller } from "./agenda_notif_poller.js";
import { startDiscordBot } from "./discord/bot.js";
import { startEventsEnginePoller } from "./events/engine.js";
const port = Number(process.env.PORT || 3001);
function startStatsCleanup() {
    const run = async () => {
        await pool.query(`UPDATE viewer_sessions
       SET ended_at = last_heartbeat_at
       WHERE ended_at IS NULL
         AND last_heartbeat_at < (NOW() - (45 * INTERVAL '1 second'))`);
        await pool.query(`UPDATE live_sessions ls
       SET ended_at = COALESCE(s.updated_at, NOW())
       FROM streamers s
       WHERE s.id = ls.streamer_id
         AND ls.ended_at IS NULL
         AND s.is_live = FALSE`);
    };
    run().catch((e) => console.warn("[stats-cleanup] first run failed", e));
    setInterval(() => run().catch((e) => console.warn("[stats-cleanup] run failed", e)), 60_000);
}
// ✅ scheduler slots (run au boot + toutes les X heures)
function startSlotsCatalogUpdater(everyHours) {
    const ms = Math.max(1, Number(everyHours || 12)) * 3600_000;
    const tick = async () => {
        try {
            const r = await runSlotsUpdate(pool);
            if (r.ok) {
                console.log(`[slots-updater] ok fetched=${r.fetched} inserted=${r.inserted.length}`);
            }
            else {
                console.warn(`[slots-updater] failed ${r.error}`);
            }
        }
        catch (e) {
            console.warn("[slots-updater] crashed", e?.message || e);
        }
    };
    tick().catch(() => { });
    setInterval(() => tick().catch(() => { }), ms);
}
async function bootstrapBackground() {
    // ⚠️ Ne doit PAS bloquer le listen()
    try {
        console.log("[boot] migrate...");
        await migrate();
        console.log("[boot] migrate ok");
        console.log("[boot] ensureBotClips...");
        await ensureBotClips();
        console.log("[boot] ensureBotClips ok");
        console.log("[boot] ensureCallsSchema...");
        await ensureCallsSchema(pool);
        console.log("[boot] ensureCallsSchema ok");
        // Si tu veux que le updater slots ne démarre qu'après DB ready :
        startSlotsCatalogUpdater(12);
        console.log("[boot] background bootstrap done");
    }
    catch (e) {
        console.error("[boot] background bootstrap failed", e?.message || e);
        // On NE crash pas le service : il est déjà up.
        // Si tu préfères forcer un crash en cas de DB down, dis-moi.
    }
}
function setupGracefulShutdown(server) {
    const shutdown = (signal) => {
        console.log(`[shutdown] ${signal} received, closing...`);
        server.close(() => {
            console.log("[shutdown] http server closed");
            pool.end().catch(() => { });
            process.exit(0);
        });
        // sécurité : si ça bloque, on force au bout de 8s
        setTimeout(() => {
            console.warn("[shutdown] force exit");
            process.exit(1);
        }, 8000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}
(async () => {
    // ✅ Crée l'app vite
    const app = createApp();
    // (tu as déjà du static uploads dans app.ts, mais tu l'avais aussi ici)
    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
    const server = http.createServer(app);
    const io = new IOServer(server, {
        cors: {
            origin: ["https://lunalive.onrender.com", "http://localhost:5173", "http://127.0.0.1:5173"],
            credentials: true,
            methods: ["GET", "POST"],
        },
    });
    app.locals.io = io;
    app.set("io", io);
    attachChat(io);
    // ✅ Démarre le serveur TOUT DE SUITE (Render sera content)
    server.listen(port, () => console.log(`[api] listening on :${port}`));
    // ✅ Démarre les pollers (ils utilisent la DB, donc si DB down ça loguera, mais ne bloque pas le deploy)
    startStatsCleanup();
    startEventsEnginePoller(60_000);
    startDlivePoller(io);
    startChestJobs(io);
    startAgendaNotifPoller(30_000);
    startClipsVodLinker();
    startClipsMp4Renderer();
    startClipsMp4Cleanup();
    if (process.env.RUN_DISCORD_BOT === "1") {
        startDiscordBot({
            log: (msg) => console.log(msg),
        }).catch((e) => {
            console.error("[discord] failed to start", e);
        });
    }
    // ✅ Bootstrap DB en arrière-plan
    bootstrapBackground().catch(() => { });
    // ✅ Pour que Render puisse arrêter proprement (évite deploys qui traînent)
    setupGracefulShutdown(server);
})();
