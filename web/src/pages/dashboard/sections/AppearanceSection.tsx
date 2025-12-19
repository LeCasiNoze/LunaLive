// web/src/components/dashboard/sections/AppearanceSection.tsx
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

type SubBadge = {
  enabled: boolean;
  text: string;
  borderColor: string;
  textColor: string;
};

type Appearance = {
  chat: {
    usernameColor: string;
    messageColor: string;
    sub: {
      usernameColor: string;
      messageColor: string;
      badge: SubBadge;
      hat: { id: string | null };
    };
  };
};

const PRESETS = [
  { id: "ghost_purple", name: "Ghost Purple", hex: "#7C4DFF" },
  { id: "blue_lotus", name: "Blue Lotus", hex: "#4AA3FF" },
  { id: "neon_mint", name: "Neon Mint", hex: "#2EF2B3" },
  { id: "rose_nova", name: "Rose Nova", hex: "#FF4DD8" },
  { id: "sunset", name: "Sunset", hex: "#FF7A59" },
  { id: "gold", name: "Gold", hex: "#FFD54A" },
  { id: "ice", name: "Ice", hex: "#9AE6FF" },
  { id: "lime", name: "Lime", hex: "#A3FF4A" },
];

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function clampBadgeText(s: string) {
  const t = (s || "").trim().replace(/[^\w\-]/g, "");
  return (t || "SUB").slice(0, 8);
}

function pickAppearance(j: any): Appearance | null {
  const ap = (j?.appearance ?? j?.streamer?.appearance) as any;
  if (!ap) return null;
  if (!ap.chat) return null;
  return ap as Appearance;
}

function ColorRow({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  help?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{value.toUpperCase()}</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.hex)}
            title={p.name}
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              border: value.toUpperCase() === p.hex ? "2px solid rgba(255,255,255,0.65)" : "1px solid rgba(255,255,255,0.14)",
              background: p.hex,
              cursor: "pointer",
              boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
            }}
          />
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 42, height: 34, border: "none", background: "transparent", cursor: "pointer" }}
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#RRGGBB"
            style={{
              width: 110,
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
              fontWeight: 800,
            }}
          />
        </div>
      </div>

      {help ? <div className="muted" style={{ fontSize: 12 }}>{help}</div> : null}
    </div>
  );
}

