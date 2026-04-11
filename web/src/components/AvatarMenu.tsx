// web/src/components/AvatarMenu.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import type { User } from "../lib/types";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";
import { initialOf } from "../lib/format";
import { canAccessFsbBoard } from "../lib/fsb_access";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function getAvatarUrlFromUser(u: any): string | null {
  // Priorité 1: Avatar perso uploadé (champ avatarUrl)
  const personalAvatar = u?.avatarUrl ?? u?.avatar_url ?? null;
  if (personalAvatar) {
    const s = String(personalAvatar).trim();
    if (s) {
      // Si c'est /Avatar/xxx, utiliser le endpoint /avatars/u/{id} qui contient l'upload
      if (s.startsWith("/Avatar/")) {
        const uid = Number(u?.id || 0);
        if (uid) {
          const cacheKey = u?.avatarVersion ?? u?.avatar_updated_at ?? u?.updatedAt ?? uid;
          return buildApiAvatarUrl(uid, cacheKey);
        }
      }
      // URLs complètes ou autres chemins
      if (s.startsWith("http://") || s.startsWith("https://")) return s;
      if (s.startsWith("/")) return `${API_BASE}${s}`;
      return s;
    }
  }
  
  // Priorité 2: Avatar par défaut attribué (si pas d'avatar perso)
  const uid = Number(u?.id || 0);
  if (uid) {
    const cacheKey = u?.avatarVersion ?? u?.avatar_updated_at ?? u?.updatedAt ?? uid;
    return buildApiAvatarUrl(uid, cacheKey);
  }
  
  return null;
}

function buildApiAvatarUrl(userId: number, cacheKey?: string | number | null) {
  return `${API_BASE}/avatars/u/${userId}?v=${encodeURIComponent(cacheKey == null ? "0" : String(cacheKey))}`;
}

function slugifyUsername(v: any): string {
  return String(v ?? "").trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function useInjectStyles(id: string, styles: string) {
  React.useEffect(() => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id; el.textContent = styles;
    document.head.appendChild(el);
  }, [id, styles]);
}

const CSS = `
@keyframes av-menu-pop {
  from { opacity: 0; transform: scale(0.94) translateY(-6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Wrap ── */
.av-wrap {
  position: relative;
}

/* ── Bouton avatar ── */
.av-btn {
  width: 38px; height: 38px;
  border-radius: 999px;
  border: 1.5px solid rgba(124,92,252,0.22);
  background: rgba(13,11,24,0.70);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 20px rgba(0,0,0,0.32);
  -webkit-tap-highlight-color: transparent;
  outline: none;
  transition:
    border-color 160ms ease,
    box-shadow   160ms ease,
    transform    130ms cubic-bezier(.22,1,.36,1);
}
.av-btn:hover {
  border-color: rgba(124,92,252,0.40);
  box-shadow: 0 8px 26px rgba(0,0,0,0.40), 0 0 12px rgba(124,92,252,0.16);
  transform: translateY(-1px);
}
.av-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(124,92,252,0.30);
}

/* Avatar image */
.av-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 999px;
  -webkit-user-drag: none;
}

/* Fallback initiale */
.av-fallback {
  width: 100%; height: 100%;
  display: grid;
  place-items: center;
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: rgba(200,195,240,0.90);
  background: linear-gradient(135deg, rgba(124,92,252,0.30), rgba(59,77,200,0.22), rgba(91,142,248,0.18));
  border-radius: 999px;
}

/* ── Dropdown ── */
.av-dropdown {
  /* ✅ z-index très haut pour passer au-dessus de tout */
  position: fixed;
  z-index: 99999;
  min-width: 200px;
  max-width: min(240px, calc(100vw - 16px));

  border-radius: 18px;
  border: 1px solid rgba(124,92,252,0.20);
  background: rgba(11,9,22,0.96);
  box-shadow:
    0 28px 70px rgba(0,0,0,0.65),
    0 0 0 1px rgba(167,139,250,0.07) inset,
    0 0 40px rgba(124,92,252,0.08);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
  animation: av-menu-pop 180ms cubic-bezier(0.22,1,0.36,1);
  transform-origin: top right;
}

/* Reflet haut */
.av-dropdown::before {
  content: "";
  position: absolute;
  top: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(90deg,
    transparent,
    rgba(167,139,250,0.38) 35%,
    rgba(91,142,248,0.26)  65%,
    transparent
  );
  pointer-events: none;
  z-index: 2;
}

/* Header user */
.av-dd-head {
  padding: 13px 14px 11px;
  border-bottom: 1px solid rgba(124,92,252,0.10);
  background: rgba(124,92,252,0.05);
}
.av-dd-name {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: -0.2px;
  color: rgba(235,232,255,0.94);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.av-dd-sub {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(167,155,220,0.50);
  margin-top: 2px;
}

/* Items */
.av-dd-body { padding: 6px; display: grid; gap: 3px; }

.av-dd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 11px;
  border-radius: 11px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(200,195,240,0.78);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.1px;
  text-decoration: none;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  transition:
    background   140ms ease,
    border-color 140ms ease,
    color        140ms ease,
    transform    120ms cubic-bezier(.22,1,.36,1);
}
.av-dd-item:hover {
  background: rgba(124,92,252,0.10);
  border-color: rgba(124,92,252,0.18);
  color: rgba(235,232,255,0.96);
  transform: translateX(2px);
}
.av-dd-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(124,92,252,0.30);
}

/* Séparateur */
.av-dd-sep {
  height: 1px;
  margin: 4px 10px;
  background: rgba(124,92,252,0.10);
}

/* Item danger */
.av-dd-item.is-danger {
  color: rgba(252,165,165,0.72);
}
.av-dd-item.is-danger:hover {
  background: rgba(239,68,68,0.10);
  border-color: rgba(239,68,68,0.22);
  color: rgba(252,165,165,0.95);
}
`;

