// Cadenas de lancement des events (décision Lucas 11 juil) : le PREMIER
// event (Semaine du Viewer) se déclenche quand 30 comptes ayant rempli
// les prérequis ont cliqué le cadenas. Cette scène remplace « Aucun event
// actif » sur /event tant que le lancement n'a pas eu lieu.
import * as React from "react";

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
      <style>{`
        .evLock{
          position: relative;
          border-radius: 22px;
          border: 1px solid rgba(124,92,252,0.28);
          overflow: hidden;
          padding: 28px 18px 24px;
          text-align: center;
          background:
            radial-gradient(420px 240px at 20% 0%, rgba(124,77,255,0.20), transparent 62%),
            radial-gradient(380px 220px at 85% 12%, rgba(56,189,248,0.10), transparent 60%),
            rgba(10,8,16,0.92);
        }
        .evLockKicker{
          font-size: 12px; font-weight: 950; letter-spacing: 2.5px;
          color: rgba(196,181,253,0.85); text-transform: uppercase;
        }
        .evLockTitle{
          margin: 8px 0 4px; font-size: clamp(22px, 5.6vw, 34px);
          font-weight: 1200; letter-spacing: -0.4px; line-height: 1.08;
          color: rgba(245,243,255,0.97);
        }
        .evLockSub{ font-size: 13px; font-weight: 850; color: rgba(215,205,245,0.72); margin: 0 auto; max-width: 520px; }

        .evLockPad{
          margin: 22px auto 6px; width: 128px; height: 128px; position: relative;
          display: flex; align-items: center; justify-content: center;
        }
        .evLockPad::before{
          content: ""; position: absolute; inset: -18px; border-radius: 999px;
          background: radial-gradient(circle, rgba(124,77,255,0.30), transparent 66%);
          animation: evLockGlow 3s ease-in-out infinite;
        }
        .evLockIcon{
          font-size: 84px; line-height: 1; position: relative;
          filter: drop-shadow(0 10px 26px rgba(0,0,0,0.55));
          animation: evLockBreath 4.2s ease-in-out infinite;
        }
        .evLockPad.isShaking .evLockIcon{ animation: evLockShake 0.5s ease-in-out; }
        @keyframes evLockGlow{ 0%,100%{ opacity:0.55; transform:scale(0.96);} 50%{ opacity:1; transform:scale(1.05);} }
        @keyframes evLockBreath{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-5px);} }
        @keyframes evLockShake{
          0%,100%{ transform:rotate(0);} 18%{ transform:rotate(-9deg);} 38%{ transform:rotate(8deg);}
          56%{ transform:rotate(-6deg);} 74%{ transform:rotate(4deg);} 88%{ transform:rotate(-2deg);}
        }

        .evLockGauge{ max-width: 460px; margin: 16px auto 0; }
        .evLockCount{ font-weight: 1200; font-size: 26px; letter-spacing: -0.4px; color: #fff; }
        .evLockCount small{ font-size: 14px; font-weight: 950; color: rgba(215,205,245,0.66); }
        .evLockTrack{
          margin-top: 8px; height: 12px; border-radius: 999px;
          background: rgba(255,255,255,0.08); overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .evLockFill{
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, #7c4dff, #38bdf8);
          box-shadow: 0 0 16px rgba(124,77,255,0.65);
          transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .evLockCTA{
          margin-top: 18px; padding: 14px 26px; border-radius: 16px;
          font-size: 15px; font-weight: 1150; letter-spacing: 0.2px;
          border: 1px solid rgba(124,77,255,0.65);
          background: linear-gradient(135deg, rgba(124,77,255,0.34), rgba(56,189,248,0.16));
          color: #fff; cursor: pointer;
          box-shadow: 0 0 0 3px rgba(124,77,255,0.12), 0 14px 40px rgba(0,0,0,0.4);
          animation: evLockCtaBreath 2.6s ease-in-out infinite;
        }
        .evLockCTA:disabled{ opacity: 0.55; cursor: not-allowed; animation: none; }
        .evLockCTA:active{ transform: scale(0.98); }
        @keyframes evLockCtaBreath{
          0%,100%{ box-shadow: 0 0 0 3px rgba(124,77,255,0.12), 0 14px 40px rgba(0,0,0,0.4); }
          50%{ box-shadow: 0 0 0 7px rgba(124,77,255,0.22), 0 14px 46px rgba(0,0,0,0.46); }
        }
        .evLockDone{
          margin-top: 18px; display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 18px; border-radius: 16px; font-weight: 1100; font-size: 14px;
          border: 1px solid rgba(60,240,180,0.4); background: rgba(60,240,180,0.10);
          color: #b9f8cf;
        }

        .evLockReqs{
          margin: 18px auto 0; max-width: 460px; text-align: left;
          border-radius: 16px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.22); padding: 12px 14px;
        }
        .evLockReqsTitle{ font-size: 12px; font-weight: 1000; color: rgba(215,205,245,0.75); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .evLockReq{ display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13.5px; font-weight: 900; color: rgba(240,236,255,0.92); }
        .evLockReq .st{ width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 12px; flex: 0 0 auto; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); }
        .evLockReq.done{ color: rgba(185,248,207,0.95); }
        .evLockReq.done .st{ border-color: rgba(60,240,180,0.5); background: rgba(60,240,180,0.14); color: #3cf0b4; }

        .evLockTeaser{
          margin: 20px auto 0; max-width: 520px; border-radius: 16px;
          border: 1px solid rgba(124,92,252,0.30);
          background: linear-gradient(135deg, rgba(124,77,255,0.14), rgba(56,189,248,0.06));
          padding: 12px 16px; font-size: 13px; font-weight: 900; color: rgba(235,230,255,0.9);
        }
        .evLockErr{ margin-top: 10px; font-size: 12.5px; font-weight: 900; color: rgba(255,150,170,0.95); }
        @media (prefers-reduced-motion: reduce){
          .evLock *{ animation: none !important; }
        }
      `}</style>

      <div className="evLockKicker">Événement de lancement</div>
      <h2 className="evLockTitle">La communauté détient la clé</h2>
      <p className="evLockSub">
        Quand <b>{state.target} membres</b> auront rempli les prérequis et cliqué le cadenas,
        le tout premier événement LunaLive se déclenche pour tout le monde.
      </p>

      <div key={shake} className={`evLockPad${shake ? " isShaking" : ""}`} onClick={clickLock} role="button" tabIndex={0} aria-label="Cliquer le cadenas">
        <span className="evLockIcon" aria-hidden>🔒</span>
      </div>

      <div className="evLockGauge">
        <div className="evLockCount">
          {state.count} <small>/ {state.target} clics</small>
        </div>
        <div className="evLockTrack">
          <div className="evLockFill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {clicked ? (
        <div className="evLockDone">✓ Ton clic est compté — parle-en autour de toi !</div>
      ) : (
        <button type="button" className="evLockCTA" onClick={clickLock} disabled={busy || (!!token && !eligible)}>
          {busy ? "…" : !token ? "Se connecter pour cliquer" : eligible ? "🔓 Cliquer le cadenas" : "Prérequis incomplets"}
        </button>
      )}
      {error ? <div className="evLockErr">{error}</div> : null}

      {token && me ? (
        <div className="evLockReqs">
          <div className="evLockReqsTitle">Tes prérequis</div>
          {me.requirements.map((r) => (
            <div key={r.key} className={`evLockReq${r.done ? " done" : ""}`}>
              <span className="st">{r.done ? "✓" : "•"}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="evLockTeaser">
        🏆 Événement n°1 : <b>La Semaine du Viewer</b> — 7 jours, chaque minute de live et chaque
        interaction comptent, récompenses et skins exclusifs pour le classement.
      </div>
    </section>
  );
}
