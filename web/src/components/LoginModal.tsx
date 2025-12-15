import * as React from "react";
import type { User } from "../lib/types";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";

export function LoginModal({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: (u: User) => void;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  useOnClickOutside([asHTMLElementRef(boxRef)], onClose, open);

  const [username, setUsername] = React.useState("LeCasiNoze");

  React.useEffect(() => {
    if (open) setUsername("LeCasiNoze");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalBox" ref={boxRef}>
        <div className="modalHeader">
          <div className="modalTitle">Connexion</div>
          <button className="iconBtn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="modalBody">
          <div className="field">
            <label>Nom (mock)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ton pseudo…"
            />
          </div>

          <div className="hint">
            Pour l’instant c’est fake. Après on branchera vraie auth + DLive link.
          </div>

          <div className="modalActions">
            <button className="btnGhost" onClick={onClose}>
              Annuler
            </button>
            <button
              className="btnPrimary"
              onClick={() =>
                onLogin({
                  username: username.trim() || "User",
                  rubis: 1250,
                })
              }
            >
              Se connecter (mock)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
