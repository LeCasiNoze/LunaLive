// web/src/App.tsx
import * as React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { useIsMobile } from "./hooks/useIsMobile";
import { Topbar } from "./layout/Topbar";
import { BottomTabs } from "./layout/BottomTabs";
import { Footer } from "./layout/Footer";
import NotFoundPage from "./pages/NotFoundPage";

// Lazy-load des routes publiques lourdes (code-splitting)
const CasinosPage = React.lazy(() => import("./pages/CasinosPage"));
const CasinoPage = React.lazy(() => import("./pages/CasinoPage"));
const LivesPage = React.lazy(() => import("./pages/LivesPage"));
const BrowsePage = React.lazy(() => import("./pages/BrowsePage"));
const StreamerPage = React.lazy(() => import("./pages/StreamerPage"));
const ProfilePage = React.lazy(() => import("./pages/ProfilePage"));
const ShopPage = React.lazy(() => import("./pages/ShopPage").then((m) => ({ default: m.ShopPage })));
const HuntPage = React.lazy(() => import("./pages/HuntPage"));
const EventPage = React.lazy(() => import("./pages/EventPage"));

// Lazy load heavy admin pages for performance
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const FsbBoardPage = React.lazy(() => import("./pages/FsbBoardPage"));
const ExtensionInstallPage = React.lazy(() => import("./pages/ExtensionInstallPage"));
const AgencyPortalPage = React.lazy(() => import("./pages/AgencyPortalPage"));
const AdminCasinoCommentsPage = React.lazy(() => import("./pages/admin/AdminCasinoCommentsPage"));
const ImpersonatePage = React.lazy(() => import("./pages/ImpersonatePage"));

// Legal pages (lazy â€” pas dans le critical path)
const MentionsLegalesPage = React.lazy(() => import("./pages/legal/MentionsLegalesPage"));
const PolitiqueConfidentialitePage = React.lazy(() => import("./pages/legal/PolitiqueConfidentialitePage"));
const CguPage = React.lazy(() => import("./pages/legal/CguPage"));
const ContactPage = React.lazy(() => import("./pages/legal/ContactPage"));
const AProposPage = React.lazy(() => import("./pages/legal/AProposPage"));
const OffresStreamerPage = React.lazy(() => import("./pages/OffresStreamerPage"));

// Debug pages
const TrovoDebugPage = React.lazy(() => import("./pages/debug/TrovoDebugPage"));
const RumbleDebugPage = React.lazy(() => import("./pages/debug/RumbleDebugPage"));

// Affi Editor â€” outil interne accessible sur /editorFSN
const AffiEditorPage = React.lazy(() => import("./pages/AffiEditorPage"));
// Affi Editor V2 â€” /editorFSNV2 (totalement isolÃ© du V1, ne touche Ã  rien)
const EditorV2Page = React.lazy(() => import("./pages/EditorV2Page"));
// Affi Editor V3 â€” /editorFSNV3 (wizard rapide M1, rÃ©utilise pipeline V2)
const EditorV3Page = React.lazy(() => import("./pages/EditorV3Page"));

// S1 — landing premium standalone Celsius (promo X/Twitter)
const S1CelsiusLanding = React.lazy(() => import("./pages/S1CelsiusLanding"));

// Lovable imports — pages premium importees telles quelles depuis Lovable
const CyclopeLandingPage = React.lazy(() => import("./pages/CyclopeLandingPage"));

// Overlay OBS — renderer transparent pour /overlay
const OverlayPage = React.lazy(() => import("./pages/OverlayPage"));
const StreamControlPage = React.lazy(() => import("./pages/fsb/StreamControlPage"));

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginModal } from "./components/LoginModal";
import { WelcomeModal } from "./components/WelcomeModal";
import { GoLiveNotifier } from "./components/GoLiveNotifier";
import { DailyBonusToast } from "./components/DailyBonusToast";
import { AchievementsToast } from "./components/AchievementsToast";
import { CallsToast } from "./components/CallsToast";
import { AchievementsModal } from "./components/AchievementsModal";
import ChatPopupPage from "./pages/ChatPopupPage";
import ReferralLandingPage from "./pages/ReferralLandingPage";
import { trackFeatureEvent } from "./lib/feature_events";

// Suspense fallback component
const LoadingFallback = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
    <div style={{ fontFamily: "system-ui", color: "#7c4dff" }}>Chargement...</div>
  </div>
);
import { BgEffect } from "./components/Bgeffects";
import { captureUtmFromUrl } from "./lib/utm";
import { LevelUpToast } from "./components/LevelUpToast";

