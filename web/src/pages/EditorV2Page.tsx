// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — éditeur de landing pages from-scratch
//
// Route: /editorFSNV2
// Architecture totalement isolée du V1 (/editorFSN). Aucun risque de
// croisement avec les pages V1 déjà publiées.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  type V2Page,
  type V2Block,
  type V2BlockType,
  type V2ZoneKey,
  type V2Model,
  type V2TextBlock,
  type V2ImageBlock,
  type V2ButtonBlock,
  type V2ContainerBlock,
  type V2SpacerBlock,
  type V2DividerBlock,
  V2_ZONE_LABELS,
  v2ZonesForModel,
  newV2Page,
  newBlockOfType,
  buildV2DefaultSlug,
  extractAffiCode,
} from "../lib/editor_v2_types";
import { RenderV2Page } from "../lib/editor_v2_render";

// ─── FSB access guard (mêmes IDs que V1) ─────────────────────────────────────
const FSB_ALLOWED_IDS = new Set([4, 15, 71]);

// ─── Theme tokens ────────────────────────────────────────────────────────────
const T = {
  bg:        "#0a0a14",
  bgPanel:   "#10101e",
  bgInput:   "#0d0d1a",
  border:    "#2a2a4a",
  borderHi:  "#3d3d6a",
  text:      "#e8e8ff",
  textMute:  "#888",
  primary:   "#6366f1",
  primaryHi: "#818cf8",
  gold:      "#FFD700",
  danger:    "#ef4444",
};

// ─── Block icons ─────────────────────────────────────────────────────────────
const BLOCK_ICONS: Record<V2BlockType, string> = {
  text:      "📝",
  image:     "🖼️",
  button:    "🔘",
  container: "📦",
  spacer:    "↕️",
  divider:   "➖",
};

const BLOCK_LABELS: Record<V2BlockType, string> = {
  text:      "Texte",
  image:     "Image",
  button:    "Bouton",
  container: "Container",
  spacer:    "Espacement",
  divider:   "Séparateur",
};

// ─── Block traversal helpers (immutable) ─────────────────────────────────────
type BlockPath = { zone: V2ZoneKey; indices: number[] };

function getBlockAt(page: V2Page, path: BlockPath): V2Block | null {
  let cur: V2Block | undefined = page.zones[path.zone]?.[path.indices[0]];
  for (let i = 1; i < path.indices.length; i++) {
    if (!cur || cur.type !== "container") return null;
    cur = cur.children[path.indices[i]];
  }
  return cur || null;
}

function updateBlockAt(page: V2Page, path: BlockPath, mutator: (b: V2Block) => V2Block): V2Page {
  const next: V2Page = JSON.parse(JSON.stringify(page));
  const arr = next.zones[path.zone];
  if (!arr) return page;
  if (path.indices.length === 1) {
    arr[path.indices[0]] = mutator(arr[path.indices[0]]);
    return next;
  }
  let parent: V2ContainerBlock = arr[path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) {
    parent = parent.children[path.indices[i]] as V2ContainerBlock;
  }
  const lastIdx = path.indices[path.indices.length - 1];
  parent.children[lastIdx] = mutator(parent.children[lastIdx]);
  return next;
}

function addBlockToZone(page: V2Page, zone: V2ZoneKey, block: V2Block, atIndex?: number): V2Page {
  const next: V2Page = JSON.parse(JSON.stringify(page));
  const arr = next.zones[zone] || [];
  if (atIndex == null || atIndex >= arr.length) arr.push(block);
  else arr.splice(atIndex, 0, block);
  next.zones[zone] = arr;
  return next;
}

function removeBlockAt(page: V2Page, path: BlockPath): V2Page {
  const next: V2Page = JSON.parse(JSON.stringify(page));
  if (path.indices.length === 1) {
    next.zones[path.zone].splice(path.indices[0], 1);
    return next;
  }
  let parent: V2ContainerBlock = next.zones[path.zone][path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) {
    parent = parent.children[path.indices[i]] as V2ContainerBlock;
  }
  parent.children.splice(path.indices[path.indices.length - 1], 1);
  return next;
}

