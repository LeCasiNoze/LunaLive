// web/src/pages/dashboard/sections/EmotesSection.tsx
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type Kind = "emoji" | "gif";

type EmoteItem = {
  id: number;
  kind: Kind;
  scope: "channel" | "native" | "global";
  streamer_id: number | null;
  name: string;
  label: string | null;
  url: string | null;
  mime: string | null;
  size_bytes: number | null;
  status: "active" | "disabled" | "banned" | "deleted";
  created_at?: string;
};

async function j<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && (data as any).ok === false)) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

function normName(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function bytesLabel(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} ko`;
  return `${(v / 1024 / 1024).toFixed(2)} mo`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("file_read_error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
}

// small helper for nicer UI errors
function friendlyErr(e: any): string {
  const m = String(e?.message || e || "Erreur");
  if (/file_too_large/i.test(m)) return "Fichier trop lourd.";
  if (/unsupported_mime/i.test(m)) return "Format non supporté (PNG/WebP pour emoji, GIF pour gif).";
  if (/gif_must_be_gif/i.test(m)) return "Un GIF doit être un vrai image/gif.";
  if (/emoji_cannot_be_gif/i.test(m)) return "Un emoji ne peut pas être un GIF (choisis PNG/WebP).";
  if (/bad_dataurl/i.test(m)) return "Fichier illisible (dataUrl invalide).";
  if (/no_streamer/i.test(m)) return "Aucune chaîne liée à ton compte.";
  if (/r2_public_base_missing/i.test(m)) return "R2 configuré mais URL publique manquante (R2_PUBLIC_BASE).";
  if (/HTTP\s+413/i.test(m)) return "Fichier trop lourd (limite serveur).";
  return m;
}

export function EmotesSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<EmoteItem[]>([]);

  const [kind, setKind] = React.useState<Kind>("emoji");
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const [uploading, setUploading] = React.useState(false);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await j<{ ok: true; items: EmoteItem[] }>("/me/streamer/emotes", token);
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // preview URL (ObjectURL)
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // if kind changes, clear incompatible file
  React.useEffect(() => {
    if (!file) return;
    if (kind === "gif" && file.type !== "image/gif") setFile(null);
    if (kind === "emoji" && file.type === "image/gif") setFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const emojis = items.filter((x) => x.kind === "emoji" && x.status !== "deleted");
  const gifs = items.filter((x) => x.kind === "gif" && x.status !== "deleted");

  const capEmoji = 40;
  const capGif = 20;

  const capReached = kind === "emoji" ? emojis.length >= capEmoji : gifs.length >= capGif;

  async function onUpload() {
    if (!token) return;
    setErr(null);

    const nm = normName(name);
    if (!nm) return setErr("Nom invalide (a-z 0-9 _)");

    if (!file) return setErr("Choisis un fichier.");

    // mime side checks (le backend re-check)
    if (kind === "gif" && file.type !== "image/gif") return setErr("Un GIF doit être un vrai image/gif.");
    if (kind === "emoji" && file.type === "image/gif") return setErr("Un emoji ne peut pas être un GIF (choisis PNG/WebP).");

    if (capReached) {
      return setErr(kind === "emoji" ? `Limite atteinte (${capEmoji} emojis).` : `Limite atteinte (${capGif} GIFs).`);
    }

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);

      await j<{ ok: true; item: EmoteItem }>("/me/streamer/emotes", token, {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: nm,
          label: label.trim() ? label.trim().slice(0, 64) : null,
          dataUrl,
        }),
      });

      // reset form
      setName("");
      setLabel("");
      setFile(null);

      // refresh list (simple et sûr)
      await refresh();
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: number) {
    if (!token) return;
    setErr(null);
    const ok = window.confirm("Supprimer cette emote ? (soft delete)");
    if (!ok) return;

    try {
      await j<{ ok: true }>(`/me/streamer/emotes/${id}`, token, { method: "DELETE" });
      await refresh();
    } catch (e: any) {
      setErr(friendlyErr(e));
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 1100, fontSize: 16 }}>😀 Emojis & GIFs</div>
          <div className="mutedSmall" style={{ marginTop: 4 }}>
            Ajoute des emotes utilisables sur ta chaîne <b>@{streamer.slug}</b>.
          </div>
        </div>

        <button className="btnSecondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* Upload card */}
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 1000 }}>Uploader une emote</div>
          <div className="mutedSmall" style={{ opacity: 0.85 }}>
            Limites: {capEmoji} emojis • {capGif} GIFs
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 10, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Type</label>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setErr(null);
              }}
            >
              <option value="emoji">Emoji (PNG/WebP)</option>
              <option value="gif">GIF (GIF)</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Nom (token)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: luna_love" />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              Utilisation chat : <b>{kind === "gif" ? ":g:" : ":e:"}{normName(name) || "name"}:</b>
            </div>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Label (optionnel)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Luna Love" />
          </div>

          <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
            <label>Fichier</label>
            <input
              type="file"
              accept={kind === "gif" ? "image/gif" : "image/png,image/webp"}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              {kind === "gif"
                ? "GIF: recommandé < 600KB."
                : "Emoji: PNG/WebP recommandé < 160KB."}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btnPrimary"
            type="button"
            onClick={onUpload}
            disabled={uploading || !file || !normName(name) || capReached}
            title={capReached ? "Limite atteinte" : "Uploader"}
          >
            {uploading ? "Upload…" : "Uploader"}
          </button>

          {capReached ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              ⚠️ Limite atteinte pour {kind === "emoji" ? "les emojis" : "les GIFs"}.
            </div>
          ) : null}

          {previewUrl ? (
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="mutedSmall" style={{ opacity: 0.8 }}>
                Preview
              </div>
              <img
                src={previewUrl}
                alt=""
                style={{
                  width: kind === "gif" ? 54 : 36,
                  height: kind === "gif" ? 54 : 36,
                  objectFit: "contain",
                  imageRendering: "auto",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  padding: 6,
                }}
              />
              {file ? (
                <div className="mutedSmall" style={{ opacity: 0.8, whiteSpace: "nowrap" }}>
                  {file.type} • {bytesLabel(file.size)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Lists */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Emojis */}
        <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 1000 }}>Emojis</div>
            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              {emojis.length}/{capEmoji}
            </div>
          </div>

          {emojis.length === 0 ? <div className="mutedSmall" style={{ marginTop: 10 }}>Aucun emoji.</div> : null}

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {emojis.map((e) => (
              <div
                key={e.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.16)",
                  padding: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  {e.url ? (
                    <img
                      src={e.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{
                        width: 36,
                        height: 36,
                        objectFit: "contain",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        padding: 6,
                      }}
                      onError={(ev) => {
                        // small fallback if url broken
                        (ev.currentTarget as any).style.opacity = "0.25";
                      }}
                    />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)" }} />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      :e:{e.name}:
                    </div>
                    <div className="mutedSmall" style={{ opacity: 0.8 }}>
                      {e.label ? e.label : "—"} • {bytesLabel(e.size_bytes)}
                    </div>
                  </div>
                </div>

                <button
                  className="btnGhostSmall"
                  type="button"
                  onClick={() => onDelete(e.id)}
                  style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.10)" }}
                >
                  🗑️ Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* GIFs */}
        <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 1000 }}>GIFs</div>
            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              {gifs.length}/{capGif}
            </div>
          </div>

          {gifs.length === 0 ? <div className="mutedSmall" style={{ marginTop: 10 }}>Aucun GIF.</div> : null}

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {gifs.map((e) => (
              <div
                key={e.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.16)",
                  padding: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  {e.url ? (
                    <img
                      src={e.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{
                        width: 54,
                        height: 54,
                        objectFit: "cover",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                      onError={(ev) => {
                        (ev.currentTarget as any).style.opacity = "0.25";
                      }}
                    />
                  ) : (
                    <div style={{ width: 54, height: 54, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }} />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      :g:{e.name}:
                    </div>
                    <div className="mutedSmall" style={{ opacity: 0.8 }}>
                      {e.label ? e.label : "—"} • {bytesLabel(e.size_bytes)}
                    </div>
                  </div>
                </div>

                <button
                  className="btnGhostSmall"
                  type="button"
                  onClick={() => onDelete(e.id)}
                  style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.10)" }}
                >
                  🗑️ Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
