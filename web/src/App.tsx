import * as React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { useIsMobile } from "./hooks/useIsMobile";
import { Topbar } from "./layout/Topbar";
import { BottomTabs } from "./layout/BottomTabs";

import LivesPage from "./pages/LivesPage";
import BrowsePage from "./pages/BrowsePage";
import StreamerPage from "./pages/StreamerPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginModal } from "./components/LoginModal";
import { GoLiveNotifier } from "./components/GoLiveNotifier";

function AppInner() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();

  const [loginOpen, setLoginOpen] = React.useState(false);

  React.useEffect(() => {
    setLoginOpen(false);
  }, [location.pathname]);

  return (
    <div className="app">
      <Topbar
        user={user as any}
        onOpenLogin={() => setLoginOpen(true)}
        onLogout={logout}
      />

      {/* ✅ ICI, hors de <Routes> */}
      <GoLiveNotifier />

      <Routes>
        <Route path="/" element={<LivesPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/s/:slug" element={<StreamerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>

      {isMobile && <BottomTabs />}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
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