function moveBlockInZone(page: V2Page, zone: V2ZoneKey, fromIdx: number, toIdx: number): V2Page {
  if (fromIdx === toIdx) return page;
  const next: V2Page = JSON.parse(JSON.stringify(page));
  const arr = next.zones[zone];
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, item);
  return next;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: T.textMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</label>
      {children}
      {hint ? <div style={{ fontSize: 10, color: T.textMute, lineHeight: 1.4 }}>{hint}</div> : null}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6,
        padding: "7px 10px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none",
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      style={{
        background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6,
        padding: "7px 10px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none",
        resize: "vertical", minHeight: 60,
      }}
    />
  );
}

function ColorPicker({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label?: string }) {
  const has = !!value && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="color"
        value={has ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 28, padding: 0, border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", background: "transparent" }}
        title={label}
      />
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, fontFamily: "monospace" }}
      />
      {has ? (
        <button onClick={() => onChange("")} style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 14 }} title="Effacer">✕</button>
      ) : null}
    </div>
  );
}

function Btn({ children, onClick, variant = "default", title }: { children: React.ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "ghost"; title?: string }) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: T.bgPanel, color: T.text, border: `1px solid ${T.border}` },
    primary: { background: T.primary, color: "#fff", border: `1px solid ${T.primary}` },
    danger:  { background: "rgba(239,68,68,.12)", color: T.danger, border: `1px solid rgba(239,68,68,.32)` },
    ghost:   { background: "transparent", color: T.textMute, border: "1px solid transparent" },
  };
  return (
    <button onClick={onClick} title={title} style={{
      ...styles[variant],
      padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: "pointer", fontFamily: "inherit",
      transition: "filter 120ms",
    }}
    onMouseEnter={(e) => { (e.target as HTMLElement).style.filter = "brightness(1.15)"; }}
    onMouseLeave={(e) => { (e.target as HTMLElement).style.filter = "none"; }}
    >{children}</button>
  );
}

// ─── Add-block menu ──────────────────────────────────────────────────────────

