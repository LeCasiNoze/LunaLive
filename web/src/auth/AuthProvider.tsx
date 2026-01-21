// web/src/auth/AuthProvider.tsx
import * as React from "react";
import type { ApiUser } from "../lib/api";
import { loadToken, saveToken } from "../lib/storage";
import { me, claimDailyBonus } from "../lib/api";

import { DailyBonusAgendaModal, type DailyBonusState } from "../components/DailyBonusAgendaModal";

type AuthCtx = {
  token: string | null;
  user: ApiUser | null;
  setAuth: (token: string, user: ApiUser) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  patchUser: (patch: Partial<ApiUser>) => void;
};

const Ctx = React.createContext<AuthCtx | null>(null);

function parisDayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function looksLikeDailyBonusState(x: any): x is DailyBonusState {
  if (!x || x.ok !== true) return false;
  if (!Array.isArray(x.week)) return false;
  if (!Array.isArray(x.milestones)) return false;
  if (!x.tokens) return false;
  return true;
}

function normalizeUser(u: any): ApiUser {
  if (!u) return u;
  if (!u.tokens) u.tokens = {};
  if (!u.breakdown) u.breakdown = {};
  return u as ApiUser;
}

// helpers storage (localStorage safe)
function lsGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => loadToken());
  const [user, setUser] = React.useState<ApiUser | null>(null);

  // ✅ popup daily bonus (state complet)
  const [dailyBonusPopup, setDailyBonusPopup] = React.useState<DailyBonusState | null>(null);

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
      setUser(normalizeUser(r.user));
    } catch {
      logout();
    }
  }, [token, logout]);

  const tryClaimDailyBonus = React.useCallback(async () => {
    if (!token || !user) return;

    const today = parisDayISO();

    // 🔒 IMPORTANT: localStorage => persiste entre onglets
    const attemptKey = `dailyBonus:lastAttempt:${user.id}`; // value = YYYY-MM-DD
    const shownKey = `dailyBonus:lastShown:${user.id}:${today}`; // "1"
    const dismissedKey = `dailyBonus:dismissed:${user.id}:${today}`; // "1"

    // si déjà dismiss aujourd'hui => ne rien auto-ouvrir
    if (lsGet(dismissedKey) === "1") return;

    // si déjà tenté aujourd'hui (dans un autre onglet) => ne pas relancer
    if (lsGet(attemptKey) === today) return;

    try {
      const r: any = await claimDailyBonus(token);

      // quoi qu'il arrive, on marque "tenté aujourd'hui" pour éviter relance multi-onglets
      lsSet(attemptKey, today);

      // si le backend dit explicitement claimed=false, on n'affiche rien
      if (r?.claimed === false) return;

      // Event global (DailyBonusToast s'abonne à ça)
      window.dispatchEvent(new CustomEvent("dailyBonus:result", { detail: { ...r, source: "auto" } }));

      // ✅ on ouvre la modal AGENDA si on a un state complet et pas déjà affiché aujourd'hui
      const s = r?.state;
      if (looksLikeDailyBonusState(s)) {
        if (lsGet(shownKey) !== "1") {
          lsSet(shownKey, "1");
          setDailyBonusPopup(s);
        }
      }

      await refreshMe();
    } catch {
      // même en erreur, on marque tenté pour pas spammer sur refresh/focus
      lsSet(attemptKey, today);
    }
  }, [token, user, refreshMe]);

  React.useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // claim dès que user est dispo
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

  // ✅ écoute globale: mise à jour instant du solde rubis
  React.useEffect(() => {
    const onRubisUpdate = (ev: any) => {
      const v = Number(ev?.detail?.rubis);
      if (!Number.isFinite(v)) return;
      patchUser({ rubis: v } as any);
    };

    window.addEventListener("rubis:update", onRubisUpdate as any);
    return () => window.removeEventListener("rubis:update", onRubisUpdate as any);
  }, [patchUser]);

  // ✅ ouverture explicite de l'agenda via event (bouton "Voir" du toast)
  React.useEffect(() => {
    const onOpen = (ev: any) => {
      const s = ev?.detail?.state;
      if (looksLikeDailyBonusState(s)) setDailyBonusPopup(s);
    };
    window.addEventListener("ui:daily_bonus_agenda_open", onOpen as any);
    return () => window.removeEventListener("ui:daily_bonus_agenda_open", onOpen as any);
  }, []);

  return (
    <Ctx.Provider value={{ token, user, setAuth, logout, refreshMe, patchUser }}>
      {children}

      {dailyBonusPopup ? (
        <DailyBonusAgendaModal
          state={dailyBonusPopup}
          onClose={() => {
            if (user) {
              const today = parisDayISO();
              const dismissedKey = `dailyBonus:dismissed:${user.id}:${today}`;
              lsSet(dismissedKey, "1"); // ✅ ne se ré-ouvre plus auto aujourd'hui
            }
            setDailyBonusPopup(null);
          }}
          onState={(s) => setDailyBonusPopup(s)}
        />
      ) : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
