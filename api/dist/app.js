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
import { featureEventsRouter } from "./routes/feature_events.js";
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
import { streamerRumbleLinkRouter } from "./routes/streamer_rumble_link.js";
import { meProfileRouter } from "./routes/me_profile.js";
import { meOverlayRouter } from "./routes/me_overlay.js";
import { overlayApiRouter } from "./routes/overlay_api.js";
import { internalBotRouter } from "./routes/internal_bot.js";
import { internalBotStreamerRequestsRouter } from "./routes/internal_bot_streamer_requests.js";
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
import { publicCallsRouter } from "./routes/public_calls.js";
import { publicSlotsRouter } from "./routes/public-slots.js";
// Billing / uploads / emotes / reports / admin content
import { billingRouter } from "./routes/billing.js";
import { uploadsRouter } from "./routes/uploads.js";
import { emotesRouter } from "./emotes/emotes.router.js";
import { streamerEmotesRouter } from "./emotes/streamer_emotes.router.js";
import { accountActionsRouter } from "./routes/account_actions.js";
import { adminImpersonateRouter } from "./routes/admin_impersonate.js";
import { adminEmotesRouter } from "./emotes/admin_emotes.router.js";
import { reportsRouter } from "./routes/reports.js";
import { adminReportsRouter } from "./routes/admin_reports.js";
import { adminSubscriptionsRouter } from "./routes/admin_subscriptions.js";
import { adminContentRouter } from "./routes/admin_content.js";
import { publicContentRouter } from "./routes/public_content.js";
import { expensesRouter } from "./routes/expenses.js";
import { fsbDashboardRouter } from "./routes/fsb_dashboard.js";
import { fsbTodosRouter } from "./routes/fsb_todos.js";
import { tiktokOutreachRouter, handleInboundReply } from "./routes/tiktok_outreach.js";
import { questsRouter } from "./routes/quests.js";
import { seedAllPeriodsIfNeeded } from "./services/quests.js";
import { xpRouter } from "./routes/xp.js";
import { adminXpRouter } from "./routes/admin_xp.js";
import { titlesRouter } from "./routes/titles.js";
import { agencyRouter } from "./routes/agency.js";
import { webrtcTurnRouter } from "./routes/webrtc_turn.js";
// Discord routes
import { meDiscordLinkRouter } from "./routes/bot/me_discord_link.js";
import { discordLinkConsumeRouter } from "./routes/bot/discord_link_consume.js";
import { botDiscordGuildRouter } from "./routes/bot/bot_discord_guild.js";
import { dliveRepostRouter } from "./routes/dlive_repost.js";
import { referralRedirectRouter } from "./routes/referral_redirect.js";
import { referralRouter } from "./routes/referral.js";
import { welcomeRouter } from "./routes/welcome.js";
import { adminAuthRouter } from "./routes/admin_auth.js";
import { adminReferralsRouter } from "./routes/admin_referrals.js";
import { adminPlatformStatsRouter } from "./routes/admin_platform_stats.js";
import { adminRumbleRouter } from "./routes/admin_rumble.js";
import { eventsRouter } from "./routes/events.js";
import { eventsViewerWeekRouter } from "./routes/events_viewer_week.js";
import { adminEventsRouter } from "./routes/admin_events.js";
import { lunaclipRouter } from "./lunaclip/routes.js";
// Debug routes
import { trovoDebugRouter } from "./routes/trovo_debug.js";
// Instagram comments monitoring
import { igCommentsRouter } from "./routes/ig_comments.js";
import { offresStreamersRouter } from "./routes/offres_streamers.js";
import { igWebhookRouter } from "./ig_dm_scheduler.js";
import { igConfigRouter } from "./routes/ig_config.js";
import { igCollaborationsRouter } from "./routes/ig_collaborations.js";
import { fsbAffiPagesRouter, publicAffiPagesRouter } from "./routes/affi_pages.js";
export function createApp() {
    const app = express();
    app.set("trust proxy", 1);
    app.use(cors());
    app.get("/healthz", (_req, res) => res.status(200).send("ok"));
    app.use(express.json({ limit: "3mb" }));
    // HLS proxy enregistré en premier — avant tout middleware d'auth
    registerHlsProxy(app);
    app.options("/hls", (_req, res) => res.sendStatus(204));
    app.use("/api/public/slots", publicSlotsRouter);
    // Overlay public — calls queue (no auth) — monté tôt pour échapper aux routers d'auth
    app.use(publicCallsRouter);
    app.use("/billing", billingRouter);
    app.use(streamerUploadsRouter);
    app.use(avatarRouter);
    app.use((req, res, next) => {
        if (process.env.ADMIN_DEBUG === "1" && String(req.path || "").startsWith("/admin")) {
            const auth = String(req.headers.authorization || "");
            const xAdmin = String(req.headers["x-admin-key"] || "");
            const xAccess = String(req.headers["x-access-token"] || "");
            res.setHeader("x-admin-debug-seen", "1");
        }
        next();
    });
    app.use((_req, res, next) => {
        res.setHeader("x-build", "comments-fix-2026-01-14-1505");
        next();
    });
    app.use(adminPlatformStatsRouter);
    app.use(adminRumbleRouter);
    app.use("/admin/casinos/comments", requireAdminKey, adminCasinoCommentsRouter);
    app.use("/admin/reports", requireAdminKey, adminReportsRouter);
    app.use("/admin/events", requireAdminKey, adminEventsRouter);
    app.use("/admin/lunaclip", requireAdminKey, lunaclipRouter);
    app.use("/admin/auth", requireAdminKey, adminAuthRouter);
    app.use("/admin/referrals", requireAdminKey, adminReferralsRouter);
    app.use("/admin", requireAdminKey, adminContentRouter);
    app.use("/admin/casinos/listings", requireAdminKey, adminCasinosRouter);
    app.use("/admin/casinos", requireAdminKey, adminCasinosRouter);
    app.use("/admin/casinos/setup", requireAdminKey, adminCasinosSetupRouter);
    app.use("/admin/subscriptions", adminSubscriptionsRouter);
    app.use("/admin/emotes", requireAdminKey, adminEmotesRouter);
    app.use("/reports", reportsRouter);
    app.use(referralRedirectRouter);
    app.use(referralRouter);
    app.use(welcomeRouter);
    app.use("/api", botDiscordGuildRouter);
    app.use("/api", discordLinkConsumeRouter);
    app.use("/api", dliveRepostRouter);
    app.use("/api", eventsRouter);
    app.use("/api", eventsViewerWeekRouter);
    app.use("/api", igCommentsRouter);
    app.use("/api", offresStreamersRouter);
    app.use("/api", igConfigRouter);
    app.use("/api", igCollaborationsRouter);
    app.use("/api", publicAffiPagesRouter);
    app.use("/api", fsbAffiPagesRouter);
    app.use("/api", expensesRouter);
    app.use("/api", fsbDashboardRouter);
    app.use("/api", fsbTodosRouter);
    app.use("/api", tiktokOutreachRouter);
    app.post("/api/inbound/tiktok-reply", handleInboundReply);
    app.use("/api", questsRouter);
    app.use("/api", xpRouter);
    app.use(adminXpRouter);
    app.use("/api", titlesRouter);
    // Quest seeder: au boot puis 1x/h. Idempotent (skip si déjà seedé).
    seedAllPeriodsIfNeeded().catch((e) => {
        console.warn("[quests] initial seed failed:", e?.message || e);
    });
    setInterval(() => {
        seedAllPeriodsIfNeeded().catch((e) => {
            console.warn("[quests] periodic seed failed:", e?.message || e);
        });
    }, 60 * 60 * 1000);
    app.use("/api", agencyRouter);
    app.use(igWebhookRouter);
    app.use("/api/debug", trovoDebugRouter);
    app.use(streamerVodsRouter);
    registerChatRoutes(app);
    registerStatsRoutes(app);
    app.use("/uploads", uploadsRouter);
    app.use("/uploads", casinoCommentImagesRouter);
    app.use("/uploads", (_req, res, next) => { res.setHeader("x-router-hit", "static_uploads"); next(); }, express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d", fallthrough: false }));
    app.use(casinosPublicRouter);
    app.use("/me/casinos", requireAuth, casinosMeRouter);
    app.use(internalBotRouter);
    app.use(internalBotStreamerRequestsRouter);
    app.use(pushRouter);
    app.use(thumbsRouter);
    app.use(moderationRouter);
    app.use(clipsPublicRouter);
    app.use(publicContentRouter);
    app.use(publicRouter);
    app.use("/public", publicRouter);
    app.use(authRouter);
    app.use(accountActionsRouter);
    app.use(meDiscordLinkRouter);
    app.use(streamerRouter);
    app.use(adminRouter);
    app.use(adminImpersonateRouter);
    app.use("/streamers", streamerTabsRouter);
    app.use(adminRubisRouter);
    app.use(walletRouter);
    app.use(supportRouter);
    app.use(earningsRouter);
    app.use(cashoutRouter);
    app.use(subscriptionsRouter);
    app.use(wheelRouter);
    app.use(chestRouter);
    app.use(predictionsRouter);
    app.use("/me/daily-bonus", requireAuth, dailyBonusRoutes);
    app.use("/me/achievements", requireAuth, achievementsRouter);
    app.use("/me/feature-events", requireAuth, featureEventsRouter);
    app.use(cosmeticsRouter);
    app.use(shopRouter);
    app.use("/shop/talents", shopTalentsRouter);
    app.use(cosmeticsCatalogRoutes);
    app.use(emotesRouter);
    app.use("/emotes", emotesRouter);
    app.use(streamerEmotesRouter);
    app.use("/me/overlay", requireAuth, meOverlayRouter);
    app.use(webrtcTurnRouter);
    app.use("/me/bot", requireAuth, meBotRouter);
    app.use("/me/bot/bot_wheel", requireAuth, botWheelRouter);
    app.use("/me/bot/bot_rain", requireAuth, botRainRouter);
    app.use("/me/bot/clips", botClipsRouter);
    app.use("/streamer/me/dlive-link", streamerDliveLinkRouter);
    app.use("/streamer/me/rumble-link", streamerRumbleLinkRouter);
    app.use(meProfileRouter);
    app.use("/overlay/api", overlayApiRouter);
    app.use("/slots", slotsRouter);
    app.use("/api/public/slots", publicSlotsRouter);
    app.use("/calls", callsHuntRouter);
    app.use("/calls", callsRouter);
    app.use("/calls", callsPcallRouter);
    app.use(hunt2Router);
    app.use((err, _req, res, _next) => {
        console.error(err);
        res.status(500).json({ ok: false, error: "server_error" });
    });
    return app;
}
