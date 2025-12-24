// web/src/auth/AuthProvider.tsx
import * as React from "react";
import type { ApiUser, ApiDailyBonusClaim } from "../lib/api";
import { loadToken, saveToken } from "../lib/storage";
import { me, claimDailyBonus } from "../lib/api";

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

function parisDayISO() {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatGrantedLine(g: any) {
  if (!g) return "—";

  if (g.type === "rubis") {
    return `+${Number(g.amount ?? 0).toLocaleString()} rubis`;
  }

  if (g.type === "token") {
    if (g.token === "wheel_ticket") return `+${g.amount ?? 1} tour(s) de roue`;
    if (g.token === "prestige_token") return `+${g.amount ?? 1} jeton(s) prestige`;
    return `+${g.amount ?? 1} token(s) ${String(g.token)}`;
  }

  if (g.type === "entitlement") {
    const kind = g.kind === "title" ? "Titre" : "Skin";
    if (g.fallback) return `${kind} mensuel (déjà obtenu) → compensation appliquée`;
    return `${kind} mensuel débloqué (sera visible plus tard)`;
  }

  return JSON.stringify(g);
}

function DailyBonusModal({
  data,
  onClose,
}: {
  data: ApiDailyBonusClaim;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"bonus" | "infos" | "event">("bonus");

  const granted = Array.isArray((data as any)?.granted) ? (data as any).granted : [];
  const claimedDays = Number((data as any)?.claimedDays ?? 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        // close si clic en dehors
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(860px, 96vw)",
          maxHeight: "min(720px, 90vh)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 0,
          padding: 0,
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            borderRight: "1px solid rgba(255,255,255,0.08)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 950 }}>Bonus</div>
            <button
              type="button"
              className="btnPrimarySmall"
              onClick={onClose}
              style={{ padding: "6px 10px" }}
              title="Fermer"
            >
              ✕
            </button>
          </div>

          <button
            type="button"
            className={tab === "bonus" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("bonus")}
            style={{ justifyContent: "flex-start" as any }}
          >
            Bonus quotidien
          </button>

          <button
            type="button"
            className={tab === "infos" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("infos")}
            style={{ justifyContent: "flex-start" as any }}
          >
            Informations
          </button>

          <button
            type="button"
            className={tab === "event" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("event")}
            style={{ justifyContent: "flex-start" as any, opacity: 0.75 }}
            title="Bientôt"
          >
            Événements (bientôt)
          </button>

          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
            Jour: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{(data as any)?.day}</strong>
            <br />
            Progression mois:{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{claimedDays}</strong> jours claimés
          </div>

          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.7 }}>
            Paliers: 5 / 10 / 20 / 30
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[5, 10, 20, 30].map((m) => (
              <div
                key={m}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: claimedDays >= m ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 12,
                }}
              >
                {m}j {claimedDays >= m ? "✓" : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 14, overflow: "auto" }}>
          {tab === "bonus" ? (
            <>
              <div className="panelTitle">Récompenses</div>
              <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.85 }}>
                Cycle hebdo: Lun 3 • Mar 3 • Mer 🎡 • Jeu 5 • Ven 5 • Sam 🎡 • Dim 10
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 8 }}>
                  Gagné maintenant
                </div>

                {granted.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {granted.map((g: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 850 }}>{formatGrantedLine(g)}</div>
                        <div className="mutedSmall" style={{ opacity: 0.75 }}>
                          {g.type === "rubis" ? String(g.origin ?? "daily_bonus") : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mutedSmall" style={{ opacity: 0.8 }}>
                    Rien de nouveau (déjà récupéré aujourd’hui).
                  </div>
                )}
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 6 }}>
                  Notes (skins/titres)
                </div>
                <div className="mutedSmall" style={{ opacity: 0.8 }}>
                  Les skins & titres sont enregistrés comme des récompenses “à venir”. Quand on aura le shop/collections,
                  ils apparaîtront automatiquement.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button type="button" className="btnPrimarySmall" onClick={onClose}>
                  Ok
                </button>
              </div>
            </>
          ) : null}

          {tab === "infos" ? (
            <>
              <div className="panelTitle">Informations</div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 8 }}>
                  Comment ça marche
                </div>
                <div className="mutedSmall" style={{ opacity: 0.85, lineHeight: 1.5 }}>
                  • 1 récupération par jour (timezone Europe/Paris).<br />
                  • Les récompenses suivent un cycle hebdomadaire qui se répète.<br />
                  • Les paliers 5/10/20/30 se débloquent selon le nombre de jours récupérés dans le mois.<br />
                  • Les récompenses uniques (skin/titre) ne sont obtenables qu’une fois ; si déjà possédées,
                  une compensation est appliquée.
                </div>
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 8 }}>
                  Paliers du mois (résumé)
                </div>
                <div className="mutedSmall" style={{ opacity: 0.85, lineHeight: 1.5 }}>
                  • 5 jours : +5 rubis<br />
                  • 10 jours : +10 rubis + 1 tour de roue<br />
                  • 20 jours : 1 skin (ou +20 rubis si déjà obtenu)<br />
                  • 30 jours : 1 titre (ou +1 jeton prestige si déjà obtenu)
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button type="button" className="btnPrimarySmall" onClick={onClose}>
                  Ok
                </button>
              </div>
            </>
          ) : null}

          {tab === "event" ? (
            <>
              <div className="panelTitle">Événements</div>
              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
                Onglet réservé pour plus tard (événements, infos plateforme, promos, etc.).
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button type="button" className="btnPrimarySmall" onClick={onClose}>
                  Ok
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => loadToken());
  const [user, setUser] = React.useState<ApiUser | null>(null);

  // ✅ popup daily bonus
  const [dailyBonusPopup, setDailyBonusPopup] = React.useState<ApiDailyBonusClaim | null>(null);

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

  const tryClaimDailyBonus = React.useCallback(async () => {
    if (!token || !user) return;

    const today = parisDayISO();
    const attemptKey = `dailyBonus:lastAttempt:${user.id}`;
    const shownKey = `dailyBonus:lastShown:${user.id}:${today}`;

    // évite de spammer l'API à chaque refreshMe() (interval + focus)
    if (sessionStorage.getItem(attemptKey) === today) return;

    try {
      const r = await claimDailyBonus(token);
      const day = (r as any)?.day || today;

      sessionStorage.setItem(attemptKey, day);

      // Event global (si tu veux écouter ailleurs)
      window.dispatchEvent(new CustomEvent("dailyBonus:result", { detail: r }));

      // Ouvrir le popup seulement si on a des gains, et seulement 1 fois / jour / onglet
      //const granted = Array.isArray((r as any)?.granted) ? (r as any).granted : [];
      if (sessionStorage.getItem(shownKey) !== "1") {
        sessionStorage.setItem(shownKey, "1");
        setDailyBonusPopup(r as any);
      }


      // update solde (simple & safe)
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

  return (
    <Ctx.Provider value={{ token, user, setAuth, logout, refreshMe, patchUser }}>
      {children}

      {dailyBonusPopup ? (
        <DailyBonusModal
          data={dailyBonusPopup}
          onClose={() => setDailyBonusPopup(null)}
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
