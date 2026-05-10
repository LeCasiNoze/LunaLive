// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — interface SaaS moderne
//
// Deux vues principales :
//   - "dashboard" : home avec liste de pages, recherche, création
//   - "editor"    : édition d'une page sélectionnée (3 colonnes sleek)
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  type V2Page, type V2Block, type V2BlockType, type V2ZoneKey, type V2Model,
  type V2TextBlock, type V2ImageBlock, type V2ButtonBlock, type V2ContainerBlock,
  type V2SpacerBlock, type V2TextStyle,
  V2_ZONE_LABELS, v2ZonesForModel,
  newBlockOfType, buildV2DefaultSlug, extractAffiCode, makeV2BlockId,
} from "../lib/editor_v2_types";
import { RenderV2Page } from "../lib/editor_v2_render";
import { getStarterTemplateV2, M4_DEFAULT_IMAGES } from "../lib/editor_v2_starters";
import {
  listFsbAffiPages, createFsbAffiPage, updateFsbAffiPage, deleteFsbAffiPage,
  type FsbAffiPage,
} from "../lib/api_affi_pages";

const FSB_ALLOWED_IDS = new Set([4, 15, 71]);

// ─── Theme — palette moderne SaaS ────────────────────────────────────────────
const T = {
  // Backgrounds
  bg:        "#0b0c12",      // app background
  bgPanel:   "#13141d",      // panel
  bgPanel2:  "#1a1c27",      // hover state panel
  bgInput:   "#0f1018",      // form inputs
  bgCanvas:  "#06070b",      // editor canvas (darker)
  // Borders
  border:    "rgba(255,255,255,.06)",
  borderHi:  "rgba(255,255,255,.14)",
  // Text
  text:      "#f1f3fa",
  textMute:  "#8b90a8",
  textDim:   "#5a5e72",
  // Accents
  primary:   "#7c5cff",
  primaryHi: "#9b85ff",
  primarySoft: "rgba(124,92,255,.12)",
  gold:      "#ffd166",
  goldSoft:  "rgba(255,209,102,.14)",
  ok:        "#3ecf8e",
  okSoft:    "rgba(62,207,142,.14)",
  warn:      "#ffa94d",
  danger:    "#ef4d4d",
  dangerSoft: "rgba(239,77,77,.14)",
};

const BLOCK_ICONS: Record<V2BlockType, string> = {
  text: "🅣", image: "🖼", button: "▣", container: "▦", spacer: "↕", divider: "─",
  fsnCardM4: "★",
  m4V1LowerSections: "▤",
  v3GameModel: "🎰",
};
const BLOCK_LABELS: Record<V2BlockType, string> = {
  text: "Texte", image: "Image", button: "Bouton", container: "Conteneur",
  spacer: "Espacement", divider: "Séparateur",
  fsnCardM4: "Card M4 (preset V1)",
  m4V1LowerSections: "Sections bas M4 V1 (preset)",
  v3GameModel: "Mini-jeu V3 (M3-M6)",
};
const M5_VARIANTS: Record<string, { name: string; emoji: string; gold: string; bgPage: string }> = {
  gold:     { name: "Gold",     emoji: "🟨", gold: "#FFD700", bgPage: "#0a0712" },
  ruby:     { name: "Ruby",     emoji: "🟥", gold: "#E0115F", bgPage: "#120710" },
  emerald:  { name: "Emerald",  emoji: "🟩", gold: "#10b981", bgPage: "#07120e" },
  sapphire: { name: "Sapphire", emoji: "🟦", gold: "#3b82f6", bgPage: "#070e18" },
  amethyst: { name: "Amethyst", emoji: "🟪", gold: "#a855f7", bgPage: "#0e0718" },
  rose:     { name: "Rose",     emoji: "🌹", gold: "#ec4899", bgPage: "#120712" },
};

// ─── Path helpers (immutable) ────────────────────────────────────────────────

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
  const arr = next.zones[path.zone]; if (!arr) return page;
  if (path.indices.length === 1) { arr[path.indices[0]] = mutator(arr[path.indices[0]]); return next; }
  let parent = arr[path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) parent = parent.children[path.indices[i]] as V2ContainerBlock;
  const lastIdx = path.indices[path.indices.length - 1];
  parent.children[lastIdx] = mutator(parent.children[lastIdx]);
  return next;
}
function addBlockToZone(page: V2Page, zone: V2ZoneKey, block: V2Block, atIndex?: number): V2Page {
  const next: V2Page = JSON.parse(JSON.stringify(page));
  const arr = next.zones[zone] || [];
  if (atIndex == null || atIndex >= arr.length) arr.push(block); else arr.splice(atIndex, 0, block);
  next.zones[zone] = arr; return next;
}
function removeBlockAt(page: V2Page, path: BlockPath): V2Page {
  const next: V2Page = JSON.parse(JSON.stringify(page));
  if (path.indices.length === 1) { next.zones[path.zone].splice(path.indices[0], 1); return next; }
  let parent = next.zones[path.zone][path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) parent = parent.children[path.indices[i]] as V2ContainerBlock;
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
function duplicateBlockAt(page: V2Page, path: BlockPath): V2Page {
  const block = getBlockAt(page, path); if (!block) return page;
  const cloned = JSON.parse(JSON.stringify(block)) as V2Block;
  function reid(b: V2Block) { b.id = makeV2BlockId(b.type); if (b.type === "container") b.children.forEach(reid); }
  reid(cloned);
  if (path.indices.length === 1) return addBlockToZone(page, path.zone, cloned, path.indices[0] + 1);
  const next: V2Page = JSON.parse(JSON.stringify(page));
  let parent = next.zones[path.zone][path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) parent = parent.children[path.indices[i]] as V2ContainerBlock;
  const idx = path.indices[path.indices.length - 1];
  parent.children.splice(idx + 1, 0, cloned);
  return next;
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

function Field({ label, hint, children, dense }: { label: string; hint?: string; children: React.ReactNode; dense?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: dense ? 6 : 10 }}>
      <label style={{ fontSize: 10.5, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</label>
      {children}
      {hint ? <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.4, marginTop: 1 }}>{hint}</div> : null}
    </div>
  );
}
function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color 120ms" }}
      onFocus={(e) => (e.target.style.borderColor = T.primary)}
      onBlur={(e) => (e.target.style.borderColor = T.border)}
    />
  );
}
function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 64, width: "100%", boxSizing: "border-box" }} />
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", cursor: "pointer" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function ColorPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const has = !!value && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="color" value={has ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
        style={{ width: 32, height: 32, padding: 0, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", background: "transparent" }} />
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#000000"
        style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 11, fontFamily: "monospace" }} />
      {has ? (
        <button onClick={() => onChange("")} style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 14 }} title="Effacer">✕</button>
      ) : null}
    </div>
  );
}
function Btn({ children, onClick, variant = "default", size = "md", title, disabled, fullWidth }: {
  children: React.ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "ghost" | "gold" | "ok"; size?: "sm" | "md" | "lg"; title?: string; disabled?: boolean; fullWidth?: boolean;
}) {
  const variants: Record<string, React.CSSProperties> = {
    default: { background: T.bgPanel2, color: T.text, border: `1px solid ${T.border}` },
    primary: { background: T.primary, color: "#fff", border: `1px solid ${T.primary}`, boxShadow: "0 2px 12px rgba(124,92,255,.32)" },
    gold:    { background: "linear-gradient(135deg,#ffd166,#ffa94d)", color: "#1a1305", border: "1px solid rgba(255,209,102,.6)", boxShadow: "0 2px 14px rgba(255,209,102,.32)" },
    ok:      { background: T.ok, color: "#fff", border: `1px solid ${T.ok}` },
    danger:  { background: T.dangerSoft, color: T.danger, border: `1px solid rgba(239,77,77,.36)` },
    ghost:   { background: "transparent", color: T.textMute, border: "1px solid transparent" },
  };
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: "5px 10px", fontSize: 11 },
    md: { padding: "7px 14px", fontSize: 12 },
    lg: { padding: "10px 18px", fontSize: 13 },
  };
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      ...variants[variant], ...sizes[size], borderRadius: 8, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
      transition: "transform 100ms, filter 120ms", display: "inline-flex", alignItems: "center", gap: 6,
      width: fullWidth ? "100%" : undefined, justifyContent: fullWidth ? "center" : undefined, whiteSpace: "nowrap",
    }}
      onMouseEnter={(e) => { if (!disabled) { (e.currentTarget as HTMLElement).style.filter = "brightness(1.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; } }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "none"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
    >{children}</button>
  );
}
function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, marginTop: 14 }}>
      <h3 style={{ margin: 0, fontSize: 11, color: T.textMute, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>{children}</h3>
      {hint ? <span style={{ fontSize: 10, color: T.textDim }}>{hint}</span> : null}
    </div>
  );
}

