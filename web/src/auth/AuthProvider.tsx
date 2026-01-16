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

/** ======= Info content (foundation) =======
 * - par défaut: texte codé ici
 * - admin: peut éditer + persister en localStorage (temp)
 * - plus tard: on branchera une route API admin
 */
const INFO_STORAGE_KEY = "dailyBonus:infoContent:v1";

const DEFAULT_INFO_MD = [
  "### Comment ça marche",
  "• 1 récupération par jour (timezone Europe/Paris).",
  "• Les récompenses suivent un cycle hebdomadaire qui se répète.",
  "• Les paliers 5/10/20/30 se débloquent selon le nombre de jours récupérés dans le mois.",
  "• Les récompenses uniques (skin/titre) ne sont obtenables qu’une fois ; si déjà possédées, une compensation est appliquée.",
  "",
  "### Paliers du mois (résumé)",
  "• 5 jours : +5 rubis",
  "• 10 jours : +10 rubis + 1 tour de roue",
  "• 20 jours : 1 skin (ou +20 rubis si déjà obtenu)",
  "• 30 jours : 1 titre (ou +1 jeton prestige si déjà obtenu)",
].join("\n");

function loadInfoContent(): string {
  try {
    const s = localStorage.getItem(INFO_STORAGE_KEY);
    if (s && s.trim()) return s;
  } catch {}
  return DEFAULT_INFO_MD;
}

function saveInfoContent(v: string) {
  try {
    localStorage.setItem(INFO_STORAGE_KEY, v);
  } catch {}
}

