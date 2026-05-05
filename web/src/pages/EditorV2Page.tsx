// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — éditeur landing complet, isolé du V1.
//
// Route: /editorFSNV2
// Features :
//   • 3 colonnes : structure / preview / properties
//   • Drag&drop natif des blocs (inter-zones supporté)
//   • iPhone SE 375×667 / Desktop preview
//   • Liste des pages V2 + recherche (modale)
//   • Templates de démarrage par modèle (M4V2 / M5V2)
//   • Édition par-ligne du bloc Texte (lineStyles)
//   • Dupliquer bloc en 1 clic
//   • Variantes M5 (gold/ruby/emerald/...) en quick-picks
//   • Persistence DB via /api/fsb/affi-pages (editorVersion: 2)
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
  type V2TextStyle,
  V2_ZONE_LABELS,
  v2ZonesForModel,
  newV2Page,
  newBlockOfType,
  buildV2DefaultSlug,
  extractAffiCode,
  makeV2BlockId,
} from "../lib/editor_v2_types";
import { RenderV2Page } from "../lib/editor_v2_render";
import {
  listFsbAffiPages,
  createFsbAffiPage,
  updateFsbAffiPage,
  deleteFsbAffiPage,
  type FsbAffiPage,
} from "../lib/api_affi_pages";

// ─── FSB access guard (mêmes IDs que V1) ─────────────────────────────────────
const FSB_ALLOWED_IDS = new Set([4, 15, 71]);

// ─── Theme ───────────────────────────────────────────────────────────────────
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
  ok:        "#10b981",
};

const BLOCK_ICONS: Record<V2BlockType, string> = {
  text: "📝", image: "🖼️", button: "🔘", container: "📦", spacer: "↕️", divider: "➖",
};
const BLOCK_LABELS: Record<V2BlockType, string> = {
  text: "Texte", image: "Image", button: "Bouton", container: "Container",
  spacer: "Espacement", divider: "Séparateur",
};

// ─── M5 Variants ─────────────────────────────────────────────────────────────
const M5_VARIANTS: Record<string, { name: string; emoji: string; gold: string; bgPage: string }> = {
  gold:     { name: "Gold",     emoji: "🟨", gold: "#FFD700", bgPage: "#0a0712" },
  ruby:     { name: "Ruby",     emoji: "🟥", gold: "#E0115F", bgPage: "#120710" },
  emerald:  { name: "Emerald",  emoji: "🟩", gold: "#10b981", bgPage: "#07120e" },
  sapphire: { name: "Sapphire", emoji: "🟦", gold: "#3b82f6", bgPage: "#070e18" },
  amethyst: { name: "Amethyst", emoji: "🟪", gold: "#a855f7", bgPage: "#0e0718" },
  rose:     { name: "Rose",     emoji: "🌹", gold: "#ec4899", bgPage: "#120712" },
};

// ─── Path helpers ────────────────────────────────────────────────────────────
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
function duplicateBlockAt(page: V2Page, path: BlockPath): V2Page {
  const block = getBlockAt(page, path);
  if (!block) return page;
  const cloned = JSON.parse(JSON.stringify(block)) as V2Block;
  // reassign IDs récursivement pour éviter les collisions
  function reid(b: V2Block) {
    b.id = makeV2BlockId(b.type);
    if (b.type === "container") b.children.forEach(reid);
  }
  reid(cloned);
  if (path.indices.length === 1) {
    return addBlockToZone(page, path.zone, cloned, path.indices[0] + 1);
  }
  // dans un container imbriqué : insère juste après l'original
  const next: V2Page = JSON.parse(JSON.stringify(page));
  let parent: V2ContainerBlock = next.zones[path.zone][path.indices[0]] as V2ContainerBlock;
  for (let i = 1; i < path.indices.length - 1; i++) {
    parent = parent.children[path.indices[i]] as V2ContainerBlock;
  }
  const idx = path.indices[path.indices.length - 1];
  parent.children.splice(idx + 1, 0, cloned);
  return next;
}

// ─── Starter templates ──────────────────────────────────────────────────────

