import * as React from "react";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";
import { login, register } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  useOnClickOutside([asHTMLElementRef(boxRef)], onClose, open);

  const { setAuth } = useAuth();

  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [username, setUsername] = React.useState("LeCasiNoze");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPassword("");
      setErr(null);
      setMode("login");
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const u = username.trim();
      if (!u) throw new Error("Pseudo requis");
      if (password.length < 6) throw new Error("Mot de passe min 6 caractères");

      const r = mode === "login" ? await login(u, password) : await register(u, password);
      setAuth(r.token, r.user);
      onClose();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalBox" ref={boxRef}>
        <div className="modalHeader">
          <div className="modalTitle">{mode === "login" ? "Connexion" : "Créer un compte"}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="modalBody">
          <div className="field">
            <label>Pseudo</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {err && <div className="hint" style={{ opacity: 0.9 }}>⚠️ {err}</div>}

          <div className="modalActions">
            <button className="btnGhost" onClick={() => setMode(mode === "login" ? "register" : "login")} disabled={busy}>
              {mode === "login" ? "Créer un compte" : "J’ai déjà un compte"}
            </button>
            <button className="btnPrimary" onClick={submit} disabled={busy}>
              {busy ? "…" : mode === "login" ? "Se connecter" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
