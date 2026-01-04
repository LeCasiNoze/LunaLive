// web/src/pages/streamer/tabs/AboutTab.tsx
import * as React from "react";
import { getStreamerAbout, putStreamerAbout, type AboutBlock } from "../../../lib/api_streamer_tabs";

function cleanUrl(u: string): string {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function emptyBlock(): AboutBlock {
  return { imageUrl: "", linkUrl: "", description: "" };
}

export function AboutTab({
  slug,
  token,
  canEdit,
}: {
  slug: string;
  token: string | null;
  canEdit: boolean;
}) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [edit, setEdit] = React.useState(false);
  const [blocks, setBlocks] = React.useState<AboutBlock[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await getStreamerAbout(slug);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setBlocks(Array.isArray(r.blocks) ? r.blocks : []);
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setEdit(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function updateBlock(i: number, patch: Partial<AboutBlock>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const payload = blocks.map((b) => ({
        imageUrl: String(b.imageUrl || "").trim() || null,
        linkUrl: String(b.linkUrl || "").trim() || null,
        description: String(b.description || "").trim() || null,
      }));

      const r = await putStreamerAbout(slug, token, payload);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setEdit(false);
      await load();
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="panelTitle">À propos</div>
        {canEdit ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!edit ? (
              <button type="button" className="btnGhostSmall" onClick={() => setEdit(true)}>
                Modifier
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={saving}
                  onClick={() => {
                    setEdit(false);
                    load();
                  }}
                >
                  Annuler
                </button>
                <button type="button" className="btnPrimarySmall" disabled={saving || !token} onClick={save}>
                  {saving ? "…" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mutedSmall" style={{ marginTop: 8, color: "rgba(255,90,90,0.95)" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mutedSmall" style={{ marginTop: 10 }}>
          Chargement…
        </div>
      ) : null}

      {!loading && !edit ? (
        blocks.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {blocks.map((b, i) => {
              const img = String(b.imageUrl || "").trim();
              const link = String(b.linkUrl || "").trim();
              const desc = String(b.description || "").trim();

              return (
                <div
                  key={b.id ?? i}
                  className="panel"
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "100%",
                        maxHeight: 240,
                        objectFit: "cover",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                      onError={(e) => {
                        (e.currentTarget as any).style.display = "none";
                      }}
                    />
                  ) : null}

                  {desc ? (
                    <div style={{ marginTop: img ? 10 : 0, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                      {desc}
                    </div>
                  ) : null}

                  {link ? (
                    <div style={{ marginTop: 10 }}>
                      <a
                        href={cleanUrl(link)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 900, textDecoration: "none" }}
                      >
                        🔗 Ouvrir le lien
                      </a>
                      <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.85 }}>
                        {cleanUrl(link)}
                      </div>
                    </div>
                  ) : null}

                  {!img && !desc && !link ? (
                    <div className="mutedSmall" style={{ opacity: 0.85 }}>
                      (Bloc vide)
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
            Aucune description pour le moment.
          </div>
        )
      ) : null}

      {!loading && edit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {blocks.map((b, i) => (
            <div key={b.id ?? i} className="panel" style={{ padding: 14, borderRadius: 16 }}>
              <div className="mutedSmall" style={{ marginBottom: 8, opacity: 0.85 }}>
                Bloc #{i + 1}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  value={String(b.imageUrl ?? "")}
                  onChange={(e) => updateBlock(i, { imageUrl: e.target.value })}
                  placeholder="Image (URL) — optionnel"
                  style={{
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    fontWeight: 800,
                  }}
                />

                <input
                  value={String(b.linkUrl ?? "")}
                  onChange={(e) => updateBlock(i, { linkUrl: e.target.value })}
                  placeholder="Lien (URL) — optionnel"
                  style={{
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    fontWeight: 800,
                  }}
                />

                <textarea
                  value={String(b.description ?? "")}
                  onChange={(e) => updateBlock(i, { description: e.target.value })}
                  placeholder="Description — optionnel"
                  rows={4}
                  style={{
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    fontWeight: 700,
                    resize: "vertical",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btnGhostSmall" onClick={() => removeBlock(i)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btnGhostSmall" onClick={() => setBlocks((p) => [...p, emptyBlock()])}>
              + Ajouter un bloc
            </button>
          </div>

          {!token ? (
            <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.85 }}>
              Connecte-toi pour enregistrer.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