function getStarterTemplate(model: V2Model): V2Page {
  const base = newV2Page(model);
  if (model === "M5V2") {
    // Image profil rond + 2 lignes Hero (Déposez X / Joue X) + Bouton RÉCLAME
    base.zones.aboveCards.push({
      id: makeV2BlockId("image"), type: "image",
      src: "", alt: "Photo de profil",
      width: "120px", height: "120px",
      objectFit: "cover",
      borderRadius: "50%",
      align: "center",
      glow: "#FFD700",
      shadow: "0 8px 32px rgba(0,0,0,.4)",
      marginTop: "40px",
      marginBottom: "20px",
    } as V2ImageBlock);
    base.zones.aboveCards.push({
      id: makeV2BlockId("text"), type: "text",
      content: "DÉPOSEZ 20€\nJOUE À 40€",
      tag: "h1",
      align: "center",
      style: {
        fontFamily: "Bebas Neue",
        fontSize: "3rem",
        fontWeight: 900,
        letterSpacing: ".02em",
        lineHeight: "1.05",
      },
      lineStyles: {
        // ligne 1 (Déposez 20€) en blanc
        0: { color: "#ffffff" },
        // ligne 2 (Joue à 40€) en or avec glow
        1: { color: "#FFD700", textShadow: "0 0 18px rgba(255,215,0,.6)" },
      },
      marginTop: "10px",
      marginBottom: "12px",
    } as V2TextBlock);
    base.zones.aboveCards.push({
      id: makeV2BlockId("text"), type: "text",
      content: "+20€ offerts dès ton premier dépôt",
      tag: "p",
      align: "center",
      style: { fontSize: "1rem", color: "rgba(255,255,255,.78)", fontWeight: 500 },
      marginBottom: "24px",
    } as V2TextBlock);
    // Cards zone — espace pour visuel coffre/jeux à ajouter par l'user
    base.zones.belowCards.push({
      id: makeV2BlockId("button"), type: "button",
      label: "RÉCLAME 20€ OFFERTS",
      href: "",
      variant: "primary",
      fullWidth: true,
      borderRadius: "14px",
      paddingX: "16px 0",
      animation: "pulse",
      marginTop: "8px",
      marginBottom: "32px",
    } as V2ButtonBlock);
    base.globals = { brandGold: "#FFD700", bgPage: "#0a0712" };
    base.casinoName = "";
  } else if (model === "M4V2") {
    // Hero compact (badge optionnel + 2 lignes H1) + 2 cartes en grid + boutons
    base.zones.aboveCards.push({
      id: makeV2BlockId("text"), type: "text",
      content: "Doublez votre dépôt",
      tag: "h1",
      align: "center",
      style: { fontFamily: "Inter", fontSize: "2rem", fontWeight: 900, color: "#fff" },
      marginTop: "32px",
    } as V2TextBlock);
    // Cards : grid 2 colonnes, chaque carte = container empilé avec image + texte + bouton
    const card = (label: string): V2ContainerBlock => ({
      id: makeV2BlockId("container"), type: "container", layout: "stack", gap: "10px",
      bg: "#10101e", borderRadius: "12px", border: "1px solid #2a2a4a", paddingX: "14px",
      paddingTop: "14px", paddingBottom: "14px",
      children: [
        { id: makeV2BlockId("image"), type: "image", src: "", alt: label, width: "100%", height: "180px", objectFit: "cover", borderRadius: "8px" } as V2ImageBlock,
        { id: makeV2BlockId("text"), type: "text", content: label, tag: "p", style: { fontWeight: 800, fontSize: "1rem", color: "#FFD700" } } as V2TextBlock,
        { id: makeV2BlockId("button"), type: "button", label: "JOUER", href: "", variant: "primary", fullWidth: true } as V2ButtonBlock,
      ],
    });
    base.zones.cards.push({
      id: makeV2BlockId("container"), type: "container", layout: "grid", columns: 2, gap: "16px",
      maxWidth: "820px",
      children: [card("Card 1"), card("Card 2")],
    } as V2ContainerBlock);
  }
  return base;
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

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
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }} />
  );
}
function Textarea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 60, width: "100%", boxSizing: "border-box" }} />
  );
}
function ColorPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const has = !!value && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="color" value={has ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 28, padding: 0, border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", background: "transparent" }} />
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#000000"
        style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, fontFamily: "monospace" }} />
      {has ? (
        <button onClick={() => onChange("")} style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 14 }} title="Effacer">✕</button>
      ) : null}
    </div>
  );
}
function Btn({ children, onClick, variant = "default", title, disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "ghost" | "gold"; title?: string; disabled?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: T.bgPanel, color: T.text, border: `1px solid ${T.border}` },
    primary: { background: T.primary, color: "#fff", border: `1px solid ${T.primary}` },
    gold:    { background: "linear-gradient(135deg,#FFD700,#FFC200)", color: "#000", border: `1px solid ${T.gold}` },
    danger:  { background: "rgba(239,68,68,.12)", color: T.danger, border: `1px solid rgba(239,68,68,.32)` },
    ghost:   { background: "transparent", color: T.textMute, border: "1px solid transparent" },
  };
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      ...styles[variant], padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
      transition: "filter 120ms",
    }}
      onMouseEnter={(e) => { if (!disabled) (e.target as HTMLElement).style.filter = "brightness(1.15)"; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.filter = "none"; }}
    >{children}</button>
  );
}

