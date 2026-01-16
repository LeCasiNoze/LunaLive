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
    viewerSkinsLevel?: 1 | 2 | 3;
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
  const u = j?.offlineBgUrl ?? j?.streamer?.offlineBgUrl ?? null;
  return typeof u === "string" && u.trim() ? u : null;
}

async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  const anyGlobal: any = globalThis as any;
  if (typeof anyGlobal.createImageBitmap === "function") {
    return await anyGlobal.createImageBitmap(file);
  }
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

async function makeOfflineBgJpeg(
  file: File,
  opts: { w: number; h: number; quality?: number }
): Promise<{ blob: Blob; previewUrl: string }> {
  const { w, h, quality = 0.82 } = opts;

  const src = await loadImageBitmap(file);
  const sw = (src as any).width as number;
  const sh = (src as any).height as number;

  const targetRatio = w / h;
  const srcRatio = sw / sh;

  let cropW = sw;
  let cropH = sh;
  let sx = 0;
  let sy = 0;

  if (srcRatio > targetRatio) {
    cropW = Math.round(sh * targetRatio);
    sx = Math.round((sw - cropW) / 2);
  } else {
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

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 1100, letterSpacing: -0.2 }}>{title}</div>
          {subtitle ? (
            <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.8 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 1000 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>{value.toUpperCase()}</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.hex)}
            title={p.name}
            style={{
              width: 30,
              height: 30,
              borderRadius: 12,
              border:
                value.toUpperCase() === p.hex
                  ? "2px solid rgba(255,255,255,0.70)"
                  : "1px solid rgba(255,255,255,0.14)",
              background: p.hex,
              cursor: "pointer",
              boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
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
              width: 120,
              padding: "10px 10px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
              fontWeight: 900,
            }}
          />
        </div>
      </div>

      {help ? (
        <div className="mutedSmall" style={{ fontSize: 12, opacity: 0.8 }}>
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

  const [offlineBgUrl, setOfflineBgUrl] = React.useState<string | null>(null);
  const [offlineUploading, setOfflineUploading] = React.useState(false);
  const [offlineDeleting, setOfflineDeleting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [offlineLocalPreview, setOfflineLocalPreview] = React.useState<string | null>(null);

  const [appearance, setAppearance] = React.useState<Appearance>({
    chat: {
      viewerSkinsLevel: 1,
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

    if (offlineLocalPreview) {
      try {
        URL.revokeObjectURL(offlineLocalPreview);
      } catch {}
      setOfflineLocalPreview(null);
    }

    setOfflineUploading(true);
    try {
      const { blob, previewUrl } = await makeOfflineBgJpeg(file, { w: 1600, h: 900, quality: 0.82 });
      setOfflineLocalPreview(previewUrl);

      const fd = new FormData();
      fd.append("image", blob, "offline.jpg");

      const r = await fetch(`${apiBase()}/streamer/me/offline-bg`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "upload_failed");

      if (typeof j.offlineBgUrl === "string") setOfflineBgUrl(j.offlineBgUrl);
      else await load();

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
      <style>{`
        .llSplit2{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          align-items:start;
        }
        @media (max-width: 980px){
          .llSplit2{ grid-template-columns: 1fr; }
        }
        .llPreview{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.16);
          overflow:hidden;
        }
      `}</style>

      <div className="panelTitle">Apparence</div>
      <div className="mutedSmall" style={{ marginTop: 6 }}>
        Chaîne : <b>@{streamer.slug}</b> • Chat + écran OFFLINE.
      </div>

      {err ? (
        <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
          ⚠️ {err}
        </div>
      ) : null}
      {ok ? (
        <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
          ✨ {ok}
        </div>
      ) : null}
      {loading ? (
        <div className="muted" style={{ marginTop: 10 }}>
          Chargement…
        </div>
      ) : null}

      {!loading ? (
        <>
          {/* OFFLINE BG */}
          <SectionCard
            title="Image OFFLINE"
            subtitle="Recommandé : 16:9 • Export auto 1600×900 (JPEG)"
            right={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btnPrimarySmall"
                  onClick={() => fileRef.current?.click()}
                  disabled={!token || offlineUploading || offlineDeleting}
                >
                  {offlineUploading ? "Upload…" : shownBg ? "Changer" : "Ajouter"}
                </button>
                <button
                  className="btnGhostSmall"
                  onClick={deleteOfflineBg}
                  disabled={!token || !offlineBgUrl || offlineUploading || offlineDeleting}
                  title={!offlineBgUrl ? "Aucune image enregistrée" : "Supprimer l'image"}
                >
                  {offlineDeleting ? "Suppression…" : "Supprimer"}
                </button>
                <button className="btnGhostSmall" onClick={load} disabled={loading || saving || offlineUploading || offlineDeleting}>
                  Recharger
                </button>
              </div>
            }
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0] || null;
                e.currentTarget.value = "";
                if (!f) return;
                uploadOfflineBg(f);
              }}
            />

            <div className="llPreview">
              <div
                style={{
                  aspectRatio: "16/9",
                  background: shownBg
                    ? `linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.12)), url(${shownBg}) center/cover no-repeat`
                    : "rgba(255,255,255,0.04)",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 1100 }}>
                    {shownBg ? "Preview OFFLINE" : "Aucune image OFFLINE"}
                  </div>
                  <div className="mutedSmall" style={{ marginTop: 6, maxWidth: 620, opacity: 0.85 }}>
                    {shownBg
                      ? "Ce visuel s’affiche sur ta page streamer quand tu es hors ligne."
                      : "Ajoute une image : on la crop/resize en 16:9 et on l’upload en JPEG optimisé."}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* CHAT */}
          <SectionCard title="Apparence — Chat" subtitle="Animation : fade-left (globale, non configurable).">
            <div className="llSplit2">
              {/* VIEWERS SKINS POLICY */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.14)",
                }}
              >
                <div style={{ fontWeight: 1100 }}>Skins des viewers</div>
                <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.85 }}>
                  Choisis si tu laisses les viewers afficher leurs cosmétiques ou si tu imposes ton style.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {([
                    {
                      v: 1,
                      title: "Niveau 1 — Libre",
                      desc: "Les viewers avec skin gardent leur skin. Sans skin → ton style.",
                    },
                    {
                      v: 2,
                      title: "Niveau 2 — Bloquer couleurs de pseudo",
                      desc: "Couleur pseudo imposée par le streamer (skins pseudo ignorés).",
                    },
                    {
                      v: 3,
                      title: "Niveau 3 — Bloquer couleurs + cadrans",
                      desc: "Couleurs + cadrans viewers ignorés. Chat homogène.",
                    },
                  ] as const).map((o) => (
                    <label
                      key={o.v}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: 10,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="viewerSkinsLevel"
                        checked={Number(appearance.chat.viewerSkinsLevel ?? 1) === o.v}
                        onChange={() =>
                          setAppearance((a) => ({
                            ...a,
                            chat: { ...a.chat, viewerSkinsLevel: o.v },
                          }))
                        }
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontWeight: 1050 }}>{o.title}</div>
                        <div className="mutedSmall" style={{ fontSize: 12, opacity: 0.82 }}>
                          {o.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* COLORS */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.14)",
                }}
              >
                <div style={{ fontWeight: 1100 }}>Couleurs</div>
                <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.85 }}>
                  Ces couleurs s’appliquent au chat selon ta politique skins.
                </div>

                <ColorRow
                  label="Couleur des pseudos"
                  value={appearance.chat.usernameColor}
                  onChange={(hex) => setAppearance((a) => ({ ...a, chat: { ...a.chat, usernameColor: hex } }))}
                />

                <ColorRow
                  label="Couleur du texte des messages"
                  value={appearance.chat.messageColor}
                  onChange={(hex) => setAppearance((a) => ({ ...a, chat: { ...a.chat, messageColor: hex } }))}
                />
              </div>
            </div>
          </SectionCard>

          {/* SUB */}
          <SectionCard title="Section SUB" subtitle="Préparé maintenant, appliqué quand on branche le système SUB.">
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.14)",
              }}
            >
              <div className="llSplit2">
                <div>
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
                </div>

                <div>
                  <div style={{ fontWeight: 1000, marginTop: 12 }}>Badge SUB</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
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
                      <span style={{ fontWeight: 1000 }}>Activé</span>
                    </label>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="mutedSmall" style={{ fontSize: 12, fontWeight: 900 }}>
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
                          width: 120,
                          padding: "10px 10px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.25)",
                          color: "white",
                          outline: "none",
                          fontWeight: 1000,
                          textTransform: "uppercase",
                        }}
                      />
                    </div>
                  </div>

                  <div className="llSplit2" style={{ marginTop: 12 }}>
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

                  <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
                    Hat avatar : placeholder stocké en DB (on branchera plus tard).
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* PREVIEW */}
          <SectionCard title="Aperçu">
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {appearance.chat.sub.badge.enabled ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 1000,
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: `1px solid ${appearance.chat.sub.badge.borderColor}`,
                      color: appearance.chat.sub.badge.textColor,
                      letterSpacing: 0.6,
                      background: "rgba(0,0,0,0.18)",
                    }}
                  >
                    {appearance.chat.sub.badge.text}
                  </span>
                ) : null}

                <span style={{ fontWeight: 1100, color: appearance.chat.usernameColor }}>PseudoViewer</span>
                <span style={{ opacity: 0.6, fontSize: 12 }}>12:34</span>
              </div>

              <div style={{ marginTop: 8, color: appearance.chat.messageColor, opacity: 0.95 }}>
                Exemple de message — “ça rend comment ?”
              </div>
            </div>
          </SectionCard>

          {/* ACTIONS */}
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
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