function ProgressBar({ value01 }: { value01: number }) {
  const v = Math.max(0, Math.min(1, value01 || 0));
  return (
    <div
      aria-hidden
      style={{
        height: 10,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.round(v * 100)}%`,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(255,90,180,0.75), rgba(180,140,255,0.75), rgba(80,160,255,0.75))",
          boxShadow: "0 10px 30px rgba(0,0,0,0.30)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(420px 120px at 15% 0%, rgba(255,255,255,0.12), rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function ChipsMilestones({ claimedDays }: { claimedDays: number }) {
  const milestones = [5, 10, 20, 30];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {milestones.map((m) => {
        const ok = claimedDays >= m;
        return (
          <div
            key={m}
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              background: ok ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)",
              border: ok ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              fontWeight: 1000,
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
            }}
            title={ok ? "Palier atteint" : "Palier à atteindre"}
          >
            <span style={{ opacity: 0.9 }}>{m}j</span>
            <span style={{ opacity: ok ? 1 : 0.45 }}>{ok ? "✓" : "•"}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderSimpleMarkdown(md: string) {
  // ultra-light (pas de lib) : headers ### + listes "•"
  const lines = String(md || "").split("\n");
  const out: React.ReactNode[] = [];
  let bufList: string[] = [];

  const flushList = () => {
    if (!bufList.length) return;
    out.push(
      <ul key={`ul-${out.length}`} style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
        {bufList.map((x, i) => (
          <li key={i} style={{ opacity: 0.9 }}>
            {x}
          </li>
        ))}
      </ul>
    );
    bufList = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      out.push(<div key={`sp-${out.length}`} style={{ height: 10 }} />);
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      out.push(
        <div key={`h-${out.length}`} style={{ fontWeight: 1400, letterSpacing: -0.2, marginTop: out.length ? 6 : 0 }}>
          {line.replace(/^###\s+/, "")}
        </div>
      );
      continue;
    }

    if (line.startsWith("• ")) {
      bufList.push(line.replace(/^•\s+/, ""));
      continue;
    }

    flushList();
    out.push(
      <div key={`p-${out.length}`} style={{ opacity: 0.88, lineHeight: 1.55 }}>
        {line}
      </div>
    );
  }

  flushList();
  return out;
}

function DailyBonusModal({
  data,
  onClose,
  isAdmin,
}: {
  data: ApiDailyBonusClaim;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const [tab, setTab] = React.useState<"bonus" | "infos" | "event">("bonus");

  const granted = Array.isArray((data as any)?.granted) ? (data as any).granted : [];
  const claimedDays = Number((data as any)?.claimedDays ?? 0);
  const dayLabel = String((data as any)?.day || "");

  // admin-edit foundation
  const [editing, setEditing] = React.useState(false);
  const [infoMd, setInfoMd] = React.useState(() => loadInfoContent());

  const progress01 = React.useMemo(() => {
    // progression vers 30 jours
    return Math.max(0, Math.min(1, claimedDays / 30));
  }, [claimedDays]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="dailyBonusOverlay"
      style={{
        position: "fixed",
        inset: 0,
        // ✅ overlay plus opaque
        background: "rgba(0,0,0,0.88)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .dailyBonusOverlay::before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(255,90,180,0.20), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(80,160,255,0.18), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(140,90,255,0.18), rgba(0,0,0,0) 64%);
          opacity: 0.95;
        }
        .dailyBonusModal{
          width: min(980px, 96vw);
          max-height: min(740px, 90vh);
          overflow: hidden;
          display: grid;
          grid-template-columns: 270px 1fr;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.18));
          box-shadow: 0 30px 120px rgba(0,0,0,0.55);
          backdrop-filter: blur(14px);
          position: relative;
          transform: translateZ(0);
        }
        .dailyBonusModal::after{
          content:"";
          position:absolute;
          inset:-2px;
          border-radius: 28px;
          pointer-events:none;
          background:
            radial-gradient(900px 320px at 15% 0%, rgba(255,90,180,0.18), rgba(0,0,0,0) 60%),
            radial-gradient(900px 320px at 90% 10%, rgba(80,160,255,0.16), rgba(0,0,0,0) 62%);
          opacity: 0.75;
        }
        .dbSidebar{
          position: relative;
          z-index: 1;
          border-right: 1px solid rgba(255,255,255,0.10);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background:
            radial-gradient(600px 220px at 20% 0%, rgba(140,90,255,0.16), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18));
        }
        .dbMain{
          position: relative;
          z-index: 1;
          padding: 16px;
          overflow: auto;
        }
        .dbTitle{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .dbTitle h3{
          margin:0;
          font-size: 16px;
          font-weight: 1400;
          letter-spacing: -0.3px;
        }
        .dbSub{
          margin-top: 4px;
          font-size: 12px;
          opacity: 0.78;
          font-weight: 900;
        }
        .dbNavBtn{
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          color: inherit;
          cursor: pointer;
          font-weight: 1100;
          display:flex;
          gap: 10px;
          align-items:center;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }
        .dbNavBtn:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
        }
        .dbNavBtnActive{
          border-color: rgba(255,90,180,0.28);
          background:
            radial-gradient(520px 160px at 30% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
            rgba(255,255,255,0.05);
        }
        .dbPanel{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          padding: 12px;
        }
        .dbItem{
          padding: 10px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          display:flex;
          justify-content: space-between;
          gap: 10px;
        }
        .dbOkRow{
          display:flex;
          justify-content:flex-end;
          margin-top: 14px;
        }
        .dbCloseBtn{
          width: 38px;
          height: 38px;
          display:grid;
          place-items:center;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
          cursor:pointer;
          color: inherit;
        }
        .dbCloseBtn:hover{
          border-color: rgba(255,255,255,0.18);
        }
        @media (max-width: 860px){
          .dailyBonusModal{ grid-template-columns: 1fr; }
          .dbSidebar{ border-right: none; border-bottom: 1px solid rgba(255,255,255,0.10); }
        }
      `}</style>

      <div className="dailyBonusModal">
        {/* Sidebar */}
        <div className="dbSidebar">
          <div className="dbTitle">
            <div>
              <h3>
                <span style={{ opacity: 0.9 }}>🎁</span> Bonus quotidien
              </h3>
              <div className="dbSub">
                Jour <span style={{ opacity: 0.95 }}>{dayLabel || "—"}</span> •{" "}
                <span style={{ opacity: 0.95 }}>{claimedDays}</span> jours ce mois-ci
              </div>
            </div>

            <button type="button" className="dbCloseBtn" onClick={onClose} title="Fermer">
              ✕
            </button>
          </div>

          <div style={{ marginTop: 6 }}>
            <div className="mutedSmall" style={{ opacity: 0.8, marginBottom: 8 }}>
              Progression (30j)
            </div>
            <ProgressBar value01={progress01} />
            <div style={{ marginTop: 10 }}>
              <ChipsMilestones claimedDays={claimedDays} />
            </div>
          </div>



          <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
            <button
              type="button"
              className={`dbNavBtn ${tab === "bonus" ? "dbNavBtnActive" : ""}`}
              onClick={() => setTab("bonus")}
            >
              <span>💎</span> Récompenses
            </button>

            <button
              type="button"
              className={`dbNavBtn ${tab === "infos" ? "dbNavBtnActive" : ""}`}
              onClick={() => setTab("infos")}
            >
              <span>ℹ️</span> Informations
            </button>

            <button
              type="button"
              className={`dbNavBtn ${tab === "event" ? "dbNavBtnActive" : ""}`}
              onClick={() => setTab("event")}
              style={{ opacity: 0.7 }}
              title="Bientôt"
            >
              <span>✨</span> Événements (bientôt)
            </button>
          </div>

          <div className="mutedSmall" style={{ marginTop: "auto", opacity: 0.75, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 1100, opacity: 0.9 }}>Cycle hebdo</div>
            Lun 3 • Mar 3 • Mer 🎡 • Jeu 5 • Ven 5 • Sam 🎡 • Dim 10
          </div>
        </div>

        {/* Content */}
        <div className="dbMain">
          {tab === "bonus" ? (
            <>
              <div className="panelTitle" style={{ margin: 0 }}>
                Récompenses
              </div>
              <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.85 }}>
                Ce que tu reçois aujourd’hui (si déjà récupéré, tu verras “déjà obtenu”).
              </div>

              <div className="dbPanel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 10, opacity: 0.8 }}>
                  Gagné maintenant
                </div>

                {granted.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {granted.map((g: any, i: number) => (
                      <div key={i} className="dbItem">
                        <div style={{ fontWeight: 1200, letterSpacing: -0.2 }}>{formatGrantedLine(g)}</div>
                        <div className="mutedSmall" style={{ opacity: 0.72 }}>
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

              <div className="dbOkRow">
                <button type="button" className="btnPrimarySmall" onClick={onClose}>
                  Ok
                </button>
              </div>
            </>
          ) : null}

          {tab === "infos" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div className="panelTitle" style={{ margin: 0 }}>
                  Informations
                </div>

                {isAdmin ? (
                  <button
                    type="button"
                    className={editing ? "btnPrimarySmall" : "btnGhostSmall"}
                    onClick={() => setEditing((v) => !v)}
                    title="Admin: éditer le contenu"
                  >
                    {editing ? "✅ Mode édition" : "✏️ Éditer"}
                  </button>
                ) : null}
              </div>

              <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.82 }}>
                (Foundation) Ce bloc sera branché sur une route admin plus tard.
              </div>

              <div className="dbPanel" style={{ marginTop: 12 }}>
                {!editing ? (
                  <div className="mutedSmall" style={{ opacity: 0.88 }}>
                    {renderSimpleMarkdown(infoMd)}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="mutedSmall" style={{ opacity: 0.8 }}>
                      Format simple : lignes, “### titre”, listes “•”.
                    </div>

                    <textarea
                      value={infoMd}
                      onChange={(e) => setInfoMd(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 260,
                        resize: "vertical",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.35)",
                        color: "inherit",
                        padding: 12,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: 12,
                        lineHeight: 1.5,
                        outline: "none",
                      }}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btnGhostSmall"
                        onClick={() => setInfoMd(loadInfoContent())}
                        title="Recharger depuis localStorage"
                      >
                        Recharger
                      </button>

                      <button
                        type="button"
                        className="btnGhostSmall"
                        onClick={() => {
                          setInfoMd(DEFAULT_INFO_MD);
                        }}
                        title="Réinitialiser au contenu par défaut"
                      >
                        Reset défaut
                      </button>

                      <button
                        type="button"
                        className="btnPrimarySmall"
                        onClick={() => {
                          saveInfoContent(infoMd);
                          setEditing(false);
                        }}
                        title="Sauvegarder (localStorage temporaire)"
                      >
                        Sauvegarder
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="dbOkRow">
                <button type="button" className="btnPrimarySmall" onClick={onClose}>
                  Ok
                </button>
              </div>
            </>
          ) : null}

          {tab === "event" ? (
            <>
              <div className="panelTitle" style={{ margin: 0 }}>
                Événements
              </div>
              <div className="dbPanel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ opacity: 0.84, lineHeight: 1.55 }}>
                  Onglet réservé pour plus tard (événements, infos plateforme, promos, etc.).
                </div>
              </div>
              <div className="dbOkRow">
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

      // Event global
      window.dispatchEvent(new CustomEvent("dailyBonus:result", { detail: { ...r, source: "auto" } }));

      // Ouvrir le popup seulement 1 fois / jour / onglet
      if (sessionStorage.getItem(shownKey) !== "1") {
        sessionStorage.setItem(shownKey, "1");
        setDailyBonusPopup(r as any);
      }

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

  const isAdmin = String((user as any)?.role || "").toLowerCase() === "admin";

  return (
    <Ctx.Provider value={{ token, user, setAuth, logout, refreshMe, patchUser }}>
      {children}

      {dailyBonusPopup ? (
        <DailyBonusModal data={dailyBonusPopup} onClose={() => setDailyBonusPopup(null)} isAdmin={isAdmin} />
      ) : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
