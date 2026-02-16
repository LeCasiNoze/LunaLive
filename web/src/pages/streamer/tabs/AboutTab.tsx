// web/src/pages/streamer/tabs/AboutTab.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AboutTab
// ══════════════════════════════════════════════════════════════
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

const ABOUT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes about-fade-in {
  from { opacity:0; transform:translateY(8px); }
  to { opacity:1; transform:translateY(0); }
}

.about-root {
  font-family:'Syne',system-ui,sans-serif;
  animation:about-fade-in 280ms ease both;
}

.about-header {
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  margin-bottom:16px;
  padding-bottom:12px;
  border-bottom:1px solid rgba(124,92,252,.10);
}

.about-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:18px; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd 0%,#a78bfa 50%,#5b8ef8 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.about-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:14px;
  align-items:start;
}

.about-tile {
  position:relative;
  padding:14px;
  border-radius:16px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
  transition:all 180ms ease;
}

.about-tile:hover {
  border-color:rgba(124,92,252,.30);
  background:rgba(124,92,252,.11);
  transform:translateY(-2px);
  box-shadow:0 8px 24px rgba(124,92,252,.18);
}

.about-tile.edit-mode {
  border-color:rgba(124,92,252,.24);
  background:rgba(124,92,252,.08);
}

.about-tile.edit-mode:hover {
  border-color:rgba(124,92,252,.36);
  background:rgba(124,92,252,.13);
}

.about-tile-header {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-bottom:12px;
  padding-bottom:10px;
  border-bottom:1px solid rgba(124,92,252,.10);
}

.about-tile-badge {
  display:flex; align-items:center; gap:8px;
  font-size:11px; color:rgba(167,139,250,.65);
  font-weight:700;
}

.about-tile-badge .drag-handle {
  cursor:grab; user-select:none; font-size:16px;
  color:rgba(167,139,250,.50);
  transition:color 120ms;
}

.about-tile-badge .drag-handle:hover {
  color:rgba(167,139,250,.85);
}

.about-tile-actions {
  display:flex; gap:6px; flex-wrap:wrap;
}

.about-img-box {
  width:100%; aspect-ratio:1/1;
  border-radius:14px; overflow:hidden;
  border:1px solid rgba(124,92,252,.18);
  background:linear-gradient(135deg,rgba(124,92,252,.08),rgba(59,77,200,.06));
  position:relative;
}

.about-img-box::after {
  content:"";
  position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(circle at 30% 30%,rgba(167,139,250,.08),transparent 60%);
}

.about-img {
  width:100%; height:100%; object-fit:contain;
  display:block; position:relative; z-index:1;
}

.about-img-placeholder {
  height:100%; display:flex; align-items:center; justify-content:center;
  font-size:12px; color:rgba(167,139,250,.45); font-weight:700;
}

.about-content {
  margin-top:12px;
}

.about-description {
  white-space:pre-wrap; line-height:1.4; font-size:13px;
  color:rgba(235,232,255,.88);
  font-weight:600;
}

.about-link {
  font-weight:800; text-decoration:none;
  font-size:13px; color:rgba(167,139,250,.85);
  display:inline-flex; align-items:center; gap:6px;
  transition:color 120ms;
}

.about-link:hover {
  color:rgba(196,181,253,.95);
}

.about-link-url {
  margin-top:5px; font-size:10px;
  color:rgba(167,139,250,.45);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

.about-edit-section {
  margin-top:14px;
  padding:12px;
  border-radius:12px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.04);
  display:flex; flex-direction:column; gap:10px;
}

.about-edit-hint {
  font-size:11px; color:rgba(167,139,250,.55);
  font-weight:600;
}

.about-input-group {
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
}

.about-input {
  flex:1; min-width:200px;
  padding:11px 14px; border-radius:12px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:14px;
  outline:none;
  transition:all 150ms ease;
}

