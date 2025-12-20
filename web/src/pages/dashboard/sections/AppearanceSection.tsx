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

function pickOfflineBgUrl(j: any): string | null {
  // attendu: { ok:true, appearance, offlineBgUrl }
  const u = j?.offlineBgUrl ?? j?.streamer?.offlineBgUrl ?? null;
  return typeof u === "string" && u.trim() ? u : null;
}

async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap est top si dispo
  const anyGlobal: any = globalThis as any;
  if (typeof anyGlobal.createImageBitmap === "function") {
    return await anyGlobal.createImageBitmap(file);
  }

  // fallback Image()
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobFromCanvas(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("toBlob_failed"));
        resolve(b);
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Resize + crop "cover" vers du 16:9 (1600x900 par défaut)
 * => renvoie un Blob JPEG + une URL de preview
 */
async function makeOfflineBgJpeg(
  file: File,
  opts: { w: number; h: number; quality?: number }
): Promise<{ blob: Blob; previewUrl: string }> {
  const { w, h, quality = 0.82 } = opts;

  const src = await loadImageBitmap(file);

  // dimensions source
  const sw = (src as any).width as number;
  const sh = (src as any).height as number;

  // cover crop
  const targetRatio = w / h;
  const srcRatio = sw / sh;

  let cropW = sw;
  let cropH = sh;
  let sx = 0;
  let sy = 0;

  if (srcRatio > targetRatio) {
    // trop large => crop horizontal
    cropW = Math.round(sh * targetRatio);
    sx = Math.round((sw - cropW) / 2);
  } else {
    // trop haut => crop vertical
    cropH = Math.round(sw / targetRatio);
    sy = Math.round((sh - cropH) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_ctx_missing");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(src as any, sx, sy, cropW, cropH, 0, 0, w, h);

  const blob = await blobFromCanvas(canvas, quality);
  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
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
              border:
                value.toUpperCase() === p.hex
                  ? "2px solid rgba(255,255,255,0.65)"
                  : "1px solid rgba(255,255,255,0.14)",
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

      {help ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {help}
        </div>
      ) : null}
    </div>
  );
}

export function AppearanceSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // OFFLINE BG
  const [offlineBgUrl, setOfflineBgUrl] = React.useState<string | null>(null);
  const [offlineUploading, setOfflineUploading] = React.useState(false);
  const [offlineDeleting, setOfflineDeleting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [offlineLocalPreview, setOfflineLocalPreview] = React.useState<string | null>(null);

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

  function toastOk(msg: string) {
    setOk(msg);
    window.setTimeout(() => setOk(null), 1400);
  }

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

      setOfflineBgUrl(pickOfflineBgUrl(j));
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

      // au cas où l'API le renvoie aussi ici
      setOfflineBgUrl(pickOfflineBgUrl(j) ?? offlineBgUrl);

      toastOk("Enregistré ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadOfflineBg(file: File) {
    if (!token) return;
    setErr(null);
    setOk(null);

    // cleanup ancienne preview locale
    if (offlineLocalPreview) {
      try {
        URL.revokeObjectURL(offlineLocalPreview);
      } catch {}
      setOfflineLocalPreview(null);
    }

    setOfflineUploading(true);
    try {
      // 16:9 — on standardise pour ton player (tu peux passer à 1920x1080 si tu veux)
      const { blob, previewUrl } = await makeOfflineBgJpeg(file, { w: 1600, h: 900, quality: 0.82 });
      setOfflineLocalPreview(previewUrl);

      const fd = new FormData();
      fd.append("image", blob, "offline.jpg");

      const r = await fetch(`${apiBase()}/streamer/me/offline-bg`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "upload_failed");

      if (typeof j.offlineBgUrl === "string") {
        setOfflineBgUrl(j.offlineBgUrl);
      } else {
        // fallback: reload pour récupérer l'url
        await load();
      }

      toastOk("Image offline mise à jour ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur upload"));
    } finally {
      setOfflineUploading(false);
    }
  }

  async function deleteOfflineBg() {
    if (!token) return;
    setErr(null);
    setOk(null);
    setOfflineDeleting(true);
    try {
      const r = await fetch(`${apiBase()}/streamer/me/offline-bg`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "delete_failed");

      setOfflineBgUrl(null);

      if (offlineLocalPreview) {
        try {
          URL.revokeObjectURL(offlineLocalPreview);
        } catch {}
        setOfflineLocalPreview(null);
      }

      toastOk("Image offline supprimée ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur suppression"));
    } finally {
      setOfflineDeleting(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  React.useEffect(() => {
    return () => {
      if (offlineLocalPreview) {
        try {
          URL.revokeObjectURL(offlineLocalPreview);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownBg = offlineLocalPreview ?? offlineBgUrl;

  return (
    <div className="panel">
      <div className="panelTitle">Apparence</div>

      <div className="muted" style={{ marginBottom: 10 }}>
        Chaîne : @{streamer.slug} • Chat + écran OFFLINE.
      </div>

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}
      {ok ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ✨ {ok}
        </div>
      ) : null}
      {loading ? <div className="muted">Chargement…</div> : null}

      {!loading ? (
        <>
          {/* ================= OFFLINE BACKGROUND ================= */}
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontWeight: 950 }}>Image OFFLINE</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Recommandé : 16:9 • Export auto 1600×900 (JPEG)
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] || null;
                  e.currentTarget.value = ""; // permet re-select same file
                  if (!f) return;
                  uploadOfflineBg(f);
                }}
              />

              <button
                className="btnPrimary"
                onClick={() => fileRef.current?.click()}
                disabled={!token || offlineUploading || offlineDeleting}
              >
                {offlineUploading ? "Upload…" : shownBg ? "Changer l'image" : "Ajouter une image"}
              </button>

              <button
                className="btnGhost"
                onClick={deleteOfflineBg}
                disabled={!token || !offlineBgUrl || offlineUploading || offlineDeleting}
                title={!offlineBgUrl ? "Aucune image enregistrée" : "Supprimer l'image"}
              >
                {offlineDeleting ? "Suppression…" : "Supprimer"}
              </button>

              <button className="btnGhost" onClick={load} disabled={loading || saving || offlineUploading || offlineDeleting}>
                Recharger
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  aspectRatio: "16/9",
                  background: shownBg
                    ? `linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.15)), url(${shownBg}) center/cover no-repeat`
                    : "rgba(255,255,255,0.04)",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>
                    {shownBg ? "Preview OFFLINE" : "Aucune image OFFLINE"}
                  </div>
                  <div className="mutedSmall" style={{ marginTop: 6, maxWidth: 520 }}>
                    {shownBg
                      ? "C’est ce visuel qui s’affichera sur la page streamer quand il n’est pas en live."
                      : "Ajoute une image : on la crop/resize en 16:9 et on l’upload en JPEG optimisé."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= CHAT APPEARANCE ================= */}
          <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 950 }}>Apparence — Chat</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Animation : fade-left (globale, non configurable).
            </div>
          </div>

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

          {/* Section sub */}
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
            <button className="btnPrimary" onClick={save} disabled={saving || offlineUploading || offlineDeleting}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button className="btnGhost" onClick={load} disabled={loading || saving || offlineUploading || offlineDeleting}>
              Recharger
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
