// web/src/layout/Topbar.tsx
import { NavLink } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";
import { AvatarMenu } from "../components/AvatarMenu";
import { useAuth } from "../auth/AuthProvider";

export function Topbar({
  onOpenLogin,
  onLogout,
}: {
  onOpenLogin: () => void;
  onLogout: () => void;
}) {
  const isMobile = useIsMobile();
  const authAny = useAuth() as any;
  const user = authAny.user as { rubis: number } | null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `navItem ${isActive ? "active" : ""}`;

  return (
    <header className="topbar">
      <div className="topbarInner">
        <div className="leftSlot">
          <div className="brand">
            <div className="brandMark" aria-hidden />
            <div className="brandName">LunaLive</div>
          </div>
        </div>

        {!isMobile && (
          <nav className="navCentered">
            <NavLink to="/" end className={linkClass}>
              Lives
            </NavLink>
            <NavLink to="/browse" className={linkClass}>
              Browse
            </NavLink>
            <NavLink to="/casinos" className={linkClass}>
              Casinos
            </NavLink>
            <NavLink to="/hunt" className={linkClass}>
              Hunt
            </NavLink>
            <NavLink to="/shop" className={linkClass}>
              Shop
            </NavLink>
          </nav>
        )}

        <div className="rightSlot">
          {user ? (
            <div className="rightRow">
              <div className="pill" title="Rubis">
                💎 <span>{Number(user.rubis || 0).toLocaleString("fr-FR")}</span>
              </div>
              <AvatarMenu user={user as any} onLogout={onLogout} />
            </div>
          ) : (
            <button className="btnPrimary" onClick={onOpenLogin}>
              Se connecter
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
