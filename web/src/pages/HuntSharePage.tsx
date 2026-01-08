// web/src/pages/HuntSharePage.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { HuntState } from "../lib/hunt_types";
import { huntShareState } from "../lib/hunt_api";

function fmtEur(n: number) {
  return `${(Number(n) || 0).toFixed(2)}€`;
}

export default function HuntSharePage() {
  const params = useParams();
  const token = String(params.token || "").trim();

  const [state, setState] = useState<HuntState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const r = await huntShareState(token);
        if (r?.ok) setState(r.state);
        else setErr("not_found");
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
  }, [token]);

  if (!token) return <div style={{ padding: 24 }}>Token manquant.</div>;
  if (err) return <div style={{ padding: 24 }}>Erreur: {err}</div>;
  if (!state) return <div style={{ padding: 24 }}>Chargement…</div>;

  const start = Number(state.start) || 0;
  const totalBet = state.items.reduce((s, it) => s + (Number(it.bet) || 0), 0);
  const totalPay = state.items.reduce((s, it) => s + (Number(it.pay) || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h2>Hunt (consultation)</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", opacity: 0.95 }}>
        <div>Start: <strong>{fmtEur(start)}</strong></div>
        <div>Total bet: <strong>{fmtEur(totalBet)}</strong></div>
        <div>Total pay: <strong>{fmtEur(totalPay)}</strong></div>
        <div>Machines: <strong>{state.items.length}</strong></div>
      </div>

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <th style={{ padding: 8 }}>Slot</th>
              <th style={{ padding: 8 }}>Provider</th>
              <th style={{ padding: 8 }}>Bet</th>
              <th style={{ padding: 8 }}>Pay</th>
              <th style={{ padding: 8 }}>Caller</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: 8 }}>{it.name}</td>
                <td style={{ padding: 8, opacity: 0.85 }}>{it.provider || "—"}</td>
                <td style={{ padding: 8 }}>{it.bet != null ? fmtEur(it.bet) : "—"}</td>
                <td style={{ padding: 8 }}>{it.pay != null ? fmtEur(it.pay) : "—"}</td>
                <td style={{ padding: 8 }}>{it.caller ? `@${it.caller}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
