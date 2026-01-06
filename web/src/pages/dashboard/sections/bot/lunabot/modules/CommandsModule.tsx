import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotCommand,
  deleteMyBotCommand,
  updateMyBotCommand,
  type ApiBotCommand,
} from "../api";

export function CommandsModule({
  token,
  commands,
  onReload,
}: {
  token: string;
  commands: ApiBotCommand[];
  onReload: () => Promise<void>;
}) {
  const [newTrigger, setNewTrigger] = React.useState("");
  const [newResp, setNewResp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function add() {
    setErr(null);
    setBusy(true);
    try {
      await createMyBotCommand(token, {
        trigger: newTrigger,
        response: normalizeMultiline(newResp),
        enabled: true,
      });
      setNewTrigger("");
      setNewResp("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div
        className="panelTitle"
        style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
      >
        <span>Commandes personnalisées</span>
        <span className="muted" style={{ fontSize: 12 }}>
          Prefix fixe: <b>!</b>
        </span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={newTrigger}
          onChange={(e) => setNewTrigger(e.target.value)}
          placeholder="trigger (ex: discord)"
          maxLength={32}
          style={{
            flex: "0 0 200px",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />

        {/* ✅ textarea (retours à la ligne) + compteur */}
        <div style={{ flex: "1 1 320px", minWidth: 240 }}>
          <textarea
            value={newResp}
            onChange={(e) => setNewResp(e.target.value)}
            placeholder="réponse"
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
            {newResp.length}/{BOT_TEXT_MAX}
          </div>
        </div>

        <button className="btnGhostInline" disabled={busy} onClick={add}>
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
              <div className="muted" style={{ flex: 1, whiteSpace: "pre-wrap" }}>
                {c.response}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await updateMyBotCommand(token, c.id, { enabled: !c.enabled });
                  await onReload();
                }}
              >
                {c.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await deleteMyBotCommand(token, c.id);
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
