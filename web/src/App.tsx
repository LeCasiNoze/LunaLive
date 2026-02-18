// web/src/App.tsx
import * as React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { useIsMobile } from "./hooks/useIsMobile";
import { Topbar } from "./layout/Topbar";
import { BottomTabs } from "./layout/BottomTabs";
import CasinosPage from "./pages/CasinosPage";
import CasinoPage from "./pages/CasinoPage";
import LivesPage from "./pages/LivesPage";
import BrowsePage from "./pages/BrowsePage";
import StreamerPage from "./pages/StreamerPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import { ShopPage } from "./pages/ShopPage";
import HuntPage from "./pages/HuntPage";

// ✅ NEW
import AdminCasinoCommentsPage from "./pages/admin/AdminCasinoCommentsPage";

// ✅ NEW (impersonate)
import ImpersonatePage from "./pages/ImpersonatePage";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginModal } from "./components/LoginModal";
import { GoLiveNotifier } from "./components/GoLiveNotifier";
import { DailyBonusToast } from "./components/DailyBonusToast";
import { AchievementsToast } from "./components/AchievementsToast";
import { CallsToast } from "./components/CallsToast";
import { AchievementsModal } from "./components/AchievementsModal";
import ChatPopupPage from "./pages/ChatPopupPage";
import ReferralLandingPage from "./pages/ReferralLandingPage";
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
        <Route path="/impersonate" element={<ImpersonatePage />} />
        <Route path="/popout/chat/:slug" element={<ChatPopupPage />} />

        <Route path="/" element={<LivesPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/shop" element={<ShopPage />} />

        <Route path="/casinos" element={<CasinosPage />} />
        <Route path="/casinos/:slug" element={<CasinoPage />} />
        <Route path="/hunt" element={<HuntPage />} />

        <Route path="/s/:slug" element={<StreamerPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/casinos/comments" element={<AdminCasinoCommentsPage />} />

        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/r/:slug" element={<ReferralLandingPage />} />
        <Route path="/event" element={<EventPage />} />
      </Routes>

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
