import * as React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import type { User } from "./lib/types";
import { loadUser, saveUser } from "./lib/storage";
import { useIsMobile } from "./hooks/useIsMobile";

import { Topbar } from "./layout/Topbar";
import { BottomTabs } from "./layout/BottomTabs";
import { LoginModal } from "./components/LoginModal";

import LivesPage from "./pages/LivesPage";
import BrowsePage from "./pages/BrowsePage";
import StreamerPage from "./pages/StreamerPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  const location = useLocation();
  const isMobile = useIsMobile();

  const [user, setUser] = React.useState<User | null>(() => loadUser());
  const [loginOpen, setLoginOpen] = React.useState(false);

  React.useEffect(() => {
    setLoginOpen(false);
  }, [location.pathname]);

  const onLogin = (u: User) => {
    setUser(u);
    saveUser(u);
    setLoginOpen(false);
  };

  const onLogout = () => {
    setUser(null);
    saveUser(null);
  };

  return (
    <div className="app">
      <Topbar
        user={user}
        onOpenLogin={() => setLoginOpen(true)}
        onLogout={onLogout}
      />

      <Routes>
        <Route path="/" element={<LivesPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/s/:slug" element={<StreamerPage />} />
        <Route path="/profile" element={<ProfilePage user={user} />} />
      </Routes>

      {isMobile && <BottomTabs />}

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={onLogin}
      />
    </div>
  );
}
