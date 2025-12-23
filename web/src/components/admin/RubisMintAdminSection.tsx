// web/src/components/admin/RubisMintAdminSection.tsx
import * as React from "react";
import { adminMintRubis, adminSearchUsers, type AdminUserSearchRow } from "../../lib/api";

const WEIGHTS: { label: string; weightBp: number; hint: string }[] = [
  { label: "1.00 (payé)", weightBp: 10000, hint: "100 rubis = 1€" },
  { label: "0.35 (farm_watch)", weightBp: 3500, hint: "farm" },
  { label: "0.30 (wheel/achiev)", weightBp: 3000, hint: "wheel/achiev" },
  { label: "0.25 (chest_auto)", weightBp: 2500, hint: "coffre auto" },
  { label: "0.20 (chest_streamer)", weightBp: 2000, hint: "coffre streamer" },
  { label: "0.10 (event_platform)", weightBp: 1000, hint: "event" },
];

export function RubisMintAdminSection({ adminKey }: { adminKey: string }) {
  const [q, setQ] = React.useState("");
  const [users, setUsers] = React.useState<AdminUserSearchRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [picked, setPicked] = React.useState<AdminUserSearchRow | null>(null);

  const [amount, setAmount] = React.useState<number>(500);
  const [weightBp, setWeightBp] = React.useState<number>(10000);
  const [note, setNote] = React.useState<string>("");

  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // search debounce
  React.useEffect(() => {
    let alive = true;
    setErr(null);
    setMsg(null);

    const qq = q.trim();
    if (!qq) {
      setUsers([]);
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        setLoading(true);
        const r = await adminSearchUsers(adminKey, qq, 8);
        if (!alive) return;
        setUsers(r.users || []);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, adminKey]);

  async function onMint() {
    setErr(null);
    setMsg(null);

    if (!picked) return;
    const amt = Math.floor(Number(amount || 0));
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Montant invalide");
      return;
    }

    try {
      setLoading(true);
      const r = await adminMintRubis(adminKey, {
        userId: picked.id,
        amount: amt,
        weightBp,
        note: note.trim() ? note.trim() : null,
      });

      setMsg(`✅ +${amt} rubis ajoutés à ${r.user.username} (tx ${r.txId})`);

      // refresh picked balance locally
      const nextRubis = Number(r.user.rubis || 0);
      setPicked((p) => (p ? { ...p, rubis: nextRubis } : p));

      // optionally clear amount/note
      setNote("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Ajouter des rubis (admin)</div>
      <div className="mutedSmall" style={{ marginBottom: 10 }}>
        Recherche un utilisateur, choisis un montant + un poids (w).
      </div>

      <div className="field">
        <label>Recherche user</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex: lecasinoze" />
      </div>

      {loading && !picked ? <div className="mutedSmall">Recherche…</div> : null}

      {!!users.length ? (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 10 }}>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="btnGhostSmall"
              onClick={() => {
                setPicked(u);
                setUsers([]);
                setQ(u.username);
              }}
              style={{
                width: "100%",
                justifyContent: "space-between",
                padding: "10px 12px",
                marginTop: 10,
              }}
            >
              <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                <b>{u.username}</b>
                <span className="mutedSmall">#{u.id}</span>
                <span className="mutedSmall">({u.role})</span>
              </span>
              <span className="mutedSmall">{Number(u.rubis || 0).toLocaleString()} rubis</span>
            </button>
          ))}
        </div>
      ) : null}

      {picked ? (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <div className="mutedSmall" style={{ marginBottom: 10 }}>
            Cible : <b>{picked.username}</b> (#{picked.id}) — solde :{" "}
            <b>{Number(picked.rubis || 0).toLocaleString()}</b> rubis
          </div>

          <div className="field">
            <label>Montant (rubis)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={1}
              step={1}
            />
          </div>

          <div className="field">
            <label>Poids (w)</label>
            <select value={String(weightBp)} onChange={(e) => setWeightBp(Number(e.target.value))}>
              {WEIGHTS.map((w) => (
                <option key={w.weightBp} value={String(w.weightBp)}>
                  {w.label} — {w.hint}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Note (optionnel)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: event test / compensation" />
          </div>

          {err ? <div className="hint">⚠️ {err}</div> : null}
          {msg ? <div className="hint">{msg}</div> : null}

          <button className="btnPrimary" disabled={loading} onClick={onMint}>
            {loading ? "…" : "Ajouter les rubis"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
