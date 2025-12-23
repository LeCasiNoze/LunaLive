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

// ✅ NEW
import { adminRubisRouter } from "./routes/admin_rubis.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(express.json());

  // legacy modules
  registerChatRoutes(app);
  registerStatsRoutes(app);

  // static uploads
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d" }));

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

  // ✅ NEW admin economy tools
  app.use(adminRubisRouter);

  // economy routers
  app.use(walletRouter);
  app.use(supportRouter);
  app.use(earningsRouter);
  app.use(cashoutRouter);
  app.use(subscriptionsRouter);

  registerHlsProxy(app);
  app.options("/hls", (_req, res) => res.sendStatus(204));

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error" });
  });

  return app;
}
