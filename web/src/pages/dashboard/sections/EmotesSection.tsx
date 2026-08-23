// web/src/pages/dashboard/sections/EmotesSection.tsx
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type Kind = "emoji" | "gif";
const SOURCE_MAX_BYTES = 8 * 1024 * 1024;

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
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  const data: unknown = await res.json().catch(() => ({}));
  const envelope = data && typeof data === "object" ? data as { ok?: boolean; error?: string } : {};
  if (!res.ok || envelope.ok === false) throw new Error(envelope.error || `HTTP ${res.status}`);
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

// small helper for nicer UI errors
function friendlyErr(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error || "Erreur");
  if (/source_file_too_large/i.test(m)) return "Le fichier source depasse 8 Mo.";
  if (/file_too_large_after_optimization/i.test(m)) return "Le fichier reste trop lourd apres optimisation. Essaie une animation plus courte.";
  if (/unsupported_mime/i.test(m)) return "Format non supporte (PNG, JPG, WebP ou GIF).";
  if (/gif_must_be_gif/i.test(m)) return "Un GIF doit être un vrai image/gif.";
  if (/emoji_cannot_be_gif/i.test(m)) return "Un emoji ne peut pas être un GIF (choisis PNG/WebP).";
  if (/bad_dataurl/i.test(m)) return "Fichier illisible (dataUrl invalide).";
  if (/bad_file_signature/i.test(m)) return "Le contenu du fichier ne correspond pas a son format.";
  if (/limit_reached/i.test(m)) return "Limite de medias atteinte pour ce type.";
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

  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = React.useState<string | null>(null);

  const [uploading, setUploading] = React.useState(false);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await j<{ ok: true; items: EmoteItem[] }>("/me/streamer/emotes", token);
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch (e: unknown) {
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

  const emojis = items.filter((x) => x.kind === "emoji" && x.status !== "deleted");
  const gifs = items.filter((x) => x.kind === "gif" && x.status !== "deleted");

  const capEmoji = 40;
  const capGif = 20;

  const kind: Kind = file?.type === "image/gif" || /\.gif$/i.test(file?.name || "") ? "gif" : "emoji";
  const replacing = items.some((item) => item.kind === kind && item.name === normName(name));
  const capReached = !replacing && (kind === "emoji" ? emojis.length >= capEmoji : gifs.length >= capGif);

  async function onUpload() {
    if (!token) return;
    setErr(null);

    const nm = normName(name);
    if (!nm) return setErr("Nom invalide (a-z 0-9 _)");

    if (!file) return setErr("Choisis un fichier.");
    if (file.size > SOURCE_MAX_BYTES) return setErr("Le fichier source depasse 8 Mo.");

    const allowedMime = ["image/gif", "image/png", "image/jpeg", "image/webp"];
    const allowedExtension = /\.(gif|png|jpe?g|webp)$/i.test(file.name);
    if ((file.type && !allowedMime.includes(file.type)) || (!file.type && !allowedExtension)) {
      return setErr("Format non supporte (PNG, JPG, WebP ou GIF).");
    }

    if (capReached) {
      return setErr(kind === "emoji" ? `Limite atteinte (${capEmoji} emojis).` : `Limite atteinte (${capGif} GIFs).`);
    }

    setUploading(true);
    setUploadInfo(null);
    try {
      const form = new FormData();
      form.set("name", nm);
      form.set("file", file);
      const result = await j<{
        ok: true;
        item: EmoteItem;
        optimization?: { originalBytes: number; outputBytes: number; savedBytes: number };
      }>("/me/streamer/emotes/upload", token, {
        method: "POST",
        body: form,
      });

      if (result.optimization) {
        setUploadInfo(`Fichier optimise : ${bytesLabel(result.optimization.originalBytes)} → ${bytesLabel(result.optimization.outputBytes)}.`);
      }

      // reset form
      setName("");
      setFile(null);

      // refresh list (simple et sûr)
      await refresh();
    } catch (e: unknown) {
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
    } catch (e: unknown) {
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
          <div style={{ fontWeight: 1000 }}>Importer un emoji ou un GIF</div>
          <div className="mutedSmall" style={{ opacity: 0.85 }}>
            {capEmoji} emojis • {capGif} GIFs
          </div>
        </div>

        <div className="emote-upload-grid">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="channel-emote-name">Nom</label>
            <input id="channel-emote-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: luna_love" />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              Utilisation chat : <b>{kind === "gif" ? ":g:" : ":e:"}{normName(name) || "name"}:</b>
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Fichier</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              Source : 8 Mo max. Sortie optimisee : emoji 160 ko max, animation 600 ko max.
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
            {uploading ? "Optimisation…" : "Optimiser et importer"}
          </button>

          {capReached ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              ⚠️ Limite atteinte pour {kind === "emoji" ? "les emojis" : "les GIFs"}.
            </div>
          ) : null}

          {uploadInfo ? (
            <div className="mutedSmall" style={{ color: "#62e6c5" }}>{uploadInfo}</div>
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
      <div className="emote-library-grid">
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
                        ev.currentTarget.style.opacity = "0.25";
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
                        ev.currentTarget.style.opacity = "0.25";
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
