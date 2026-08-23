// Cadenas de lancement des events (décision Lucas 11 juil) : le PREMIER
// event (Semaine du Viewer) se déclenche quand 30 comptes ayant rempli
// les prérequis ont cliqué le cadenas. Cette scène remplace « Aucun event
// actif » sur /event tant que le lancement n'a pas eu lieu.
import * as React from "react";
import { ArrowRight, Check, Circle, LockKeyhole, Sparkles, Trophy, Users } from "lucide-react";

// ⚠ MÊME base que ChatPanel/CallTab/api_events (VITE_API_BASE, fallback
// onrender). PAS lib/http apiBase() qui utilise VITE_API_URL avec fallback
// localhost → cassait le cadenas en prod.
function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type LockRequirement = { key: string; label: string; done: boolean };
export type LaunchLockState = {
  ok: boolean;
  unlocked: boolean;
  count: number;
  target: number;
  me?: { clicked: boolean; eligible: boolean; requirements: LockRequirement[] } | null;
};

export async function fetchLaunchLock(token: string | null): Promise<LaunchLockState | null> {
  try {
    const r = await fetch(`${apiBase()}/api/public/launch-lock`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const j = await r.json();
    return j?.ok ? (j as LaunchLockState) : null;
  } catch {
    return null;
  }
}

export function EventLaunchLock({
  token,
  state,
  onRequireLogin,
  onChanged,
}: {
  token: string | null;
  state: LaunchLockState;
  onRequireLogin: () => void;
  onChanged: (s: LaunchLockState) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [shake, setShake] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  // re-fetch de l'état (jauge + prérequis) quand l'utilisateur REVIENT sur
  // la page — sinon un prérequis rempli ailleurs (roue, bonus…) ne se
  // cochait qu'au rechargement complet (retour Lucas).
  React.useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const s = await fetchLaunchLock(token);
      if (s) onChanged(s);
    };
    window.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [token, onChanged]);

  const me = state.me ?? null;
  const clicked = !!me?.clicked;
  const eligible = !!me?.eligible;
  const pct = Math.max(0, Math.min(100, (state.count / Math.max(1, state.target)) * 100));

  async function clickLock() {
    setError(null);
    if (!token) return onRequireLogin();
    if (clicked || busy) return;
    if (!eligible) {
      // secousse : le cadenas résiste tant que les prérequis ne sont pas remplis
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase()}/api/public/launch-lock/click`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j?.ok) {
        setShake((n) => n + 1);
        onChanged({
          ...state,
          unlocked: !!j.unlocked,
          count: Number(j.count ?? state.count),
          me: me ? { ...me, clicked: true } : me,
        });
      } else if (j?.error === "not_eligible") {
        setError("Termine d'abord les prérequis ci-dessous.");
      } else {
        setError(String(j?.error || "Erreur"));
      }
    } catch (e: any) {
      setError(String(e?.message || "Erreur réseau"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="evLock">
      <div className="evLockMain">
        <div className="evLockCopy">
          <span className="evLockKicker"><Sparkles size={14} /> Premier événement LunaLive</span>
          <h1>30 clics pour lancer la saison.</h1>
          <p>Les membres éligibles ouvrent ensemble le premier événement. Chaque clic validé rapproche toute la communauté du lancement.</p>

          <div className="evLockGauge">
            <div className="evLockCount"><strong>{state.count}</strong><span>sur {state.target} clics validés</span><b>{Math.round(pct)}%</b></div>
            <div className="evLockTrack" role="progressbar" aria-valuemin={0} aria-valuemax={state.target} aria-valuenow={state.count}>
              <div className="evLockFill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {clicked ? (
            <div className="evLockDone"><Check size={17} /> Ton clic est compté. Plus que {Math.max(0, state.target - state.count)}.</div>
          ) : (
            <button key={shake} type="button" className={`evLockCTA${shake ? " isShaking" : ""}`} onClick={clickLock} disabled={busy || (!!token && !eligible)}>
              <LockKeyhole size={17} />
              {busy ? "Validation..." : !token ? "Se connecter pour participer" : eligible ? "Valider mon clic" : "Prérequis incomplets"}
              <ArrowRight size={16} />
            </button>
          )}
          {error ? <div className="evLockErr" role="alert">{error}</div> : null}
        </div>

        <aside className="evLockSide">
          <div className="evLockSideIcon"><LockKeyhole size={28} /></div>
          <span className="evLockSideLabel"><Users size={13} /> Objectif collectif</span>
          <strong>{Math.max(0, state.target - state.count)}</strong>
          <small>clic{state.target - state.count > 1 ? "s" : ""} restant{state.target - state.count > 1 ? "s" : ""}</small>
        </aside>
      </div>

      <div className="evLockLower">
        <div className="evLockReqs">
          <div className="evLockReqsTitle">Tes prérequis</div>
          {token && me ? me.requirements.map((requirement) => (
            <div key={requirement.key} className={`evLockReq${requirement.done ? " done" : ""}`}>
              <span className="st">{requirement.done ? <Check size={13} /> : <Circle size={11} />}</span>
              <span>{requirement.label}</span>
            </div>
          )) : <p className="evLockReqLogin">Connecte-toi pour consulter et compléter tes prérequis.</p>}
        </div>

        <div className="evLockTeaser">
          <span><Trophy size={15} /> Prochainement</span>
          <h2>La Semaine du Viewer</h2>
          <p>Sept jours où chaque minute de live et chaque interaction comptent, avec classement et récompenses exclusives.</p>
        </div>
      </div>
    </section>
  );
}
