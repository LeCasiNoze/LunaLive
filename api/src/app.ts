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

import { adminRubisRouter } from "./routes/admin_rubis.js";
import { wheelRouter } from "./routes/wheel.js";
import { chestRouter } from "./routes/chest.js";
import { dailyBonusRoutes } from "./routes/daily_bonus_routes.js";
import { requireAuth } from "./auth.js";
import { achievementsRouter } from "./routes/achievements.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { cosmeticsCatalogRoutes } from "./routes/cosmetics_catalog_routes.js";
import { avatarRouter } from "./routes/avatar.js";
import { shopRouter } from "./routes/shop.js";

import { casinosPublicRouter } from "./routes/casinos_public.js";
import { casinosMeRouter } from "./routes/casinos_me.js";
import { adminCasinosRouter } from "./routes/admin_casinos.js";
import { adminCasinosSetupRouter } from "./routes/admin_casinos_setup.js";
import { streamerDliveLinkRouter } from "./routes/streamer_dlive_link.js";

// ✅ NEW: tabs (about/agenda)
import { streamerTabsRouter } from "./routes/streamer_tabs.js";
import { streamerVodsRouter } from "./routes/streamer_vods.js";
import { meProfileRouter } from "./routes/me_profile.js";
import { internalBotRouter } from "./routes/internal_bot.js";

// ✅ NEW clean bot module
import meBotRouter from "./modules/bot/router.js";
import { meOverlayRouter } from "./routes/me_overlay.js";
import { overlayApiRouter } from "./routes/overlay_api.js";

// ✅ NEW: clips routes
import { botClipsRouter } from "./bot_clips/router.js";
import { clipsPublicRouter } from "./routes/clips_public.js";
import { slotsRouter } from "./routes/slots.js";
import { callsRouter } from "./routes/calls.js";

// ✅ NEW: Hunt
import { hunt2Router } from "./routes/hunt2.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(express.json({ limit: "300kb" }));

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

  // ✅ streamer tabs (about/agenda)
  app.use("/streamers", streamerTabsRouter);

  // admin economy tools
  app.use(adminRubisRouter);

  // economy routers
  app.use(walletRouter);
  app.use(supportRouter);
  app.use(earningsRouter);
  app.use(cashoutRouter);
  app.use(subscriptionsRouter);

  app.use(wheelRouter);
  app.use(chestRouter);

  app.use("/me/daily-bonus", requireAuth, dailyBonusRoutes);
  app.use("/me/achievements", requireAuth, achievementsRouter);

  app.use(cosmeticsRouter);
  app.use(avatarRouter);
  app.use(shopRouter);
  app.use(cosmeticsCatalogRoutes);

  // casinos
  app.use(casinosPublicRouter);
  app.use("/me/casinos", requireAuth, casinosMeRouter);
  app.use(streamerVodsRouter);

  // ✅ OBS overlay config (compat frontend)
  app.use("/me/overlay", requireAuth, meOverlayRouter);

  // ✅ LunaBot dashboard routes
  app.use("/me/bot", requireAuth, meBotRouter);

  // ✅ Clips dashboard (download/list/delete)
  app.use("/me/bot/clips", botClipsRouter);

  // ✅ IMPORTANT: compat legacy frontend
  app.use("/admin/casinos/listings", adminCasinosRouter);

  // admin casinos = admin key only (PAS requireAuth)
  app.use("/admin/casinos", adminCasinosRouter);

  // (optionnel mais ok)
  app.use("/casinos/listings", adminCasinosRouter);

  app.use(adminCasinosSetupRouter);
  app.use("/streamer/me/dlive-link", streamerDliveLinkRouter);
  app.use(meProfileRouter);
  app.use(internalBotRouter);
  app.use("/overlay/api", overlayApiRouter);
  app.use(clipsPublicRouter);

  app.use("/slots", slotsRouter);
  app.use("/calls", callsRouter);

  // ✅ Hunt routes (/api/hunt2/*)
  app.use(hunt2Router);

  registerHlsProxy(app);
  app.options("/hls", (_req, res) => res.sendStatus(204));

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error" });
  });

  return app;
}
