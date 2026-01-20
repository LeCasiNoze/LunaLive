// api/src/app.ts
import express from "express";
import cors from "cors";
import path from "path";

import { requireAuth, requireAdminKey } from "./auth.js";

import { registerChatRoutes } from "./chat_routes.js";
import { registerHlsProxy } from "./hls_proxy.js";
import { registerStatsRoutes } from "./stats_routes.js";

// Core routers
import { publicRouter } from "./routes/public.js";
import { authRouter } from "./routes/auth.js";
import { streamerRouter } from "./routes/streamer.js";
import { adminRouter } from "./routes/admin.js";

// Public / misc
import { pushRouter } from "./routes/push.js";
import { thumbsRouter } from "./routes/thumbs.js";
import { moderationRouter } from "./routes/moderation.js";
import { streamerUploadsRouter } from "./routes/streamer_uploads.js";
import { streamerVodsRouter } from "./routes/streamer_vods.js";
import { streamerTabsRouter } from "./routes/streamer_tabs.js";

// Economy
import { walletRouter } from "./routes/wallet.js";
import { supportRouter } from "./routes/support.js";
import { earningsRouter } from "./routes/earnings.js";
import { cashoutRouter } from "./routes/cashout.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { adminRubisRouter } from "./routes/admin_rubis.js";

// Features
import { achievementsRouter } from "./routes/achievements.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { cosmeticsCatalogRoutes } from "./routes/cosmetics_catalog_routes.js";
import { avatarRouter } from "./routes/avatar.js";
import { shopRouter } from "./routes/shop.js";
import { shopTalentsRouter } from "./routes/shop_talents.js";
import { wheelRouter } from "./routes/wheel.js";
import { chestRouter } from "./routes/chest.js";
import { dailyBonusRoutes } from "./routes/daily_bonus_routes.js";
import { predictionsRouter } from "./predictions/predictions.routes.js";

// Casinos (Trustpilot)
import { casinosPublicRouter } from "./routes/casinos_public.js";
import { casinosMeRouter } from "./routes/casinos_me.js";
import { adminCasinosRouter } from "./routes/admin_casinos.js";
import { adminCasinosSetupRouter } from "./routes/admin_casinos_setup.js";
import { adminCasinoCommentsRouter } from "./routes/admin_casino_comments.js";
import { casinoCommentImagesRouter } from "./routes/casino_comment_images.js";

// Streamer / integrations
import { streamerDliveLinkRouter } from "./routes/streamer_dlive_link.js";
import { meProfileRouter } from "./routes/me_profile.js";
import { meOverlayRouter } from "./routes/me_overlay.js";
import { overlayApiRouter } from "./routes/overlay_api.js";
import { internalBotRouter } from "./routes/internal_bot.js";

// Bot module (clean)
import meBotRouter from "./modules/bot/router.js";
import { botWheelRouter } from "./routes/bot_wheel.js";
import { botRainRouter } from "./routes/bot_rain.js";
import { botClipsRouter } from "./bot_clips/router.js";

// Clips / slots / calls / hunt
import { clipsPublicRouter } from "./routes/clips_public.js";
import { slotsRouter } from "./routes/slots.js";
import { callsRouter } from "./routes/calls.js";
import { callsPcallRouter } from "./routes/calls_pcall.js";
import { callsHuntRouter } from "./routes/calls_hunt.js";
import { hunt2Router } from "./routes/hunt2.js";

// Billing
import { billingRouter } from "./routes/billing.js";
import { uploadsRouter } from "./routes/uploads.js";
import { emotesRouter } from "./emotes/emotes.router.js";
import { streamerEmotesRouter } from "./emotes/streamer_emotes.router.js";
import { accountActionsRouter } from "./routes/account_actions.js";
import { adminImpersonateRouter } from "./routes/admin_impersonate.js";
import { adminEmotesRouter } from "./emotes/admin_emotes.router.js";

