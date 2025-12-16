import * as React from "react";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";
import { login, register, registerVerify, registerResend } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

type Step = "login" | "register_form" | "register_code";

// ✅ Types attendus côté API
type RegisterResp = {
  ok: boolean;
  needsVerify?: boolean;
  devCode?: string;
  error?: string;
  token?: string;
  user?: any;
};

export function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  useOnClickOutside([asHTMLElementRef(boxRef)], onClose, open);

  const { setAuth } = useAuth();

  const [step, setStep] = React.useState<Step>("login");

  const [username, setUsername] = React.useState("LeCasiNoze");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");

  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setErr(null);
      setBusy(false);
      setPassword("");
      setCode("");
      setEmail("");
      setStep("login");
    }
  }, [open]);

  if (!open) return null;

  function isValidEmail(s: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }

  async function submitLogin() {
    setBusy(true);
    setErr(null);
    try {
      const u = username.trim();
      if (!u) throw new Error("Pseudo requis");
      if (password.length < 6)
        throw new Error("Mot de passe min 6 caractères");

      const r = await login(u, password);
      setAuth(r.token, r.user);
      onClose();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegisterForm() {
    setBusy(true);
    setErr(null);
    try {
      const u = username.trim();
      const em = email.trim();

      if (!u) throw new Error("Pseudo requis");
      if (u.length < 3) throw new Error("Pseudo min 3 caractères");
      if (!isValidEmail(em)) throw new Error("Email invalide");
      if (password.length < 6)
        throw new Error("Mot de passe min 6 caractères");

      // 👇 cast côté front pour accepter devCode/needsVerify
      const r = (await register(u, em, password)) as unknown as RegisterResp;

      if (r?.needsVerify) {
        setStep("register_code");
        if (r.devCode) setCode(String(r.devCode)); // DEV: auto-fill
        return;
      }

      // si API renvoie une erreur structurée
      if (r?.ok === false && r.error) {
        throw new Error(r.error);
      }

      throw new Error("Réponse register invalide");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function resendRegisterCode() {
    setBusy(true);
    setErr(null);
    try {
      const u = username.trim();
      if (!u) throw new Error("Pseudo requis");

      const r = (await registerResend(u)) as unknown as RegisterResp;

      if (r?.ok === false && r.error) throw new Error(r.error);
      if (r?.devCode) setCode(String(r.devCode)); // DEV: auto-fill
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegisterCode() {
    setBusy(true);
    setErr(null);
    try {
      const u = username.trim();
      const c = code.trim();

      if (!u) throw new Error("Pseudo requis");
      if (c.length < 4) throw new Error("Code requis");

      const r = await registerVerify(u, c);
      setAuth(r.token, r.user);
      onClose();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  const title =
    step === "login"
      ? "Connexion"
      : step === "register_form"
      ? "Créer un compte"
      : "Vérification email";

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalBox" ref={boxRef}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="modalBody">
          {step === "login" && (
            <>
              <div className="field">
                <label>Pseudo</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {err && (
                <div className="hint" style={{ opacity: 0.9 }}>
                  ⚠️ {err}
                </div>
              )}

              <div className="modalActions">
                <button
                  className="btnGhost"
                  onClick={() => {
                    setErr(null);
                    setPassword("");
                    setStep("register_form");
                  }}
                  disabled={busy}
                >
                  Créer un compte
                </button>
                <button
                  className="btnPrimary"
                  onClick={submitLogin}
                  disabled={busy}
                >
                  {busy ? "…" : "Se connecter"}
                </button>
              </div>
            </>
          )}

          {step === "register_form" && (
            <>
              <div className="field">
                <label>Pseudo</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label>Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              <div className="field">
                <label>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {err && (
                <div className="hint" style={{ opacity: 0.9 }}>
                  ⚠️ {err}
                </div>
              )}

              <div className="modalActions">
                <button
                  className="btnGhost"
                  onClick={() => {
                    setErr(null);
                    setPassword("");
                    setEmail("");
                    setStep("login");
                  }}
                  disabled={busy}
                >
                  J’ai déjà un compte
                </button>
                <button
                  className="btnPrimary"
                  onClick={submitRegisterForm}
                  disabled={busy}
                >
                  {busy ? "…" : "Envoyer le code"}
                </button>
              </div>
            </>
          )}

          {step === "register_code" && (
            <>
              <div className="hint" style={{ opacity: 0.9, marginBottom: 10 }}>
                On t’a envoyé un code par email. Saisis-le pour finaliser la
                création du compte.
              </div>

              <div className="field">
                <label>Pseudo</label>
                <input value={username} disabled />
              </div>

              <div className="field">
                <label>Code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                />
              </div>

              {err && (
                <div className="hint" style={{ opacity: 0.9 }}>
                  ⚠️ {err}
                </div>
              )}

              <div className="modalActions">
                <button
                  className="btnGhost"
                  onClick={() => {
                    setErr(null);
                    setCode("");
                    setStep("register_form");
                  }}
                  disabled={busy}
                >
                  Retour
                </button>

                <button
                  className="btnGhost"
                  onClick={resendRegisterCode}
                  disabled={busy}
                >
                  Renvoyer le code
                </button>

                <button
                  className="btnPrimary"
                  onClick={submitRegisterCode}
                  disabled={busy}
                >
                  {busy ? "…" : "Valider"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
