import * as React from "react";
import type { ApiUser } from "../lib/api";
import { loadToken, saveToken } from "../lib/storage";
import { me } from "../lib/api";

type AuthCtx = {
  token: string | null;
  user: ApiUser | null;
  setAuth: (token: string, user: ApiUser) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;

  // ✅ Nouveau: patch local du user (ex: rubis)
  patchUser: (patch: Partial<ApiUser>) => void;
};

const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => loadToken());
  const [user, setUser] = React.useState<ApiUser | null>(null);

  const logout = React.useCallback(() => {
    setToken(null);
    setUser(null);
    saveToken(null);
  }, []);

  const setAuth = React.useCallback((t: string, u: ApiUser) => {
    setToken(t);
    setUser(u);
    saveToken(t);
  }, []);

  const patchUser = React.useCallback((patch: Partial<ApiUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const refreshMe = React.useCallback(async () => {
    if (!token) return;
    try {
      const r = await me(token);
      setUser(r.user);
    } catch {
      logout();
    }
  }, [token, logout]);

  React.useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  React.useEffect(() => {
    if (!token) return;

    const id = window.setInterval(() => {
      refreshMe();
    }, 30_000);

    const onFocus = () => refreshMe();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, refreshMe]);

  return (
    <Ctx.Provider value={{ token, user, setAuth, logout, refreshMe, patchUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
