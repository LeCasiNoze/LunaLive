import * as React from "react";
import { getWheelState, spinWheel } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

export function DailyWheelCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [loading, setLoading] = React.useState(false);
  const [state, setState] = React.useState<any>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    const s = await getWheelState(token);
    setState(s);
  }

  React.useEffect(() => {
    setMsg(null);
    setErr(null);
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSpin() {
    if (!token) return;
    setErr(null);
    setMsg(null);

    try {
      setLoading(true);
      const r = await spinWheel(token);

      const { raw, mintedTotal, mintedLow, dropped } = r.reward;

      let line = `🎡 Gain: ${raw} → +${mintedTotal} rubis`;
      if (mintedLow > 0) line += ` (dont ${mintedLow} en w=0.10)`;
      if (dropped > 0) line += ` — ${dropped} perdus (cap hard)`;

      setMsg(line);

      // refresh state + user
      await refresh().catch(() => {});
      await auth.refreshMe?.().catch(() => {});
    } catch (e: any) {
      const m = String(e?.message || e);
      setErr(m === "already_spun" ? "Déjà fait aujourd’hui." : m);
      await refresh().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">Daily Wheel</div>
        <div className="mutedSmall">Connecte-toi pour tourner la roue.</div>
      </div>
    );
  }

  const canSpin = !!state?.canSpin;

  return (
    <div className="panel">
      <div className="panelTitle">Daily Wheel</div>
      <div className="mutedSmall" style={{ marginTop: 6 }}>
        1 spin / jour. Au-delà du cap journalier, les gains passent en <b>w=0.10</b>, puis stop.
      </div>

      {state?.cap ? (
        <div className="mutedSmall" style={{ marginTop: 10 }}>
          Cap: <b>{state.cap.freeAwarded}</b> / {state.cap.capNormal} (normal) —{" "}
          <b>{state.cap.freeLowAwarded}</b> / {state.cap.capLow} (w=0.10)
        </div>
      ) : null}

      {state?.lastSpin ? (
        <div className="mutedSmall" style={{ marginTop: 10 }}>
          Déjà tourné aujourd’hui ✅ (gain brut: <b>{state.lastSpin.raw_reward}</b>, mint:{" "}
          <b>{state.lastSpin.minted_total}</b>)
        </div>
      ) : null}

      {err ? <div className="hint">⚠️ {err}</div> : null}
      {msg ? <div className="hint">{msg}</div> : null}

      <button className="btnPrimary" disabled={loading || !canSpin} onClick={onSpin} style={{ marginTop: 10 }}>
        {loading ? "…" : canSpin ? "Tourner la roue" : "Roue déjà utilisée"}
      </button>
    </div>
  );
}
