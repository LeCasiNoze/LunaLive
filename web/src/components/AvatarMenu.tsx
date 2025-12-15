import * as React from "react";
import { Link } from "react-router-dom";
import type { User } from "../lib/types";
import { initialOf } from "../lib/format";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";

export function AvatarMenu({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(
    [asHTMLElementRef(btnRef), asHTMLElementRef(menuRef)],
    () => setOpen(false),
    open
  );

  return (
    <div className="avatarWrap">
      <button
        ref={btnRef}
        className="avatarBtn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ouvrir le menu profil"
      >
        {initialOf(user.username)}
      </button>

      {open && (
        <div ref={menuRef} className="dropdown">
          <div className="dropdownTop">
            <div className="dropdownName">{user.username}</div>
            <div className="dropdownSub">Compte (mock)</div>
          </div>

          <div className="dropdownSep" />

          <Link
            to="/profile"
            className="dropdownItem"
            onClick={() => setOpen(false)}
          >
            Profil
          </Link>

          <button className="dropdownItem danger" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
