import { NavLink } from "react-router-dom";
import type { User } from "../lib/types";
import { useIsMobile } from "../hooks/useIsMobile";
import { AvatarMenu } from "../components/AvatarMenu";

export function Topbar({
  user,
  onOpenLogin,
  onLogout,
}: {
  user: User | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}) {
  const isMobile = useIsMobile();
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
            <NavLink to="/shop" className={linkClass}>
              Shop
            </NavLink>
          </nav>
        )}

        <div className="rightSlot">
          {user ? (
            <div className="rightRow">
              <div className="pill" title="Rubis">
                💎 <span>{user.rubis.toLocaleString("fr-FR")}</span>
              </div>
              <AvatarMenu user={user} onLogout={onLogout} />
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