// ─── Image picker ────────────────────────────────────────────────────────────

function ImagePickerV2({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const token = (typeof window !== "undefined" ? localStorage.getItem("lunalive_token_v1") : "") || "";

  async function handleFile(file: File) {
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://lunalive-api.onrender.com";
      const res = await fetch(`${base}/me/overlay/bg/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) setErr(json?.error || "Erreur upload");
      else onChange(String(json.url));
    } catch { setErr("Erreur réseau"); }
    finally { setUploading(false); }
  }

  return (
    <Field label={label || "Image"}>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, border: `1px solid ${T.border}`, background: value ? "#000" : T.bgInput, overflow: "hidden", flexShrink: 0, display: "grid", placeItems: "center" }}>
          {value ? <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <span style={{ fontSize: 22, opacity: 0.3 }}>🖼</span>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL ou upload"
            style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 9px", color: T.text, fontSize: 11.5 }} />
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={() => setGalleryOpen(!galleryOpen)} style={{
              flex: 1, background: T.goldSoft, border: `1px dashed ${T.gold}`, color: T.gold,
              padding: "5px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>🖼 Galerie</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              flex: 1, background: T.primarySoft, border: `1px dashed ${T.primary}`, color: T.primaryHi,
              padding: "5px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: uploading ? "wait" : "pointer", fontFamily: "inherit",
            }}>{uploading ? "Upload…" : "📁 Upload"}</button>
            {value ? (
              <button type="button" onClick={() => onChange("")} style={{
                background: "transparent", border: `1px solid ${T.danger}`, color: T.danger,
                padding: "5px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>✕</button>
            ) : null}
          </div>
          {err && <div style={{ fontSize: 10, color: T.danger }}>{err}</div>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      </div>
      {galleryOpen ? (
        <div style={{
          marginTop: 8, padding: 8, background: T.bgInput, border: `1px solid ${T.border}`,
          borderRadius: 8, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6,
        }}>
          {M4_DEFAULT_IMAGES.map((img) => (
            <button key={img.url} type="button"
              onClick={() => { onChange(img.url); setGalleryOpen(false); }}
              style={{
                background: "#000", border: `1px solid ${value === img.url ? T.gold : T.border}`, borderRadius: 6,
                padding: 0, cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column",
              }}>
              <img src={img.url} alt={img.name} style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }} />
              <div style={{ fontSize: 9.5, color: T.textMute, padding: "4px 6px", textAlign: "center" }}>{img.name}</div>
            </button>
          ))}
        </div>
      ) : null}
    </Field>
  );
}

// ─── Add block menu ──────────────────────────────────────────────────────────

function AddBlockMenu({ onAdd, label = "+ Ajouter" }: { onAdd: (type: V2BlockType) => void; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const types: V2BlockType[] = ["text", "image", "button", "container", "spacer", "divider"];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: T.primarySoft, border: `1px dashed ${T.primary}`, color: T.primaryHi,
        padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%",
      }}>{label}</button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,.6)", minWidth: 180 }}>
            {types.map((t) => (
              <button key={t} onClick={() => { onAdd(t); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                background: "transparent", color: T.text, border: "none", padding: "8px 10px", borderRadius: 6,
                cursor: "pointer", fontFamily: "inherit", fontSize: 12,
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = T.bgPanel2; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ width: 20, color: T.textMute, fontSize: 14, textAlign: "center" }}>{BLOCK_ICONS[t]}</span>
                <span>{BLOCK_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Block list item ─────────────────────────────────────────────────────────

function BlockListItem({
  block, isSelected, onSelect, onDelete, onDuplicate, onDragStart, onDragOver, onDrop,
}: {
  block: V2Block; isSelected: boolean;
  onSelect: () => void; onDelete: () => void; onDuplicate: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
}) {
  const auto = block.type === "text" ? `"${(block as V2TextBlock).content.slice(0, 28).replace(/\n/g, " │ ") || "Texte"}"` :
                block.type === "image" ? `${(block as V2ImageBlock).src ? "•" : "—"} Image` :
                block.type === "button" ? `"${(block as V2ButtonBlock).label || "Bouton"}"` :
                block.type === "container" ? `${(block as V2ContainerBlock).layout} (${(block as V2ContainerBlock).children.length})` :
                block.type === "spacer" ? `${(block as V2SpacerBlock).height || "20px"}` :
                block.type === "fsnCardM4" ? `Card M4 V1 · ${(block as any).depositAmount || "?"} → ${(block as any).bonusAmount || "?"}` :
                `Séparateur`;
  const label = block.name ? block.name : auto;
  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      onClick={onSelect}
      style={{
        padding: "7px 10px", borderRadius: 7,
        background: isSelected ? T.primarySoft : "transparent",
        border: `1px solid ${isSelected ? T.primary : T.border}`,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text,
        marginBottom: 3,
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = T.bgPanel2; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ opacity: 0.4, fontSize: 11, cursor: "grab" }}>⋮⋮</span>
      <span style={{ width: 16, color: T.textMute, fontSize: 13, textAlign: "center" }}>{BLOCK_ICONS[block.type]}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Dupliquer" style={{ background: "transparent", border: "none", color: T.textDim, cursor: "pointer", fontSize: 12, padding: 2 }}>⎘</button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Supprimer" style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 14, padding: 2 }}>×</button>
    </div>
  );
}

// ─── Property panel ──────────────────────────────────────────────────────────

function PropTextStyle({ style, onChange }: { style: V2TextStyle; onChange: (s: V2TextStyle) => void }) {
  const update = (patch: Partial<V2TextStyle>) => onChange({ ...style, ...patch });
  return (
    <>
      <Field label="Couleur" dense><ColorPicker value={style.color} onChange={(v) => update({ color: v })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Taille" dense><Input value={style.fontSize || ""} onChange={(v) => update({ fontSize: v })} placeholder="1.4rem" /></Field>
        <Field label="Poids" dense><Input type="number" value={String(style.fontWeight || "")} onChange={(v) => update({ fontWeight: Number(v) || undefined })} placeholder="700" /></Field>
      </div>
      <Field label="Police" dense><Input value={style.fontFamily || ""} onChange={(v) => update({ fontFamily: v })} placeholder="Inter / Bebas Neue" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Letter sp." dense><Input value={style.letterSpacing || ""} onChange={(v) => update({ letterSpacing: v })} placeholder=".04em" /></Field>
        <Field label="Line height" dense><Input value={style.lineHeight || ""} onChange={(v) => update({ lineHeight: v })} placeholder="1.4" /></Field>
      </div>
      <Field label="Transform" dense>
        <Select value={style.textTransform || "none"} onChange={(v) => update({ textTransform: v as any })}
          options={[{value:"none",label:"Aucun"},{value:"uppercase",label:"MAJUSCULES"},{value:"capitalize",label:"Capitalisé"}]} />
      </Field>
      <Field label="Text shadow" dense><Input value={style.textShadow || ""} onChange={(v) => update({ textShadow: v })} placeholder="0 0 10px gold" /></Field>
    </>
  );
}

function PropPanel({ block, onChange }: { block: V2Block; onChange: (next: V2Block) => void }) {
  const update = (patch: Partial<V2Block>) => onChange({ ...block, ...patch } as V2Block);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.primarySoft, border: `1px solid ${T.primary}40`, borderRadius: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, color: T.primaryHi }}>{BLOCK_ICONS[block.type]}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{block.name || BLOCK_LABELS[block.type]}</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: T.textDim, marginLeft: "auto" }}>{BLOCK_LABELS[block.type]}</span>
      </div>
      <Field label="Nom du bloc" dense hint="Affiché dans la liste à gauche (ex: Pseudo, Bouton CTA)">
        <Input value={block.name || ""} onChange={(v) => update({ name: v || undefined } as any)} placeholder={BLOCK_LABELS[block.type]} />
      </Field>

      {block.type === "text" && (
        <>
          <Field label="Contenu" hint="Sauts de ligne = lignes (chacune stylable)"><Textarea value={block.content} onChange={(v) => update({ content: v } as any)} /></Field>
          <Field label="Tag HTML" dense>
            <Select value={block.tag || "p"} onChange={(v) => update({ tag: v as any } as any)}
              options={[{value:"h1",label:"H1"},{value:"h2",label:"H2"},{value:"h3",label:"H3"},{value:"h4",label:"H4"},{value:"p",label:"Paragraphe"},{value:"span",label:"Span"}]} />
          </Field>
          <SectionTitle>Style global</SectionTitle>
          <PropTextStyle style={(block as V2TextBlock).style || {}} onChange={(s) => update({ style: s } as any)} />

          {(() => {
            const lines = (block as V2TextBlock).content.split("\n");
            if (lines.length <= 1) return null;
            const lineStyles = (block as V2TextBlock).lineStyles || {};
            return (
              <>
                <SectionTitle hint={`${lines.length} lignes`}>Style par ligne</SectionTitle>
                {lines.map((ln, i) => (
                  <details key={i} style={{ background: T.goldSoft, border: `1px solid rgba(255,209,102,.22)`, borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: T.text, fontWeight: 700 }}>
                      Ligne {i + 1} : <span style={{ color: T.textDim, fontWeight: 400 }}>"{ln.slice(0, 28) || "(vide)"}"</span>
                    </summary>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                      <PropTextStyle style={lineStyles[i] || {}} onChange={(s) => {
                        const next = { ...lineStyles };
                        if (Object.keys(s).length === 0) delete next[i]; else next[i] = s;
                        update({ lineStyles: next } as any);
                      }} />
                    </div>
                  </details>
                ))}
              </>
            );
          })()}
        </>
      )}

      {block.type === "image" && (
        <>
          <ImagePickerV2 value={block.src} onChange={(v) => update({ src: v } as any)} />
          <Field label="Alt" dense><Input value={block.alt || ""} onChange={(v) => update({ alt: v } as any)} /></Field>
          <Field label="Lien" dense><Input value={block.href || ""} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Largeur" dense><Input value={block.width || ""} onChange={(v) => update({ width: v } as any)} placeholder="320px" /></Field>
            <Field label="Hauteur" dense><Input value={block.height || ""} onChange={(v) => update({ height: v } as any)} placeholder="auto" /></Field>
          </div>
          <Field label="Ajustement" dense>
            <Select value={block.objectFit || "cover"} onChange={(v) => update({ objectFit: v as any } as any)}
              options={[{value:"cover",label:"Remplir"},{value:"contain",label:"Contenu"},{value:"fill",label:"Étirer"},{value:"none",label:"Native"}]} />
          </Field>
          <Field label="Texte superposé" dense><Input value={block.overlayText || ""} onChange={(v) => update({ overlayText: v } as any)} /></Field>
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Texte" dense><Input value={block.label} onChange={(v) => update({ label: v } as any)} /></Field>
          <Field label="Lien" dense><Input value={block.href} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <Field label="Variante" dense>
            <Select value={block.variant || "primary"} onChange={(v) => update({ variant: v as any } as any)}
              options={[{value:"primary",label:"Primaire (or)"},{value:"outline",label:"Contour"},{value:"ghost",label:"Discret"},{value:"custom",label:"Custom"}]} />
          </Field>
          {block.variant === "custom" && (
            <>
              <Field label="Couleur fond" dense><ColorPicker value={block.bgColor} onChange={(v) => update({ bgColor: v } as any)} /></Field>
              <Field label="Couleur texte" dense><ColorPicker value={block.textColor} onChange={(v) => update({ textColor: v } as any)} /></Field>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Icône gauche" dense><Input value={block.iconLeft || ""} onChange={(v) => update({ iconLeft: v } as any)} placeholder="🎰" /></Field>
            <Field label="Icône droite" dense><Input value={block.iconRight || ""} onChange={(v) => update({ iconRight: v } as any)} placeholder="→" /></Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text, cursor: "pointer", padding: "4px 0" }}>
            <input type="checkbox" checked={!!block.fullWidth} onChange={(e) => update({ fullWidth: e.target.checked } as any)} />
            <span>Pleine largeur</span>
          </label>
        </>
      )}

      {block.type === "container" && (
        <>
          <Field label="Disposition" dense>
            <Select value={block.layout} onChange={(v) => update({ layout: v as any } as any)}
              options={[{value:"stack",label:"↕ Empilé"},{value:"row",label:"↔ En ligne"},{value:"grid",label:"⊞ Grille"}]} />
          </Field>
          {block.layout === "grid" && (
            <Field label="Colonnes" dense><Input type="number" value={String(block.columns || 2)} onChange={(v) => update({ columns: Number(v) || 2 } as any)} /></Field>
          )}
          <Field label="Espacement enfants" dense><Input value={block.gap || ""} onChange={(v) => update({ gap: v } as any)} placeholder="12px" /></Field>
          <Field label="Largeur max" dense><Input value={block.maxWidth || ""} onChange={(v) => update({ maxWidth: v } as any)} placeholder="720px" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Largeur fixe" dense><Input value={block.width || ""} onChange={(v) => update({ width: v } as any)} placeholder="36px" /></Field>
            <Field label="Hauteur fixe" dense><Input value={block.height || ""} onChange={(v) => update({ height: v } as any)} placeholder="36px" /></Field>
          </div>
          <Field label="Justifier (horizontal)" dense>
            <Select value={block.justify || ""} onChange={(v) => update({ justify: v as any } as any)}
              options={[{value:"",label:"Hérité"},{value:"start",label:"Début"},{value:"center",label:"Centre"},{value:"end",label:"Fin"},{value:"between",label:"Espacé entre"},{value:"around",label:"Espacé autour"}]} />
          </Field>
          <Field label="Aligner items (vertical)" dense>
            <Select value={block.itemsAlign || ""} onChange={(v) => update({ itemsAlign: v as any } as any)}
              options={[{value:"",label:"Hérité"},{value:"start",label:"Haut"},{value:"center",label:"Centre"},{value:"end",label:"Bas"},{value:"stretch",label:"Étiré"}]} />
          </Field>
        </>
      )}

      {block.type === "spacer" && (
        <>
          <Field label="Hauteur" dense><Input value={block.height || "20px"} onChange={(v) => update({ height: v } as any)} /></Field>
          <Field label="Hauteur mobile" dense><Input value={block.heightMobile || ""} onChange={(v) => update({ heightMobile: v } as any)} placeholder="surcharge" /></Field>
        </>
      )}

      {block.type === "fsnCardM4" && (
        <>
          <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5, padding: "6px 8px", background: T.goldSoft, border: `1px solid rgba(255,209,102,.22)`, borderRadius: 6, marginBottom: 8 }}>
            Card preset M4 V1 — rendu visuel figé (duplication exacte de la
            card V1). Seules les données ci-dessous sont éditables.
          </div>
          <ImagePickerV2 value={block.imgSrc} onChange={(v) => update({ imgSrc: v } as any)} />
          <Field label="Alt image" dense><Input value={block.imgAlt || ""} onChange={(v) => update({ imgAlt: v } as any)} /></Field>
          <Field label="Lien (CTA Jouer)" dense><Input value={block.href} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Dépôt" dense><Input value={block.depositAmount} onChange={(v) => update({ depositAmount: v } as any)} placeholder="10€" /></Field>
            <Field label="Bonus reçu" dense><Input value={block.bonusAmount} onChange={(v) => update({ bonusAmount: v } as any)} placeholder="20€" /></Field>
          </div>
          <Field label="% bonus" dense><Input value={block.bonusPct || ""} onChange={(v) => update({ bonusPct: v } as any)} placeholder="100%" /></Field>
          <Field label="Délai animation float" dense hint="0s pour la 1ère card, -3s pour la 2e (rythme V1)">
            <Input value={block.animationDelay || ""} onChange={(v) => update({ animationDelay: v } as any)} placeholder="0s" />
          </Field>
        </>
      )}

      {block.type === "divider" && (
        <>
          <Field label="Couleur" dense><ColorPicker value={block.color} onChange={(v) => update({ color: v } as any)} /></Field>
          <Field label="Épaisseur" dense><Input value={block.thickness || "1px"} onChange={(v) => update({ thickness: v } as any)} /></Field>
          <Field label="Largeur" dense><Input value={block.width || "60%"} onChange={(v) => update({ width: v } as any)} /></Field>
          <Field label="Style" dense>
            <Select value={block.style || "solid"} onChange={(v) => update({ style: v as any } as any)}
              options={[{value:"solid",label:"Plein"},{value:"dashed",label:"Pointillé"},{value:"dotted",label:"Points"}]} />
          </Field>
        </>
      )}

      {/* Common visual props — exclus pour fsnCardM4 (preset visuel figé V1) */}
      {block.type !== "spacer" && block.type !== "fsnCardM4" && (
        <>
          <SectionTitle>Apparence</SectionTitle>
          <Field label="Background" dense><ColorPicker value={(block as any).bg} onChange={(v) => update({ bg: v } as any)} /></Field>
          <Field label="Image de fond" dense><Input value={(block as any).bgImage || ""} onChange={(v) => update({ bgImage: v } as any)} placeholder="https://..." /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Border radius" dense><Input value={(block as any).borderRadius || ""} onChange={(v) => update({ borderRadius: v } as any)} placeholder="12px" /></Field>
            <Field label="Bordure" dense><Input value={(block as any).border || ""} onChange={(v) => update({ border: v } as any)} placeholder="1px solid #fff" /></Field>
          </div>
          <Field label="Box shadow" dense><Input value={(block as any).shadow || ""} onChange={(v) => update({ shadow: v } as any)} placeholder="0 8px 24px rgba(0,0,0,.5)" /></Field>
          <Field label="Glow (couleur)" dense><ColorPicker value={(block as any).glow} onChange={(v) => update({ glow: v } as any)} /></Field>
          <Field label="Animation" dense>
            <Select value={(block as any).animation || "none"} onChange={(v) => update({ animation: v as any } as any)}
              options={[{value:"none",label:"Aucune"},{value:"fadeIn",label:"Fade in"},{value:"slideUp",label:"Slide up"},{value:"pulse",label:"Pulse"},{value:"float",label:"Float"}]} />
          </Field>

          <SectionTitle>Espacement</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Marge ↑" dense><Input value={(block as any).marginTop || ""} onChange={(v) => update({ marginTop: v } as any)} placeholder="16px" /></Field>
            <Field label="Marge ↓" dense><Input value={(block as any).marginBottom || ""} onChange={(v) => update({ marginBottom: v } as any)} placeholder="16px" /></Field>
            <Field label="Padding ↑" dense><Input value={(block as any).paddingTop || ""} onChange={(v) => update({ paddingTop: v } as any)} placeholder="8px" /></Field>
            <Field label="Padding ↓" dense><Input value={(block as any).paddingBottom || ""} onChange={(v) => update({ paddingBottom: v } as any)} placeholder="8px" /></Field>
          </div>
          <Field label="Alignement" dense>
            <Select value={(block as any).align || ""} onChange={(v) => update({ align: v as any } as any)}
              options={[{value:"",label:"Hérité"},{value:"left",label:"Gauche"},{value:"center",label:"Centré"},{value:"right",label:"Droite"}]} />
          </Field>
        </>
      )}
    </div>
  );
}

// ─── Page card (dashboard) ───────────────────────────────────────────────────

function PageCard({ page, onOpen, onDelete, onDuplicate }: { page: FsbAffiPage; onOpen: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const updatedAgo = page.updatedAt ? new Date(page.updatedAt).toLocaleDateString("fr-FR") : "—";
  return (
    <div style={{
      background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 16, display: "flex", flexDirection: "column", gap: 10,
      transition: "all 160ms", cursor: "pointer", position: "relative", overflow: "hidden",
    }}
      onClick={onOpen}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 40px rgba(124,92,255,.2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      {/* Mini preview */}
      <div style={{
        height: 110, borderRadius: 8, background: "linear-gradient(135deg,#1a1c27 0%,#0f1018 100%)",
        border: `1px solid ${T.border}`, display: "grid", placeItems: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ fontSize: 38, opacity: 0.18 }}>{page.editorVersion === 2 ? "✨" : "📄"}</div>
        <div style={{ position: "absolute", top: 8, right: 8, padding: "2px 7px", background: page.editorVersion === 2 ? T.primarySoft : "rgba(255,255,255,.06)", color: page.editorVersion === 2 ? T.primaryHi : T.textMute, fontSize: 9.5, fontWeight: 800, borderRadius: 4, letterSpacing: ".05em" }}>
          {page.editorVersion === 2 ? "V2" : "V1"} · M{page.model}
        </div>
      </div>

      {/* Title + meta */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.brandName || "(sans nom)"}</div>
        <div style={{ fontSize: 11, color: T.textDim, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/r/{page.slug}</div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: "auto" }}>
        <span style={{ fontSize: 10, color: T.textDim, flex: 1 }}>Modifié {updatedAgo}</span>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Dupliquer" style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textMute, cursor: "pointer", padding: "4px 8px", borderRadius: 5, fontSize: 11 }}>⎘</button>
        <button onClick={(e) => { e.stopPropagation(); window.open(`/r/${page.slug}`, "_blank"); }} title="Voir en ligne" style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textMute, cursor: "pointer", padding: "4px 8px", borderRadius: 5, fontSize: 11 }}>↗</button>
        <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Supprimer "${page.brandName}" ?`)) onDelete(); }} title="Supprimer" style={{ background: "transparent", border: `1px solid rgba(239,77,77,.25)`, color: T.danger, cursor: "pointer", padding: "4px 8px", borderRadius: 5, fontSize: 11 }}>🗑</button>
      </div>
    </div>
  );
}