export function AppearanceSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const [appearance, setAppearance] = React.useState<Appearance>({
    chat: {
      usernameColor: "#7C4DFF",
      messageColor: "#FFFFFF",
      sub: {
        usernameColor: "#9AE6FF",
        messageColor: "#FFFFFF",
        badge: {
          enabled: true,
          text: "SUB",
          borderColor: "#7C4DFF",
          textColor: "#FFFFFF",
        },
        hat: { id: null },
      },
    },
  });

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBase()}/streamer/me/appearance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "appearance_failed");

      const ap = pickAppearance(j);
      if (!ap) throw new Error("appearance_missing");
      setAppearance(ap);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch(`${apiBase()}/streamer/me/appearance`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ appearance }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "save_failed");

      const ap = pickAppearance(j);
      if (!ap) throw new Error("save_ok_but_no_appearance");
      setAppearance(ap);

      setOk("Enregistré ✅");
      window.setTimeout(() => setOk(null), 1400);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="panel">
      <div className="panelTitle">Apparence — Chat</div>

      <div className="muted" style={{ marginBottom: 10 }}>
        Chaîne : @{streamer.slug} • Couleurs par défaut du chat.
        <br />
        Animation : fade-left (globale, non configurable).
      </div>

      {err ? <div className="hint" style={{ opacity: 0.95 }}>⚠️ {err}</div> : null}
      {ok ? <div className="hint" style={{ opacity: 0.95 }}>✨ {ok}</div> : null}
      {loading ? <div className="muted">Chargement…</div> : null}

      {!loading ? (
        <>
          {/* Section pseudo */}
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Section pseudo</div>
            <ColorRow
              label="Couleur des pseudos"
              value={appearance.chat.usernameColor}
              onChange={(hex) => setAppearance((a) => ({ ...a, chat: { ...a.chat, usernameColor: hex } }))}
              help="S’applique à tous les viewers (skins viewers plus tard)."
            />
          </div>

          {/* Section message */}
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Section message</div>
            <ColorRow
              label="Couleur du texte des messages"
              value={appearance.chat.messageColor}
              onChange={(hex) => setAppearance((a) => ({ ...a, chat: { ...a.chat, messageColor: hex } }))}
            />
          </div>

          {/* Section sub (déjà paramétrable, appliqué plus tard quand on aura la logique sub) */}
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontWeight: 950 }}>Section SUB</div>
              <div className="muted" style={{ fontSize: 12 }}>
                (préparé maintenant, appliqué quand on branche le système sub)
              </div>
            </div>

            <ColorRow
              label="Couleur pseudo SUB"
              value={appearance.chat.sub.usernameColor}
              onChange={(hex) =>
                setAppearance((a) => ({
                  ...a,
                  chat: { ...a.chat, sub: { ...a.chat.sub, usernameColor: hex } },
                }))
              }
            />

            <ColorRow
              label="Couleur message SUB"
              value={appearance.chat.sub.messageColor}
              onChange={(hex) =>
                setAppearance((a) => ({
                  ...a,
                  chat: { ...a.chat, sub: { ...a.chat.sub, messageColor: hex } },
                }))
              }
            />

            <div style={{ marginTop: 12, fontWeight: 900, opacity: 0.95 }}>Badge SUB (tag)</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={appearance.chat.sub.badge.enabled}
                  onChange={(e) =>
                    setAppearance((a) => ({
                      ...a,
                      chat: {
                        ...a.chat,
                        sub: { ...a.chat.sub, badge: { ...a.chat.sub.badge, enabled: e.target.checked } },
                      },
                    }))
                  }
                />
                <span style={{ fontWeight: 900 }}>Activé</span>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                  Texte (≤ 8)
                </div>
                <input
                  value={appearance.chat.sub.badge.text}
                  onChange={(e) =>
                    setAppearance((a) => ({
                      ...a,
                      chat: {
                        ...a.chat,
                        sub: { ...a.chat.sub, badge: { ...a.chat.sub.badge, text: clampBadgeText(e.target.value) } },
                      },
                    }))
                  }
                  style={{
                    width: 110,
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    outline: "none",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ColorRow
                label="Couleur bordure badge"
                value={appearance.chat.sub.badge.borderColor}
                onChange={(hex) =>
                  setAppearance((a) => ({
                    ...a,
                    chat: {
                      ...a.chat,
                      sub: { ...a.chat.sub, badge: { ...a.chat.sub.badge, borderColor: hex } },
                    },
                  }))
                }
              />
              <ColorRow
                label="Couleur texte badge"
                value={appearance.chat.sub.badge.textColor}
                onChange={(hex) =>
                  setAppearance((a) => ({
                    ...a,
                    chat: {
                      ...a.chat,
                      sub: { ...a.chat.sub, badge: { ...a.chat.sub.badge, textColor: hex } },
                    },
                  }))
                }
              />
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Hat avatar (bordure / crown) : placeholder stocké en DB (on branchera plus tard).
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 950, marginBottom: 8 }}>Aperçu</div>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {appearance.chat.sub.badge.enabled ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: `1px solid ${appearance.chat.sub.badge.borderColor}`,
                      color: appearance.chat.sub.badge.textColor,
                      letterSpacing: 0.6,
                    }}
                  >
                    {appearance.chat.sub.badge.text}
                  </span>
                ) : null}

                <span style={{ fontWeight: 950, color: appearance.chat.usernameColor }}>PseudoViewer</span>
                <span style={{ opacity: 0.6, fontSize: 12 }}>12:34</span>
              </div>

              <div style={{ marginTop: 8, color: appearance.chat.messageColor, opacity: 0.95 }}>
                Exemple de message — “ça rend comment ?”
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btnPrimary" onClick={save} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button className="btnGhost" onClick={load} disabled={loading || saving}>
              Recharger
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