.about-input:focus {
  border-color:rgba(124,92,252,.42);
  background:rgba(124,92,252,.12);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.about-input::placeholder { color:rgba(167,139,250,.40); }

.about-textarea {
  width:100%;
  padding:11px 14px; border-radius:12px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:14px;
  outline:none; resize:vertical;
  min-height:90px;
  transition:all 150ms ease;
}

.about-textarea:focus {
  border-color:rgba(124,92,252,.42);
  background:rgba(124,92,252,.12);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.about-textarea::placeholder { color:rgba(167,139,250,.40); }

.about-empty {
  padding:24px;
  text-align:center;
  font-size:13px; color:rgba(167,139,250,.55);
  font-weight:600;
}

.about-footer {
  margin-top:16px;
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
}

.about-footer-hint {
  font-size:11px; color:rgba(167,139,250,.50);
  font-weight:600;
}
`;

export function AboutTab({ slug, token, canEdit }: { slug: string; token: string | null; canEdit: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState(false);
  const [blocks, setBlocks] = React.useState<AboutBlock[]>([]);
  const [uploadingIndex, setUploadingIndex] = React.useState<number | null>(null);
  const dragIndexRef = React.useRef<number | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await getStreamerAbout(slug);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setBlocks(Array.isArray(r.blocks) ? r.blocks : []);
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { setEdit(false); load(); /* eslint-disable-next-line */ }, [slug]);

  function updateBlock(i: number, patch: Partial<AboutBlock>) {
    setBlocks(prev => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeBlock(i: number) { setBlocks(prev => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const payload = blocks.map(b => ({
        imageUrl: String(b.imageUrl || "").trim() || null,
        linkUrl: String(b.linkUrl || "").trim() || null,
        description: String(b.description || "").trim() || null,
      }));
      const r = await putStreamerAbout(slug, token, payload);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setEdit(false); await load();
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setSaving(false); }
  }

  async function uploadImage(i: number, file: File) {
    if (!token) return setError("Connecte-toi pour upload une image.");
    setUploadingIndex(i); setError(null);
    try {
      const r = await uploadStreamerAboutImage(slug, token, file);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Upload error");
      updateBlock(i, { imageUrl: r.imageUrl });
    } catch (e: any) { setError(String(e?.message || "Erreur upload")); }
    finally { setUploadingIndex(null); }
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    setBlocks(prev => moveItem(prev, from, to));
  }

  function renderTile(b: AboutBlock, i: number, mode: "view" | "edit") {
    const img = String(b.imageUrl || "").trim();
    const link = String(b.linkUrl || "").trim();
    const desc = String(b.description || "").trim();
    const imgSrc = img ? absFromApiMaybe(img) : "";

    const ImgBox = (
      <div className="about-img-box">
        {imgSrc ? (
          <img src={imgSrc} alt="" loading="lazy" className="about-img"
            onError={e => { (e.currentTarget as any).style.display = "none"; }} />
        ) : (
          <div className="about-img-placeholder">(pas d'image)</div>
        )}
      </div>
    );

    return (
      <div key={b.id ?? i} className={`about-tile${mode === "edit" ? " edit-mode" : ""}`}
        draggable={mode === "edit"}
        onDragStart={() => { dragIndexRef.current = i; }}
        onDragOver={e => { if (mode !== "edit") return; e.preventDefault(); }}
        onDrop={() => {
          if (mode !== "edit") return;
          const from = dragIndexRef.current;
          dragIndexRef.current = null;
          if (from == null) return;
          reorder(from, i);
        }}>

        {mode === "edit" ? (
          <div className="about-tile-header">
            <div className="about-tile-badge">
              <span className="drag-handle">⠿</span>
              <span>Bloc #{i + 1}</span>
            </div>
            <div className="about-tile-actions">
              <button type="button" className="btnGhostSmall" disabled={i === 0} onClick={() => reorder(i, i - 1)}
                title="Monter">↑</button>
              <button type="button" className="btnGhostSmall" disabled={i === blocks.length - 1} onClick={() => reorder(i, i + 1)}
                title="Descendre">↓</button>
              <button type="button" className="btnGhostSmall" onClick={() => removeBlock(i)}
                style={{ color:"rgba(252,165,165,.90)" }}>✕</button>
            </div>
          </div>
        ) : null}

        {imgSrc && link ? (
          <a href={cleanUrl(link)} target="_blank" rel="noreferrer" style={{ textDecoration:"none", display:"block" }}>
            {ImgBox}
          </a>
        ) : ImgBox}

        {(desc || link) ? (
          <div className="about-content">
            {desc ? <div className="about-description">{desc}</div> : null}
            {!imgSrc && link ? (
              <div style={{ marginTop: desc ? 10 : 0 }}>
                <a href={cleanUrl(link)} target="_blank" rel="noreferrer" className="about-link">
                  🔗 <span>Ouvrir le lien</span>
                </a>
                <div className="about-link-url">{cleanUrl(link)}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "edit" ? (
          <div className="about-edit-section">
            <div className="about-edit-hint">
              Taille finale : Carré <strong>800×800</strong> (crop centré auto)
            </div>
            
            <div className="about-input-group">
              <label className="btnGhostSmall"
                style={{ cursor: token ? "pointer" : "not-allowed", opacity: token ? 1 : 0.6 }}>
                {uploadingIndex === i ? "⏳ Upload…" : imgSrc ? "📷 Changer" : "📷 Uploader"}
                <input type="file" accept="image/png,image/jpeg,image/webp"
                  disabled={!token || uploadingIndex === i} style={{ display:"none" }}
                  onChange={e => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (!f) return;
                    uploadImage(i, f);
                  }} />
              </label>
              {imgSrc ? (
                <button type="button" className="btnGhostSmall"
                  onClick={() => updateBlock(i, { imageUrl: "" })} disabled={uploadingIndex === i}>
                  Retirer
                </button>
              ) : null}
            </div>

            <input className="about-input" value={String(b.linkUrl ?? "")}
              onChange={e => updateBlock(i, { linkUrl: e.target.value })}
              placeholder="URL du lien (optionnel)" />

            <textarea className="about-textarea" value={String(b.description ?? "")}
              onChange={e => updateBlock(i, { description: e.target.value })}
              placeholder="Description (optionnel)" />
          </div>
        ) : null}

        {!imgSrc && !desc && !link && mode === "view" ? (
          <div className="about-empty">Bloc vide</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="about-root">
      <style>{ABOUT_STYLES}</style>

      <div className="about-header">
        <span className="about-title">À propos</span>
        {canEdit ? (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {!edit ? (
              <button type="button" className="btnGhostSmall" onClick={() => setEdit(true)}>✏️ Modifier</button>
            ) : (
              <>
                <button type="button" className="btnGhostSmall" disabled={saving}
                  onClick={() => { setEdit(false); load(); }}>Annuler</button>
                <button type="button" className="btnPrimarySmall" disabled={saving || !token} onClick={save}>
                  {saving ? "⏳ Enregistrement…" : "✓ Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginTop:8, padding:"12px 14px", borderRadius:12,
          border:"1px solid rgba(239,68,68,.28)", background:"rgba(239,68,68,.08)",
          fontSize:12, color:"rgba(252,165,165,.92)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:600 }}>
          ⚠️ {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ marginTop:10, fontSize:13, color:"rgba(196,181,253,.65)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:600 }}>
          ⏳ Chargement…
        </div>
      ) : null}

      {!loading && !blocks.length && !edit ? (
        <div className="about-empty">
          Aucune description pour le moment.
        </div>
      ) : null}

      {!loading ? <div className="about-grid" style={{ marginTop:12 }}>{blocks.map((b, i) => renderTile(b, i, edit ? "edit" : "view"))}</div> : null}

      {!loading && edit ? (
        <div className="about-footer">
          <button type="button" className="btnGhostSmall" onClick={() => setBlocks(p => [...p, emptyBlock()])}>
            + Ajouter un bloc
          </button>
          <div className="about-footer-hint">
            💡 Drag & drop avec ⠿ (desktop), ou utilise ↑ ↓
          </div>
          {!token ? (
            <div className="about-footer-hint" style={{ color:"rgba(252,165,165,.70)" }}>
              ⚠️ Connecte-toi pour uploader/enregistrer
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}