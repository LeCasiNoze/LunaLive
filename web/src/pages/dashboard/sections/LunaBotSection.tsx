import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";
import {
  botTestSend,
  clearMyBotLogs,
  createMyBotAutopost,
  createMyBotCommand,
  deleteMyBotAutopost,
  deleteMyBotCommand,
  getMyBotAutoposts,
  getMyBotCommands,
  getMyBotLogs,
  getMyBotOverview,
  updateMyBotAutopost,
  updateMyBotCommand,
  type ApiBotAutopost,
  type ApiBotCommand,
  type ApiBotLogRow,
} from "../../../lib/api";

export function LunaBotSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [overview, setOverview] = React.useState<any>(null);

  const [commands, setCommands] = React.useState<ApiBotCommand[]>([]);
  const [autoposts, setAutoposts] = React.useState<ApiBotAutopost[]>([]);
  const [logs, setLogs] = React.useState<ApiBotLogRow[]>([]);

  // forms
  const [newTrigger, setNewTrigger] = React.useState("");
  const [newResp, setNewResp] = React.useState("");

  const [newAutoMsg, setNewAutoMsg] = React.useState("");
  const [newAutoEvery, setNewAutoEvery] = React.useState(600);

  const [testBody, setTestBody] = React.useState("Test LunaBot ✅");

  async function reloadAll() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [ov, c, a, l] = await Promise.all([
        getMyBotOverview(token),
        getMyBotCommands(token),
        getMyBotAutoposts(token),
        getMyBotLogs(token, 60),
      ]);
      setOverview(ov);
      setCommands(c.commands);
      setAutoposts(a.autoposts);
      setLogs(l.logs);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">LunaBot</div>
        <div className="muted">Connecte-toi.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>LunaBot</span>
        <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 800 }}>
          @{streamer.slug}
        </span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btnGhostInline" onClick={() => reloadAll()} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>

        <button
          className="btnGhostInline"
          onClick={async () => {
            if (!token) return;
            await botTestSend(token, testBody);
            await reloadAll();
          }}
          disabled={loading}
        >
          Envoyer test (chat)
        </button>

        <input
          value={testBody}
          onChange={(e) => setTestBody(e.target.value)}
          placeholder="Message de test"
          style={{
            flex: "1 1 260px",
            minWidth: 220,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
      </div>

      {overview?.ok && (
        <div className="muted" style={{ marginTop: 10 }}>
          Commandes: <b>{overview.counts.commands}</b> • Auto-messages: <b>{overview.counts.autoposts}</b> • Logs:{" "}
          <b>{overview.counts.logs}</b>
        </div>
      )}

      <hr style={{ margin: "16px 0", opacity: 0.15 }} />

      {/* COMMANDS */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 900 }}>Commandes personnalisées</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Prefix fixe: <b>!</b> (tu stockes juste le trigger)
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={newTrigger}
          onChange={(e) => setNewTrigger(e.target.value)}
          placeholder="trigger (ex: discord)"
          style={{
            flex: "0 0 200px",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <input
          value={newResp}
          onChange={(e) => setNewResp(e.target.value)}
          placeholder="réponse"
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <button
          className="btnGhostInline"
          disabled={loading}
          onClick={async () => {
            if (!token) return;
            await createMyBotCommand(token, { trigger: newTrigger, response: newResp, enabled: true });
            setNewTrigger("");
            setNewResp("");
            await reloadAll();
          }}
        >
          Ajouter
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {commands.length === 0 ? (
          <div className="muted">Aucune commande.</div>
        ) : (
          commands.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ width: 160, fontWeight: 900 }}>!{c.trigger}</div>
              <div className="muted" style={{ flex: 1 }}>
                {c.response}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  if (!token) return;
                  await updateMyBotCommand(token, c.id, { enabled: !c.enabled });
                  await reloadAll();
                }}
              >
                {c.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  if (!token) return;
                  await deleteMyBotCommand(token, c.id);
                  await reloadAll();
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>

      <hr style={{ margin: "16px 0", opacity: 0.15 }} />

      {/* AUTOPOSTS */}
      <div style={{ fontWeight: 900 }}>Messages automatiques (live-only côté bot)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={newAutoMsg}
          onChange={(e) => setNewAutoMsg(e.target.value)}
          placeholder="message"
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <input
          type="number"
          value={newAutoEvery}
          onChange={(e) => setNewAutoEvery(Number(e.target.value))}
          placeholder="everySec"
          style={{
            width: 140,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <button
          className="btnGhostInline"
          disabled={loading}
          onClick={async () => {
            if (!token) return;
            await createMyBotAutopost(token, { message: newAutoMsg, everySec: newAutoEvery, enabled: true });
            setNewAutoMsg("");
            await reloadAll();
          }}
        >
          Ajouter
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {autoposts.length === 0 ? (
          <div className="muted">Aucun auto-message.</div>
        ) : (
          autoposts.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ width: 120, fontWeight: 900 }}>{p.everySec}s</div>
              <div className="muted" style={{ flex: 1 }}>
                {p.message}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  if (!token) return;
                  await updateMyBotAutopost(token, p.id, { enabled: !p.enabled });
                  await reloadAll();
                }}
              >
                {p.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  if (!token) return;
                  await deleteMyBotAutopost(token, p.id);
                  await reloadAll();
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>

      <hr style={{ margin: "16px 0", opacity: 0.15 }} />

      {/* LOGS */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>Logs</div>
        <button
          className="btnGhostInline"
          onClick={async () => {
            if (!token) return;
            await clearMyBotLogs(token);
            await reloadAll();
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {logs.length === 0 ? (
          <div className="muted">Aucun log.</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="muted" style={{ fontSize: 12, opacity: 0.9 }}>
              <b style={{ opacity: 0.9 }}>{String(l.level).toUpperCase()}</b> — {l.message}{" "}
              <span style={{ opacity: 0.6 }}>({new Date(l.createdAt).toLocaleString()})</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
