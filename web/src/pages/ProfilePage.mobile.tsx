// web/src/pages/ProfilePage.mobile.tsx
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { myFollowing, myProfileStats, type ApiFollowing, type ApiProfileStats } from "../lib/api_profile";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ──────────────────────────────────────────
   Helpers (copiés/alignés sur ProfilePage + StreamerPage.mobile)
────────────────────────────────────────── */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function fmt(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
}
function initials(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}
function humanDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} min`;
}
function dowLabel(dow: number | null | undefined) {
  if (dow == null) return "—";
  const labels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return labels[dow] ?? String(dow);
}
function hourLabel(hour: number | null | undefined) {
  if (hour == null) return "—";
  const h = clamp(Math.floor(hour), 0, 23);
  return `${String(h).padStart(2, "0")}:00`;
}
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}
function getAvatarUrl(u: any): string | null {
  // ✅ On essaye plusieurs champs possibles (selon backend/DB), sans rien casser.
  const candidates = [
    u?.avatarUrl,
    u?.avatar_url,
    u?.avatar,
    u?.photoUrl,
    u?.photo_url,
    u?.picture,
    u?.imageUrl,
    u?.image_url,
  ].filter(Boolean);

  const v = candidates[0];
  if (!v) return null;
  const s = String(v);
  if (!s) return null;
  return absolutize(s) ?? s;
}

/**
 * Avatar resolver user (comme StreamerPage.mobile):
 * - priorité à user.avatarUrl/etc.
 * - sinon fallback sur /avatars/u/:id (cache-bust soft 1/min)
 */
function pickUserAvatarUrl(user: any) {
  const uid = user?.id != null ? Number(user.id) : null;
  const direct = getAvatarUrl(user);
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return direct || byUid;
}

function pillBase(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
    color: active ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.78)",
    fontWeight: 950,
    whiteSpace: "nowrap",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
    transform: active ? "translateY(-1px)" : "translateY(0px)",
  };
}
function smallBadge(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    fontWeight: 950,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

/* ──────────────────────────────────────────
   Minimal “Account Settings” (copié du ProfilePage)
   -> on le gardera ici pour mobile-friendly ensuite
────────────────────────────────────────── */
function AccountSettingsModal({
  open,
  onClose,
  token,
  onAfterChange,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  onAfterChange: () => Promise<void> | void;
}) {
  const [tab, setTab] = React.useState<"rename" | "password">("rename");

  // rename
  const [newUsername, setNewUsername] = React.useState("");
  const [renameCodeSent, setRenameCodeSent] = React.useState(false);
  const [renameCode, setRenameCode] = React.useState("");
  const [renamePay, setRenamePay] = React.useState(false);
  const [renameHint, setRenameHint] = React.useState<string | null>(null);
  const [renameBusy, setRenameBusy] = React.useState(false);

  // password
  const [passCodeSent, setPassCodeSent] = React.useState(false);
  const [passCode, setPassCode] = React.useState("");
  const [p1, setP1] = React.useState("");
  const [p2, setP2] = React.useState("");
  const [showP1, setShowP1] = React.useState(false);
  const [showP2, setShowP2] = React.useState(false);
  const [passHint, setPassHint] = React.useState<string | null>(null);
  const [passBusy, setPassBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTab("rename");
    setRenameHint(null);
    setPassHint(null);
    setRenameCodeSent(false);
    setPassCodeSent(false);
    setRenameCode("");
    setPassCode("");
    setNewUsername("");
    setRenamePay(false);
    setP1("");
    setP2("");
    setShowP1(false);
    setShowP2(false);
  }, [open]);

    React.useEffect(() => {
    if (!open) return;

    // bloque le scroll derrière la modale (mobile friendly)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // fermeture via Escape
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function post(path: string, body: any) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const data = await r.json().catch(() => ({}));
    return { r, data };
  }

  async function sendRenameCode() {
    setRenameBusy(true);
    setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/request-code", { newUsername });
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      setRenameCodeSent(true);
      setRenameHint("Code envoyé par email ✅");
    } catch (e: any) {
      setRenameHint(String(e?.message || "Erreur envoi code"));
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmRename() {
    setRenameBusy(true);
    setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/confirm", {
        newUsername,
        code: renameCode,
        payIfNeeded: renamePay,
      });

      if (r.status === 409 && data?.error === "cooldown") {
        setRenameHint(
          `Cooldown: encore ${data.remainingDays}j. Coche “payer ${data.price} rubis” pour rename maintenant.`
        );
        return;
      }

      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);

      try {
        localStorage.setItem("token", String(data.token || ""));
      } catch {}

      setRenameHint(`Pseudo mis à jour ✅${data.paid ? ` (payé ${data.paid} rubis)` : ""} — refresh…`);
      await Promise.resolve(onAfterChange());
      window.location.reload();
    } catch (e: any) {
      setRenameHint(String(e?.message || "Erreur rename"));
    } finally {
      setRenameBusy(false);
    }
  }

  async function sendPasswordCode() {
    setPassBusy(true);
    setPassHint(null);
    try {
      const { r, data } = await post("/me/password/request-code", {});
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      setPassCodeSent(true);
      setPassHint("Code envoyé par email ✅");
    } catch (e: any) {
      setPassHint(String(e?.message || "Erreur envoi code"));
    } finally {
      setPassBusy(false);
    }
  }

  async function confirmPassword() {
    setPassBusy(true);
    setPassHint(null);
    try {
      if (!p1 || p1.length < 6) throw new Error("password_too_short");
      if (p1 !== p2) throw new Error("password_mismatch");

      const { r, data } = await post("/me/password/confirm", { code: passCode, newPassword: p1 });
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);

      setPassHint("Mot de passe mis à jour ✅");
      setPassCode("");
      setP1("");
      setP2("");
    } catch (e: any) {
      const msg = String(e?.message || "Erreur mot de passe");
      if (msg === "password_mismatch") setPassHint("Les mots de passe ne matchent pas.");
      else if (msg === "password_too_short") setPassHint("Mot de passe trop court (min 6).");
      else setPassHint(msg);
    } finally {
      setPassBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 12,
      }}
    >
      <div
        style={{
          width: "min(560px, 96vw)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "radial-gradient(900px 300px at 20% 0%, rgba(140,90,255,0.30), rgba(0,0,0,0) 60%), radial-gradient(700px 260px at 85% 20%, rgba(255,90,180,0.18), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18))",
          boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 1100, letterSpacing: -0.2, fontSize: 16 }}>⚙️ Paramètres du compte</div>
          <button className="btnGhostSmall" onClick={onClose} type="button">
            ✖
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className={tab === "rename" ? "btnPrimarySmall" : "btnGhostSmall"} onClick={() => setTab("rename")}>
            ✍️ Pseudo
          </button>
          <button
            className={tab === "password" ? "btnPrimarySmall" : "btnGhostSmall"}
            onClick={() => setTab("password")}
          >
            🔒 Mot de passe
          </button>
        </div>

        {tab === "rename" ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div className="mutedSmall">Rename gratuit tous les 30 jours. Sinon tu peux payer <b>1000 rubis</b>.</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Nouveau pseudo"
                style={{
                  flex: "1 1 220px",
                  minWidth: 200,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit",
                  outline: "none",
                  fontWeight: 850,
                }}
              />
              <button className="btnGhostSmall" onClick={sendRenameCode} disabled={renameBusy || !newUsername.trim()}>
                📩 Code
              </button>
            </div>

            {renameCodeSent ? (
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={renameCode}
                  onChange={(e) => setRenameCode(e.target.value)}
                  placeholder="Code (6 chiffres)"
                  style={{
                    width: "min(280px, 100%)",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                  <input type="checkbox" checked={renamePay} onChange={(e) => setRenamePay(e.target.checked)} />
                  Payer 1000 rubis si cooldown
                </label>

                <button
                  className="btnPrimarySmall"
                  onClick={confirmRename}
                  disabled={renameBusy || !renameCode.trim() || !newUsername.trim()}
                >
                  ✅ Valider
                </button>
              </div>
            ) : null}

            {renameHint ? <div className="mutedSmall">{renameHint}</div> : null}
          </div>
        ) : null}

        {tab === "password" ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div className="mutedSmall">Changement de mot de passe via code email.</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btnGhostSmall" onClick={sendPasswordCode} disabled={passBusy}>
                📩 Envoyer code
              </button>
              {passCodeSent ? <span className="mutedSmall">Code envoyé ✅</span> : null}
            </div>

            {passCodeSent ? (
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={passCode}
                  onChange={(e) => setPassCode(e.target.value)}
                  placeholder="Code (6 chiffres)"
                  style={{
                    width: "min(280px, 100%)",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={p1}
                      onChange={(e) => setP1(e.target.value)}
                      type={showP1 ? "text" : "password"}
                      placeholder="Nouveau mot de passe"
                      style={{
                        flex: "1 1 240px",
                        minWidth: 200,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "inherit",
                        outline: "none",
                        fontWeight: 850,
                      }}
                    />
                    <button className="btnGhostSmall" onClick={() => setShowP1((v) => !v)} type="button">
                      {showP1 ? "🙈" : "👁️"}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={p2}
                      onChange={(e) => setP2(e.target.value)}
                      type={showP2 ? "text" : "password"}
                      placeholder="Confirmer"
                      style={{
                        flex: "1 1 240px",
                        minWidth: 200,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "inherit",
                        outline: "none",
                        fontWeight: 850,
                      }}
                    />
                    <button className="btnGhostSmall" onClick={() => setShowP2((v) => !v)} type="button">
                      {showP2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button className="btnPrimarySmall" onClick={confirmPassword} disabled={passBusy}>
                  ✅ Mettre à jour
                </button>
              </div>
            ) : null}

            {passHint ? <div className="mutedSmall">{passHint}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Mobile page
────────────────────────────────────────── */
type MobileTabKey = "menu" | "style" | "social" | "stats" | "streamer";
const TAB_ORDER: MobileTabKey[] = ["menu", "style", "social", "stats", "streamer"];

function clampTabIndex(i: number) {
  return Math.max(0, Math.min(TAB_ORDER.length - 1, i));
}
function tabIndexOf(t: MobileTabKey) {
  const i = TAB_ORDER.indexOf(t);
  return i >= 0 ? i : 0;
}
function nextTab(t: MobileTabKey) {
  return TAB_ORDER[clampTabIndex(tabIndexOf(t) + 1)];
}
function prevTab(t: MobileTabKey) {
  return TAB_ORDER[clampTabIndex(tabIndexOf(t) - 1)];
}

export default function ProfilePageMobile() {
  const { user, token, refreshMe } = useAuth() as any;
  const navigate = useNavigate();

  const [tab, setTab] = React.useState<MobileTabKey>("menu");
  const [tabView, setTabView] = React.useState<MobileTabKey>("menu");
  const [tabAnim, setTabAnim] = React.useState<{ stage: "idle" | "leaving" | "entering"; dir: -1 | 1 }>({
    stage: "idle",
    dir: 1,
  });

  const tabAnimRef = React.useRef(tabAnim);
  React.useEffect(() => {
    tabAnimRef.current = tabAnim;
  }, [tabAnim]);

  const timersRef = React.useRef<number[]>([]);
  React.useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  // modals
  const [achOpen, setAchOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // streamer request status
  const [reqStatus, setReqStatus] = React.useState<string | null>(null);
  const [busyApply, setBusyApply] = React.useState(false);

  // social
  const [q, setQ] = React.useState("");
  const dq = useDebouncedValue(q, 250);
  const [following, setFollowing] = React.useState<ApiFollowing[]>([]);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [followErr, setFollowErr] = React.useState<string | null>(null);

  // stats
  const [stats, setStats] = React.useState<ApiProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsErr, setStatsErr] = React.useState<string | null>(null);

  // avatar
  const avatarUrl = user ? pickUserAvatarUrl(user) : null;
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarUrl]);

  
  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      try {
        const r = await myStreamerRequest(token);
        setReqStatus(r.request?.status ?? null);
      } catch {
        setReqStatus(null);
      }
    })();
  }, [token]);

  async function onApply() {
    if (!token) return;
    setBusyApply(true);
    try {
      const r = await applyStreamer(token);
      setReqStatus(r.request?.status ?? null);
      await refreshMe();
    } finally {
      setBusyApply(false);
    }
  }

  // Load following when Social tab opens or query changes
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      if (tab !== "social") return;

      setFollowLoading(true);
      setFollowErr(null);
      try {
        const r = await myFollowing(token, { q: dq, limit: 120 });
        if (cancelled) return;
        setFollowing(r.items);
      } catch (e: any) {
        if (cancelled) return;
        setFollowErr(e?.message ?? "Erreur chargement following");
        setFollowing([]);
      } finally {
        if (!cancelled) setFollowLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tab, dq]);

  // Load stats when Stats tab opens
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      if (tab !== "stats") return;

      setStatsLoading(true);
      setStatsErr(null);
      try {
        const r = await myProfileStats(token);
        if (cancelled) return;
        setStats(r);
      } catch (e: any) {
        if (cancelled) return;
        setStats(null);
        setStatsErr(e?.message ?? "Erreur chargement stats");
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  // derived stats
  const s: any = stats ?? {};
  const netRubis =
    typeof s.rubisEarnedTotal === "number" && typeof s.rubisSpentTotal === "number"
      ? s.rubisEarnedTotal - s.rubisSpentTotal
      : null;

  // ──────────────────────────────────────────
  // Tabs: goTab (slide + fade)
  // ──────────────────────────────────────────
  const LEAVE_MS = 140;
  const ENTER_MS = 170;

  const goTab = React.useCallback(
    (next: MobileTabKey) => {
      if (next === tab) return;

      const curI = tabIndexOf(tab);
      const nextI = tabIndexOf(next);
      const dir: -1 | 1 = nextI > curI ? 1 : -1;

      setTab(next);

      if (tabAnimRef.current.stage !== "idle") {
        setTabView(next);
        setTabAnim({ stage: "entering", dir });
        const id = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0);
        timersRef.current.push(id);
        return;
      }

      setTabAnim({ stage: "leaving", dir });
      const id = window.setTimeout(() => {
        setTabView(next);
        setTabAnim({ stage: "entering", dir });
        const id2 = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0);
        timersRef.current.push(id2);
      }, LEAVE_MS);

      timersRef.current.push(id);
    },
    [tab]
  );

  const tabRowRef = React.useRef<HTMLDivElement | null>(null);
  const tabBtnRefs = React.useRef<Partial<Record<MobileTabKey, HTMLButtonElement | null>>>({});

  React.useEffect(() => {
    const el = tabBtnRefs.current[tab];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    } catch {}
  }, [tab]);

  // ──────────────────────────────────────────
  // Swipe tabs (safe)
  // ──────────────────────────────────────────
  const swipeEnabled = !achOpen && !settingsOpen;

  const swipeRef = React.useRef({
    x0: 0,
    y0: 0,
    t0: 0,
    active: false,
    tracking: false,
    locked: false as false | "x" | "y",
  });

  const SWIPE_MIN_X = 60;
  const SWIPE_MAX_Y = 70;
  const SWIPE_MAX_MS = 650;
  const EDGE_GUARD = 8;

  function isInteractiveTarget(target: any) {
    const tag = String(target?.tagName || "").toLowerCase();
    if (!tag) return false;
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a") return true;
    if (target?.closest?.("[data-no-swipe='1']")) return true;
    return false;
  }

  function onSwipeStart(e: React.TouchEvent) {
    if (!swipeEnabled) return;
    const t = e.touches?.[0];
    if (!t) return;

    if (isInteractiveTarget(e.target)) return;
    if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;

    swipeRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      t0: Date.now(),
      active: true,
      tracking: true,
      locked: false,
    };
  }

  function onSwipeMove(e: React.TouchEvent) {
    if (!swipeRef.current.active) return;

    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;

    if (!swipeRef.current.locked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        swipeRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (swipeRef.current.locked === "y") {
      swipeRef.current.active = false;
      swipeRef.current.tracking = false;
      return;
    }
  }

  function onSwipeEnd(e: React.TouchEvent) {
    if (!swipeRef.current.tracking) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;
    const dt = Date.now() - swipeRef.current.t0;

    swipeRef.current.active = false;
    swipeRef.current.tracking = false;

    if (dt > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_X) return;
    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) goTab(nextTab(tab));
    else goTab(prevTab(tab));
  }

  const contentAnimStyle: React.CSSProperties = React.useMemo(() => {
    const base: React.CSSProperties = { willChange: "transform, opacity" };

    if (tabAnim.stage === "leaving") {
      return {
        ...base,
        transition: `transform ${LEAVE_MS}ms ease, opacity ${LEAVE_MS}ms ease`,
        transform: `translateX(${tabAnim.dir === 1 ? -22 : 22}px)`,
        opacity: 0,
      };
    }
    if (tabAnim.stage === "entering") {
      return {
        ...base,
        transition: "none",
        transform: `translateX(${tabAnim.dir === 1 ? 22 : -22}px)`,
        opacity: 0,
      };
    }
    return {
      ...base,
      transition: `transform ${ENTER_MS}ms ease, opacity ${ENTER_MS}ms ease`,
      transform: "translateX(0px)",
      opacity: 1,
    };
  }, [tabAnim.stage, tabAnim.dir]);

  if (!user) {
    return (
      <main className="container" style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
        <div className="pageTitle">
          <h1>Profil</h1>
          <p className="muted">Connecte-toi pour accéder à ton profil.</p>
        </div>
      </main>
    );
  }

  const isStreamerOrAdmin = user.role === "streamer" || user.role === "admin";

  return (
    <main className="container" style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ll-float { animation: llFloat 10s ease-in-out infinite; }
          @keyframes llFloat { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        }
      `}</style>

      {/* HEADER CARD (compact) */}
      <div
        className="panel"
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 18,
          background:
            "radial-gradient(700px 220px at 15% 0%, rgba(140,90,255,0.30), rgba(0,0,0,0) 60%), radial-gradient(560px 220px at 88% 20%, rgba(255,90,180,0.18), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 55px rgba(0,0,0,0.30)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div className="ll-float" style={{ position: "absolute", right: 12, top: 10, opacity: 0.9 }}>
          🌙✨
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* avatar */}
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.18)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
            title={user.username}
          >
            {avatarUrl && avatarOk ? (
              <img
                src={String(avatarUrl)}
                alt={user.username}
                onError={() => setAvatarOk(false)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontWeight: 1000, opacity: 0.92 }}>{initials(user.username)}</span>
            )}
          </div>

          {/* identity */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontWeight: 1100,
                fontSize: 16,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={user.username}
            >
              {user.username}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={smallBadge()}>🛡️ {String(user.role)}</span>
              <span style={smallBadge()}>💎 {fmt(user.rubis)} rubis</span>
            </div>
          </div>

          {/* quick actions */}
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
            <button className="btnGhostSmall" onClick={() => setAchOpen(true)} type="button" title="Succès">
              🏆
            </button>
            {token ? (
              <button className="btnGhostSmall" onClick={() => setSettingsOpen(true)} type="button" title="Paramètres">
                ⚙️
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* TABS ROW (swipe like StreamerPage.mobile) */}
      <div
        className="panel"
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 18,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div ref={tabRowRef} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            ref={(el) => {
              tabBtnRefs.current.menu = el;
            }}
            type="button"
            style={pillBase(tab === "menu")}
            onClick={() => goTab("menu")}
          >
            Menu
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.style = el;
            }}
            type="button"
            style={pillBase(tab === "style")}
            onClick={() => goTab("style")}
          >
            🎨 Style
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.social = el;
            }}
            type="button"
            style={pillBase(tab === "social")}
            onClick={() => goTab("social")}
          >
            🤝 Social
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.stats = el;
            }}
            type="button"
            style={pillBase(tab === "stats")}
            onClick={() => goTab("stats")}
          >
            📊 Stats
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.streamer = el;
            }}
            type="button"
            style={pillBase(tab === "streamer")}
            onClick={() => goTab("streamer")}
          >
            🚀 Streamer
          </button>
        </div>
      </div>

      {/* CONTENT (swipe + anim) */}
      <div
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
        style={{ touchAction: "pan-y", marginTop: 10 }}
      >
        <div style={contentAnimStyle}>
          {tabView === "menu" ? (
            <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>⚡ Accès rapide</div>
              <div className="mutedSmall" style={{ marginTop: 6 }}>
                Un menu simple. Les “gros modules” seront refaits en modals mobile-friendly ensuite.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <button
                  type="button"
                  className="btnPrimarySmall"
                  onClick={() => setSettingsOpen(true)}
                  disabled={!token}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>⚙️ Paramètres</span>
                  <span className="mutedSmall">{token ? "Ouvrir" : "Login"}</span>
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => setAchOpen(true)}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>🏆 Succès</span>
                  <span className="mutedSmall">Ouvrir</span>
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => goTab("style")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>🎨 Personnalisation</span>
                  <span className="mutedSmall">Aller</span>
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => goTab("social")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>🤝 Social</span>
                  <span className="mutedSmall">Aller</span>
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => goTab("stats")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>📊 Stats</span>
                  <span className="mutedSmall">Aller</span>
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => goTab("streamer")}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>🚀 Streamer</span>
                  <span className="mutedSmall">Aller</span>
                </button>

                {isStreamerOrAdmin ? (
                  <button
                    type="button"
                    className="btnPrimarySmall"
                    onClick={() => navigate("/dashboard")}
                    style={{ justifyContent: "space-between", display: "flex" }}
                  >
                    <span style={{ fontWeight: 950 }}>🟢 Dashboard streamer</span>
                    <span className="mutedSmall">Ouvrir</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {tabView === "style" ? (
            <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>🎨 Personnalisation</div>
                <button className="btnGhostSmall" type="button" onClick={() => goTab("menu")}>
                  Retour
                </button>
              </div>
              <div className="mutedSmall" style={{ marginTop: 6 }}>
                (Temp) On l’affiche inline. Ensuite on le bascule en modal mobile clean.
              </div>

              <div style={{ marginTop: 10 }}>
                <PersonalisationSection username={user.username} />
              </div>
            </div>
          ) : null}

          {tabView === "social" ? (
            <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>🤝 Following</div>
                <button className="btnGhostSmall" type="button" onClick={() => goTab("menu")}>
                  Retour
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="🔎 Rechercher…"
                  style={{
                    flex: "1 1 220px",
                    minWidth: 180,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    outline: "none",
                    fontWeight: 850,
                  }}
                />
                <button className="btnGhostSmall" onClick={() => setQ("")} disabled={!q} type="button">
                  Reset
                </button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.12)",
                  padding: 10,
                  maxHeight: 440,
                  overflow: "auto",
                }}
              >
                {followLoading ? (
                  <div className="mutedSmall" style={{ padding: 10 }}>
                    Chargement… ⏳
                  </div>
                ) : followErr ? (
                  <div className="mutedSmall" style={{ padding: 10 }}>
                    {followErr}
                  </div>
                ) : following.length === 0 ? (
                  <div className="mutedSmall" style={{ padding: 10 }}>
                    Aucun résultat.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {following.map((f: any) => {
                      const fAvatar = getAvatarUrl(f);
                      const live = typeof f.isLive === "boolean" ? f.isLive : null;

                      return (
                        <div
                          key={f.id ?? f.slug}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "12px 12px",
                            borderRadius: 16,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background:
                              live === true
                                ? "linear-gradient(90deg, rgba(255,90,180,0.14), rgba(80,160,255,0.10), rgba(255,255,255,0.03))"
                                : "rgba(255,255,255,0.04)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 16,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background:
                                  "linear-gradient(135deg, rgba(140,90,255,0.22), rgba(80,160,255,0.12), rgba(255,90,180,0.08))",
                                overflow: "hidden",
                                display: "grid",
                                placeItems: "center",
                                flex: "0 0 auto",
                              }}
                              title={f.displayName ?? f.slug}
                            >
                              {fAvatar ? (
                                <img
                                  src={fAvatar}
                                  alt={f.displayName ?? f.slug}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <div style={{ fontWeight: 1000 }}>{initials(f.displayName ?? f.slug)}</div>
                              )}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 1000,
                                  lineHeight: 1.2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {f.displayName ?? f.slug} {live === true ? <span style={{ marginLeft: 6 }}>🔴</span> : null}
                              </div>
                              <div className="mutedSmall" style={{ marginTop: 2, opacity: 0.85 }}>
                                @{f.slug}
                                {live === true ? " • live" : live === false ? " • offline" : ""}
                              </div>
                            </div>
                          </div>

                          <Link to={`/s/${f.slug}`} className="btnGhostSmall" data-no-swipe="1">
                            👀 Voir
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tabView === "stats" ? (
            <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>📊 Stats (mobile)</div>
                <button
                  className="btnGhostSmall"
                  type="button"
                  onClick={() => {
                    setStatsLoading(true);
                    setStatsErr(null);
                    (async () => {
                      if (!token) return;
                      try {
                        const r = await myProfileStats(token);
                        setStats(r);
                      } catch (e: any) {
                        setStats(null);
                        setStatsErr(e?.message ?? "Erreur chargement stats");
                      } finally {
                        setStatsLoading(false);
                      }
                    })();
                  }}
                  disabled={statsLoading}
                  title="Rafraîchir"
                >
                  🔄
                </button>
              </div>

              <div className="mutedSmall" style={{ marginTop: 6 }}>
                {statsErr ? <span style={{ color: "rgba(255,120,120,0.95)" }}>{statsErr}</span> : "Vue compacte (on fera une version encore plus sexy ensuite)."}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={smallBadge()}>📅 {s.accountAgeDays != null ? `${fmt(s.accountAgeDays)} j` : "—"}</span>
                <span style={smallBadge()}>👥 {s.followingCount != null ? fmt(s.followingCount) : "—"} suivis</span>
                <span style={smallBadge()}>⏰ {hourLabel(s.mostActiveChatHour)}</span>
                <span style={smallBadge()}>🗓️ {dowLabel(s.mostActiveChatDow)}</span>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>⏱️ Watchtime total</div>
                    <div style={{ fontWeight: 1000 }}>{statsLoading ? "…" : humanDuration(s.watchSecondsTotal)}</div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>💬 Messages</div>
                    <div style={{ fontWeight: 1000 }}>{statsLoading ? "…" : s.chatMessagesTotal != null ? fmt(s.chatMessagesTotal) : "—"}</div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>💎 Rubis gagnés</div>
                    <div style={{ fontWeight: 1000 }}>{statsLoading ? "…" : s.rubisEarnedTotal != null ? fmt(s.rubisEarnedTotal) : "—"}</div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>🔥 Rubis dépensés</div>
                    <div style={{ fontWeight: 1000 }}>{statsLoading ? "…" : s.rubisSpentTotal != null ? fmt(s.rubisSpentTotal) : "—"}</div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>🧮 Net rubis</div>
                    <div style={{ fontWeight: 1000 }}>{statsLoading ? "…" : netRubis == null ? "—" : fmt(netRubis)}</div>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div className="mutedSmall" style={{ opacity: 0.9 }}>
                    Extras
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={smallBadge()}>🎡 {s.dailyWheelSpinsTotal != null ? `${fmt(s.dailyWheelSpinsTotal)} spins` : "—"}</span>
                    <span style={smallBadge()}>🗓️ {s.dailyBonusClaimsTotal != null ? `${fmt(s.dailyBonusClaimsTotal)} claims` : "—"}</span>
                    <span style={smallBadge()}>🎁 {s.entitlementsTotal != null ? `${fmt(s.entitlementsTotal)} items` : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tabView === "streamer" ? (
            <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>🚀 Espace streamer</div>
                <button className="btnGhostSmall" type="button" onClick={() => goTab("menu")}>
                  Retour
                </button>
              </div>

              {isStreamerOrAdmin ? (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div className="mutedSmall">Tu as accès au dashboard streamer.</div>
                  <Link to="/dashboard" className="btnPrimarySmall" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 950 }}>🟢 Ouvrir le Dashboard</span>
                    <span className="mutedSmall">Go</span>
                  </Link>
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div className="mutedSmall">
                    Statut:{" "}
                    <b>
                      {reqStatus === "pending"
                        ? "En attente"
                        : reqStatus === "approved"
                        ? "Acceptée ✅"
                        : reqStatus === "rejected"
                        ? "Refusée"
                        : "Aucune demande"}
                    </b>
                  </div>

                  <button
                    className="btnPrimarySmall"
                    onClick={onApply}
                    disabled={busyApply || reqStatus === "pending" || reqStatus === "approved" || !token}
                    type="button"
                    style={{ justifyContent: "space-between", display: "flex" }}
                    title={!token ? "Connecte-toi" : ""}
                  >
                    <span style={{ fontWeight: 950 }}>
                      {busyApply
                        ? "…"
                        : reqStatus === "pending"
                        ? "⏳ Demande en attente"
                        : reqStatus === "approved"
                        ? "✅ Déjà streamer"
                        : "🎥 Faire une demande"}
                    </span>
                    <span className="mutedSmall">{!token ? "Login" : "OK"}</span>
                  </button>

                  <div className="mutedSmall" style={{ opacity: 0.85 }}>
                    Tip: on mettra ici un flow mobile plus propre ensuite (upload avatar, infos streamer, etc.).
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Modals */}
      <AchievementsModal open={achOpen} onClose={() => setAchOpen(false)} />

      {token ? (
        <AccountSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          token={token}
          onAfterChange={refreshMe}
        />
      ) : null}
    </main>
  );
}
