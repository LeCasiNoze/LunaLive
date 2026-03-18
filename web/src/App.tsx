// web/src/App.tsx
import * as React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { useIsMobile } from "./hooks/useIsMobile";
import { Topbar } from "./layout/Topbar";
import { BottomTabs } from "./layout/BottomTabs";
import { Footer } from "./layout/Footer";
import CasinosPage from "./pages/CasinosPage";
import CasinoPage from "./pages/CasinoPage";
import LivesPage from "./pages/LivesPage";
import BrowsePage from "./pages/BrowsePage";
import StreamerPage from "./pages/StreamerPage";
import ProfilePage from "./pages/ProfilePage";
import { ShopPage } from "./pages/ShopPage";
import HuntPage from "./pages/HuntPage";
import NotFoundPage from "./pages/NotFoundPage";

// Lazy load heavy admin pages for performance
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const AdminCasinoCommentsPage = React.lazy(() => import("./pages/admin/AdminCasinoCommentsPage"));
const ImpersonatePage = React.lazy(() => import("./pages/ImpersonatePage"));

// Legal pages (lazy — pas dans le critical path)
const MentionsLegalesPage = React.lazy(() => import("./pages/legal/MentionsLegalesPage"));
const PolitiqueConfidentialitePage = React.lazy(() => import("./pages/legal/PolitiqueConfidentialitePage"));
const CguPage = React.lazy(() => import("./pages/legal/CguPage"));
const ContactPage = React.lazy(() => import("./pages/legal/ContactPage"));
const AProposPage = React.lazy(() => import("./pages/legal/AProposPage"));

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginModal } from "./components/LoginModal";
import { GoLiveNotifier } from "./components/GoLiveNotifier";
import { DailyBonusToast } from "./components/DailyBonusToast";
import { AchievementsToast } from "./components/AchievementsToast";
import { CallsToast } from "./components/CallsToast";
import { AchievementsModal } from "./components/AchievementsModal";
import ChatPopupPage from "./pages/ChatPopupPage";
import ReferralLandingPage from "./pages/ReferralLandingPage";

// Suspense fallback component
const LoadingFallback = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
    <div style={{ fontFamily: "system-ui", color: "#7c4dff" }}>Chargement...</div>
  </div>
);
import EventPage from "./pages/EventPage";
import { BgEffect } from "./components/Bgeffects";

function AppInner() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { logout } = useAuth();

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [achievementsOpen, setAchievementsOpen] = React.useState(false);

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

  // ✅ listeners globaux (si tu les utilises avec CallsToast actions)
  React.useEffect(() => {
    const onAchievements = () => setAchievementsOpen(true);
    window.addEventListener("ui:achievements_open", onAchievements as any);
    return () => window.removeEventListener("ui:achievements_open", onAchievements as any);
  }, []);

  return (
    <div className="app">
      <BgEffect type="cards" />
      {!isMobile && <Topbar onOpenLogin={() => setLoginOpen(true)} onLogout={logout} />}

      <GoLiveNotifier />
      <DailyBonusToast />
      <AchievementsToast />
      <CallsToast />

      <Routes>
        <Route path="/impersonate" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <ImpersonatePage />
          </React.Suspense>
        } />
        <Route path="/popout/chat/:slug" element={<ChatPopupPage />} />

        <Route path="/" element={<LivesPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/shop" element={<ShopPage />} />

        <Route path="/casinos" element={<CasinosPage />} />
        <Route path="/casinos/:slug" element={<CasinoPage />} />
        <Route path="/hunt" element={<HuntPage />} />

        <Route path="/s/:slug" element={<StreamerPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="/admin" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <AdminPage />
          </React.Suspense>
        } />
        <Route path="/admin/casinos/comments" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <AdminCasinoCommentsPage />
          </React.Suspense>
        } />

        <Route path="/dashboard" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <DashboardPage />
          </React.Suspense>
        } />
        <Route path="/r/:slug" element={<ReferralLandingPage />} />
        <Route path="/event" element={<EventPage />} />

        {/* Legal / trust pages */}
        <Route path="/mentions-legales" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <MentionsLegalesPage />
          </React.Suspense>
        } />
        <Route path="/politique-de-confidentialite" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <PolitiqueConfidentialitePage />
          </React.Suspense>
        } />
        <Route path="/cgu" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <CguPage />
          </React.Suspense>
        } />
        <Route path="/contact" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <ContactPage />
          </React.Suspense>
        } />
        <Route path="/a-propos" element={
          <React.Suspense fallback={<LoadingFallback />}>
            <AProposPage />
          </React.Suspense>
        } />

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <Footer />

      {isMobile && <BottomTabs />}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <AchievementsModal open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
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