function AppInner() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { logout, token } = useAuth();

  // Capture UTM params on every route change (in case user navigates from
  // an ad-tagged URL into the app). No-op if no utm_* params present.
  React.useEffect(() => {
    captureUtmFromUrl();
  }, [location.pathname, location.search]);
  const isStandaloneReferral =
    location.pathname.startsWith("/r/") ||
    location.pathname.startsWith("/s1") ||
    location.pathname.startsWith("/cyclope");
  const isOverlayRoute =
    location.pathname.startsWith("/overlay") ||
    location.pathname.startsWith("/stream-control");
  const hideChrome =
    location.pathname === "/editorFSN" ||
    location.pathname === "/editorFSNV2" ||
    location.pathname === "/editorFSNV3" ||
    isOverlayRoute ||
    location.pathname.startsWith("/agency") ||
    isStandaloneReferral;

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [achievementsOpen, setAchievementsOpen] = React.useState(false);
  const [welcomeOpen, setWelcomeOpen] = React.useState(false);

  React.useEffect(() => {
    setLoginOpen(false);
    setAchievementsOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    const force = sessionStorage.getItem("force_register");
    if (force === "1") {
      sessionStorage.removeItem("force_register");
      setLoginOpen(true);
      window.dispatchEvent(new CustomEvent("ui:open_register"));
    }
  }, [location.pathname, location.search]);

  // listeners globaux (si tu les utilises avec CallsToast actions)
  React.useEffect(() => {
    const onAchievements = () => setAchievementsOpen(true);
    const onLoginSuccess = () => {
      const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
      const last = Number(localStorage.getItem("ll_welcome_seen") || 0);
      if (Date.now() - last < TWENTY_FOUR_H) return;
      setTimeout(() => {
        setWelcomeOpen(true);
      }, 200);
    };

    window.addEventListener("ui:achievements_open", onAchievements as any);
    window.addEventListener("ui:login_success", onLoginSuccess as any);

    return () => {
      window.removeEventListener("ui:achievements_open", onAchievements as any);
      window.removeEventListener("ui:login_success", onLoginSuccess as any);
    };
  }, []);

  React.useEffect(() => {
    if (!token) return;

    let subject: string | null = null;
    if (location.pathname === "/profile") subject = "profile";
    else if (location.pathname === "/shop") subject = "shop";
    else if (location.pathname.startsWith("/s/")) subject = "streamer";

    if (!subject) return;
    void trackFeatureEvent(token, { kind: "page_visit", subject });
  }, [location.pathname, token]);

  return (
    <div className="app">
      {!isStandaloneReferral && !isOverlayRoute && (
        <div className="appBgLayer" aria-hidden="true">
          <BgEffect type="cards" />
        </div>
      )}

      <div className="appContentLayer">
        {!isMobile && !hideChrome && (
          <Topbar onOpenLogin={() => setLoginOpen(true)} onLogout={logout} />
        )}

        {!isStandaloneReferral && (
          <>
            <GoLiveNotifier />
            <DailyBonusToast />
            <AchievementsToast />
            <CallsToast />
          </>
        )}

        <Routes>
          <Route
            path="/impersonate"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <ImpersonatePage />
              </React.Suspense>
            }
          />
          <Route path="/popout/chat/:slug" element={<ChatPopupPage />} />

          {/* Overlay OBS — renderer transparent */}
          <Route
            path="/overlay"
            element={
              <React.Suspense fallback={null}>
                <OverlayPage />
              </React.Suspense>
            }
          />

          {/* Stream Control FSB */}
          <Route
            path="/stream-control"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <StreamControlPage />
              </React.Suspense>
            }
          />

          {/* Affi template editor â€” outil interne */}
          <Route
            path="/editorFSN"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <AffiEditorPage />
              </React.Suspense>
            }
          />
          {/* Affi Editor V2 â€” nouvelle gÃ©nÃ©ration (M4V2 / M5V2) */}
          <Route
            path="/editorFSNV2"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <EditorV2Page />
              </React.Suspense>
            }
          />
          {/* Affi Editor V3 â€” wizard rapide M1 */}
          <Route
            path="/editorFSNV3"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <EditorV3Page />
              </React.Suspense>
            }
          />
          <Route
            path="/agency"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <AgencyPortalPage />
              </React.Suspense>
            }
          />

          <Route path="/" element={<LivesPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/shop" element={<ShopPage />} />

          <Route path="/casinos" element={<CasinosPage />} />
          <Route path="/casinos/:slug" element={<CasinoPage />} />
          <Route path="/hunt" element={<HuntPage />} />

          <Route path="/s/:slug" element={<StreamerPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route
            path="/admin"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <AdminPage />
              </React.Suspense>
            }
          />
          <Route
            path="/admin/casinos/comments"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <AdminCasinoCommentsPage />
              </React.Suspense>
            }
          />

          <Route
            path="/dashboard"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <DashboardPage />
              </React.Suspense>
            }
          />
          <Route
            path="/FSB_Board"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <FsbBoardPage />
              </React.Suspense>
            }
          />
          <Route
            path="/extension"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <ExtensionInstallPage />
              </React.Suspense>
            }
          />
          <Route path="/r/:slug" element={<ReferralLandingPage />} />
          <Route
            path="/s1"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <S1CelsiusLanding />
              </React.Suspense>
            }
          />
          <Route
            path="/cyclope"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <CyclopeLandingPage />
              </React.Suspense>
            }
          />
          <Route path="/event" element={<EventPage />} />

          {/* Debug routes */}
          <Route
            path="/debug/trovo"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <TrovoDebugPage />
              </React.Suspense>
            }
          />
          <Route
            path="/debug/rumble"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <RumbleDebugPage />
              </React.Suspense>
            }
          />

          {/* Legal / trust pages */}
          <Route
            path="/mentions-legales"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <MentionsLegalesPage />
              </React.Suspense>
            }
          />
          <Route
            path="/politique-de-confidentialite"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <PolitiqueConfidentialitePage />
              </React.Suspense>
            }
          />
          <Route
            path="/cgu"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <CguPage />
              </React.Suspense>
            }
          />
          <Route
            path="/contact"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <ContactPage />
              </React.Suspense>
            }
          />
          <Route
            path="/a-propos"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <AProposPage />
              </React.Suspense>
            }
          />

          <Route
            path="/offres_streamers/:slug"
            element={
              <React.Suspense fallback={<LoadingFallback />}>
                <OffresStreamerPage />
              </React.Suspense>
            }
          />

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        {!hideChrome && <Footer />}

        {isMobile && !hideChrome && location.pathname !== "/profile" && <BottomTabs />}

        {!isStandaloneReferral && (
          <>
            <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
            <WelcomeModal
              open={welcomeOpen}
              onClose={() => {
                localStorage.setItem("ll_welcome_seen", String(Date.now()));
                setWelcomeOpen(false);
              }}
            />
            <AchievementsModal open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
            <LevelUpToast />
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
