// web/src/components/AvatarMenu.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import type { User } from "../lib/types";
import { initialOf } from "../lib/format";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(
  /\/$/,
  ""
);

function getAvatarUrlFromUser(u: any): string | null {
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
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith("/")) return `${API_BASE}${s}`;
  return s;
}

function buildApiAvatarUrl(userId: number, cacheKey?: string | number | null) {
  const v = cacheKey == null ? "0" : String(cacheKey);
  return `${API_BASE}/avatars/u/${userId}?v=${encodeURIComponent(v)}`;
}

export function AvatarMenu({
  user,
  onLogout,
  onOpenReport,
}: {
  user: User;
  onLogout: () => void;
  onOpenReport?: () => void; // ✅ NEW
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(
    [asHTMLElementRef(btnRef), asHTMLElementRef(menuRef)],
    () => setOpen(false),
    open
  );

  const canSeeDashboard = user.role === "streamer" || user.role === "admin";

  const uid = Number((user as any)?.id || 0) || 0;
  const direct = getAvatarUrlFromUser(user as any);

  const cacheKey =
    (user as any)?.avatarVersion ??
    (user as any)?.avatar_updated_at ??
    (user as any)?.avatarUpdatedAt ??
    (user as any)?.updatedAt ??
    (user as any)?.updated_at ??
    uid;

  const endpoint = uid ? buildApiAvatarUrl(uid, cacheKey) : null;
  const [imgOk, setImgOk] = React.useState(true);

  React.useEffect(() => setImgOk(true), [direct, endpoint]);

  const src = direct ?? endpoint;

  return (
    <div className="avatarWrap llAvatarWrap">
      <style>{`
        /* ✅ important: ancre le dropdown ici */
        .llAvatarWrap{ position: relative; }

        .llAvatarWrap .avatarBtn{
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          overflow: hidden;
          padding: 0;
          display: grid;
          place-items: center;
        }
        .llAvatarWrap .avatarBtn:hover{
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.07);
        }
        .llAvatarImg{
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .llAvatarFallback{
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-weight: 1100;
          letter-spacing: 0.6px;
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), rgba(0,0,0,0.22) 70%),
            linear-gradient(135deg, rgba(140,90,255,0.18), rgba(80,160,255,0.10), rgba(255,90,180,0.08));
        }

        /* Dropdown rework */
        .llAvatarWrap .dropdown{
          /* ✅ évite l'effet "coupé à droite" */
          right: 0;
          left: auto;
          transform: translateX(-8px);     /* ouvre un peu vers l'intérieur */
          transform-origin: top right;
          max-width: calc(100vw - 12px);   /* anti overflow viewport */

          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,12,18,0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.45);
          border-radius: 16px;
          overflow: hidden;
        }

        .llAvatarWrap .dropdownTop{
          padding: 12px 12px 10px;
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .llAvatarWrap .dropdownName{
          font-weight: 1100;
          letter-spacing: -0.2px;
        }
        .llAvatarWrap .dropdownSub{
          opacity: 0.7;
          font-size: 12px;
          margin-top: 2px;
        }

        .llAvatarWrap .dropdownItem{
          border-radius: 12px;
          margin: 6px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          padding: 10px 12px;
          color: inherit;
          text-decoration: none;
          display: block;
          font-weight: 900;
        }
        .llAvatarWrap .dropdownItem:hover{
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
        }
        .llAvatarWrap .dropdownItem.danger{
          border-color: rgba(255,90,180,0.22);
          background: rgba(255,90,180,0.08);
        }
      `}</style>

      <button
        ref={btnRef}
        className="avatarBtn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ouvrir le menu profil"
        title={user.username}
      >
        {src && imgOk ? (
          <img
            className="llAvatarImg"
            src={src}
            alt={user.username}
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className="llAvatarFallback">{initialOf(user.username)}</span>
        )}
      </button>

      {open && (
        <div ref={menuRef} className="dropdown">
          <div className="dropdownTop">
            <div className="dropdownName">{user.username}</div>
            <div className="dropdownSub">Compte</div>
          </div>

          <div className="dropdownSep" />

          {canSeeDashboard && (
            <Link to="/dashboard" className="dropdownItem" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          )}

          <Link to="/profile" className="dropdownItem" onClick={() => setOpen(false)}>
            Profil
          </Link>

          {/* ✅ NEW: signalement / retour */}
          {onOpenReport && (
            <button
              className="dropdownItem"
              onClick={() => {
                setOpen(false);
                onOpenReport();
              }}
            >
              Un problème ?
            </button>
          )}

          <button
            className="dropdownItem danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