// ─── DASHBOARD VIEW ──────────────────────────────────────────────────────────

function DashboardView({
  user, pages, loading, onNew, onOpen, onDelete, onDuplicate, onRefresh,
}: {
  user: { username: string }; pages: FsbAffiPage[]; loading: boolean;
  onNew: (model: V2Model) => void; onOpen: (p: FsbAffiPage) => void;
  onDelete: (p: FsbAffiPage) => void; onDuplicate: (p: FsbAffiPage) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "v2" | "v1">("v2");
  const filtered = pages.filter((p) => {
    if (filter === "v2" && p.editorVersion !== 2) return false;
    if (filter === "v1" && p.editorVersion === 2) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.brandName.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
      {/* Topbar */}
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: `1px solid ${T.border}`, background: T.bgPanel, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#7c5cff,#ffd166)", display: "grid", placeItems: "center", fontSize: 14 }}>✨</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em" }}>Affi Studio</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: -2 }}>v2 · landing builder</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.textMute }}>👋 {user.username}</span>
      </header>

      {/* Hero / actions */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-.02em" }}>Mes landing pages</h1>
            <p style={{ fontSize: 13, color: T.textMute, margin: "6px 0 0" }}>{filtered.length} page{filtered.length > 1 ? "s" : ""} {filter === "v2" ? "V2" : filter === "v1" ? "V1" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="default" size="md" onClick={() => onNew("M4V2")}>+ Nouvelle (M4)</Btn>
            <Btn variant="gold" size="md" onClick={() => onNew("M5V2")}>+ Nouvelle (M5)</Btn>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textDim, fontSize: 14 }}>🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (nom, slug, titre)…"
              style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 10px 38px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 0, background: T.bgPanel, padding: 3, borderRadius: 10, border: `1px solid ${T.border}` }}>
            {(["v2","v1","all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? T.primary : "transparent", color: filter === f ? "#fff" : T.textMute,
                border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{f === "all" ? "Toutes" : f.toUpperCase()}</button>
            ))}
          </div>
          <Btn variant="ghost" size="md" onClick={onRefresh}>↻ Rafraîchir</Btn>
        </div>

        {/* Pages grid */}
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: T.textDim }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", background: T.bgPanel, border: `1px dashed ${T.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{search ? "Aucune page ne correspond" : "Aucune page V2"}</div>
            <div style={{ fontSize: 12, color: T.textMute, marginBottom: 16 }}>{search ? "Essaie avec un autre mot-clé" : "Crée ta première landing page V2"}</div>
            {!search && <Btn variant="primary" size="lg" onClick={() => onNew("M4V2")}>+ Nouvelle landing</Btn>}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {filtered.map((p) => (
              <PageCard key={p.id} page={p} onOpen={() => onOpen(p)} onDelete={() => onDelete(p)} onDuplicate={() => onDuplicate(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EDITOR VIEW ─────────────────────────────────────────────────────────────

function EditorView({
  page, setPage, currentPageId, onBack, onSave, dirty, saving, notice, error, refreshList,
  pages, onLoad,
}: {
  page: V2Page; setPage: React.Dispatch<React.SetStateAction<V2Page>>;
  currentPageId: number | null; onBack: () => void; onSave: () => Promise<void>;
  dirty: boolean; saving: boolean; notice: string | null; error: string | null;
  refreshList: () => void; pages: FsbAffiPage[]; onLoad: (p: FsbAffiPage) => void;
}) {
  const [selectedPath, setSelectedPath] = React.useState<BlockPath | null>(null);
  const [device, setDevice] = React.useState<"mobile" | "desktop">("mobile");
  const [slugLocked, setSlugLocked] = React.useState(true);
  const [tab, setTab] = React.useState<"structure" | "global" | "settings">("structure");
  const dragRef = React.useRef<{ zone: V2ZoneKey; index: number } | null>(null);

  React.useEffect(() => {
    if (!page.affiLink) return;
    const code = extractAffiCode(page.affiLink);
    if (code !== page.affiCode) {
      setPage((p) => ({ ...p, affiCode: code, slug: p.slug || buildV2DefaultSlug(p.affiLink, p.modelKind) }));
    }
  }, [page.affiLink, page.affiCode, page.modelKind, setPage]);

  const selectedBlock = selectedPath ? getBlockAt(page, selectedPath) : null;
  const zones = v2ZonesForModel(page.modelKind);

  const addBlock = (zone: V2ZoneKey, type: V2BlockType) => {
    const block = newBlockOfType(type);
    setPage((p) => addBlockToZone(p, zone, block));
  };
  const handleDragStart = (zone: V2ZoneKey, index: number) => { dragRef.current = { zone, index }; };
  const handleDrop = (zone: V2ZoneKey, index: number) => {
    const dr = dragRef.current; if (!dr) return;
    if (dr.zone === zone) {
      setPage((p) => moveBlockInZone(p, zone, dr.index, index));
    } else {
      setPage((p) => {
        const block = p.zones[dr.zone][dr.index];
        const removed = removeBlockAt(p, { zone: dr.zone, indices: [dr.index] });
        return addBlockToZone(removed, zone, block, index);
      });
    }
    dragRef.current = null;
  };

  const applyM5Variant = (key: string) => {
    const v = M5_VARIANTS[key]; if (!v) return;
    setPage((p) => ({ ...p, globals: { ...(p.globals || {}), brandGold: v.gold, bgPage: v.bgPage } }));
  };

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr", background: T.bg, color: T.text, fontFamily: "Inter, system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      {/* Topbar */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.bgPanel, flexWrap: "wrap" }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← Mes pages</Btn>
        <div style={{ width: 1, height: 22, background: T.border }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{page.casinoName || "Sans nom"}</div>
          <div style={{ fontSize: 10, color: T.textDim, fontFamily: "monospace" }}>
            /r/{page.slug || "..."} {dirty && <span style={{ color: T.warn, fontWeight: 800, marginLeft: 6 }}>● non sauvegardé</span>}
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {notice && <span style={{ fontSize: 11, color: T.ok, fontWeight: 700 }}>✓ {notice}</span>}
        {error && <span style={{ fontSize: 11, color: T.danger, fontWeight: 700 }}>✕ {error}</span>}

        <div style={{ display: "flex", gap: 1, background: T.bgInput, padding: 2, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <button onClick={() => setDevice("mobile")} style={{ background: device === "mobile" ? T.primary : "transparent", color: device === "mobile" ? "#fff" : T.textMute, border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>📱 SE</button>
          <button onClick={() => setDevice("desktop")} style={{ background: device === "desktop" ? T.primary : "transparent", color: device === "desktop" ? "#fff" : T.textMute, border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🖥 Desktop</button>
        </div>

        <Btn onClick={onSave} variant="gold" disabled={saving} size="md">{saving ? "..." : "💾 Enregistrer"}</Btn>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", height: "100%", overflow: "hidden" }}>
        {/* LEFT */}
        <aside style={{ borderRight: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: T.bgPanel2 }}>
            {([["structure","Structure"],["global","Style global"],["settings","Réglages"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as any)} style={{
                flex: 1, background: tab === k ? T.bgPanel : "transparent", color: tab === k ? T.text : T.textMute,
                border: "none", padding: "10px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                borderBottom: tab === k ? `2px solid ${T.primary}` : "2px solid transparent", transition: "all 120ms",
              }}>{l}</button>
            ))}
          </div>

          <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
            {tab === "structure" && (
              <>
                <SectionTitle hint={`${zones.reduce((acc, z) => acc + (page.zones[z]?.length || 0), 0)} blocs`}>Zones</SectionTitle>
                {zones.map((zk) => {
                  const blocks = page.zones[zk] || [];
                  return (
                    <div key={zk} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, marginBottom: 6, letterSpacing: ".06em", textTransform: "uppercase" }}>
                        {V2_ZONE_LABELS[zk]} <span style={{ color: T.textDim, fontWeight: 500, marginLeft: 4 }}>({blocks.length})</span>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        {blocks.length === 0 ? (
                          <div style={{ fontSize: 11, color: T.textDim, padding: "10px 0", textAlign: "center", border: `1px dashed ${T.border}`, borderRadius: 8 }}
                            onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(zk, 0)}>
                            Vide — glisser ici ou ajouter
                          </div>
                        ) : null}
                        {blocks.map((b, i) => (
                          <BlockListItem key={b.id || i} block={b}
                            isSelected={selectedPath?.zone === zk && selectedPath.indices.length === 1 && selectedPath.indices[0] === i}
                            onSelect={() => setSelectedPath({ zone: zk, indices: [i] })}
                            onDelete={() => {
                              setPage((p) => removeBlockAt(p, { zone: zk, indices: [i] }));
                              if (selectedPath?.zone === zk && selectedPath.indices[0] === i) setSelectedPath(null);
                            }}
                            onDuplicate={() => setPage((p) => duplicateBlockAt(p, { zone: zk, indices: [i] }))}
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
              </>
            )}

            {tab === "global" && (
              <>
                <SectionTitle>Couleurs globales</SectionTitle>
                <Field label="Fond de page" dense><ColorPicker value={page.globals?.bgPage} onChange={(v) => setPage((p) => ({ ...p, globals: { ...p.globals, bgPage: v } }))} /></Field>
                <Field label="Fond carte" dense><ColorPicker value={page.globals?.bgCard} onChange={(v) => setPage((p) => ({ ...p, globals: { ...p.globals, bgCard: v } }))} /></Field>
                <Field label="Or (accent)" dense><ColorPicker value={page.globals?.brandGold} onChange={(v) => setPage((p) => ({ ...p, globals: { ...p.globals, brandGold: v } }))} /></Field>
                <Field label="Bordure" dense><ColorPicker value={page.globals?.borderColor} onChange={(v) => setPage((p) => ({ ...p, globals: { ...p.globals, borderColor: v } }))} /></Field>

                <SectionTitle>Typographie</SectionTitle>
                <Field label="Police principale" dense><Input value={page.globals?.fontPrimary || ""} onChange={(v) => setPage((p) => ({ ...p, globals: { ...p.globals, fontPrimary: v } }))} placeholder="Inter / Bebas Neue" /></Field>

                {page.modelKind === "M5V2" && (
                  <>
                    <SectionTitle>Variantes M5</SectionTitle>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {Object.entries(M5_VARIANTS).map(([k, v]) => (
                        <button key={k} onClick={() => applyM5Variant(k)} style={{
                          background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 4px",
                          color: T.text, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.primary; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                        >
                          <span style={{ fontSize: 18 }}>{v.emoji}</span>
                          <span style={{ fontWeight: 700 }}>{v.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "settings" && (
              <>
                <SectionTitle>Métadonnées</SectionTitle>
                <Field label="Lien d'affiliation"><Input value={page.affiLink} onChange={(v) => setPage((p) => ({ ...p, affiLink: v }))} placeholder="https://celsius.games/CODE" /></Field>
                <Field label="Code (auto-extrait)" dense><Input value={page.affiCode} onChange={(v) => setPage((p) => ({ ...p, affiCode: v }))} /></Field>
                <Field label="Nom du casino" dense><Input value={page.casinoName} onChange={(v) => setPage((p) => ({ ...p, casinoName: v }))} placeholder="ex: Celsius Games" /></Field>
                <Field label="Titre SEO" dense><Input value={page.pageTitle || ""} onChange={(v) => setPage((p) => ({ ...p, pageTitle: v }))} placeholder="<title>" /></Field>

                <SectionTitle>URL de la landing</SectionTitle>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <button onClick={() => setSlugLocked(!slugLocked)} style={{ background: "transparent", border: "none", color: slugLocked ? T.textMute : T.gold, cursor: "pointer", fontSize: 12, padding: 0 }}>
                    {slugLocked ? "🔒 Verrouillée" : "🔓 Modification activée"}
                  </button>
                </div>
                <Input value={page.slug} onChange={(v) => !slugLocked && setPage((p) => ({ ...p, slug: v.replace(/[^A-Za-z0-9_-]/g, "") }))} placeholder="UHyEqTtNlLM4" />
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, fontFamily: "monospace" }}>
                  → lunalive.win/r/<b style={{ color: T.gold }}>{page.slug || "..."}</b>
                </div>

                {pages.length > 0 && (
                  <>
                    <SectionTitle>Charger une autre page</SectionTitle>
                    <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
                      {pages.filter(p => p.editorVersion === 2).map((p) => (
                        <button key={p.id} onClick={() => onLoad(p)} style={{
                          width: "100%", display: "flex", flexDirection: "column", gap: 1,
                          background: p.id === currentPageId ? T.primarySoft : "transparent",
                          border: "none", padding: "8px 10px", textAlign: "left",
                          borderBottom: `1px solid ${T.border}`, cursor: "pointer", color: T.text, fontFamily: "inherit",
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{p.brandName || "(sans nom)"}</span>
                          <span style={{ fontSize: 10, color: T.textDim, fontFamily: "monospace" }}>{p.slug}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <SectionTitle>Actions</SectionTitle>
                <Btn variant="default" size="md" fullWidth onClick={refreshList}>↻ Rafraîchir liste</Btn>
              </>
            )}
          </div>
        </aside>

        {/* CENTER — preview */}
        <main style={{ overflow: "auto", padding: 32, display: "grid", placeItems: "start center", background: T.bgCanvas }}>
          <div style={{
            width: device === "mobile" ? 375 : 1280,
            minHeight: device === "mobile" ? 667 : 720,
            maxWidth: "100%",
            background: page.globals?.bgPage || "#000",
            borderRadius: device === "mobile" ? 36 : 12,
            border: device === "mobile" ? `8px solid #1a1c27` : `1px solid ${T.border}`,
            boxShadow: "0 24px 70px rgba(0,0,0,.7)",
            overflow: "hidden",
            transform: device === "desktop" ? "scale(0.55)" : "none",
            transformOrigin: "top center",
          }}>
            <RenderV2Page
              page={page}
              isMobile={device === "mobile"}
              editCtx={{
                selected: selectedPath,
                onSelect: (zone, indices) => setSelectedPath({ zone, indices }),
              }}
            />
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: T.textDim, fontWeight: 600 }}>
            {device === "mobile" ? "📱 iPhone SE (375 × 667)" : "🖥 Desktop 1280 — preview à 55%"}
          </div>
        </main>

        {/* RIGHT */}
        <aside style={{ borderLeft: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", padding: 14 }}>
          {selectedBlock ? (
            <PropPanel block={selectedBlock} onChange={(next) => {
              if (!selectedPath) return;
              setPage((p) => updateBlockAt(p, selectedPath, () => next));
            }} />
          ) : (
            <div style={{ color: T.textDim, fontSize: 12, padding: "40px 8px", textAlign: "center", lineHeight: 1.6 }}>
              <div style={{ fontSize: 38, opacity: 0.3, marginBottom: 12 }}>👈</div>
              <div style={{ fontWeight: 700, color: T.textMute, marginBottom: 6 }}>Aucun bloc sélectionné</div>
              <div>Clique sur un bloc dans l'arborescence pour modifier ses propriétés.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EditorV2Page() {
  const { user, token } = useAuth();
  const allowed = !!user && FSB_ALLOWED_IDS.has(user.id);

  const [view, setView] = React.useState<"dashboard" | "editor">("dashboard");
  const [page, setPage] = React.useState<V2Page>(() => getStarterTemplateV2("M4V2"));
  const [currentPageId, setCurrentPageId] = React.useState<number | null>(null);
  const [pages, setPages] = React.useState<FsbAffiPage[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [dirty, setDirty] = React.useState(false);
  const lastSavedRef = React.useRef<string>(JSON.stringify(page));
  React.useEffect(() => { setDirty(JSON.stringify(page) !== lastSavedRef.current); }, [page]);

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const refreshList = React.useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const r = await listFsbAffiPages(token);
      setPages(r.items);
    } catch (e: any) { setError(`Liste: ${e?.message || "erreur"}`); }
    finally { setLoadingList(false); }
  }, [token]);
  React.useEffect(() => { void refreshList(); }, [refreshList]);

  const startNew = (model: V2Model) => {
    setPage(getStarterTemplateV2(model));
    setCurrentPageId(null);
    lastSavedRef.current = "";
    setDirty(true);
    setView("editor");
  };

  const openPage = (p: FsbAffiPage) => {
    if (p.editorVersion === 2 && p.config && (p.config as any).zones) {
      const v2 = p.config as unknown as V2Page;
      setPage(v2);
      setCurrentPageId(p.id);
      lastSavedRef.current = JSON.stringify(v2);
      setDirty(false);
      setView("editor");
    } else {
      // V1 page → ouvre dans le V1 editor
      window.open(`/editorFSN`, "_blank");
    }
  };

  const duplicatePage = async (p: FsbAffiPage) => {
    if (!token) return;
    try {
      const payload = {
        slug: `${p.slug}-copy`,
        model: p.model,
        variant: p.variant,
        brandName: `${p.brandName} (copie)`,
        title: p.title,
        config: p.config,
        editorVersion: p.editorVersion || 1,
      };
      await createFsbAffiPage(token, payload);
      void refreshList();
      setNotice(`Dupliquée : ${p.brandName}`);
      setTimeout(() => setNotice(null), 2500);
    } catch (e: any) { setError(`Duplication: ${e?.message || "erreur"}`); }
  };

  const deletePage = async (p: FsbAffiPage) => {
    if (!token) return;
    try {
      await deleteFsbAffiPage(token, p.id);
      void refreshList();
      if (currentPageId === p.id) {
        setCurrentPageId(null);
        setView("dashboard");
      }
    } catch (e: any) { setError(`Suppression: ${e?.message || "erreur"}`); }
  };

  const handleSave = async () => {
    if (!token) { setError("Non authentifié"); return; }
    if (!page.slug.trim()) { setError("Slug requis"); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        slug: page.slug,
        model: page.modelKind === "M5V2" ? 5 : 4,
        variant: null,
        brandName: page.casinoName || page.slug,
        title: page.pageTitle || page.casinoName || page.slug,
        config: page as any,
        editorVersion: 2,
      };
      const result = currentPageId
        ? await updateFsbAffiPage(token, currentPageId, payload)
        : await createFsbAffiPage(token, payload);
      setCurrentPageId(result.item.id);
      const updated = { ...page, slug: result.item.slug };
      setPage(updated);
      lastSavedRef.current = JSON.stringify(updated);
      setDirty(false);
      setNotice(`Sauvegardé · /r/${result.item.slug}`);
      setTimeout(() => setNotice(null), 3000);
      void refreshList();
    } catch (e: any) { setError(`Save: ${e?.message || "erreur"}`); }
    finally { setSaving(false); }
  };

  // Ctrl+S
  const handleSaveRef = React.useRef(handleSave);
  handleSaveRef.current = handleSave;
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && view === "editor") {
        e.preventDefault();
        void handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view]);

  const handleBackToDashboard = () => {
    if (dirty && !window.confirm("Tu as des modifs non sauvegardées. Quitter quand même ?")) return;
    setView("dashboard");
    setCurrentPageId(null);
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

  if (view === "dashboard") {
    return (
      <DashboardView
        user={user!} pages={pages} loading={loadingList}
        onNew={startNew} onOpen={openPage} onDelete={deletePage} onDuplicate={duplicatePage}
        onRefresh={refreshList}
      />
    );
  }

  return (
    <EditorView
      page={page} setPage={setPage} currentPageId={currentPageId}
      onBack={handleBackToDashboard} onSave={handleSave}
      dirty={dirty} saving={saving} notice={notice} error={error}
      refreshList={refreshList} pages={pages} onLoad={openPage}
    />
  );
}
