// web/src/layout/BottomTabs.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — BottomTabs mobile  |  Design : Purple Velvet × Blue Night
//  Aligné sur le même token system que Topbar, LivesPage.mobile, etc.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { UnreadBadge } from "../components/UnreadBadge";
import { publicGetContent } from "../lib/api";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";
import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ─── helpers ────────────────────────────────────────────────────────── */
function absolutize(url: string | null): string | null {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
}

function initials(name: string) {
  const s = (name || "?").trim();
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

function getAvatarUrl(u: any): string | null {
  const v = [u?.avatarUrl, u?.avatar_url, u?.avatar, u?.photoUrl, u?.photo_url, u?.picture, u?.imageUrl, u?.image_url].filter(Boolean)[0];
  if (!v) return null;
  return absolutize(String(v)) ?? String(v);
}

function pickUserAvatarUrl(user: any) {
  const uid    = user?.id != null ? Number(user.id) : null;
  const direct = getAvatarUrl(user);
  const byUid  = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return direct || byUid;
}

/* ─── CSS ────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

/* ══ Tokens ══════════════════════════════════════════════════════════════ */
.bt-root {
  --bt-purple:      #7c5cfc;
  --bt-purple-2:    #a78bfa;
  --bt-purple-pale: #c4b5fd;
  --bt-blue:        #5b8ef8;
  --bt-text-1:      rgba(235,232,255,.96);
  --bt-text-2:      rgba(180,185,230,.70);
  --bt-text-3:      rgba(140,145,195,.48);
  --bt-border:      rgba(124,92,252,.18);
  --bt-safe:        env(safe-area-inset-bottom, 0px);
  --bt-ease:        cubic-bezier(.22,1,.36,1);
  --bt-grad: linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
}

/* ══ Barre de navigation fixe ═══════════════════════════════════════════ */
.bt-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  padding: 8px 10px calc(8px + var(--bt-safe));
  background: rgba(8,7,18,.88);
  border-top: 1px solid rgba(124,92,252,.16);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: center;
}
/* Reflet haut */
.bt-bar::before {
  content:""; position:absolute; top:0; left:5%; right:5%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.26) 64%,transparent);
  pointer-events:none;
}

/* ══ Spacer ══════════════════════════════════════════════════════════════ */
.bt-spacer {
  height: calc(72px + var(--bt-safe));
}

/* ══ Tab (Lives / Browse) ════════════════════════════════════════════════ */
.bt-tab {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px 12px; border-radius: 15px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: var(--bt-text-2);
  text-decoration: none; min-height: 46px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px; font-weight: 700; letter-spacing: -.1px;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color: transparent;
  user-select: none; position: relative;
}
.bt-tab:active { transform: scale(.97); }
.bt-tab.active {
  color: rgba(196,181,253,.95);
  border-color: rgba(124,92,252,.32);
  background: rgba(124,92,252,.10);
}
/* Dot indicateur sous les tabs */
.bt-tab-dot {
  position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);
  width: 3px; height: 3px; border-radius: 999px;
  background: rgba(167,139,250,0);
  transition: background 160ms ease, width 200ms var(--bt-ease);
}
.bt-tab.active .bt-tab-dot {
  background: rgba(167,139,250,.72); width: 14px;
}
/* Glow icône active */
.bt-tab.active .bt-tab-icon {
  filter: drop-shadow(0 0 6px rgba(167,139,250,.55));
}

.bt-tab-icon  { font-size: 17px; line-height: 1; }
.bt-tab-label { font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }

/* ══ Bouton central ⋯ ═══════════════════════════════════════════════════ */
.bt-fab {
  position: relative;
  width: 54px; height: 48px;
  border-radius: 17px;
  border: 1px solid rgba(124,92,252,.30);
  background: linear-gradient(135deg, rgba(124,92,252,.22), rgba(59,77,200,.18), rgba(91,142,248,.14));
  color: rgba(220,210,255,.95);
  cursor: pointer;
  font-size: 22px; font-weight: 700; line-height: 1;
  display: grid; place-items: center;
  box-shadow: 0 0 0 1px rgba(167,139,250,.08) inset, 0 8px 28px rgba(0,0,0,.40);
  transition: transform 120ms var(--bt-ease), filter 150ms ease, box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.bt-fab:hover { filter: brightness(1.12); }
.bt-fab:active { transform: scale(.94); box-shadow: 0 0 0 1px rgba(167,139,250,.12) inset, 0 4px 14px rgba(0,0,0,.38); }

/* Reflet haut du FAB */
.bt-fab::before {
  content:""; position:absolute; top:0; left:12%; right:12%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.50) 45%, transparent);
  border-radius:999px; pointer-events:none;
}

