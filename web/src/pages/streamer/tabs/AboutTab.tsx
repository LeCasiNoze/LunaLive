// web/src/pages/streamer/tabs/AboutTab.tsx
import * as React from "react";
import {
  getStreamerAbout,
  putStreamerAbout,
  uploadStreamerAboutImage,
  absFromApiMaybe,
  type AboutBlock,
} from "../../../lib/api_streamer_tabs";

function cleanUrl(u: string): string {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function emptyBlock(): AboutBlock {
  return { imageUrl: "", linkUrl: "", description: "" };
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice();
  const [it] = a.splice(from, 1);
  a.splice(to, 0, it);
  return a;
}

type ImgMeta = { w: number; h: number; kind: "banner" | "square" };

function detectKind(w: number, h: number): "banner" | "square" {
  if (!w || !h) return "square";
  return w / h >= 1.45 ? "banner" : "square";
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
  const [uploadingIndex, setUploadingIndex] = React.useState<number | null>(null);

  // key = imageUrl (absolute), meta = dims/kind
  const [metaMap, setMetaMap] = React.useState<Record<string, ImgMeta>>({});

  const dragIndexRef = React.useRef<number | null>(null);

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

  async function uploadImage(i: number, file: File) {
    if (!token) return setError("Connecte-toi pour upload une image.");
    setUploadingIndex(i);
    setError(null);
    try {
      const r = await uploadStreamerAboutImage(slug, token, file);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Upload error");
      updateBlock(i, { imageUrl: r.imageUrl });

      // on peut pré-remplir meta si le backend renvoie width/height
      if (r.width && r.height) {
        const abs = absFromApiMaybe(r.imageUrl);
        setMetaMap((p) => ({
          ...p,
          [abs]: { w: r.width!, h: r.height!, kind: detectKind(r.width!, r.height!) },
        }));
      }
    } catch (e: any) {
      setError(String(e?.message || "Erreur upload"));
    } finally {
      setUploadingIndex(null);
    }
  }

  function onImgLoad(absUrl: string, w: number, h: number) {
    if (!absUrl || !w || !h) return;
    setMetaMap((p) => {
      const cur = p[absUrl];
      if (cur && cur.w === w && cur.h === h) return p;
      return { ...p, [absUrl]: { w, h, kind: detectKind(w, h) } };
    });
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    setBlocks((prev) => moveItem(prev, from, to));
  }

  function renderTile(b: AboutBlock, i: number, mode: "view" | "edit") {
    const img = String(b.imageUrl || "").trim();
    const link = String(b.linkUrl || "").trim();
    const desc = String(b.description || "").trim();

    const imgSrc = img ? absFromApiMaybe(img) : "";
    const meta = imgSrc ? metaMap[imgSrc] : undefined;
    const kind: "banner" | "square" = meta?.kind ?? "square";

    const tileAspect = kind === "banner" ? "3 / 1" : "1 / 1";
    const tileSpan =
      kind === "banner"
        ? ({ gridColumnEnd: "span 2" } as const) // ✅ 2 colonnes
        : undefined;

    const ImgBox = (
      <div
        style={{
          width: "100%",
          aspectRatio: tileAspect as any,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onLoad={(e) => {
              const el = e.currentTarget;
              onImgLoad(imgSrc, el.naturalWidth || 0, el.naturalHeight || 0);
            }}
            onError={(e) => {
              (e.currentTarget as any).style.display = "none";
            }}
          />
        ) : (
          <div
            className="mutedSmall"
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.8,
              fontWeight: 800,
            }}
          >
            (pas d’image)
          </div>
        )}
      </div>
    );

    return (
      <div
        key={b.id ?? i}
        className="panel"
        style={{
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          ...tileSpan,
        }}
        draggable={mode === "edit"}
        onDragStart={() => {
          dragIndexRef.current = i;
        }}
        onDragOver={(e) => {
          if (mode !== "edit") return;
          e.preventDefault();
        }}
        onDrop={() => {
          if (mode !== "edit") return;
          const from = dragIndexRef.current;
          dragIndexRef.current = null;
          if (from == null) return;
          reorder(from, i);
        }}
      >
        {mode === "edit" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div className="mutedSmall" style={{ opacity: 0.85, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ cursor: "grab", userSelect: "none", fontWeight: 950 }}>⠿</span>
              <span>Bloc #{i + 1}</span>
              {imgSrc && meta ? (
                <span style={{ opacity: 0.85 }}>
                  • {meta.kind === "banner" ? "Bannière" : "Carré"} ({meta.w}×{meta.h})
                </span>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btnGhostSmall" disabled={i === 0} onClick={() => reorder(i, i - 1)}>
                ↑
              </button>
              <button type="button" className="btnGhostSmall" disabled={i === blocks.length - 1} onClick={() => reorder(i, i + 1)}>
                ↓
              </button>
              <button type="button" className="btnGhostSmall" onClick={() => removeBlock(i)}>
                Supprimer
              </button>
            </div>
          </div>
        ) : null}

        {/* Image cliquable si link */}
        {imgSrc && link ? (
          <a href={cleanUrl(link)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block" }}>
            {ImgBox}
          </a>
        ) : (
          ImgBox
        )}

        {/* Description */}
        {desc ? (
          <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{desc}</div>
        ) : null}

        {/* Lien affiché seulement si PAS d'image (sinon lien = clic image) */}
        {!imgSrc && link ? (
          <div style={{ marginTop: 10 }}>
            <a href={cleanUrl(link)} target="_blank" rel="noreferrer" style={{ fontWeight: 900, textDecoration: "none" }}>
              🔗 Ouvrir le lien
            </a>
            <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.85 }}>
              {cleanUrl(link)}
            </div>
          </div>
        ) : null}

        {/* EDIT FIELDS */}
        {mode === "edit" ? (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Reco tailles : Carré <b>800×800</b> / Bannière <b>1200×400</b> (important centré).
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label className="btnGhostSmall" style={{ cursor: token ? "pointer" : "not-allowed", opacity: token ? 1 : 0.6 }}>
                {uploadingIndex === i ? "Upload…" : imgSrc ? "Changer l’image" : "Uploader une image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!token || uploadingIndex === i}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (!f) return;
                    uploadImage(i, f);
                  }}
                />
              </label>

              {imgSrc ? (
                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => updateBlock(i, { imageUrl: "" })}
                  disabled={uploadingIndex === i}
                >
                  Retirer l’image
                </button>
              ) : null}
            </div>

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
          </div>
        ) : null}

        {!imgSrc && !desc && !link && mode === "view" ? (
          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
            (Bloc vide)
          </div>
        ) : null}
      </div>
    );
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

      {!loading && !blocks.length && !edit ? (
        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
          Aucune description pour le moment.
        </div>
      ) : null}

      {!loading ? (
        <div style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 220px))",
          justifyContent: "start",
          gap: 12,
          alignItems: "start",
          gridAutoFlow: "dense", // ✅ compacte autour des bannières
        }}>

          {blocks.map((b, i) => renderTile(b, i, edit ? "edit" : "view"))}
        </div>
      ) : null}

      {!loading && edit ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btnGhostSmall" onClick={() => setBlocks((p) => [...p, emptyBlock()])}>
            + Ajouter un bloc
          </button>

          <div className="mutedSmall" style={{ opacity: 0.85 }}>
            Astuce : drag & drop avec ⠿ (desktop), ou ↑ ↓.
          </div>

          {!token ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Connecte-toi pour uploader/enregistrer.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
