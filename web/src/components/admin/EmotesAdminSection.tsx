// web/src/components/admin/EmotesAdminSection.tsx
import * as React from "react";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type Kind = "emoji" | "gif";
type Scope = "channel" | "native" | "global";
type Status = "active" | "disabled" | "banned" | "deleted";

export type AdminEmoteItem = {
  id: number;
  kind: Kind;
  scope: Scope;
  streamer_id: number | null;
  streamer_slug?: string | null; // optionnel si le backend le renvoie
  name: string;
  label: string | null;
  url: string | null;
  mime: string | null;
  size_bytes: number | null;
  status: Status;
  created_at?: string;

  // optionnels (utile debug)
  storage?: "r2" | "local" | "unknown";
  missing_file?: boolean; // si backend détecte 404 en storage
};

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function bytesLabel(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} ko`;
  return `${(v / 1024 / 1024).toFixed(2)} mo`;
}

function normName(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("file_read_error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
}

function friendlyErr(e: any): string {
  const m = String(e?.message || e || "Erreur");
  if (/file_too_large/i.test(m)) return "Fichier trop lourd.";
  if (/unsupported_mime/i.test(m)) return "Format non supporté (PNG/WebP pour emoji, GIF pour gif).";
  if (/gif_must_be_gif/i.test(m)) return "Un GIF doit être un vrai image/gif.";
  if (/emoji_cannot_be_gif/i.test(m)) return "Un emoji ne peut pas être un GIF (choisis PNG/WebP).";
  if (/bad_dataurl/i.test(m)) return "Fichier illisible (dataUrl invalide).";
  if (/HTTP\s+413/i.test(m)) return "Fichier trop lourd (limite serveur).";
  if (/unauthorized/i.test(m) || /HTTP\s+401/i.test(m)) return "Non autorisé (admin key).";
  return m;
}

async function jAdmin<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && (data as any).ok === false)) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

/**
 * 🔌 ENDPOINTS (à matcher côté API)
 *
 * GET    /admin/emotes?limit=200&q=&scope=&kind=&status=&streamer=
 *   => { ok:true, items: AdminEmoteItem[] }
 *
 * POST   /admin/emotes
 *   body: { scope:"native"|"global", kind:"emoji"|"gif", name, label?, dataUrl }
 *   => { ok:true, item: AdminEmoteItem }
 *
 * POST   /admin/emotes/:id/status
 *   body: { status:"active"|"disabled"|"banned"|"deleted" }
 *   => { ok:true }
 *
 * POST   /admin/emotes/:id/purge
 *   => { ok:true } // supprime le fichier du storage (R2/local) si possible
 *
 * (optionnel) POST /admin/emotes/:id/repair  => { ok:true } // si tu veux plus tard
 */

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info" | "brand";
}) {
  const bg =
    tone === "good"
      ? "rgba(34,197,94,0.14)"
      : tone === "warn"
      ? "rgba(245,158,11,0.14)"
      : tone === "bad"
      ? "rgba(239,68,68,0.14)"
      : tone === "info"
      ? "rgba(56,189,248,0.14)"
      : tone === "brand"
      ? "rgba(167,139,250,0.16)"
      : "rgba(255,255,255,0.08)";

  const border =
    tone === "good"
      ? "rgba(34,197,94,0.30)"
      : tone === "warn"
      ? "rgba(245,158,11,0.30)"
      : tone === "bad"
      ? "rgba(239,68,68,0.30)"
      : tone === "info"
      ? "rgba(56,189,248,0.30)"
      : tone === "brand"
      ? "rgba(167,139,250,0.32)"
      : "rgba(255,255,255,0.12)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function toneForStatus(s: Status): "good" | "warn" | "bad" | "neutral" {
  if (s === "active") return "good";
  if (s === "disabled") return "warn";
  if (s === "banned") return "bad";
  return "neutral";
}

function labelForScope(sc: Scope) {
  if (sc === "native") return "Natif (site)";
  if (sc === "global") return "Global";
  return "Chaîne";
}

export function EmotesAdminSection({ adminKey }: { adminKey: string }) {
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<AdminEmoteItem[]>([]);

  // filters
  const [q, setQ] = React.useState("");
  const [scope, setScope] = React.useState<"" | Scope>("");
  const [kind, setKind] = React.useState<"" | Kind>("");
  const [status, setStatus] = React.useState<"" | Status>("");
  const [streamer, setStreamer] = React.useState(""); // slug/id (selon backend)

  // upload (native/global)
  const [upScope, setUpScope] = React.useState<"native" | "global">("native");
  const [upKind, setUpKind] = React.useState<Kind>("emoji");
  const [upName, setUpName] = React.useState("");
  const [upLabel, setUpLabel] = React.useState("");
  const [upFile, setUpFile] = React.useState<File | null>(null);
  const [upPreview, setUpPreview] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // preview modal-ish
  const [peek, setPeek] = React.useState<AdminEmoteItem | null>(null);

  async function refresh() {
    if (!adminKey) return;
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "300");
      if (q.trim()) qs.set("q", q.trim());
      if (scope) qs.set("scope", scope);
      if (kind) qs.set("kind", kind);
      if (status) qs.set("status", status);
      if (streamer.trim()) qs.set("streamer", streamer.trim());

      const r = await jAdmin<{ ok: true; items: AdminEmoteItem[] }>(`/admin/emotes?${qs.toString()}`, adminKey);
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
  }, [adminKey]);

  // objectURL preview for upload file
  React.useEffect(() => {
    if (!upFile) {
      setUpPreview(null);
      return;
    }
    const url = URL.createObjectURL(upFile);
    setUpPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [upFile]);

  React.useEffect(() => {
    if (!upFile) return;
    if (upKind === "gif" && upFile.type !== "image/gif") setUpFile(null);
    if (upKind === "emoji" && upFile.type === "image/gif") setUpFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upKind]);

  const stats = React.useMemo(() => {
    const by = (pred: (x: AdminEmoteItem) => boolean) => items.filter(pred).length;
    return {
      total: items.length,
      active: by((x) => x.status === "active"),
      disabled: by((x) => x.status === "disabled"),
      banned: by((x) => x.status === "banned"),
      deleted: by((x) => x.status === "deleted"),
      native: by((x) => x.scope === "native"),
      global: by((x) => x.scope === "global"),
      channel: by((x) => x.scope === "channel"),
      emojis: by((x) => x.kind === "emoji"),
      gifs: by((x) => x.kind === "gif"),
    };
  }, [items]);

  async function setItemStatus(id: number, next: Status) {
    setErr(null);
    try {
      await jAdmin<{ ok: true }>(`/admin/emotes/${id}/status`, adminKey, {
        method: "POST",
        body: JSON.stringify({ status: next }),
      });
      await refresh();
    } catch (e: any) {
      setErr(friendlyErr(e));
    }
  }

  async function purgeItem(id: number) {
    setErr(null);
    const ok = window.confirm("Purger le fichier du storage ? (irréversible)");
    if (!ok) return;
    try {
      await jAdmin<{ ok: true }>(`/admin/emotes/${id}/purge`, adminKey, { method: "POST" });
      await refresh();
    } catch (e: any) {
      setErr(friendlyErr(e));
    }
  }

  async function onCreateNativeOrGlobal() {
    setErr(null);

    const nm = normName(upName);
    if (!nm) return setErr("Nom invalide (a-z 0-9 _).");
    if (!upFile) return setErr("Choisis un fichier.");

    if (upKind === "gif" && upFile.type !== "image/gif") return setErr("Un GIF doit être un vrai image/gif.");
    if (upKind === "emoji" && upFile.type === "image/gif") return setErr("Un emoji ne peut pas être un GIF (PNG/WebP).");

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(upFile);
      await jAdmin<{ ok: true; item: AdminEmoteItem }>(`/admin/emotes`, adminKey, {
        method: "POST",
        body: JSON.stringify({
          scope: upScope,
          kind: upKind,
          name: nm,
          label: upLabel.trim() ? upLabel.trim().slice(0, 64) : null,
          dataUrl,
        }),
      });

      setUpName("");
      setUpLabel("");
      setUpFile(null);
      await refresh();
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setUploading(false);
    }
  }

  const filteredHint = React.useMemo(() => {
    const parts: string[] = [];
    if (q.trim()) parts.push(`q="${q.trim()}"`);
    if (scope) parts.push(`scope=${scope}`);
    if (kind) parts.push(`kind=${kind}`);
    if (status) parts.push(`status=${status}`);
    if (streamer.trim()) parts.push(`streamer=${streamer.trim()}`);
    return parts.length ? parts.join(" • ") : "aucun filtre";
  }, [q, scope, kind, status, streamer]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* top bar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 950 }}>Catalogue emotes — natif / global / streamers</div>
          <div className="mutedSmall" style={{ opacity: 0.85, lineHeight: 1.35 }}>
            Objectif: publier/supprimer les emotes du site + modérer celles des streamers.
            <br />
            <span style={{ opacity: 0.9 }}>Filtres: {filteredHint}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Pill tone="info">Total: <b>{stats.total}</b></Pill>
          <Pill tone="good">Active: <b>{stats.active}</b></Pill>
          <Pill tone="warn">Disabled: <b>{stats.disabled}</b></Pill>
          <Pill tone="bad">Banned: <b>{stats.banned}</b></Pill>
          <button className="btnSecondary" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* filters card */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          padding: 12,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Recherche</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="nom / label / streamer..."
              />
              <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
                Ex: <b>love</b>, <b>native</b>, <b>wayzebi</b>
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
                <option value="">Tous</option>
                <option value="native">Natif</option>
                <option value="global">Global</option>
                <option value="channel">Chaîne</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
                <option value="">Tous</option>
                <option value="emoji">Emoji</option>
                <option value="gif">GIF</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="">Tous</option>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
                <option value="banned">banned</option>
                <option value="deleted">deleted</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Streamer (slug/id)</label>
              <input value={streamer} onChange={(e) => setStreamer(e.target.value)} placeholder="ex: lecasinoze" />
              <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
                Optionnel : filtre les emotes <b>scope=channel</b>
              </div>
            </div>

            <button
              className="btnPrimary"
              type="button"
              onClick={refresh}
              disabled={loading}
              style={{ height: 40 }}
            >
              Appliquer
            </button>

            <button
              className="btnSecondary"
              type="button"
              onClick={() => {
                setQ("");
                setScope("");
                setKind("");
                setStatus("");
                setStreamer("");
                setErr(null);
              }}
              style={{ height: 40 }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill tone="neutral">Native: <b>{stats.native}</b></Pill>
            <Pill tone="neutral">Global: <b>{stats.global}</b></Pill>
            <Pill tone="neutral">Chaîne: <b>{stats.channel}</b></Pill>
            <Pill tone="neutral">Emojis: <b>{stats.emojis}</b></Pill>
            <Pill tone="neutral">GIFs: <b>{stats.gifs}</b></Pill>
            <Pill tone="neutral">Deleted: <b>{stats.deleted}</b></Pill>
          </div>
        </div>
      </div>

      {/* create native/global */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.02)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950 }}>Publier une emote (natif/global)</div>
          <Pill tone="brand">Admin</Pill>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "160px 160px 1fr 1fr", gap: 10, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Scope</label>
            <select
              value={upScope}
              onChange={(e) => {
                setUpScope(e.target.value as any);
                setErr(null);
              }}
            >
              <option value="native">Natif (site)</option>
              <option value="global">Global</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Type</label>
            <select
              value={upKind}
              onChange={(e) => {
                setUpKind(e.target.value as any);
                setErr(null);
              }}
            >
              <option value="emoji">Emoji (PNG/WebP)</option>
              <option value="gif">GIF (GIF)</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Nom (token)</label>
            <input value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="ex: luna_love" />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              Token chat : <b>{upKind === "gif" ? ":g:" : ":e:"}{normName(upName) || "name"}:</b>
            </div>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Label (optionnel)</label>
            <input value={upLabel} onChange={(e) => setUpLabel(e.target.value)} placeholder="ex: Luna Love" />
          </div>

          <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
            <label>Fichier</label>
            <input
              type="file"
              accept={upKind === "gif" ? "image/gif" : "image/png,image/webp"}
              onChange={(e) => setUpFile(e.target.files?.[0] || null)}
            />
            <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>
              {upKind === "gif" ? "GIF: recommandé < 600KB." : "Emoji: PNG/WebP recommandé < 160KB."}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btnPrimary"
            type="button"
            onClick={onCreateNativeOrGlobal}
            disabled={uploading || !upFile || !normName(upName)}
          >
            {uploading ? "Publication…" : "Publier"}
          </button>

          <button
            className="btnSecondary"
            type="button"
            onClick={() => {
              setUpName("");
              setUpLabel("");
              setUpFile(null);
              setErr(null);
            }}
            disabled={uploading}
          >
            Reset
          </button>

          {upPreview ? (
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
              <div className="mutedSmall" style={{ opacity: 0.8 }}>Preview</div>
              <img
                src={upPreview}
                alt=""
                style={{
                  width: upKind === "gif" ? 54 : 36,
                  height: upKind === "gif" ? 54 : 36,
                  objectFit: "contain",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  padding: 6,
                }}
              />
              {upFile ? (
                <div className="mutedSmall" style={{ opacity: 0.8, whiteSpace: "nowrap" }}>
                  {upFile.type} • {bytesLabel(upFile.size)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* list */}
      <div style={{ display: "grid", gap: 10 }}>
        {items.length === 0 && !loading ? <div className="mutedSmall">Aucune emote.</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          {items.map((e) => {
            const created = e.created_at ? new Date(e.created_at).toLocaleString("fr-FR") : "";
            const statusTone = toneForStatus(e.status);

            const missingTone =
              e.missing_file ? "rgba(245,158,11,0.14)" : "transparent";
            const missingBorder =
              e.missing_file ? "rgba(245,158,11,0.30)" : "rgba(255,255,255,0.10)";

            return (
              <div
                key={e.id}
                style={{
                  borderRadius: 14,
                  border: `1px solid ${missingBorder}`,
                  background: e.missing_file ? missingTone : "rgba(255,255,255,0.02)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
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
                          width: e.kind === "gif" ? 54 : 40,
                          height: e.kind === "gif" ? 54 : 40,
                          objectFit: e.kind === "gif" ? "cover" : "contain",
                          borderRadius: 12,
                          background: "rgba(0,0,0,0.16)",
                          border: "1px solid rgba(255,255,255,0.10)",
                        }}
                        onError={(ev) => {
                          (ev.currentTarget as any).style.opacity = "0.25";
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: e.kind === "gif" ? 54 : 40,
                          height: e.kind === "gif" ? 54 : 40,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.10)",
                        }}
                      />
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.kind === "gif" ? `:g:${e.name}:` : `:e:${e.name}:`}
                        </div>
                        <Pill tone={statusTone}>{e.status}</Pill>
                        <Pill tone="neutral">{labelForScope(e.scope)}</Pill>
                        {e.scope === "channel" ? (
                          <Pill tone="info">
                            streamer: <b>{e.streamer_slug || String(e.streamer_id ?? "—")}</b>
                          </Pill>
                        ) : null}
                        {e.storage ? <Pill tone="neutral">storage: <b>{e.storage}</b></Pill> : null}
                        {e.missing_file ? <Pill tone="warn">⚠️ fichier manquant</Pill> : null}
                      </div>

                      <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
                        {e.label || "—"} • {bytesLabel(e.size_bytes)} • {e.mime || "—"}
                        {created ? ` • ${created}` : ""}
                        <span style={{ opacity: 0.75 }}> • id {e.id}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="btnSmall"
                      type="button"
                      onClick={() => setPeek(e)}
                      style={{
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      👁️ Preview
                    </button>

                    <button
                      className="btnGhostSmall"
                      type="button"
                      onClick={() => setItemStatus(e.id, "active")}
                      style={{ borderRadius: 12, border: "1px solid rgba(34,197,94,0.30)", background: "rgba(34,197,94,0.10)" }}
                      disabled={e.status === "active"}
                      title="Rendre actif"
                    >
                      ✅ Activer
                    </button>

                    <button
                      className="btnGhostSmall"
                      type="button"
                      onClick={() => setItemStatus(e.id, "disabled")}
                      style={{ borderRadius: 12, border: "1px solid rgba(245,158,11,0.30)", background: "rgba(245,158,11,0.10)" }}
                      disabled={e.status === "disabled"}
                      title="Désactiver (soft)"
                    >
                      ⏸️ Disable
                    </button>

                    <button
                      className="btnGhostSmall"
                      type="button"
                      onClick={() => setItemStatus(e.id, "banned")}
                      style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.10)" }}
                      disabled={e.status === "banned"}
                      title="Ban (modération)"
                    >
                      ⛔ Ban
                    </button>

                    <button
                      className="btnGhostSmall"
                      type="button"
                      onClick={() => {
                        const ok = window.confirm("Mettre en deleted ? (soft delete)");
                        if (!ok) return;
                        setItemStatus(e.id, "deleted");
                      }}
                      style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.08)" }}
                      disabled={e.status === "deleted"}
                      title="Soft delete"
                    >
                      🗑️ Delete
                    </button>

                    <button
                      className="btnGhostSmall"
                      type="button"
                      onClick={() => purgeItem(e.id)}
                      style={{ borderRadius: 12, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(148,163,184,0.10)" }}
                      title="Supprime le fichier du storage"
                    >
                      🧨 Purge
                    </button>
                  </div>
                </div>

                {e.url ? (
                  <div style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <a className="mutedSmall" style={{ opacity: 0.85 }} href={e.url} target="_blank" rel="noreferrer">
                      Ouvrir URL
                    </a>
                    {e.url.startsWith("/") ? (
                      <span className="mutedSmall" style={{ opacity: 0.65 }}>
                        (relative → risque “storage local”)
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mutedSmall" style={{ padding: 10, opacity: 0.8 }}>
                    Pas d’URL (storage manquant / emote cassée).
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* peek modal */}
      {peek ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPeek(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.60)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,15,20,0.96)",
              boxShadow: "0 30px 120px rgba(0,0,0,0.50)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontWeight: 950 }}>
                  {peek.kind === "gif" ? `:g:${peek.name}:` : `:e:${peek.name}:`}
                </b>
                <Pill tone={toneForStatus(peek.status)}>{peek.status}</Pill>
                <Pill tone="neutral">{labelForScope(peek.scope)}</Pill>
              </div>

              <button className="btnSecondary" type="button" onClick={() => setPeek(null)}>
                Fermer
              </button>
            </div>

            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", placeItems: "center", padding: 16 }}>
                {peek.url ? (
                  <img
                    src={peek.url}
                    alt=""
                    style={{
                      width: "min(420px, 100%)",
                      height: "auto",
                      maxHeight: "55vh",
                      objectFit: "contain",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.25)",
                      padding: 10,
                    }}
                    onError={(ev) => {
                      (ev.currentTarget as any).style.opacity = "0.25";
                    }}
                  />
                ) : (
                  <div className="mutedSmall">Pas d’URL.</div>
                )}
              </div>

              <div className="mutedSmall" style={{ opacity: 0.9, lineHeight: 1.5 }}>
                <div><b>Label</b> : {peek.label || "—"}</div>
                <div><b>MIME</b> : {peek.mime || "—"}</div>
                <div><b>Taille</b> : {bytesLabel(peek.size_bytes)}</div>
                <div><b>Scope</b> : {peek.scope}</div>
                <div><b>Streamer</b> : {peek.scope === "channel" ? (peek.streamer_slug || String(peek.streamer_id ?? "—")) : "—"}</div>
                <div><b>URL</b> : {peek.url || "—"}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