/* ══ Backdrop sheet ══════════════════════════════════════════════════════ */
.bt-backdrop {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(4,3,10,.78);
  display: grid; align-items: end;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  animation: bt-fade-in 180ms ease;
}
@keyframes bt-fade-in { from{opacity:0} to{opacity:1} }

/* ══ Sheet ═══════════════════════════════════════════════════════════════ */
.bt-sheet {
  position: relative;
  width: min(720px, 100%); margin: 0 auto;
  border-radius: 22px 22px 0 0;
  border: 1px solid rgba(124,92,252,.22);
  border-bottom: 0;
  background: rgba(11,9,22,.96);
  box-shadow: 0 -30px 80px rgba(0,0,0,.60), 0 0 0 1px rgba(167,139,250,.06) inset;
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
  animation: bt-slide-up 260ms cubic-bezier(.22,1,.36,1);
}
@keyframes bt-slide-up {
  from { opacity:0; transform:translateY(24px); }
  to   { opacity:1; transform:translateY(0); }
}
/* Reflet haut du sheet */
.bt-sheet::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.48) 35%,rgba(91,142,248,.34) 65%,transparent);
  pointer-events:none; z-index:2;
}
/* Lueur ambiante */
.bt-sheet::after {
  content:""; position:absolute; top:-60px; left:-60px;
  width:280px; height:170px; border-radius:50%;
  background: radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none;
}

/* ── Sheet header ── */
.bt-sheet-top {
  position: relative; z-index:1;
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(124,92,252,.10);
}
.bt-sheet-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800; font-size: 15px; letter-spacing: -.3px;
  color: rgba(235,232,255,.92);
}

/* ── Sheet body ── */
.bt-sheet-body {
  position: relative; z-index:1;
  padding: 12px 14px;
  padding-bottom: calc(16px + var(--bt-safe));
  max-height: min(80vh, 760px);
  overflow-y: auto;
  display: grid; gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(124,92,252,.22) transparent;
}
.bt-sheet-body::-webkit-scrollbar { width:4px; }
.bt-sheet-body::-webkit-scrollbar-track { background:transparent; }
.bt-sheet-body::-webkit-scrollbar-thumb { background:rgba(124,92,252,.22); border-radius:4px; }