export function AvatarMenu({
  user,
  onLogout,
  onOpenReport,
}: {
  user: User;
  onLogout: () => void;
  onOpenReport?: () => void;
}) {
  useInjectStyles("av-styles", CSS);

  const [open, setOpen] = React.useState(false);
  const btnRef  = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  /* ✅ position du dropdown calculée en fixed depuis le bouton */
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);

  useOnClickOutside(
    [asHTMLElementRef(btnRef), asHTMLElementRef(menuRef)],
    () => setOpen(false),
    open
  );

  /* Calcule la position au clic */
  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top:   rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(v => !v);
  }

  /* Recalcule si le viewport bouge */
  React.useEffect(() => {
    if (!open) return;
    const fn = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
      }
    };
    window.addEventListener("scroll", fn, true);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("scroll", fn, true);
      window.removeEventListener("resize", fn);
    };
  }, [open]);

  const userId = Number((user as any)?.id || 0);
  const canSeeDashboard = user.role === "streamer";
  const canSeeFsbBoard = canAccessFsbBoard({ id: userId });
  const uid      = userId;
  const direct   = getAvatarUrlFromUser(user as any);
  const cacheKey = (user as any)?.avatarVersion ?? (user as any)?.avatar_updated_at ?? (user as any)?.updatedAt ?? uid;
  const endpoint = uid ? buildApiAvatarUrl(uid, cacheKey) : null;
  const [imgOk, setImgOk] = React.useState(true);
  React.useEffect(() => setImgOk(true), [direct, endpoint]);
  const src = direct;

  // Debug pour voir l'URL finale
  console.log("AvatarMenu - URL finale:", src);

  const myChannelSlug = slugifyUsername((user as any)?.streamerSlug ?? user.username);
  const myChannelHref = myChannelSlug ? `/s/${myChannelSlug}` : "/";

  const close = () => setOpen(false);

  return (
    <div className="av-wrap">
      <button
        ref={btnRef}
        className="av-btn"
        onClick={handleOpen}
        aria-label="Ouvrir le menu profil"
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.username}
      >
        {src && imgOk ? (
          <img 
            className="av-img" 
            src={src} 
            alt={user.username} 
            onError={() => {
              console.log("AvatarMenu - Erreur de chargement:", src);
              setImgOk(false);
            }} 
          />
        ) : (
          <span className="av-fallback">{initialOf(user.username)}</span>
        )}
      </button>

      {/* ✅ Portal — position fixed calculée, z-index 99999, passe au-dessus de tout */}
      {open && pos && createPortalDropdown(
        <div
          ref={menuRef}
          className="av-dropdown"
          role="menu"
          style={{ top: pos.top, right: pos.right }}
        >
          {/* Header */}
          <div className="av-dd-head">
            <div className="av-dd-name">{user.username}</div>
            <div className="av-dd-sub">Mon compte</div>
          </div>

          {/* Items */}
          <div className="av-dd-body">
            {canSeeDashboard && (
              <>
                <Link to="/dashboard" className="av-dd-item" role="menuitem" onClick={close}>
                  📊 Dashboard
                </Link>
                <Link to={myChannelHref} className="av-dd-item" role="menuitem" onClick={close}>
                  📺 Ma chaîne
                </Link>
              </>
            )}

            {canSeeFsbBoard && (
              <Link to="/FSB_Board" className="av-dd-item" role="menuitem" onClick={close}>
                💼 FSB Board
              </Link>
            )}

            <Link to="/profile" className="av-dd-item" role="menuitem" onClick={close}>
              👤 Profil
            </Link>

            {onOpenReport && (
              <>
                <div className="av-dd-sep" />
                <button
                  className="av-dd-item"
                  role="menuitem"
                  onClick={() => { close(); onOpenReport(); }}
                >
                  ⚑ Un problème ?
                </button>
              </>
            )}

            <div className="av-dd-sep" />
            <button
              className="av-dd-item is-danger"
              role="menuitem"
              onClick={() => { close(); onLogout(); }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper portal ─────────────────────────────────────────────────
   On importe createPortal de react-dom pour rendre le dropdown
   directement dans document.body (au-dessus de tout) */
import { createPortal } from "react-dom";
function createPortalDropdown(node: React.ReactNode) {
  return createPortal(node, document.body);
}
