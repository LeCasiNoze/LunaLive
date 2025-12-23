// api/src/app.ts
import express from "express";
import cors from "cors";
import path from "path";

import { registerHlsProxy } from "./hls_proxy.js";
import { registerChatRoutes } from "./chat_routes.js";
import { registerStatsRoutes } from "./stats_routes.js";

import { pushRouter } from "./routes/push.js";
import { thumbsRouter } from "./routes/thumbs.js";
import { moderationRouter } from "./routes/moderation.js";
import { streamerUploadsRouter } from "./routes/streamer_uploads.js";

import { publicRouter } from "./routes/public.js";
import { authRouter } from "./routes/auth.js";
import { streamerRouter } from "./routes/streamer.js";
import { adminRouter } from "./routes/admin.js";

import { walletRouter } from "./routes/wallet.js";
import { supportRouter } from "./routes/support.js";
import { earningsRouter } from "./routes/earnings.js";
import { cashoutRouter } from "./routes/cashout.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";

// ✅ Origines autorisées
const ALLOWED_ORIGINS = new Set([
  "https://lunalive.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsOptionsDelegate(req: any, cb: any) {
  const origin = req.header("Origin");

  // si pas d'Origin (curl, server-to-server), on autorise
  if (!origin) {
    cb(null, {
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
      maxAge: 86400,
    });
    return;
  }

  const ok = ALLOWED_ORIGINS.has(origin);
  cb(null, {
    // IMPORTANT : renvoyer l’origin exacte (pas "*") quand credentials/authorization
    origin: ok ? origin : false,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
    maxAge: 86400,
  });
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  // ✅ CORS tout en haut, AVANT les routes
  app.use(cors(corsOptionsDelegate));

  // ✅ Répond aux preflights pour TOUTES les routes
  app.options("*", cors(corsOptionsDelegate));

  app.use(express.json({ limit: "1mb" }));

  // legacy modules
  registerChatRoutes(app);
  registerStatsRoutes(app);

  // static uploads
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d" })
  );

  // existing routers
  app.use(pushRouter);
  app.use(thumbsRouter);
  app.use(moderationRouter);
  app.use(streamerUploadsRouter);

  // NEW routers (clean split)
  app.use(publicRouter);
  app.use(authRouter);
  app.use(streamerRouter);
  app.use(adminRouter);

  // economy routers
  app.use(walletRouter);
  app.use(supportRouter);
  app.use(earningsRouter);
  app.use(cashoutRouter);
  app.use(subscriptionsRouter);

  // HLS proxy
  registerHlsProxy(app);

  // (optionnel) ta route spécifique hls OPTIONS peut rester, mais plus nécessaire
  app.options("/hls", (_req, res) => res.sendStatus(204));

  // error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error" });
  });

  return app;
}