/* Bouton fermer */
.bt-close {
  width:36px; height:36px; border-radius:11px;
  border: 1px solid rgba(124,92,252,.18); background: rgba(255,255,255,.04);
  color: rgba(235,232,255,.65); cursor:pointer; display:grid; place-items:center; font-size:14px;
  transition: background 150ms ease, border-color 150ms ease, transform 130ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-close:hover { background:rgba(124,92,252,.12); border-color:rgba(124,92,252,.36); transform:scale(1.06); }

/* ── Profil me ── */
.bt-me {
  display:flex; align-items:center; gap:12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(124,92,252,.18);
  background: rgba(124,92,252,.06);
  text-decoration:none; color:inherit;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-me:active { transform:scale(.98); }
.bt-me:hover  { background:rgba(124,92,252,.10); border-color:rgba(124,92,252,.28); }

.bt-me-ava {
  width:46px; height:46px; border-radius:15px; flex-shrink:0; overflow:hidden;
  border: 1px solid rgba(124,92,252,.22); background: rgba(0,0,0,.35);
  display:grid; place-items:center;
  font-family:'Syne',system-ui,sans-serif; font-size:14px; font-weight:800;
  color:rgba(196,181,253,.80);
}
.bt-me-ava img { width:100%; height:100%; object-fit:cover; display:block; }

.bt-me-name {
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px; letter-spacing:-.2px;
  color:rgba(235,232,255,.94); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bt-me-sub {
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:500;
  color:rgba(167,155,220,.48); margin-top:3px;
}
.bt-me-arrow {
  margin-left:auto; flex-shrink:0;
  font-size:12px; color:rgba(124,92,252,.55);
}

/* ── Divider section ── */
.bt-divider {
  height:1px; border-radius:999px; margin:2px 0;
  background: linear-gradient(90deg,rgba(124,92,252,0),rgba(124,92,252,.18),rgba(91,142,248,.12),rgba(91,142,248,0));
}

/* ── Section label ── */
.bt-section-label {
  font-family:'Syne',system-ui,sans-serif;
  font-size:10px; font-weight:700; letter-spacing:.18em; text-transform:uppercase;
  color:rgba(140,145,195,.48); padding: 2px 2px 4px;
  display:flex; align-items:center; gap:8px;
}
/* barre couleur gauche */
.bt-section-label::before {
  content:""; width:3px; height:10px; border-radius:2px; flex-shrink:0;
  background: linear-gradient(180deg,#a78bfa,#5b8ef8);
}

/* ── Menu items ── */
.bt-menu-list { display:grid; gap:8px; }

.bt-menu-item {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding: 11px 13px; border-radius:14px;
  border: 1px solid rgba(124,92,252,.12); background: rgba(124,92,252,.04);
  color:rgba(235,232,255,.88); text-decoration:none; cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700; letter-spacing:-.15px;
  text-align:left; width:100%;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-menu-item:hover  { background:rgba(124,92,252,.10); border-color:rgba(124,92,252,.24); }
.bt-menu-item:active { transform:translateX(2px); }

.bt-menu-item-left { display:inline-flex; align-items:center; gap:10px; min-width:0; }
.bt-menu-item-icon { font-size:16px; flex-shrink:0; }
.bt-menu-item-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bt-menu-item-arrow { font-size:11px; color:rgba(124,92,252,.50); flex-shrink:0; }

/* Item danger (signaler) */
.bt-menu-item-danger {
  border-color:rgba(239,68,68,.14); background:rgba(239,68,68,.04); color:rgba(252,165,165,.75);
}
.bt-menu-item-danger:hover { background:rgba(239,68,68,.10); border-color:rgba(239,68,68,.28); }
.bt-menu-item-danger .bt-menu-item-arrow { color:rgba(239,68,68,.40); }

/* ── Rewards embed ── */
.bt-rewards-wrap {
  display:grid; gap:8px;
  padding: 12px; border-radius:16px;
  border: 1px solid rgba(124,92,252,.14); background: rgba(124,92,252,.04);
}
.bt-rewards-label {
  display:flex; align-items:center; gap:9px;
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:700;
  color:rgba(167,139,250,.70);
}
`;

let _btCssInjected = false;
function useBottomTabsStyles() {
  React.useEffect(() => {
    if (_btCssInjected) return;
    const el = document.createElement("style");
    el.id = "bt-css"; el.textContent = CSS;
    document.head.appendChild(el);
    _btCssInjected = true;
  }, []);
}

/* ─── Types ─────────────────────────────────────────────────────────── */
type MenuLink   = { kind: "link";   to: string; label: string; icon?: string; danger?: boolean };
type MenuAction = { kind: "action"; label: string; icon?: string; danger?: boolean; onClick: () => void };
type MenuItem   = MenuLink | MenuAction;

/* ─── Composant ──────────────────────────────────────────────────────── */
export function BottomTabs() {
  useBottomTabsStyles();

  const location = useLocation();
  const navigate  = useNavigate();
  const authAny   = useAuth() as any;
  const userAny   = authAny?.user ?? null;
  const token     = authAny?.token ?? null;

  /* ── Unread bonus ── */
  const CONTENT_KEYS = ["daily_bonus_infos", "guide_viewer", "guide_streamer"] as const;
  const [unreadBonus, setUnreadBonus] = React.useState(false);

  const reloadUnreadBonus = React.useCallback(async () => {
    if (!token) { setUnreadBonus(false); return; }
    try {
      const results = await Promise.all(
        CONTENT_KEYS.map(async (k) => {
          const r: any = await publicGetContent(k);
          const item = r?.item ?? null;
          if (!item) return false;
          return isUnread(`content:${k}`, contentVersionFromItem(item));
        })
      );
      setUnreadBonus(results.some(Boolean));
    } catch { setUnreadBonus(false); }
  }, [token]);

  React.useEffect(() => { reloadUnreadBonus(); }, [reloadUnreadBonus]);

  React.useEffect(() => {
    const onSeen    = () => reloadUnreadBonus();
    const onStorage = () => reloadUnreadBonus();
    window.addEventListener("ll:content-seen", onSeen as any);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ll:content-seen", onSeen as any);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadUnreadBonus]);

  /* ── Avatar ── */
  const username  = String(userAny?.username || "");
  const avatarSrc = pickUserAvatarUrl(userAny);
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarSrc]);

  /* ── Sheet ── */
  const [open, setOpen] = React.useState(false);

  // Ferme au changement de route
  React.useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  // ESC + lock scroll
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const prev  = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  /* ── Tab active class ── */
  const tabCls = ({ isActive }: { isActive: boolean }) => `bt-tab${isActive ? " active" : ""}`;

  /* ── Ouvre le report modal ── */
  function openReport() {
    window.dispatchEvent(new Event("ui:report_open"));
    setOpen(false);
  }

  /* ── Items du menu ── */
  const menuItems: MenuItem[] = [
    {
      kind: "action", label: "Clips du mois", icon: "🎬",
      onClick: () => { navigate("/?open=clips"); setOpen(false); },
    },
    { kind: "link", to: "/casinos", label: "CheckTaSlot", icon: "🎰" },
    { kind: "link", to: "/hunt",    label: "Hunt",        icon: "🧿" },
    { kind: "link", to: "/shop",    label: "Shop",        icon: "🛍️" },
  ];

  return (
    <div className="bt-root">
      {/* ── Barre fixe ── */}
      <nav className="bt-bar" aria-label="Navigation principale">
        <NavLink to="/" end className={tabCls} aria-label="Lives">
          <span className="bt-tab-icon">📡</span>
          <span className="bt-tab-label">Lives</span>
          <span className="bt-tab-dot" aria-hidden />
        </NavLink>

        {/* FAB central */}
        <button
          type="button"
          className="bt-fab"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {/* Indicateur unread */}
          <span style={{ position:"absolute", top:6, right:7 }}>
            <UnreadBadge show={unreadBonus} title="Nouveautés • Bonus quotidien" />
          </span>
          ⋯
        </button>

        <NavLink to="/browse" className={tabCls} aria-label="Browse">
          <span className="bt-tab-icon">◈</span>
          <span className="bt-tab-label">Browse</span>
          <span className="bt-tab-dot" aria-hidden />
        </NavLink>
      </nav>

      {/* ── Spacer ── */}
      <div className="bt-spacer" aria-hidden />

      {/* ── Sheet (menu) ── */}
      {open && (
        <div className="bt-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="bt-sheet"
            role="dialog" aria-modal="true" aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bt-sheet-top">
              <span className="bt-sheet-title">Menu</span>
              <button className="bt-close" type="button" aria-label="Fermer" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Body */}
            <div className="bt-sheet-body">

              {/* Profil */}
              <Link to="/profile" className="bt-me" onClick={() => setOpen(false)} aria-label="Mon compte">
                <div className="bt-me-ava" aria-hidden>
                  {avatarSrc && avatarOk ? (
                    <img src={String(avatarSrc)} alt="" onError={() => setAvatarOk(false)} />
                  ) : (
                    <span>{initials(username)}</span>
                  )}
                </div>
                <div style={{ minWidth:0 }}>
                  <div className="bt-me-name">{username || "Mon compte"}</div>
                  <div className="bt-me-sub">Profil · Options</div>
                </div>
                <span className="bt-me-arrow" aria-hidden>›</span>
              </Link>

              <div className="bt-divider" aria-hidden />

              {/* Navigation */}
              <div className="bt-section-label">Navigation</div>
              <div className="bt-menu-list">
                {menuItems.map((it) =>
                  it.kind === "link" ? (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={`bt-menu-item${it.danger ? " bt-menu-item-danger" : ""}`}
                      onClick={() => setOpen(false)}
                      aria-label={it.label}
                    >
                      <span className="bt-menu-item-left">
                        <span className="bt-menu-item-icon" aria-hidden>{it.icon ?? "•"}</span>
                        <span className="bt-menu-item-label">{it.label}</span>
                      </span>
                      <span className="bt-menu-item-arrow" aria-hidden>›</span>
                    </Link>
                  ) : (
                    <button
                      key={it.label}
                      type="button"
                      className={`bt-menu-item${it.danger ? " bt-menu-item-danger" : ""}`}
                      onClick={it.onClick}
                      aria-label={it.label}
                    >
                      <span className="bt-menu-item-left">
                        <span className="bt-menu-item-icon" aria-hidden>{it.icon ?? "•"}</span>
                        <span className="bt-menu-item-label">{it.label}</span>
                      </span>
                      <span className="bt-menu-item-arrow" aria-hidden>›</span>
                    </button>
                  )
                )}
              </div>

              <div className="bt-divider" aria-hidden />

              {/* Récompenses */}
              <div className="bt-section-label">
                Récompenses
                <UnreadBadge show={unreadBonus} title="Nouveautés à lire" />
              </div>
              <div className="bt-rewards-wrap">
                <div className="bt-rewards-label">
                  <span aria-hidden>🎁</span> Bonus quotidien
                </div>
                <DailyBonusAccessCard />
              </div>
              <div className="bt-rewards-wrap">
                <DailyWheelCard />
              </div>

              <div className="bt-divider" aria-hidden />

              {/* Signaler */}
              <button type="button" className="bt-menu-item bt-menu-item-danger" onClick={openReport} aria-label="Signaler un problème">
                <span className="bt-menu-item-left">
                  <span className="bt-menu-item-icon" aria-hidden>🚩</span>
                  <span className="bt-menu-item-label">Signaler un problème</span>
                </span>
                <span className="bt-menu-item-arrow" aria-hidden>›</span>
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}