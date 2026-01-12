// web/src/components/admin/RubisMintAdminSection.tsx
import * as React from "react";
import { adminMintRubis, adminSearchUsers, type AdminUserSearchRow } from "../../lib/api";

/**
 * IMPORTANT
 * WalletEngine déduit le poids (w) depuis l'origin via weightBp(origin).
 * Donc côté Admin, on doit choisir un ORIGIN (source) — pas juste un weightBp.
 *
 * On garde weightBp dans la payload uniquement pour compat rétro si l'API l'attend encore,
 * mais le backend doit utiliser origin pour créer wallet_lots.origin correctement.
 */
const ORIGINS: { origin: string; label: string; weightBp: number; hint: string }[] = [
  { origin: "paid_topup", label: "1.00 (payé)", weightBp: 10000, hint: "100 rubis = 1€" },
  { origin: "farm_watch", label: "0.35 (farm_watch)", weightBp: 3500, hint: "farm" },
  { origin: "wheel_daily", label: "0.30 (wheel_daily)", weightBp: 3000, hint: "wheel" },
  { origin: "achievement", label: "0.30 (achievement)", weightBp: 3000, hint: "achievement" },
  { origin: "chest_auto", label: "0.25 (chest_auto)", weightBp: 2500, hint: "coffre auto" },
  { origin: "chest_streamer", label: "0.20 (chest_streamer)", weightBp: 2000, hint: "coffre streamer" },
  { origin: "event_platform", label: "0.10 (event_platform)", weightBp: 1000, hint: "event" },
];

function getOriginRow(origin: string) {
  return ORIGINS.find((o) => o.origin === origin) ?? ORIGINS[ORIGINS.length - 1];
}

export function RubisMintAdminSection({ adminKey }: { adminKey: string }) {
  const [q, setQ] = React.useState("");
  const [users, setUsers] = React.useState<AdminUserSearchRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [picked, setPicked] = React.useState<AdminUserSearchRow | null>(null);

  const [amount, setAmount] = React.useState<number>(500);
  const [origin, setOrigin] = React.useState<string>("paid_topup");
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

    const o = getOriginRow(origin);

    try {
      setLoading(true);

      // Payload "WalletEngine-friendly":
      // -> on envoie origin (source) afin que le backend fasse earnRubisTx(..., origin, ...)
      // On laisse weightBp aussi si l'API l'attend encore, mais il ne doit pas être la source de vérité.
      const r = await adminMintRubis(adminKey, {
        userId: picked.id,
        amount: amt,
        origin: o.origin,
        weightBp: o.weightBp, // compat rétro si nécessaire
        note: note.trim() ? note.trim() : null,
      } as any);

      const wTxt = (o.weightBp / 10000).toFixed(2);
      setMsg(`✅ +${amt} rubis ajoutés à ${r.user.username} (origin ${o.origin}, w=${wTxt})`);

      // refresh picked balance locally
      const nextRubis = Number(r.user.rubis || 0);
      setPicked((p) => (p ? { ...p, rubis: nextRubis } : p));

      setNote("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const o = getOriginRow(origin);
  const wTxt = (o.weightBp / 10000).toFixed(2);

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Ajouter des rubis (admin)</div>
      <div className="mutedSmall" style={{ marginBottom: 10 }}>
        Recherche un utilisateur, choisis un montant + une <b>origine</b> (source). Le poids (w) est déduit de l’origine.
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
            <label>Origine (source) — <span className="mutedSmall">w={wTxt}</span></label>
            <select value={origin} onChange={(e) => setOrigin(String(e.target.value))}>
              {ORIGINS.map((x) => (
                <option key={x.origin} value={x.origin}>
                  {x.label} — {x.hint}
                </option>
              ))}
            </select>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Stocké dans <code>wallet_lots.origin</code> : <b>{o.origin}</b>
            </div>
          </div>

          <div className="field">
            <label>Note (optionnel)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex: event test / compensation"
            />
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
