import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotAutopost,
  deleteMyBotAutopost,
  updateMyBotAutopost,
  type ApiBotAutopost,
} from "../api";

export function AutopostsModule({
  token,
  autoposts,
  onReload,
}: {
  token: string;
  autoposts: ApiBotAutopost[];
  onReload: () => Promise<void>;
}) {
  const [newMsg, setNewMsg] = React.useState("");
  const [newEvery, setNewEvery] = React.useState(600);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function add() {
    setErr(null);
    setBusy(true);
    try {
      await createMyBotAutopost(token, {
        message: normalizeMultiline(newMsg),
        everySec: newEvery,
        enabled: true,
      });
      setNewMsg("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle">Messages automatiques</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        Note: l’exécution live-only sera gérée côté bot (pas ici).
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {/* ✅ textarea (retours à la ligne) + compteur */}
        <div style={{ flex: "1 1 320px", minWidth: 240 }}>
          <textarea
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="message"
            maxLength={BOT_TEXT_MAX}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.12)",
              color: "inherit",
              resize: "vertical",
              lineHeight: 1.25,
            }}
          />
          <div
            className="muted"
            style={{
              marginTop: 4,
              fontSize: 12,
              display: "flex",
              justifyContent: "flex-end",
              fontWeight: 900,
              opacity: 0.8,
            }}
          >
            {newMsg.length}/{BOT_TEXT_MAX}
          </div>
        </div>

        <input
          type="number"
          value={newEvery}
          onChange={(e) => setNewEvery(Number(e.target.value))}
          placeholder="everySec"
          min={10}
          style={{
            width: 140,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />

        <button className="btnGhostInline" disabled={busy} onClick={add}>
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
              <div className="muted" style={{ flex: 1, whiteSpace: "pre-wrap" }}>
                {p.message}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await updateMyBotAutopost(token, p.id, { enabled: !p.enabled });
                  await onReload();
                }}
              >
                {p.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await deleteMyBotAutopost(token, p.id);
                  await onReload();
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
