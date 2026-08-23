// web/src/pages/streamer/tabs/AboutTab.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AboutTab
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Info,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
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
.about-root { color:#f4f0fc; font-family:'Manrope',sans-serif; }
.about-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
.about-heading { min-width:0; }
.about-kicker { display:flex; align-items:center; gap:7px; color:#9388ab; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.about-title { display:block; margin-top:5px; color:#f5f2ff; font-size:20px; font-weight:800; letter-spacing:-.045em; }
.about-subtitle { margin-top:5px; color:#847b96; font-size:10px; font-weight:600; }
.about-actions,.about-tile-actions,.about-input-group,.about-footer { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.about-action { min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:8px 12px; border:1px solid rgba(167,139,250,.16); border-radius:11px; background:rgba(255,255,255,.035); color:#c9c1d7; font:750 10px 'Manrope',sans-serif; cursor:pointer; }
.about-action:hover { border-color:rgba(167,139,250,.32); background:rgba(139,92,246,.1); color:#f4efff; }
.about-action.primary { border-color:rgba(139,92,246,.38); background:#7c3aed; color:white; }
.about-action.danger { color:#f7a7b2; }
.about-action.icon { width:32px; min-height:32px; padding:0; }
.about-action:disabled { opacity:.45; cursor:not-allowed; }
.about-state { min-height:150px; display:grid; place-items:center; gap:10px; padding:28px; border:1px dashed rgba(167,139,250,.14); border-radius:17px; color:#81788f; font-size:11px; font-weight:650; text-align:center; }
.about-state.error { min-height:0; margin-bottom:14px; border-style:solid; border-color:rgba(248,113,113,.24); background:rgba(248,113,113,.06); color:#f4a4ad; }
.about-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; align-items:start; }
.about-tile { position:relative; overflow:hidden; border:1px solid rgba(167,139,250,.12); border-radius:17px; background:rgba(255,255,255,.024); }
.about-tile.edit-mode { padding:12px; overflow:visible; border-color:rgba(167,139,250,.22); background:rgba(139,92,246,.05); }
.about-tile-header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:11px; }
.about-tile-badge { display:flex; align-items:center; gap:7px; color:#9389a5; font-size:9px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.drag-handle { display:grid; place-items:center; color:#786d8d; cursor:grab; }
.about-img-box { position:relative; width:100%; overflow:hidden; aspect-ratio:1/1; border-radius:14px; background:linear-gradient(145deg,#181126,#08060f); }
.about-tile:not(.edit-mode) .about-img-box { border-radius:0; }
.about-img { width:100%; height:100%; display:block; object-fit:contain; }
.about-img-placeholder { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#746b82; font-size:10px; font-weight:700; }
.about-content { padding:13px 14px 14px; }
.about-edit-section + .about-content { padding-inline:0; }
.about-description { color:#d7d1e1; font-size:11px; font-weight:600; line-height:1.6; white-space:pre-wrap; }
.about-link { display:inline-flex; align-items:center; gap:6px; color:#b9a8f7; font-size:10px; font-weight:800; text-decoration:none; }
.about-link:hover { color:#e3dbff; }
.about-link-url { margin-top:5px; overflow:hidden; color:#71687e; font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
.about-edit-section { display:flex; flex-direction:column; gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid rgba(167,139,250,.11); }
.about-edit-hint { display:flex; align-items:center; gap:6px; color:#7e748d; font-size:9px; font-weight:650; }
.about-input,.about-textarea { width:100%; padding:10px 11px; border:1px solid rgba(167,139,250,.16); border-radius:10px; outline:none; background:rgba(5,3,11,.42); color:#eee9f6; font:600 10px/1.45 'Manrope',sans-serif; }
.about-input:focus,.about-textarea:focus { border-color:rgba(167,139,250,.42); box-shadow:0 0 0 3px rgba(124,58,237,.1); }
.about-input::placeholder,.about-textarea::placeholder { color:#625a6f; }
.about-textarea { min-height:84px; resize:vertical; }
.about-empty { padding:20px; color:#766d83; font-size:10px; text-align:center; }
.about-footer { margin-top:16px; }
.about-footer-hint { display:flex; align-items:center; gap:6px; color:#746b82; font-size:9px; font-weight:650; }
@media(max-width:620px){
  .about-header { align-items:flex-start; }
  .about-grid { grid-template-columns:1fr; }
  .about-actions { justify-content:flex-end; }
  .about-action .about-action-label { display:none; }
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
          <div className="about-img-placeholder"><ImagePlus size={20} /> Aucune image</div>
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
              <span className="drag-handle"><GripVertical size={15} /></span>
              <span>Bloc #{i + 1}</span>
            </div>
            <div className="about-tile-actions">
              <button type="button" className="about-action icon" disabled={i === 0} onClick={() => reorder(i, i - 1)} title="Monter"><ArrowUp size={13} /></button>
              <button type="button" className="about-action icon" disabled={i === blocks.length - 1} onClick={() => reorder(i, i + 1)} title="Descendre"><ArrowDown size={13} /></button>
              <button type="button" className="about-action icon danger" onClick={() => removeBlock(i)} title="Supprimer"><Trash2 size={13} /></button>
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
                  <ExternalLink size={12} /> <span>Ouvrir le lien</span>
                </a>
                <div className="about-link-url">{cleanUrl(link)}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "edit" ? (
          <div className="about-edit-section">
            <div className="about-edit-hint">
              <Info size={12} /> Image optimisée en carré 800 x 800, recadrage centré automatique.
            </div>
            
            <div className="about-input-group">
              <label className="about-action"
                style={{ cursor: token ? "pointer" : "not-allowed", opacity: token ? 1 : 0.6 }}>
                <ImagePlus size={13} /> {uploadingIndex === i ? "Envoi…" : imgSrc ? "Changer" : "Importer"}
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
                <button type="button" className="about-action danger"
                  onClick={() => updateBlock(i, { imageUrl: "" })} disabled={uploadingIndex === i}>
                  <Trash2 size={13} /> Retirer
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
        <div className="about-heading">
          <div className="about-kicker"><Info size={13} /> Présentation</div>
          <span className="about-title">À propos de la chaîne</span>
          <div className="about-subtitle">Liens, partenaires et informations utiles réunis au même endroit.</div>
        </div>
        {canEdit ? (
          <div className="about-actions">
            {!edit ? (
              <button type="button" className="about-action" onClick={() => setEdit(true)}><Pencil size={13} /><span className="about-action-label">Modifier</span></button>
            ) : (
              <>
                <button type="button" className="about-action" disabled={saving}
                  onClick={() => { setEdit(false); load(); }}><X size={13} /><span className="about-action-label">Annuler</span></button>
                <button type="button" className="about-action primary" disabled={saving || !token} onClick={save}>
                  <Save size={13} /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="about-state error" role="alert">{error}</div>
      ) : null}

      {loading ? (
        <div className="about-state">Chargement de la présentation…</div>
      ) : null}

      {!loading && !blocks.length && !edit ? (
        <div className="about-empty">
          Cette chaîne n'a pas encore ajouté de présentation.
        </div>
      ) : null}

      {!loading ? <div className="about-grid" style={{ marginTop:12 }}>{blocks.map((b, i) => renderTile(b, i, edit ? "edit" : "view"))}</div> : null}

      {!loading && edit ? (
        <div className="about-footer">
          <button type="button" className="about-action" onClick={() => setBlocks(p => [...p, emptyBlock()])}>
            <Plus size={13} /> Ajouter un bloc
          </button>
          <div className="about-footer-hint">
            <GripVertical size={12} /> Déplace les blocs à la souris ou avec les flèches.
          </div>
          {!token ? (
            <div className="about-footer-hint" style={{ color:"#f4a4ad" }}>
              Connecte-toi pour importer et enregistrer.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
