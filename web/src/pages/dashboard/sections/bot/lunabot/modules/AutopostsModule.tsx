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

  // ✅ édition
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editMsg, setEditMsg] = React.useState("");
  const [editEvery, setEditEvery] = React.useState(600);
  const [savingId, setSavingId] = React.useState<string | null>(null);

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

  function startEdit(p: ApiBotAutopost) {
    setErr(null);
    setEditingId(p.id);
    setEditMsg(p.message ?? "");
    setEditEvery(Number(p.everySec) || 600);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditMsg("");
    setEditEvery(600);
  }

  async function saveEdit(id: string) {
    setErr(null);
    setSavingId(id);
    try {
      await updateMyBotAutopost(token, id, {
        message: normalizeMultiline(editMsg),
        everySec: editEvery,
      });
      setEditingId(null);
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
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

      {/* ADD */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
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

      {/* LIST */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {autoposts.length === 0 ? (
          <div className="muted">Aucun auto-message.</div>
        ) : (
          autoposts.map((p) => {
            const isEditing = editingId === p.id;
            const isSaving = savingId === p.id;

            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "stretch",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.10)",
                }}
              >
                {!isEditing ? (
                  <>
                    <div style={{ width: 120, fontWeight: 900, paddingTop: 4 }}>
                      {p.everySec}s
                    </div>

                    <div className="muted" style={{ flex: 1, whiteSpace: "pre-wrap", paddingTop: 4 }}>
                      {p.message}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btnGhostInline"
                        onClick={async () => {
                          await updateMyBotAutopost(token, p.id, { enabled: !p.enabled });
                          await onReload();
                        }}
                      >
                        {p.enabled ? "Désactiver" : "Activer"}
                      </button>

                      <button className="btnGhostInline" onClick={() => startEdit(p)}>
                        Modifier
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
                  </>
                ) : (
                  <>
                    <div style={{ width: 140 }}>
                      <input
                        type="number"
                        value={editEvery}
                        onChange={(e) => setEditEvery(Number(e.target.value))}
                        min={10}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(0,0,0,0.12)",
                          color: "inherit",
                        }}
                      />
                      <div className="muted" style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
                        everySec
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 240 }}>
                      <textarea
                        value={editMsg}
                        onChange={(e) => setEditMsg(e.target.value)}
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
                          justifyContent: "space-between",
                          fontWeight: 900,
                          opacity: 0.8,
                        }}
                      >
                        <span>{p.enabled ? "Actif" : "Désactivé"}</span>
                        <span>
                          {editMsg.length}/{BOT_TEXT_MAX}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btnGhostInline"
                        disabled={isSaving}
                        onClick={() => saveEdit(p.id)}
                      >
                        {isSaving ? "Sauvegarde…" : "Enregistrer"}
                      </button>
                      <button className="btnGhostInline" disabled={isSaving} onClick={cancelEdit}>
                        Annuler
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
