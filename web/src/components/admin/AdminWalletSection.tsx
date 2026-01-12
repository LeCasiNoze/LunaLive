import * as React from "react";
import {
  adminSearchUsers,
  adminGetWallet,
  adminWalletAdd,
  adminWalletRemove,
  adminWalletResetUser,
  adminWalletResetAll,
} from "../../lib/api";

/* =========================
   TYPES
========================= */

type UserRow = {
  id: number;
  username: string;
  role: string;
  rubis: number;
};

type WalletLot = {
  id: number;
  origin: string;
  weight_bp: number;
  amount_total: number;
  amount_remaining: number;
  created_at: string;
};

/* =========================
   CONSTANTS
========================= */

const WEIGHTS = [
  { label: "1.00 (payé / admin)", value: 10000 },
  { label: "0.20 (event / compensation)", value: 2000 },
];

/* =========================
   COMPONENT
========================= */

export function AdminWalletSection({ adminKey }: { adminKey: string }) {
  const [q, setQ] = React.useState("");
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [picked, setPicked] = React.useState<UserRow | null>(null);

  const [lots, setLots] = React.useState<WalletLot[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [amount, setAmount] = React.useState(500);
  const [weightBp, setWeightBp] = React.useState(10000);

  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  /* =========================
     SEARCH USERS (debounced)
  ========================= */
  React.useEffect(() => {
    if (!q.trim()) {
      setUsers([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const r = await adminSearchUsers(adminKey, q.trim(), 8);
        setUsers(r.users || []);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, adminKey]);

  /* =========================
     LOAD WALLET
  ========================= */
  async function loadWallet(userId: number) {
    setLoading(true);
    try {
      const r = await adminGetWallet(adminKey, userId);
      setPicked(r.user);
      setLots(r.lots);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     ACTIONS
  ========================= */
  async function onAdd() {
    if (!picked) return;
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      await adminWalletAdd(adminKey, {
        userId: picked.id,
        amount,
        weightBp,
      });
      setMsg(`✅ +${amount} rubis ajoutés`);
      await loadWallet(picked.id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onRemove() {
    if (!picked) return;
    if (!confirm(`Retirer ${amount} rubis à ${picked.username} ?`)) return;

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      await adminWalletRemove(adminKey, {
        userId: picked.id,
        amount,
      });
      setMsg(`➖ ${amount} rubis retirés`);
      await loadWallet(picked.id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onResetUser() {
    if (!picked) return;
    if (!confirm(`⚠️ Reset TOTAL des rubis de ${picked.username} ?`)) return;

    setLoading(true);
    try {
      await adminWalletResetUser(adminKey, picked.id);
      await loadWallet(picked.id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function onResetAll() {
    if (!confirm("💣 RESET TOTAL DE TOUS LES UTILISATEURS ?")) return;
    if (!confirm("Dernière confirmation. Action irréversible.")) return;

    setLoading(true);
    try {
      await adminWalletResetAll(adminKey);
      setPicked(null);
      setLots([]);
      setUsers([]);
      setQ("");
      setMsg("💣 Tous les rubis ont été reset");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="panel">
      <div className="panelTitle">Admin · Wallet Rubis</div>

      <div className="field">
        <label>Recherche utilisateur</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="pseudo..."
        />
      </div>

      {!!users.length && (
        <div className="list">
          {users.map((u) => (
            <button
              key={u.id}
              className="btnGhostSmall"
              onClick={() => {
                setUsers([]);
                setQ(u.username);
                loadWallet(u.id);
              }}
            >
              <b>{u.username}</b> <span className="mutedSmall">#{u.id}</span>
              <span className="mutedSmall">
                {u.rubis.toLocaleString()} rubis
              </span>
            </button>
          ))}
        </div>
      )}

      {picked && (
        <>
          <hr />

          <div className="mutedSmall">
            👤 <b>{picked.username}</b> — Solde :{" "}
            <b>{picked.rubis.toLocaleString()} rubis</b>
          </div>

          {/* ACTIONS */}
          <div className="field">
            <label>Montant</label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label>Poids</label>
            <select
              value={weightBp}
              onChange={(e) => setWeightBp(Number(e.target.value))}
            >
              {WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btnPrimary" onClick={onAdd} disabled={loading}>
              ➕ Ajouter
            </button>
            <button className="btnDanger" onClick={onRemove} disabled={loading}>
              ➖ Retirer
            </button>
            <button className="btnGhost" onClick={onResetUser}>
              🔁 Reset user
            </button>
          </div>

          {/* LOTS */}
          <h4 style={{ marginTop: 16 }}>Lots rubis</h4>
          {lots.map((l) => (
            <div key={l.id} className="lotRow">
              <b>{l.origin}</b> · w={(l.weight_bp / 10000).toFixed(2)} ·{" "}
              {l.amount_remaining}/{l.amount_total}
            </div>
          ))}
        </>
      )}

      <hr />

      <button className="btnDanger" onClick={onResetAll}>
        💣 RESET TOUT LE SERVEUR
      </button>

      {err && <div className="hint">⚠️ {err}</div>}
      {msg && <div className="hint">{msg}</div>}
    </div>
  );
}
