import * as React from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";

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
import { DailyBonusAgendaModal } from "./components/DailyBonusAgendaModal";

function AppInner() {
  const location = useLocation();
  const nav = useNavigate();

  const [achievementsOpen, setAchievementsOpen] = React.useState(false);
  // DailyBonusAgendaModal fonctionne en "state machine"
  const [dailyAgendaState, setDailyAgendaState] = React.useState<any>({ open: false });

  const isMobile = useIsMobile();
  const { logout } = useAuth();

  const [loginOpen, setLoginOpen] = React.useState(false);

  React.useEffect(() => {
    setLoginOpen(false);
    setAchievementsOpen(false);
    setDailyAgendaState((s: any) => ({ ...(s || {}), open: false }));

  }, [location.pathname]);

  React.useEffect(() => {
  const onGoLive = (e: any) => {
    const target = String(e?.detail?.target || "").trim();
    if (!target) return;

    if (/^https?:\/\//i.test(target)) window.location.href = target;
    else nav(target);
  };

  const onAchievements = () => setAchievementsOpen(true);
  const onDailyAgenda = () => {
  setDailyAgendaState((s: any) => ({ ...(s || {}), open: true }));
    };


  window.addEventListener("ui:go_live_open", onGoLive as any);
  window.addEventListener("ui:achievements_open", onAchievements as any);
  window.addEventListener("ui:daily_bonus_agenda_open", onDailyAgenda as any);

  return () => {
    window.removeEventListener("ui:go_live_open", onGoLive as any);
    window.removeEventListener("ui:achievements_open", onAchievements as any);
    window.removeEventListener("ui:daily_bonus_agenda_open", onDailyAgenda as any);
  };
}, [nav]);

  return (
    <div className="app">
      <Topbar onOpenLogin={() => setLoginOpen(true)} onLogout={logout} />

      <GoLiveNotifier />
      <DailyBonusToast />
      <AchievementsToast />
      <CallsToast />

      <Routes>
        {/* ✅ token -> saveToken -> redirect / */}
        <Route path="/impersonate" element={<ImpersonatePage />} />

        <Route path="/" element={<LivesPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/shop" element={<ShopPage />} />

        <Route path="/casinos" element={<CasinosPage />} />
        <Route path="/casinos/:slug" element={<CasinoPage />} />
        <Route path="/hunt" element={<HuntPage />} />

        <Route path="/s/:slug" element={<StreamerPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="/admin" element={<AdminPage />} />
        {/* ✅ NEW: modération avis casinos */}
        <Route path="/admin/casinos/comments" element={<AdminCasinoCommentsPage />} />

        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>

      {isMobile && <BottomTabs />}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <AchievementsModal open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
      <DailyBonusAgendaModal
        state={dailyAgendaState}
        onState={setDailyAgendaState}
        onClose={() => setDailyAgendaState((s: any) => ({ ...(s || {}), open: false }))}
      />

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
