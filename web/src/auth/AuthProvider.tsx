// web/src/auth/AuthProvider.tsx
import * as React from "react";
import type { ApiUser } from "../lib/api";
import { loadToken, saveToken } from "../lib/storage";
import { me, claimDailyBonus } from "../lib/api";

type AuthCtx = {
  token: string | null;
  user: ApiUser | null;
  setAuth: (token: string, user: ApiUser) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;

  // ✅ patch local du user (ex: rubis)
  patchUser: (patch: Partial<ApiUser>) => void;
};

const Ctx = React.createContext<AuthCtx | null>(null);

function normalizeUser(u: any): ApiUser {
  if (!u) return u;
  // évite des crashs si certaines clés sont absentes
  if (!u.tokens) u.tokens = {};
  if (!u.breakdown) u.breakdown = {};
  return u as ApiUser;
}

function parisDayISO() {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
    setUser(normalizeUser(u));
    saveToken(t);
  }, []);

  const patchUser = React.useCallback((patch: Partial<ApiUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged: any = { ...prev, ...patch };
      return normalizeUser(merged);
    });
  }, []);

  const refreshMe = React.useCallback(async () => {
    if (!token) return;
    try {
      const r = await me(token);
      setUser(normalizeUser((r as any)?.user));
    } catch {
      logout();
    }
  }, [token, logout]);

  // ✅ On garde l'auto-claim (qui déclenche le toast via l'event "dailyBonus:result"),
  // mais on RETIRE tout ce qui ouvre la DailyBonusAgendaModal.
  const tryClaimDailyBonus = React.useCallback(async () => {
    if (!token || !user) return;

    const today = parisDayISO();
    const attemptKey = `dailyBonus:lastAttempt:${user.id}`;

    // évite de spammer l'API à chaque refreshMe() (interval + focus)
    if (sessionStorage.getItem(attemptKey) === today) return;

    try {
      const r: any = await claimDailyBonus(token);

      const day = String(r?.state?.day || r?.day || today);
      sessionStorage.setItem(attemptKey, day);

      // Event global -> DailyBonusToast s'en occupe
      window.dispatchEvent(new CustomEvent("dailyBonus:result", { detail: { ...r, source: "auto" } }));

      // update solde
      await refreshMe();
    } catch {
      // silencieux (pas bloquant)
      sessionStorage.setItem(attemptKey, today);
    }
  }, [token, user, refreshMe]);

  React.useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // claim dès que user est dispo (après refreshMe / login)
  React.useEffect(() => {
    if (!token || !user) return;
    tryClaimDailyBonus();
  }, [token, user, tryClaimDailyBonus]);

  React.useEffect(() => {
    if (!token) return;

    const id = window.setInterval(() => {
      refreshMe();
    }, 30_000);

    const onFocus = () => {
      refreshMe();
      tryClaimDailyBonus();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, refreshMe, tryClaimDailyBonus]);

  // ✅ écoute globale: mise à jour instant du solde rubis partout
  React.useEffect(() => {
    const onRubisUpdate = (ev: any) => {
      const v = Number(ev?.detail?.rubis);
      if (!Number.isFinite(v)) return;
      patchUser({ rubis: v } as any);
    };

    window.addEventListener("rubis:update", onRubisUpdate as any);
    return () => window.removeEventListener("rubis:update", onRubisUpdate as any);
  }, [patchUser]);

  return <Ctx.Provider value={{ token, user, setAuth, logout, refreshMe, patchUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