// ─── Image picker (URL + upload + preview) ──────────────────────────────────

function ImagePickerV2({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const token = (typeof window !== "undefined" ? localStorage.getItem("lunalive_token_v1") : "") || "";

  async function handleFile(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://lunalive-api.onrender.com";
      const res = await fetch(`${base}/me/overlay/bg/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) setErr(json?.error || "Erreur upload");
      else onChange(String(json.url));
    } catch {
      setErr("Erreur réseau");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label ? <label style={{ fontSize: 11, color: T.textMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</label> : null}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{
          width: 50, height: 50, borderRadius: 8, border: `1px solid ${T.border}`,
          background: value ? "#000" : T.bgInput, overflow: "hidden", flexShrink: 0,
          display: "grid", placeItems: "center",
        }}>
          {value ? (
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : <span style={{ fontSize: 18, opacity: 0.4 }}>🖼</span>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL ou upload"
            style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12 }} />
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              flex: 1, background: "rgba(99,102,241,.16)", border: `1px dashed ${T.primary}`, color: T.primaryHi,
              padding: "4px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: uploading ? "wait" : "pointer", fontFamily: "inherit",
            }}>{uploading ? "Upload…" : "📁 Upload"}</button>
            {value ? (
              <button type="button" onClick={() => onChange("")} style={{
                background: "transparent", border: `1px solid ${T.danger}`, color: T.danger,
                padding: "4px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>✕</button>
            ) : null}
          </div>
          {err && <div style={{ fontSize: 10, color: T.danger }}>{err}</div>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      </div>
    </div>
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
        padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      }}>+ Ajouter un bloc</button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 10, background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 160 }}>
          {types.map((t) => (
            <button key={t} onClick={() => { onAdd(t); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              background: "transparent", color: T.text, border: "none", padding: "7px 10px", borderRadius: 5,
              cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span>{BLOCK_ICONS[t]}</span><span>{BLOCK_LABELS[t]}</span>
            </button>
          ))}
        </div>
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
  const label = block.type === "text" ? `"${(block as V2TextBlock).content.slice(0, 24).replace(/\n/g, " | ") || "Texte"}"` :
                block.type === "image" ? `${(block as V2ImageBlock).src ? "🖼" : "—"} Image` :
                block.type === "button" ? `"${(block as V2ButtonBlock).label || "Bouton"}"` :
                block.type === "container" ? `${(block as V2ContainerBlock).layout} (${(block as V2ContainerBlock).children.length})` :
                block.type === "spacer" ? `${(block as V2SpacerBlock).height || "20px"}` : `Séparateur`;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      style={{
        padding: "5px 8px", borderRadius: 5,
        background: isSelected ? "rgba(99,102,241,.18)" : "transparent",
        border: `1px solid ${isSelected ? T.primary : "transparent"}`,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text,
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)"; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ opacity: 0.5, fontSize: 10 }}>⋮⋮</span>
      <span>{BLOCK_ICONS[block.type]}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Dupliquer" style={{ background: "transparent", border: "none", color: T.textMute, cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.7 }}>⎘</button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Supprimer" style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", fontSize: 14, padding: 0, opacity: 0.7 }}>×</button>
    </div>
  );
}

// ─── Properties panel ────────────────────────────────────────────────────────

function PropTextStyle({ style, onChange, label }: { style: V2TextStyle; onChange: (s: V2TextStyle) => void; label?: string }) {
  const update = (patch: Partial<V2TextStyle>) => onChange({ ...style, ...patch });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label ? <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, letterSpacing: ".05em" }}>{label}</div> : null}
      <Field label="Couleur"><ColorPicker value={style.color} onChange={(v) => update({ color: v })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Taille"><Input value={style.fontSize || ""} onChange={(v) => update({ fontSize: v })} placeholder="ex: 1.4rem" /></Field>
        <Field label="Poids"><Input type="number" value={String(style.fontWeight || "")} onChange={(v) => update({ fontWeight: Number(v) || undefined })} placeholder="400/700/900" /></Field>
      </div>
      <Field label="Police"><Input value={style.fontFamily || ""} onChange={(v) => update({ fontFamily: v })} placeholder="Inter / Bebas Neue / ..." /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Field label="Letter spacing"><Input value={style.letterSpacing || ""} onChange={(v) => update({ letterSpacing: v })} placeholder=".04em" /></Field>
        <Field label="Line height"><Input value={style.lineHeight || ""} onChange={(v) => update({ lineHeight: v })} placeholder="1.4" /></Field>
      </div>
      <Field label="Transform">
        <select value={style.textTransform || "none"} onChange={(e) => update({ textTransform: e.target.value as any })}
          style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
          <option value="none">Aucun</option><option value="uppercase">MAJUSCULES</option><option value="capitalize">Capitalisé</option>
        </select>
      </Field>
      <Field label="Text shadow"><Input value={style.textShadow || ""} onChange={(v) => update({ textShadow: v })} placeholder="0 0 10px gold" /></Field>
    </div>
  );
}

function PropPanel({ block, onChange }: { block: V2Block; onChange: (next: V2Block) => void }) {
  const update = (patch: Partial<V2Block>) => onChange({ ...block, ...patch } as V2Block);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
        {BLOCK_ICONS[block.type]} {BLOCK_LABELS[block.type]}
      </div>

      {/* Type-specific */}
      {block.type === "text" && (
        <>
          <Field label="Contenu" hint="Sauts de ligne = nouvelles lignes (chacune stylable séparément ci-dessous)">
            <Textarea value={block.content} onChange={(v) => update({ content: v } as any)} rows={3} />
          </Field>
          <Field label="Tag HTML">
            <select value={block.tag || "p"} onChange={(e) => update({ tag: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option>
              <option value="h4">H4</option><option value="p">Paragraphe</option><option value="span">Span</option>
            </select>
          </Field>
          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Style global du bloc</div>
          <PropTextStyle style={(block as V2TextBlock).style || {}} onChange={(s) => update({ style: s } as any)} />

          {/* Per-line styles */}
          {(() => {
            const lines = (block as V2TextBlock).content.split("\n");
            if (lines.length <= 1) return null;
            const lineStyles = (block as V2TextBlock).lineStyles || {};
            return (
              <>
                <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
                <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Style par ligne ({lines.length} lignes)
                </div>
                {lines.map((ln, i) => (
                  <details key={i} style={{ background: "rgba(255,215,0,.04)", border: `1px solid rgba(255,215,0,.18)`, borderRadius: 6, padding: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: T.text, fontWeight: 700, padding: "2px 0" }}>
                      Ligne {i + 1} : <span style={{ color: T.textMute, fontWeight: 400 }}>"{ln.slice(0, 30) || "(vide)"}"</span>
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      <PropTextStyle
                        style={lineStyles[i] || {}}
                        onChange={(s) => {
                          const next = { ...(lineStyles || {}) };
                          if (Object.keys(s).length === 0) delete next[i]; else next[i] = s;
                          update({ lineStyles: next } as any);
                        }}
                      />
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
          <ImagePickerV2 label="Image" value={block.src} onChange={(v) => update({ src: v } as any)} />
          <Field label="Texte alternatif"><Input value={block.alt || ""} onChange={(v) => update({ alt: v } as any)} /></Field>
          <Field label="Lien (optionnel)"><Input value={block.href || ""} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Largeur"><Input value={block.width || ""} onChange={(v) => update({ width: v } as any)} placeholder="100% / 320px" /></Field>
            <Field label="Hauteur"><Input value={block.height || ""} onChange={(v) => update({ height: v } as any)} placeholder="auto / 200px" /></Field>
          </div>
          <Field label="Ajustement">
            <select value={block.objectFit || "cover"} onChange={(e) => update({ objectFit: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="cover">Remplir</option><option value="contain">Contenu</option><option value="fill">Étirer</option><option value="none">Native</option>
            </select>
          </Field>
          <Field label="Texte superposé"><Input value={block.overlayText || ""} onChange={(v) => update({ overlayText: v } as any)} /></Field>
          {block.overlayText ? (
            <Field label="Position overlay">
              <select value={block.overlayPosition || "center"} onChange={(e) => update({ overlayPosition: e.target.value as any } as any)}
                style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
                <option value="top-left">Haut gauche</option><option value="top-right">Haut droite</option>
                <option value="center">Centré</option>
                <option value="bottom-left">Bas gauche</option><option value="bottom-right">Bas droite</option>
              </select>
            </Field>
          ) : null}
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Texte"><Input value={block.label} onChange={(v) => update({ label: v } as any)} /></Field>
          <Field label="Lien"><Input value={block.href} onChange={(v) => update({ href: v } as any)} placeholder="https://..." /></Field>
          <Field label="Variante">
            <select value={block.variant || "primary"} onChange={(e) => update({ variant: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="primary">Primaire (or)</option><option value="outline">Contour</option>
              <option value="ghost">Discret</option><option value="custom">Custom</option>
            </select>
          </Field>
          {block.variant === "custom" && (
            <>
              <Field label="Couleur fond"><ColorPicker value={block.bgColor} onChange={(v) => update({ bgColor: v } as any)} /></Field>
              <Field label="Couleur texte"><ColorPicker value={block.textColor} onChange={(v) => update({ textColor: v } as any)} /></Field>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Icône gauche"><Input value={block.iconLeft || ""} onChange={(v) => update({ iconLeft: v } as any)} placeholder="🎰" /></Field>
            <Field label="Icône droite"><Input value={block.iconRight || ""} onChange={(v) => update({ iconRight: v } as any)} placeholder="→" /></Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, cursor: "pointer" }}>
            <input type="checkbox" checked={!!block.fullWidth} onChange={(e) => update({ fullWidth: e.target.checked } as any)} />
            <span>Pleine largeur</span>
          </label>
        </>
      )}

      {block.type === "container" && (
        <>
          <Field label="Layout">
            <select value={block.layout} onChange={(e) => update({ layout: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="stack">Empilé</option><option value="row">En ligne</option><option value="grid">Grille</option>
            </select>
          </Field>
          {block.layout === "grid" && (
            <Field label="Colonnes"><Input type="number" value={String(block.columns || 2)} onChange={(v) => update({ columns: Number(v) || 2 } as any)} /></Field>
          )}
          <Field label="Espacement enfants"><Input value={block.gap || "12px"} onChange={(v) => update({ gap: v } as any)} placeholder="12px" /></Field>
          <Field label="Largeur max"><Input value={block.maxWidth || ""} onChange={(v) => update({ maxWidth: v } as any)} placeholder="ex: 720px" /></Field>
          <div style={{ fontSize: 11, color: T.textMute, padding: "8px 0", lineHeight: 1.5 }}>
            💡 Pour ajouter / réordonner les enfants : sélectionne ce container dans l'arbre puis utilise les boutons de la zone parente.
          </div>
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
            <select value={block.style || "solid"} onChange={(e) => update({ style: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="solid">Plein</option><option value="dashed">Pointillé</option><option value="dotted">Points</option>
            </select>
          </Field>
        </>
      )}

      {/* Common visual props */}
      {block.type !== "spacer" && (
        <>
          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Style & Effets</div>
          <Field label="Background"><ColorPicker value={(block as any).bg} onChange={(v) => update({ bg: v } as any)} /></Field>
          <Field label="Image de fond"><Input value={(block as any).bgImage || ""} onChange={(v) => update({ bgImage: v } as any)} placeholder="https://..." /></Field>
          <Field label="Border radius"><Input value={(block as any).borderRadius || ""} onChange={(v) => update({ borderRadius: v } as any)} placeholder="ex: 12px" /></Field>
          <Field label="Bordure"><Input value={(block as any).border || ""} onChange={(v) => update({ border: v } as any)} placeholder="ex: 1px solid #FFD700" /></Field>
          <Field label="Box shadow"><Input value={(block as any).shadow || ""} onChange={(v) => update({ shadow: v } as any)} placeholder="0 8px 24px rgba(0,0,0,.5)" /></Field>
          <Field label="Glow"><ColorPicker value={(block as any).glow} onChange={(v) => update({ glow: v } as any)} /></Field>
          <Field label="Animation">
            <select value={(block as any).animation || "none"} onChange={(e) => update({ animation: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="none">Aucune</option><option value="fadeIn">Fade in</option><option value="slideUp">Slide up</option>
              <option value="pulse">Pulse</option><option value="float">Float</option>
            </select>
          </Field>

          <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Espacement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="Marge haut"><Input value={(block as any).marginTop || ""} onChange={(v) => update({ marginTop: v } as any)} placeholder="16px" /></Field>
            <Field label="Marge bas"><Input value={(block as any).marginBottom || ""} onChange={(v) => update({ marginBottom: v } as any)} placeholder="16px" /></Field>
            <Field label="Padding haut"><Input value={(block as any).paddingTop || ""} onChange={(v) => update({ paddingTop: v } as any)} placeholder="8px" /></Field>
            <Field label="Padding bas"><Input value={(block as any).paddingBottom || ""} onChange={(v) => update({ paddingBottom: v } as any)} placeholder="8px" /></Field>
          </div>
          <Field label="Alignement">
            <select value={(block as any).align || ""} onChange={(e) => update({ align: e.target.value as any } as any)}
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontSize: 13 }}>
              <option value="">Hérite</option><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

// ─── Pages list modal ────────────────────────────────────────────────────────

function PagesListModal({
  isOpen, onClose, pages, onLoad, onDelete, onNew, currentId,
}: {
  isOpen: boolean; onClose: () => void; pages: FsbAffiPage[];
  onLoad: (p: FsbAffiPage) => void; onDelete: (p: FsbAffiPage) => void; onNew: () => void;
  currentId: number | null;
}) {
  const [search, setSearch] = React.useState("");
  if (!isOpen) return null;
  const filtered = pages.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.brandName.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 720, maxHeight: "85vh", background: T.bgPanel, border: `1px solid ${T.border}`,
        borderRadius: 12, boxShadow: "0 24px 60px rgba(0,0,0,.6)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.gold }}>📋 Mes landings V2</div>
          <span style={{ fontSize: 11, color: T.textMute }}>{filtered.length} page{filtered.length > 1 ? "s" : ""}</span>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={onNew}>+ Nouvelle</Btn>
          <Btn variant="ghost" onClick={onClose}>✕ Fermer</Btn>
        </div>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
          <Input value={search} onChange={setSearch} placeholder="🔍 Rechercher (nom / slug / titre)…" />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: T.textMute, fontSize: 13 }}>
              {search ? "Aucune page ne correspond." : "Aucune page V2 — clique '+ Nouvelle' pour démarrer."}
            </div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} style={{
                padding: "10px 12px", margin: 4, borderRadius: 8, background: p.id === currentId ? "rgba(99,102,241,.18)" : "transparent",
                border: `1px solid ${p.id === currentId ? T.primary : T.border}`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.brandName || "(sans nom)"}</div>
                  <div style={{ fontSize: 11, color: T.textMute, fontFamily: "monospace", marginTop: 2 }}>
                    /r/<b style={{ color: T.gold }}>{p.slug}</b> · {p.editorVersion === 2 ? "V2" : "V1"} · M{p.model}
                  </div>
                </div>
                <Btn variant="default" onClick={() => { onLoad(p); onClose(); }}>Charger</Btn>
                <Btn variant="danger" onClick={() => { if (window.confirm(`Supprimer "${p.brandName || p.slug}" ?`)) onDelete(p); }}>🗑</Btn>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EditorV2Page() {
  const { user, token } = useAuth();
  const allowed = !!user && FSB_ALLOWED_IDS.has(user.id);

  const [page, setPage] = React.useState<V2Page>(() => getStarterTemplate("M5V2"));
  const [selectedPath, setSelectedPath] = React.useState<BlockPath | null>(null);
  const [device, setDevice] = React.useState<"mobile" | "desktop">("mobile");
  const [slugLocked, setSlugLocked] = React.useState(true);
  const dragRef = React.useRef<{ zone: V2ZoneKey; index: number } | null>(null);

  // List of pages from DB
  const [pages, setPages] = React.useState<FsbAffiPage[]>([]);
  const [pagesOpen, setPagesOpen] = React.useState(false);
  const [currentPageId, setCurrentPageId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Track dirty state — true dès qu'un changement diverge de la DB
  const [dirty, setDirty] = React.useState(false);
  const lastSavedRef = React.useRef<string>(JSON.stringify(page));
  React.useEffect(() => {
    setDirty(JSON.stringify(page) !== lastSavedRef.current);
  }, [page]);

  // Warning beforeunload si modifs non sauvegardées
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Raccourci Ctrl+S → save
  const handleSaveRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-extract code → suggest slug
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

  // Load list at mount
  const refreshList = React.useCallback(async () => {
    if (!token) return;
    try {
      const r = await listFsbAffiPages(token);
      setPages(r.items.filter((p) => p.editorVersion === 2));
    } catch (e: any) {
      setError(`Liste: ${e?.message || "erreur"}`);
    }
  }, [token]);
  React.useEffect(() => { void refreshList(); }, [refreshList]);

  const selectedBlock = selectedPath ? getBlockAt(page, selectedPath) : null;

  const addBlock = (zone: V2ZoneKey, type: V2BlockType) => {
    const block = newBlockOfType(type);
    setPage((p) => addBlockToZone(p, zone, block));
  };

  const handleDragStart = (zone: V2ZoneKey, index: number) => { dragRef.current = { zone, index }; };
  const handleDrop = (zone: V2ZoneKey, index: number) => {
    const dr = dragRef.current;
    if (!dr) return;
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

  // Save → backend
  const handleSave = async () => {
    if (!token) { setError("Token manquant"); return; }
    if (!page.slug.trim()) { setError("Slug requis avant sauvegarde"); return; }
    setSaving(true);
    setError(null);
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
      const updatedPage = { ...page, slug: result.item.slug };
      setPage(updatedPage);
      lastSavedRef.current = JSON.stringify(updatedPage);
      setDirty(false);
      setNotice(`Sauvegardé : /r/${result.item.slug}`);
      setTimeout(() => setNotice(null), 3000);
      void refreshList();
    } catch (e: any) {
      setError(`Sauvegarde: ${e?.message || "erreur"}`);
    } finally {
      setSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

  const loadPage = (p: FsbAffiPage) => {
    if (p.editorVersion !== 2 || !p.config || !(p.config as any).zones) {
      setError("Cette page n'est pas une V2 valide.");
      return;
    }
    const v2 = p.config as unknown as V2Page;
    setPage(v2);
    lastSavedRef.current = JSON.stringify(v2);
    setDirty(false);
    setCurrentPageId(p.id);
    setSelectedPath(null);
    setSlugLocked(true);
    setNotice(`Chargé : ${p.brandName}`);
    setTimeout(() => setNotice(null), 2000);
  };

  const newPage = () => {
    if (window.confirm("Créer une nouvelle page ? (les modifs non sauvegardées seront perdues)")) {
      setPage(getStarterTemplate(page.modelKind));
      setCurrentPageId(null);
      setSelectedPath(null);
    }
  };

  const deletePage = async (p: FsbAffiPage) => {
    if (!token) return;
    try {
      await deleteFsbAffiPage(token, p.id);
      void refreshList();
      if (currentPageId === p.id) {
        setPage(getStarterTemplate("M5V2"));
        setCurrentPageId(null);
      }
    } catch (e: any) {
      setError(`Suppression: ${e?.message || "erreur"}`);
    }
  };

  // Variantes M5
  const applyM5Variant = (key: string) => {
    const v = M5_VARIANTS[key];
    if (!v) return;
    setPage((p) => ({ ...p, globals: { ...(p.globals || {}), brandGold: v.gold, bgPage: v.bgPage } }));
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
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.bgPanel, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: ".02em", color: T.gold }}>✨ Editor V2</div>
        <span style={{ fontSize: 10, color: T.textMute, padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: 4 }}>BETA</span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
          <Btn variant="default" onClick={() => setPagesOpen(true)}>📋 Mes pages ({pages.length})</Btn>
          <Btn variant="ghost" onClick={newPage}>+ Nouvelle</Btn>
        </div>

        <div style={{ flex: 1 }} />

        {currentPageId && (
          <span style={{ fontSize: 11, color: T.textMute, fontFamily: "monospace" }}>
            ID #{currentPageId} · /r/<span style={{ color: T.gold }}>{page.slug}</span>
            {dirty && <span style={{ marginLeft: 6, color: T.danger, fontWeight: 800 }}>● modifs non sauvegardées</span>}
          </span>
        )}

        {notice && <span style={{ fontSize: 11, color: T.ok, fontWeight: 700 }}>✓ {notice}</span>}
        {error && <span style={{ fontSize: 11, color: T.danger, fontWeight: 700 }}>✕ {error}</span>}

        <select value={page.modelKind} onChange={(e) => {
          const m = e.target.value as V2Model;
          if (page.zones && Object.values(page.zones).some((arr) => arr.length > 0)) {
            if (!window.confirm("Changer de modèle ? Les blocs actuels seront remplacés par le template du nouveau modèle.")) return;
          }
          setPage(getStarterTemplate(m));
          setCurrentPageId(null);
          setSelectedPath(null);
        }} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", color: T.text, fontSize: 12 }}>
          <option value="M4V2">M4 V2</option>
          <option value="M5V2">M5 V2</option>
        </select>

        <div style={{ display: "flex", gap: 1, background: T.bgInput, padding: 2, borderRadius: 6, border: `1px solid ${T.border}` }}>
          <button onClick={() => setDevice("mobile")} style={{ background: device === "mobile" ? T.primary : "transparent", color: device === "mobile" ? "#fff" : T.textMute, border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>📱 iPhone SE</button>
          <button onClick={() => setDevice("desktop")} style={{ background: device === "desktop" ? T.primary : "transparent", color: device === "desktop" ? "#fff" : T.textMute, border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🖥 Desktop</button>
        </div>

        <Btn onClick={handleSave} variant="gold" disabled={saving}>{saving ? "..." : currentPageId ? "💾 Enregistrer" : "✨ Publier"}</Btn>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 320px", height: "100%", overflow: "hidden" }}>
        {/* LEFT */}
        <aside style={{ borderRight: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", padding: 10 }}>
          <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>Métadonnées</div>
          <Field label="Lien d'affiliation"><Input value={page.affiLink} onChange={(v) => setPage((p) => ({ ...p, affiLink: v }))} placeholder="https://celsius.games/CODE" /></Field>
          <Field label="Code affi (auto)"><Input value={page.affiCode} onChange={(v) => setPage((p) => ({ ...p, affiCode: v }))} placeholder="extrait du lien" /></Field>
          <Field label="Nom du casino"><Input value={page.casinoName} onChange={(v) => setPage((p) => ({ ...p, casinoName: v }))} placeholder="ex: Celsius Games" /></Field>
          <Field label="Titre de la page"><Input value={page.pageTitle || ""} onChange={(v) => setPage((p) => ({ ...p, pageTitle: v }))} placeholder="<title> SEO" /></Field>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
            <label style={{ fontSize: 11, color: T.textMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>URL de la landing</label>
            <button onClick={() => setSlugLocked(!slugLocked)} title={slugLocked ? "Déverrouiller" : "Verrouiller"} style={{ background: "transparent", border: "none", color: slugLocked ? T.textMute : T.gold, cursor: "pointer", fontSize: 12 }}>
              {slugLocked ? "🔒" : "🔓"}
            </button>
          </div>
          <Input value={page.slug} onChange={(v) => !slugLocked && setPage((p) => ({ ...p, slug: v.replace(/[^A-Za-z0-9_-]/g, "") }))} placeholder="ex: UHyEqTtNlLM4" />
          <div style={{ fontSize: 10, color: T.textMute, marginTop: 4, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            lunalive.win/r/<b style={{ color: T.gold }}>{page.slug || "..."}</b>
          </div>

          {page.modelKind === "M5V2" && (
            <>
              <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "16px 0 12px" }} />
              <div style={{ fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>Variante M5</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {Object.entries(M5_VARIANTS).map(([key, v]) => (
                  <button key={key} onClick={() => applyM5Variant(key)} title={v.name} style={{
                    background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "8px 4px", color: T.text, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  }}>
                    <span style={{ fontSize: 16 }}>{v.emoji}</span>
                    <span>{v.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

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
                      onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(zk, 0)}>
                      Zone vide — ajouter ou glisser un bloc
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
        </aside>

        {/* CENTER — Preview */}
        <main style={{ overflow: "auto", padding: 24, display: "grid", placeItems: "start center", background: "#04040a" }}>
          <div style={{
            width: device === "mobile" ? 375 : 1280,
            minHeight: device === "mobile" ? 667 : 720,
            maxWidth: "100%",
            background: page.globals?.bgPage || "#000",
            borderRadius: device === "mobile" ? 32 : 8,
            border: `1px solid ${T.border}`,
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            overflow: "hidden",
            transform: device === "desktop" ? "scale(0.55)" : "none",
            transformOrigin: "top center",
          }}>
            <RenderV2Page page={page} isMobile={device === "mobile"} />
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: T.textMute }}>
            {device === "mobile" ? "iPhone SE — 375 × 667" : "Desktop 1280 — preview à 55%"}
          </div>
        </main>

        {/* RIGHT */}
        <aside style={{ borderLeft: `1px solid ${T.border}`, background: T.bgPanel, overflowY: "auto", padding: 12 }}>
          {selectedBlock ? (
            <PropPanel block={selectedBlock} onChange={(next) => {
              if (!selectedPath) return;
              setPage((p) => updateBlockAt(p, selectedPath, () => next));
            }} />
          ) : (
            <div style={{ color: T.textMute, fontSize: 12, padding: "20px 8px", textAlign: "center", lineHeight: 1.6 }}>
              <div style={{ fontSize: 32, opacity: 0.5, marginBottom: 8 }}>👈</div>
              Sélectionne un bloc dans la colonne de gauche pour modifier ses propriétés.
            </div>
          )}
        </aside>
      </div>

      <PagesListModal
        isOpen={pagesOpen} onClose={() => setPagesOpen(false)}
        pages={pages} onLoad={loadPage} onDelete={deletePage} onNew={() => { newPage(); setPagesOpen(false); }}
        currentId={currentPageId}
      />
    </div>
  );
}