function AddBlockMenu({ onAdd }: { onAdd: (type: V2BlockType) => void }) {
  const [open, setOpen] = React.useState(false);
  const types: V2BlockType[] = ["text", "image", "button", "container", "spacer", "divider"];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "rgba(99,102,241,.16)", border: `1px dashed ${T.primary}`, color: T.primaryHi,
        padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
        fontFamily: "inherit",
      }}>+ Ajouter un bloc</button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 10, background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 160 }}>
          {types.map((t) => (
            <button key={t} onClick={() => { onAdd(t); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              background: "transparent", color: T.text, border: "none", padding: "7px 10px", borderRadius: 5,
              cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(99,102,241,.12)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              <span>{BLOCK_ICONS[t]}</span><span>{BLOCK_LABELS[t]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Block tree (left panel) ─────────────────────────────────────────────────

function BlockListItem({
  block, depth, isSelected, onSelect, onDelete, onDragStart, onDragOver, onDrop,
}: {
  block: V2Block; depth: number; isSelected: boolean;
  onSelect: () => void; onDelete: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
}) {
  const label = block.type === "text" ? `"${(block as V2TextBlock).content.slice(0, 24) || "Texte"}"` :
                block.type === "image" ? `${(block as V2ImageBlock).src ? "🖼" : "—"} Image` :
                block.type === "button" ? `"${(block as V2ButtonBlock).label || "Bouton"}"` :
                block.type === "container" ? `📦 ${(block as V2ContainerBlock).layout} (${(block as V2ContainerBlock).children.length})` :
                block.type === "spacer" ? `↕️ ${(block as V2SpacerBlock).height || "20px"}` :
                `➖ Séparateur`;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      style={{
        marginLeft: depth * 16,
        padding: "5px 8px",
        borderRadius: 5,
        background: isSelected ? "rgba(99,102,241,.18)" : "transparent",
        border: `1px solid ${isSelected ? T.primary : "transparent"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: T.text,
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)"; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ opacity: 0.5, fontSize: 10 }}>⋮⋮</span>
      <span>{BLOCK_ICONS[block.type]}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 12, padding: 0, opacity: 0.6 }} title="Supprimer">×</button>
    </div>
  );
}

// ─── Properties panel ────────────────────────────────────────────────────────

function PropPanel({ block, onChange }: { block: V2Block; onChange: (next: V2Block) => void }) {
  const update = <K extends keyof V2Block>(patch: Partial<V2Block>) => onChange({ ...block, ...patch } as V2Block);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
        {BLOCK_ICONS[block.type]} {BLOCK_LABELS[block.type]}
      </div>

      {/* Type-specific */}
      {block.type === "text" && (
        <>
          <Field label="Contenu" hint="Sauts de ligne = nouvelles lignes (chaque ligne stylable séparément)">
            <Textarea value={block.content} onChange={(v) => update({ content: v } as any)} />
          </Field>
          <Field label="Tag HTML">
            <select value={block.tag || "p"} onChange={(e) => update({ tag: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option>
              <option value="h4">H4</option><option value="p">Paragraphe</option><option value="span">Span</option>
            </select>
          </Field>
          <PropTextStyle style={(block as V2TextBlock).style || {}} onChange={(s) => update({ style: s } as any)} />
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="URL de l'image"><Input value={block.src} onChange={(v) => update({ src: v } as any)} placeholder="https://..." /></Field>
          <Field label="Texte alternatif (alt)"><Input value={block.alt || ""} onChange={(v) => update({ alt: v } as any)} /></Field>
          <Field label="Lien (optionnel)"><Input value={block.href || ""} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Largeur"><Input value={block.width || ""} onChange={(v) => update({ width: v } as any)} placeholder="100% / 320px" /></Field>
            <Field label="Hauteur"><Input value={block.height || ""} onChange={(v) => update({ height: v } as any)} placeholder="auto / 200px" /></Field>
          </div>
          <Field label="Ajustement">
            <select value={block.objectFit || "cover"} onChange={(e) => update({ objectFit: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="cover">Remplir (cover)</option>
              <option value="contain">Contenu (contain)</option>
              <option value="fill">Étirer (fill)</option>
              <option value="none">Native</option>
            </select>
          </Field>
          <Field label="Texte superposé (overlay)"><Input value={block.overlayText || ""} onChange={(v) => update({ overlayText: v } as any)} /></Field>
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Texte"><Input value={block.label} onChange={(v) => update({ label: v } as any)} /></Field>
          <Field label="Lien"><Input value={block.href} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <Field label="Variante">
            <select value={block.variant || "primary"} onChange={(e) => update({ variant: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="primary">Primaire (or)</option>
              <option value="outline">Contour</option>
              <option value="ghost">Discret</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          {block.variant === "custom" && (
            <>
              <Field label="Couleur fond"><ColorPicker value={block.bgColor} onChange={(v) => update({ bgColor: v } as any)} /></Field>
              <Field label="Couleur texte"><ColorPicker value={block.textColor} onChange={(v) => update({ textColor: v } as any)} /></Field>
            </>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, cursor: "pointer" }}>
            <input type="checkbox" checked={!!block.fullWidth} onChange={(e) => update({ fullWidth: e.target.checked } as any)} />
            <span>Pleine largeur</span>
          </label>
        </>
      )}

      {block.type === "container" && (
        <>
          <Field label="Layout">
            <select value={block.layout} onChange={(e) => update({ layout: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="stack">Empilé (vertical)</option>
              <option value="row">En ligne (horizontal)</option>
              <option value="grid">Grille</option>
            </select>
          </Field>
          {block.layout === "grid" && (
            <Field label="Nombre de colonnes"><Input type="number" value={String(block.columns || 2)} onChange={(v) => update({ columns: Number(v) || 2 } as any)} /></Field>
          )}
          <Field label="Espacement entre enfants"><Input value={block.gap || "12px"} onChange={(v) => update({ gap: v } as any)} placeholder="12px" /></Field>
          <Field label="Largeur max"><Input value={block.maxWidth || ""} onChange={(v) => update({ maxWidth: v } as any)} placeholder="ex: 720px (vide = 100%)" /></Field>
        </>
      )}

      {block.type === "spacer" && (
        <>
          <Field label="Hauteur"><Input value={block.height || "20px"} onChange={(v) => update({ height: v } as any)} /></Field>
          <Field label="Hauteur mobile (optionnel)"><Input value={block.heightMobile || ""} onChange={(v) => update({ heightMobile: v } as any)} placeholder="surcharge mobile" /></Field>
        </>
      )}

      {block.type === "divider" && (
        <>
          <Field label="Couleur"><ColorPicker value={block.color} onChange={(v) => update({ color: v } as any)} /></Field>
          <Field label="Épaisseur"><Input value={block.thickness || "1px"} onChange={(v) => update({ thickness: v } as any)} /></Field>
          <Field label="Largeur"><Input value={block.width || "60%"} onChange={(v) => update({ width: v } as any)} /></Field>
          <Field label="Style">
            <select value={block.style || "solid"} onChange={(e) => update({ style: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="solid">Plein</option>
              <option value="dashed">Pointillé</option>
              <option value="dotted">Points</option>
            </select>
          </Field>
        </>
      )}

      {/* Common visual props (effects + spacing) */}
      {block.type !== "spacer" && (
        <>
          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Style & Effets</div>
          <Field label="Background"><ColorPicker value={(block as any).bg} onChange={(v) => update({ bg: v } as any)} /></Field>
          <Field label="Border radius"><Input value={(block as any).borderRadius || ""} onChange={(v) => update({ borderRadius: v } as any)} placeholder="ex: 12px" /></Field>
          <Field label="Bordure"><Input value={(block as any).border || ""} onChange={(v) => update({ border: v } as any)} placeholder="ex: 1px solid #FFD700" /></Field>
          <Field label="Box shadow"><Input value={(block as any).shadow || ""} onChange={(v) => update({ shadow: v } as any)} placeholder="0 8px 24px rgba(0,0,0,.5)" /></Field>
          <Field label="Glow"><ColorPicker value={(block as any).glow} onChange={(v) => update({ glow: v } as any)} /></Field>
          <Field label="Animation">
            <select value={(block as any).animation || "none"} onChange={(e) => update({ animation: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="none">Aucune</option>
              <option value="fadeIn">Fade in</option>
              <option value="slideUp">Slide up</option>
              <option value="pulse">Pulse</option>
              <option value="float">Float</option>
            </select>
          </Field>

          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Espacement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Marge haut"><Input value={(block as any).marginTop || ""} onChange={(v) => update({ marginTop: v } as any)} placeholder="ex: 16px" /></Field>
            <Field label="Marge bas"><Input value={(block as any).marginBottom || ""} onChange={(v) => update({ marginBottom: v } as any)} placeholder="ex: 16px" /></Field>
            <Field label="Padding haut"><Input value={(block as any).paddingTop || ""} onChange={(v) => update({ paddingTop: v } as any)} placeholder="ex: 8px" /></Field>
            <Field label="Padding bas"><Input value={(block as any).paddingBottom || ""} onChange={(v) => update({ paddingBottom: v } as any)} placeholder="ex: 8px" /></Field>
          </div>
          <Field label="Alignement">
            <select value={(block as any).align || ""} onChange={(e) => update({ align: e.target.value as any } as any)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="">Hérite</option>
              <option value="left">Gauche</option>
              <option value="center">Centré</option>
              <option value="right">Droite</option>
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

function PropTextStyle({ style, onChange }: { style: NonNullable<V2TextBlock["style"]>; onChange: (s: NonNullable<V2TextBlock["style"]>) => void }) {
  const update = (patch: Partial<typeof style>) => onChange({ ...style, ...patch });
  return (
    <>
      <Field label="Couleur"><ColorPicker value={style.color} onChange={(v) => update({ color: v })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Taille"><Input value={style.fontSize || ""} onChange={(v) => update({ fontSize: v })} placeholder="ex: 1.4rem" /></Field>
        <Field label="Poids"><Input type="number" value={String(style.fontWeight || "")} onChange={(v) => update({ fontWeight: Number(v) || undefined })} placeholder="400 / 700 / 900" /></Field>
      </div>
      <Field label="Police"><Input value={style.fontFamily || ""} onChange={(v) => update({ fontFamily: v })} placeholder="ex: Inter, Bebas Neue" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Letter spacing"><Input value={style.letterSpacing || ""} onChange={(v) => update({ letterSpacing: v })} placeholder=".04em" /></Field>
        <Field label="Line height"><Input value={style.lineHeight || ""} onChange={(v) => update({ lineHeight: v })} placeholder="1.4" /></Field>
      </div>
      <Field label="Transform">
        <select value={style.textTransform || "none"} onChange={(e) => update({ textTransform: e.target.value as any })} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
          <option value="none">Aucun</option><option value="uppercase">MAJUSCULES</option><option value="capitalize">Capitalisé</option>
        </select>
      </Field>
      <Field label="Text shadow"><Input value={style.textShadow || ""} onChange={(v) => update({ textShadow: v })} placeholder="0 0 10px gold" /></Field>
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EditorV2Page() {
  const { user } = useAuth();
  const allowed = !!user && FSB_ALLOWED_IDS.has(user.id);

  const [page, setPage] = React.useState<V2Page>(() => newV2Page("M4V2"));
  const [selectedPath, setSelectedPath] = React.useState<BlockPath | null>(null);
  const [device, setDevice] = React.useState<"mobile" | "desktop">("mobile");
  const [slugLocked, setSlugLocked] = React.useState(true);
  const dragRef = React.useRef<{ zone: V2ZoneKey; index: number } | null>(null);

  // Auto-extract code + suggest slug at first edit
  React.useEffect(() => {
    if (!page.affiLink) return;
    const code = extractAffiCode(page.affiLink);
    if (code !== page.affiCode) {
      setPage((p) => ({
        ...p,
        affiCode: code,
        slug: p.slug || buildV2DefaultSlug(p.affiLink, p.modelKind),
      }));
    }
  }, [page.affiLink, page.affiCode, page.modelKind]);

  // Selected block
  const selectedBlock = selectedPath ? getBlockAt(page, selectedPath) : null;

  // Add a top-level block to a zone
  const addBlock = (zone: V2ZoneKey, type: V2BlockType) => {
    const block = newBlockOfType(type);
    setPage((p) => addBlockToZone(p, zone, block));
  };

  // Block drag start
  const handleDragStart = (zone: V2ZoneKey, index: number) => {
    dragRef.current = { zone, index };
  };
  const handleDrop = (zone: V2ZoneKey, index: number) => {
    const dr = dragRef.current;
    if (!dr) return;
    if (dr.zone === zone) {
      setPage((p) => moveBlockInZone(p, zone, dr.index, index));
    } else {
      // Move across zones
      setPage((p) => {
        const block = p.zones[dr.zone][dr.index];
        const removed = removeBlockAt(p, { zone: dr.zone, indices: [dr.index] });
        return addBlockToZone(removed, zone, block, index);
      });
    }
    dragRef.current = null;
  };

  // Save handler (placeholder for now — real persistence comes phase 2)
  const handleSave = () => {
    console.log("[EditorV2] save", page);
    alert("Phase 1 — sauvegarde non encore wired (voir console).\n\nPhase 2 ajoutera la persistance backend.");
  };

  if (!allowed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: T.bg, color: T.textMute, fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <div style={{ color: T.danger, fontWeight: 700, marginTop: 8 }}>Accès réservé FSB</div>
        </div>
      </div>
    );
  }

  const zones = v2ZonesForModel(page.modelKind);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr", background: T.bg, color: T.text, fontFamily: "Inter, system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.bgPanel }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: ".02em", color: T.gold }}>✨ Editor V2</div>
        <span style={{ fontSize: 10, color: T.textMute, padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: 4 }}>BETA</span>
        <div style={{ flex: 1 }} />

        {/* Modèle */}
        <select value={page.modelKind} onChange={(e) => setPage((p) => ({ ...p, modelKind: e.target.value as V2Model, zones: newV2Page(e.target.value as V2Model).zones }))} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", color: T.text, fontSize: 12 }}>
          <option value="M4V2">M4 V2</option>
          <option value="M5V2">M5 V2</option>
        </select>

        {/* Device toggle */}
        <div style={{ display: "flex", gap: 1, background: T.bgInput, padding: 2, borderRadius: 6, border: `1px solid ${T.border}` }}>
          <button onClick={() => setDevice("mobile")} style={{ background: device === "mobile" ? T.primary : "transparent", color: device === "mobile" ? "#fff" : T.textMute, border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>📱 iPhone SE</button>
          <button onClick={() => setDevice("desktop")} style={{ background: device === "desktop" ? T.primary : "transparent", color: device === "desktop" ? "#fff" : T.textMute, border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🖥 Desktop</button>
        </div>

        <Btn onClick={handleSave} variant="primary">💾 Enregistrer</Btn>
      </header>

      {/* 3-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 320px", height: "100%", overflow: "hidden" }}>
        {/* LEFT — Structure tree */}
        <aside style={{ borderRight: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", padding: 10 }}>
          <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>Métadonnées</div>
          <Field label="Lien d'affiliation"><Input value={page.affiLink} onChange={(v) => setPage((p) => ({ ...p, affiLink: v }))} placeholder="https://celsius.games/CODE" /></Field>
          <Field label="Code affi (auto)"><Input value={page.affiCode} onChange={(v) => setPage((p) => ({ ...p, affiCode: v }))} placeholder="extrait du lien" /></Field>
          <Field label="Nom du casino"><Input value={page.casinoName} onChange={(v) => setPage((p) => ({ ...p, casinoName: v }))} placeholder="ex: Celsius Games" /></Field>
          <Field label="Titre de la page (SEO)"><Input value={page.pageTitle || ""} onChange={(v) => setPage((p) => ({ ...p, pageTitle: v }))} placeholder="<title> de la page" /></Field>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
            <label style={{ fontSize: 11, color: T.textMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>URL de la landing</label>
            <button onClick={() => setSlugLocked(!slugLocked)} title={slugLocked ? "Déverrouiller pour modifier" : "Verrouiller"} style={{ background: "transparent", border: "none", color: slugLocked ? T.textMute : T.gold, cursor: "pointer", fontSize: 12 }}>
              {slugLocked ? "🔒" : "🔓"}
            </button>
          </div>
          <Input value={page.slug} onChange={(v) => !slugLocked && setPage((p) => ({ ...p, slug: v.replace(/[^A-Za-z0-9_-]/g, "") }))} placeholder="ex: UHyEqTtNlLM4" />
          <div style={{ fontSize: 10, color: T.textMute, marginTop: 4, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            lunalive.win/r/<b style={{ color: T.gold }}>{page.slug || "..."}</b>
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "16px 0 12px" }} />

          <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>Structure</div>
          {zones.map((zk) => {
            const blocks = page.zones[zk] || [];
            return (
              <div key={zk} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, marginBottom: 4, letterSpacing: ".05em" }}>{V2_ZONE_LABELS[zk]}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
                  {blocks.length === 0 ? (
                    <div style={{ fontSize: 11, color: T.textMute, padding: "8px 0", textAlign: "center", border: `1px dashed ${T.border}`, borderRadius: 6 }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(zk, 0)}>
                      Zone vide — glisser un bloc ici
                    </div>
                  ) : null}
                  {blocks.map((b, i) => (
                    <BlockListItem
                      key={b.id || i}
                      block={b}
                      depth={0}
                      isSelected={selectedPath?.zone === zk && selectedPath.indices.length === 1 && selectedPath.indices[0] === i}
                      onSelect={() => setSelectedPath({ zone: zk, indices: [i] })}
                      onDelete={() => {
                        setPage((p) => removeBlockAt(p, { zone: zk, indices: [i] }));
                        if (selectedPath?.zone === zk && selectedPath.indices[0] === i) setSelectedPath(null);
                      }}
                      onDragStart={() => handleDragStart(zk, i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(zk, i)}
                    />
                  ))}
                </div>
                <AddBlockMenu onAdd={(t) => addBlock(zk, t)} />
              </div>
            );
          })}
        </aside>

        {/* CENTER — Preview */}
        <main style={{ overflow: "auto", padding: 24, display: "grid", placeItems: "start center", background: "#04040a" }}>
          <div style={{
            width: device === "mobile" ? 375 : 1280,
            minHeight: device === "mobile" ? 667 : 720,
            maxWidth: "100%",
            background: "#000",
            borderRadius: device === "mobile" ? 32 : 8,
            border: `1px solid ${T.border}`,
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            overflow: "hidden",
            transform: device === "desktop" ? "scale(0.6)" : "none",
            transformOrigin: "top center",
          }}>
            <RenderV2Page page={page} isMobile={device === "mobile"} />
          </div>
          {device === "mobile" ? (
            <div style={{ marginTop: 12, fontSize: 10, color: T.textMute }}>iPhone SE — 375 × 667</div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 10, color: T.textMute }}>Desktop 1280 — preview à 60 %</div>
          )}
        </main>

        {/* RIGHT — Properties panel */}
        <aside style={{ borderLeft: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", padding: 12 }}>
          {selectedBlock ? (
            <PropPanel
              block={selectedBlock}
              onChange={(next) => {
                if (!selectedPath) return;
                setPage((p) => updateBlockAt(p, selectedPath, () => next));
              }}
            />
          ) : (
            <div style={{ color: T.textMute, fontSize: 12, padding: "20px 8px", textAlign: "center", lineHeight: 1.6 }}>
              <div style={{ fontSize: 32, opacity: 0.5, marginBottom: 8 }}>👈</div>
              Sélectionne un bloc dans la colonne de gauche pour modifier ses propriétés.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