export function createApp() {
  const app = express();

  // ─────────────────────────────────────────────
  // ✅ Base config
  // ─────────────────────────────────────────────
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(express.json({ limit: "3mb" }));

  // Billing (souvent webhook / needs early mount)
  app.use("/billing", billingRouter);

  // uploads/avatars (middlewares globaux existants)
  app.use(streamerUploadsRouter);
  app.use(avatarRouter);

  // ─────────────────────────────────────────────
  // ✅ TEMP: Admin debug (logs only for /admin*)
  // ─────────────────────────────────────────────
  app.use((req, res, next) => {
    if (process.env.ADMIN_DEBUG === "1" && String(req.path || "").startsWith("/admin")) {
      const auth = String(req.headers.authorization || "");
      const xAdmin = String((req.headers as any)["x-admin-key"] || "");
      const xAccess = String((req.headers as any)["x-access-token"] || "");

      console.error("[ADMIN_DEBUG][REQ]", req.method, req.originalUrl);
      console.error("[ADMIN_DEBUG][HDR] authorization:", JSON.stringify(auth));
      console.error("[ADMIN_DEBUG][HDR] x-admin-key:", JSON.stringify(xAdmin));
      console.error("[ADMIN_DEBUG][HDR] x-access-token:", JSON.stringify(xAccess));
      console.error("[ADMIN_DEBUG][HDR] origin:", JSON.stringify(String(req.headers.origin || "")));
      console.error("[ADMIN_DEBUG][HDR] host:", JSON.stringify(String(req.headers.host || "")));

      res.setHeader("x-admin-debug-seen", "1");
    }
    next();
  });

  // build marker
  app.use((_req, res, next) => {
    res.setHeader("x-build", "comments-fix-2026-01-14-1505");
    next();
  });

  // ─────────────────────────────────────────────
  // ✅ Admin comments router monté AVANT admin casinos router
  // ─────────────────────────────────────────────
  app.use("/admin/casinos/comments", adminCasinoCommentsRouter);

  // ─────────────────────────────────────────────
  // ✅ Public VODs (doit matcher AVANT streamerRouter)
  // ─────────────────────────────────────────────
  app.use(streamerVodsRouter);

  // ─────────────────────────────────────────────
  // ✅ Legacy modules
  // ─────────────────────────────────────────────
  registerChatRoutes(app);
  registerStatsRoutes(app);

  // ─────────────────────────────────────────────
  // ✅ Uploads routers + DB images BEFORE static
  // ─────────────────────────────────────────────
  app.use("/uploads", uploadsRouter);

  // images commentaires casinos depuis DB (fallback disk si pas trouvé)
  app.use("/uploads", casinoCommentImagesRouter);

  // ─────────────────────────────────────────────
  // ✅ Static uploads
  // ─────────────────────────────────────────────
  app.use(
    "/uploads",
    (_req, res, next) => {
      res.setHeader("x-router-hit", "static_uploads");
      next();
    },
    express.static(path.resolve(process.cwd(), "uploads"), {
      maxAge: "7d",
      fallthrough: false,
    })
  );

  // ─────────────────────────────────────────────
  // ✅ Casinos PUBLIC + /me/casinos (auth)
  // ─────────────────────────────────────────────
  app.use(casinosPublicRouter);
  app.use("/me/casinos", requireAuth, casinosMeRouter);

  // ─────────────────────────────────────────────
  // ✅ Other public routers
  // ─────────────────────────────────────────────
  app.use(pushRouter);
  app.use(thumbsRouter);
  app.use(moderationRouter);

  // ─────────────────────────────────────────────
  // ✅ Public + Auth
  // ─────────────────────────────────────────────
  app.use(publicRouter);
  app.use(authRouter);
  app.use(accountActionsRouter);
  
  // ─────────────────────────────────────────────
  // ✅ Main routers
  // ─────────────────────────────────────────────
  app.use(streamerRouter);
  
  // ✅ Admin emotes (protégé, mais UNIQUEMENT sur /admin/emotes/*)
  app.use("/admin/emotes", requireAdminKey, adminEmotesRouter);

  app.use(adminRouter);
  app.use(adminImpersonateRouter);
  
  // Streamer tabs (/streamers/:slug/about, /agenda, etc.)
  app.use("/streamers", streamerTabsRouter);

  // ─────────────────────────────────────────────
  // ✅ Admin economy tools
  // ─────────────────────────────────────────────
  app.use(adminRubisRouter);

  // ─────────────────────────────────────────────
  // ✅ Economy routers
  // ─────────────────────────────────────────────
  app.use(walletRouter);
  app.use(supportRouter);
  app.use(earningsRouter);
  app.use(cashoutRouter);
  app.use(subscriptionsRouter);

  // ─────────────────────────────────────────────
  // ✅ Wheel / Chest / Predictions
  // ─────────────────────────────────────────────
  app.use(wheelRouter);
  app.use(chestRouter);
  app.use(predictionsRouter);

  // Daily bonus + achievements (auth)
  app.use("/me/daily-bonus", requireAuth, dailyBonusRoutes);
  app.use("/me/achievements", requireAuth, achievementsRouter);

  // ─────────────────────────────────────────────
  // ✅ Cosmetics / Shop
  // ─────────────────────────────────────────────
  app.use(cosmeticsRouter);
  app.use(shopRouter);
  app.use("/shop/talents", shopTalentsRouter);
  app.use(cosmeticsCatalogRoutes);

  app.use(emotesRouter);
  app.use(streamerEmotesRouter);
  // ─────────────────────────────────────────────
  // ✅ Overlay + Bot dashboard (auth)
  // ─────────────────────────────────────────────
  app.use("/me/overlay", requireAuth, meOverlayRouter);

  app.use("/me/bot", requireAuth, meBotRouter);
  app.use("/me/bot/bot_wheel", requireAuth, botWheelRouter);
  app.use("/me/bot/bot_rain", requireAuth, botRainRouter);

  // Clips dashboard
  app.use("/me/bot/clips", botClipsRouter);

  // ─────────────────────────────────────────────
  // ✅ Casinos ADMIN (ordre CRITIQUE)
  // ─────────────────────────────────────────────
  app.use("/admin/casinos/listings", adminCasinosRouter);
  app.use("/admin/casinos", adminCasinosRouter);

  // ❌ IMPORTANT: on ne monte PAS un router admin sur un chemin public
  // app.use("/casinos/listings", adminCasinosRouter);

  app.use(adminCasinosSetupRouter);

  // ─────────────────────────────────────────────
  // ✅ Misc routers
  // ─────────────────────────────────────────────
  app.use("/streamer/me/dlive-link", streamerDliveLinkRouter);
  app.use(meProfileRouter);
  app.use(internalBotRouter);
  app.use("/overlay/api", overlayApiRouter);
  app.use(clipsPublicRouter);

  // ─────────────────────────────────────────────
  // ✅ Slots / Calls / Hunt
  // ─────────────────────────────────────────────
  app.use("/slots", slotsRouter);
  app.use("/calls", callsHuntRouter);
  app.use("/calls", callsRouter);
  app.use("/calls", callsPcallRouter);
  app.use(hunt2Router);

  // ─────────────────────────────────────────────
  // ✅ HLS proxy
  // ─────────────────────────────────────────────
  registerHlsProxy(app);
  app.options("/hls", (_req, res) => res.sendStatus(204));

  // ─────────────────────────────────────────────
  // ✅ Error handler
  // ─────────────────────────────────────────────
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error" });
  });

  return app;
}
