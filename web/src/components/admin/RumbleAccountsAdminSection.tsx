// web/src/components/admin/RumbleAccountsAdminSection.tsx
// Section admin pour gérer les comptes Rumble (similaire à DLive)

import * as React from "react";
import {
  adminListUsers,
  getStreamers,
  adminListRumbleAccounts,
  adminCreateRumbleAccount,
  adminDeleteRumbleAccount,
  adminReleaseRumbleAccount,
} from "../../lib/api";

const RUMBLE_RTMP = "rtmp://live.rumble.com/live";

function maskUrl(u: string) {
  if (!u) return "";
  return u.length > 46 ? u.slice(0, 46) + "..." : u;
}

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return "****";
  return k.slice(0, 4) + "****" + k.slice(-4);
}

export function RumbleAccountsAdminSection({ adminKey }: { adminKey: string }) {
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [eligibleStreamers, setEligibleStreamers] = React.useState<Array<{ streamerId: string; label: string }>>([]);

  // Form fields
  const [username, setUsername] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [streamKey, setStreamKey] = React.useState("");
  const [selectedStreamerId, setSelectedStreamerId] = React.useState("");

  async function refresh() {
    setErr(null);
    
    try {
      const [rumbleAccounts, users, streamers] = await Promise.all([
        adminListRumbleAccounts(adminKey),
        adminListUsers(adminKey),
        getStreamers(),
      ]);

      setAccounts(rumbleAccounts.accounts);

      const slugToId = new Map<string, string>();
      for (const s of streamers) slugToId.set(String(s.slug), String(s.id));

      const assigned = new Set<string>();
      for (const acc of rumbleAccounts.accounts) if (acc.assignedStreamerId) assigned.add(String(acc.assignedStreamerId));

      const eligible: Array<{ streamerId: string; label: string }> = [];
      for (const u of users.users) {
        const isStreamer = u.role === "streamer" || u.role === "admin";
        if (!isStreamer) continue;
        if (!u.streamerSlug) continue;

        const sid = slugToId.get(u.streamerSlug);
        if (!sid) continue;
        if (assigned.has(String(sid))) continue;

        eligible.push({ streamerId: sid, label: `${u.username} (${u.streamerSlug})` });
      }

      eligible.sort((x, y) => x.label.localeCompare(y.label));
      setEligibleStreamers(eligible);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  React.useEffect(() => {
    refresh().catch((e: any) => setErr(String(e?.message || e)));
  }, [adminKey]);

  async function addRumbleAccount() {
    setBusy(true);
    setErr(null);
    
    try {
      await adminCreateRumbleAccount(adminKey, {
        username: username.trim(),
        apiKey: apiKey.trim(),
        rtmpUrl: RUMBLE_RTMP,
        streamKey: streamKey.trim(),
        assignedToStreamerId: selectedStreamerId || null,
      });
      
      // Reset form
      setUsername("");
      setApiKey("");
      setStreamKey("");
      setSelectedStreamerId("");
      
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Ajout de compte Rumble (LeCasiNoze)</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        RTMP fixe : <b>{RUMBLE_RTMP}</b>. Gestion des comptes Rumble pour LeCasiNoze.
      </div>

      {err && <div className="hint">{"\u26a0\ufe0f"} {err}</div>}

      {/* Add account form */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panelTitle">Ajouter un compte Rumble</div>

        <div className="field">
          <label>Username Rumble</label>
          <input 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            placeholder="ex: LeCasiNoze" 
          />
        </div>

        <div className="field">
          <label>API Key (Live API)</label>
          <input 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)} 
            placeholder="Clé API Rumble..." 
            type="password"
          />
        </div>

        <div className="field">
          <label>Stream Key</label>
          <input 
            value={streamKey} 
            onChange={(e) => setStreamKey(e.target.value)} 
            placeholder="Clé de stream RTMP..." 
            type="password"
          />
        </div>

        <div className="field">
          <label>Assigner à</label>
          <select 
            value={selectedStreamerId} 
            onChange={(e) => setSelectedStreamerId(e.target.value)}
          >
            <option value="">Non assigné</option>
            {eligibleStreamers.map((s) => (
              <option key={s.streamerId} value={s.streamerId}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button 
          className="btnPrimary" 
          onClick={addRumbleAccount} 
          disabled={busy || !username.trim() || !apiKey.trim() || !streamKey.trim()}
        >
          {busy ? "..." : "Ajouter"}
        </button>
      </div>

      {/* List */}
      <div style={{ marginTop: 14 }}>
        <div className="panelTitle">Liste des comptes Rumble</div>

        {accounts.map((acc) => {
          const isAssigned = !!(acc.assigned_to_streamer_id || acc.assignedStreamerId);
          return (
            <div
              key={acc.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 0",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <b>#{acc.id}</b>{" "}
                  <span className="mutedSmall">
                    Rumble / {acc.username}
                  </span>
                  <div className="mutedSmall">RTMP: {maskUrl(acc.rtmp_url || RUMBLE_RTMP)}</div>
                  <div className="mutedSmall">Stream Key: {maskKey(acc.stream_key || "****")}</div>
                </div>

                {isAssigned ? (
                  <button
                    className="btnGhostSmall"
                    onClick={async () => {
                      await adminReleaseRumbleAccount(adminKey, acc.id);
                      await refresh();
                    }}
                    disabled={busy}
                  >
                    Dissocier
                  </button>
                ) : (
                  <button
                    className="btnGhostSmall"
                    onClick={async () => {
                      await adminDeleteRumbleAccount(adminKey, acc.id);
                      await refresh();
                    }}
                    disabled={busy}
                  >
                    Supprimer
                  </button>
                )}
              </div>

              <div className="mutedSmall">
                Statut :{" "}
                {isAssigned ? (
                  <>
                    <b>ASSIGNÉ</b> à LeCasiNoze{" "}
                    <span className="mutedSmall">(ID: {acc.assigned_to_streamer_id || acc.assignedStreamerId})</span>
                  </>
                ) : (
                  <b>LIBRE</b>
                )}
                {acc.assigned_at && (
                  <span className="mutedSmall">
                    {" "}depuis {new Date(acc.assigned_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
            Aucun compte Rumble configuré
          </div>
        )}
      </div>
    </div>
  );
}
