// ─────────────────────────────────────────────────────────────────────────────
// Editor V3 — wizard rapide M1 (= M4V1 dupliqué) + dashboard simple.
//
// Réutilise toute la pipeline V2 :
//   - Save → POST /api/fsb/affi-pages (editorVersion=2, model=4)
//   - Render preview & publié → <RenderV2Page page=...>
//   - Page publique → /r/<slug>
//
// Marqueur V3 : on stocke `__v3` + `__v3Inputs` dans le config V2Page pour
// pouvoir lister uniquement les pages V3 dans le dashboard et ré-ouvrir un
// wizard pré-rempli.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { RenderV2Page } from "../lib/editor_v2_render";
import {
  buildV3PageFromQuickInputs,
  defaultV3QuickInputs,
  V3_FONT_PRESETS,
  V3_COLOR_PRESETS,
  V3_SIZE_SCALE,
  V3_WEIGHT_PRESETS,
  V3_GAME_IMAGES,
  V3_ASPECT_PRESETS,
  type V3QuickInputs,
  type V3LineStyle,
  type V3GameKey,
} from "../lib/editor_v3_quick_builder";
import {
  listFsbAffiPages, createFsbAffiPage, updateFsbAffiPage, deleteFsbAffiPage,
  type FsbAffiPage,
} from "../lib/api_affi_pages";

const FSB_ALLOWED_IDS = new Set([4, 15, 71]);

// ─── Theme ──────────────────────────────────────────────────────────────────
const T = {
  bg:        "#0b0c12",
  bgPanel:   "#13141d",
  bgPanel2:  "#1a1c27",
  bgInput:   "#0f1018",
  border:    "rgba(255,255,255,.07)",
  borderHi:  "rgba(255,255,255,.16)",
  text:      "#f1f3fa",
  textMute:  "#8b90a8",
  textDim:   "#5a5e72",
  primary:   "#7c5cff",
  gold:      "#ffd166",
  ok:        "#3ecf8e",
  danger:    "#ef4d4d",
};

const V3_MARKER = "__v3";
const V3_INPUTS_KEY = "__v3Inputs";

// ─── Helpers UI ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: T.bgInput,
  color: T.text,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: T.textMute,
  textTransform: "uppercase",
  letterSpacing: ".5px",
  marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  background: `linear-gradient(135deg, ${T.primary}, #6045dd)`,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: T.text,
  border: `1px solid ${T.borderHi}`,
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  background: "transparent",
  color: T.danger,
  border: `1px solid ${T.danger}55`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

function Accordion({
  label, hint, open, onToggle, children, sectionRef,
}: {
  label: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} style={{
      background: T.bgPanel2, border: `1px solid ${open ? T.primary + "55" : T.border}`,
      borderRadius: 10, marginBottom: 10, overflow: "hidden",
      transition: "border-color 150ms",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", color: T.text, padding: "12px 14px",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.textMute, transition: "transform 150ms", transform: open ? "rotate(90deg)" : "none", display: "inline-block", width: 10 }}>▶</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
        </span>
        {hint ? <span style={{ fontSize: 11, color: T.textDim }}>{hint}</span> : null}
      </button>
      {open ? <div style={{ padding: "0 14px 14px" }}>{children}</div> : null}
    </div>
  );
}

function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? (color ? `${color}22` : T.primary + "33") : T.bgInput,
        color: active ? (color || T.primary) : T.text,
        border: `1px solid ${active ? (color || T.primary) : T.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─── Style picker (par ligne) ───────────────────────────────────────────────

function LineStylePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: V3LineStyle | undefined;
  onChange: (s: V3LineStyle) => void;
}) {
  const v: V3LineStyle = value || {};
  const [customColor, setCustomColor] = React.useState(v.color || "");

  return (
    <div style={{ background: label ? T.bgPanel2 : "transparent", border: label ? `1px solid ${T.border}` : "none", borderRadius: 10, padding: label ? 12 : 0, marginTop: label ? 8 : 0 }}>
      {label ? <div style={{ fontSize: 12, fontWeight: 700, color: T.textMute, marginBottom: 10 }}>{label}</div> : null}

      <div style={{ marginBottom: 10 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Police</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {V3_FONT_PRESETS.map((f) => (
            <Chip key={f.key} active={v.font === f.family} onClick={() => onChange({ ...v, font: f.family })}>
              <span style={{ fontFamily: `"${f.family}", system-ui` }}>{f.label}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Couleur</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {V3_COLOR_PRESETS.map((c) => (
            <Chip key={c.key} active={v.color === c.value} color={c.value} onClick={() => onChange({ ...v, color: c.value })}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.value, display: "inline-block" }} />
                {c.label}
              </span>
            </Chip>
          ))}
          <input
            type="color"
            value={customColor || "#ffffff"}
            onChange={(e) => { setCustomColor(e.target.value); onChange({ ...v, color: e.target.value }); }}
            style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
            title="Couleur personnalisée"
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Taille</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {V3_SIZE_SCALE.map((s) => (
              <Chip key={s.key} active={(v.size || "l") === s.key} onClick={() => onChange({ ...v, size: s.key })}>{s.label}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Graisse</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {V3_WEIGHT_PRESETS.map((w) => (
              <Chip key={w.key} active={(v.weight || "black") === w.key} onClick={() => onChange({ ...v, weight: w.key })}>{w.label}</Chip>
            ))}
          </div>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: T.text, cursor: "pointer" }}>
        <input type="checkbox" checked={!!v.glow} onChange={(e) => onChange({ ...v, glow: e.target.checked })} />
        Halo lumineux (glow)
      </label>
    </div>
  );
}

// ─── Card format controls (aspect ratio + object-fit) ─────────────────────

function CardImageFormatControls({
  inputs, update,
}: {
  inputs: V3QuickInputs;
  update: (patch: Partial<V3QuickInputs>) => void;
}) {
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>Format image (s'applique aux 2 cartes)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {V3_ASPECT_PRESETS.map((a) => (
          <Chip key={a.key} active={inputs.cardAspect === a.key} onClick={() => update({ cardAspect: a.key })}>
            {a.label}
          </Chip>
        ))}
      </div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>Remplissage</div>
      <div style={{ display: "flex", gap: 4 }}>
        <Chip active={inputs.cardObjectFit === "cover"} onClick={() => update({ cardObjectFit: "cover" })}>
          Plein (cover)
        </Chip>
        <Chip active={inputs.cardObjectFit === "contain"} onClick={() => update({ cardObjectFit: "contain" })}>
          Adapter (contain)
        </Chip>
      </div>
    </div>
  );
}

// ─── Image picker (game image / custom URL) ─────────────────────────────────

function GameImagePicker({
  value,
  onChange,
}: {
  value: { kind: V3GameKey | "custom"; url: string };
  onChange: (v: { kind: V3GameKey | "custom"; url: string }) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {V3_GAME_IMAGES.map((g) => (
          <Chip
            key={g.key}
            active={value.kind === g.key}
            onClick={() => onChange({ kind: g.key, url: g.url })}
          >
            {g.label}{!g.url ? " (URL requis)" : ""}
          </Chip>
        ))}
        <Chip active={value.kind === "custom"} onClick={() => onChange({ kind: "custom", url: value.kind === "custom" ? value.url : "" })}>URL custom</Chip>
      </div>
      <input
        type="url"
        placeholder="https://… (URL d'image)"
        value={value.url}
        onChange={(e) => onChange({ ...value, url: e.target.value })}
        style={inputStyle}
      />
      {value.url ? (
        <div style={{ marginTop: 8, height: 80, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`, background: "#000" }}>
          <img src={value.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Wizard view ────────────────────────────────────────────────────────────

type SectionKey = "profile" | "pseudo" | "deposit" | "bonus" | "card1" | "card2";

function WizardQuickView({
  initialInputs,
  initialPageId,
  initialSavedSlug,
  onCancel,
  onSaved,
  token,
}: {
  initialInputs: V3QuickInputs;
  initialPageId: number | null;
  initialSavedSlug: string | null;
  onCancel: () => void;
  onSaved: (saved: FsbAffiPage) => void;
  token: string;
}) {
  const [inputs, setInputs] = React.useState<V3QuickInputs>(initialInputs);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobilePreview, setIsMobilePreview] = React.useState(true);
  const [openSection, setOpenSection] = React.useState<SectionKey | null>(null);
  const [savedSlug, setSavedSlug] = React.useState<string | null>(initialSavedSlug);
  const [copyOk, setCopyOk] = React.useState(false);

  const page = React.useMemo(() => buildV3PageFromQuickInputs(inputs), [inputs]);

  const update = (patch: Partial<V3QuickInputs>) => setInputs((prev) => ({ ...prev, ...patch }));
  const toggleSection = (k: SectionKey) => setOpenSection((cur) => (cur === k ? null : k));

  const canSave = inputs.affiLink.trim().length > 0 && !!page.slug;

  const publicUrl = savedSlug ? `${window.location.origin}/r/${savedSlug}` : null;
  const handleCopy = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopyOk(true); setTimeout(() => setCopyOk(false), 1500); }
    catch { /* ignore */ }
  };

  // ─── Click-on-preview → ouvre la section correspondante ────────────────
  const editCtx = React.useMemo(() => ({
    selected: null,
    onSelect: (zone: any, indices: number[]) => {
      // Cards zone → indices[0]=container, indices[1]=card index
      if (zone === "cards" && indices.length >= 2) {
        setOpenSection(indices[1] === 0 ? "card1" : "card2");
        // scroll-into-view sera fait via effect ci-dessous
        return;
      }
      // aboveCards zone → on remonte au top-level (indices[0]) et on lit le
      // name pour décider quelle section ouvrir.
      if (zone === "aboveCards") {
        const top = page.zones.aboveCards[indices[0]] as any;
        const name: string = top?.name || "";
        if (name === "Wrapper image profil") setOpenSection("profile");
        else if (name === "Cadre pseudo") setOpenSection("pseudo");
        else if (name === "Ligne — Déposez X€") setOpenSection("deposit");
        else if (name === "Ligne — Jouer à Y€") setOpenSection("bonus");
      }
    },
  }), [page]);

  // Scroll auto vers la section ouverte côté form panel
  const sectionRefs = React.useRef<Record<SectionKey, HTMLDivElement | null>>({} as any);
  React.useEffect(() => {
    if (!openSection) return;
    const el = sectionRefs.current[openSection];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openSection]);

  const handleSave = async () => {
    if (!canSave) { setError("Lien d'affiliation requis."); return; }
    setSaving(true); setError(null);
    try {
      // On stocke les inputs du wizard dans le config pour ré-ouverture.
      const cfg: any = { ...page, [V3_MARKER]: true, [V3_INPUTS_KEY]: inputs };
      const payload = {
        slug: page.slug,
        model: 4,
        variant: null,
        brandName: page.casinoName || page.slug,
        title: page.pageTitle || page.casinoName || page.slug,
        config: cfg,
        editorVersion: 2,
      };
      const result = initialPageId
        ? await updateFsbAffiPage(token, initialPageId, payload)
        : await createFsbAffiPage(token, payload);
      setSavedSlug(result.item.slug);
      onSaved(result.item);
    } catch (e: any) {
      setError(e?.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", background: T.bgPanel, borderBottom: `1px solid ${T.border}`,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onCancel} style={btnGhost}>← Retour</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Wizard rapide — Modèle M1</div>
            <div style={{ fontSize: 12, color: T.textMute }}>Slug : <code>{page.slug || "(sans code d'affi)"}</code></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {error ? <div style={{ color: T.danger, fontSize: 13 }}>{error}</div> : null}
          {publicUrl ? (
            <>
              <button onClick={handleCopy} style={btnGhost} title={publicUrl}>
                {copyOk ? "✓ Copié" : "📋 Copier URL"}
              </button>
              <a href={publicUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                ↗ Ouvrir
              </a>
            </>
          ) : null}
          <button onClick={handleSave} disabled={!canSave || saving} style={{ ...btnPrimary, opacity: !canSave || saving ? 0.5 : 1 }}>
            {saving ? "Sauvegarde…" : initialPageId || savedSlug ? "Mettre à jour" : "Créer la page"}
          </button>
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 480px) 1fr", height: "calc(100vh - 60px)" }}>
        {/* Form panel */}
        <div style={{ borderRight: `1px solid ${T.border}`, padding: 20, overflowY: "auto", height: "100%", minHeight: 0 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: T.textMute, textTransform: "uppercase", letterSpacing: ".5px" }}>Informations</h3>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Modèle</label>
            <Chip active>M1</Chip>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Pseudo (optionnel)</label>
            <input type="text" value={inputs.pseudo || ""} onChange={(e) => update({ pseudo: e.target.value })} style={inputStyle} placeholder="ex: Jimmy" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Lien d'affiliation *</label>
            <input type="url" value={inputs.affiLink} onChange={(e) => update({ affiLink: e.target.value })} style={inputStyle} placeholder="https://celsius.games/UHyEqTtNlL" />
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
              Code détecté : <code>{page.affiCode || "(aucun — vérifie l'URL)"}</code>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Déposez X (€)</label>
              <input type="number" min={1} value={inputs.depositAmount}
                onChange={(e) => update({ depositAmount: Math.max(1, Number(e.target.value) || 1) })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Jouer à Y (€)</label>
              <input type="number" min={1} value={inputs.bonusAmount}
                onChange={(e) => update({ bonusAmount: Math.max(1, Number(e.target.value) || 1) })}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Sections dépliables */}
          <Accordion
            sectionRef={(el) => { sectionRefs.current.profile = el; }}
            label="Image de profil"
            hint={inputs.profileImageUrl ? "URL définie" : "Vide"}
            open={openSection === "profile"} onToggle={() => toggleSection("profile")}
          >
            <input type="url" value={inputs.profileImageUrl || ""}
              onChange={(e) => update({ profileImageUrl: e.target.value })}
              style={inputStyle} placeholder="https://… (laisser vide pour masquer)"
            />
            {inputs.profileImageUrl ? (
              <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                <img src={inputs.profileImageUrl} alt="" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #FFD700" }} />
              </div>
            ) : null}
          </Accordion>

          <Accordion
            sectionRef={(el) => { sectionRefs.current.card1 = el; }}
            label="Image — Carte 1"
            hint={V3_GAME_IMAGES.find((g) => g.key === inputs.card1Image.kind)?.label || "Custom"}
            open={openSection === "card1"} onToggle={() => toggleSection("card1")}
          >
            <GameImagePicker value={inputs.card1Image} onChange={(v) => update({ card1Image: v })} />
            <CardImageFormatControls inputs={inputs} update={update} />
          </Accordion>

          <Accordion
            sectionRef={(el) => { sectionRefs.current.card2 = el; }}
            label="Image — Carte 2"
            hint={V3_GAME_IMAGES.find((g) => g.key === inputs.card2Image.kind)?.label || "Custom"}
            open={openSection === "card2"} onToggle={() => toggleSection("card2")}
          >
            <GameImagePicker value={inputs.card2Image} onChange={(v) => update({ card2Image: v })} />
            <CardImageFormatControls inputs={inputs} update={update} />
          </Accordion>

          <h3 style={{ margin: "20px 0 10px", fontSize: 14, color: T.textMute, textTransform: "uppercase", letterSpacing: ".5px" }}>Style des textes</h3>

          {inputs.pseudo ? (
            <Accordion
              sectionRef={(el) => { sectionRefs.current.pseudo = el; }}
              label="Pseudo"
              open={openSection === "pseudo"} onToggle={() => toggleSection("pseudo")}
            >
              <LineStylePicker label="" value={inputs.pseudoStyle} onChange={(s) => update({ pseudoStyle: s })} />
            </Accordion>
          ) : null}
          <Accordion
            sectionRef={(el) => { sectionRefs.current.deposit = el; }}
            label="« Déposez X€ »"
            open={openSection === "deposit"} onToggle={() => toggleSection("deposit")}
          >
            <LineStylePicker label="" value={inputs.depositLineStyle} onChange={(s) => update({ depositLineStyle: s })} />
          </Accordion>
          <Accordion
            sectionRef={(el) => { sectionRefs.current.bonus = el; }}
            label="« Jouer à Y€ »"
            open={openSection === "bonus"} onToggle={() => toggleSection("bonus")}
          >
            <LineStylePicker label="" value={inputs.bonusLineStyle} onChange={(s) => update({ bonusLineStyle: s })} />
          </Accordion>
        </div>

        {/* Preview */}
        <div style={{ background: "#000", display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", minHeight: 0 }}>
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bgPanel, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: T.textMute, fontWeight: 600 }}>APERÇU LIVE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Chip active={isMobilePreview} onClick={() => setIsMobilePreview(true)}>📱 Mobile</Chip>
              <Chip active={!isMobilePreview} onClick={() => setIsMobilePreview(false)}>🖥 Desktop</Chip>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 0", minHeight: 0 }}>
            <div style={{
              width: isMobilePreview ? 420 : "min(720px, 100%)",
              maxWidth: isMobilePreview ? 420 : 720,
              margin: "0 auto",
              border: `1px solid ${T.border}`,
              borderRadius: isMobilePreview ? 24 : 8,
              overflow: "hidden",
              background: page.globals?.bgPage || "#080212",
            }}>
              <RenderV2Page page={page} isMobile={isMobilePreview} editCtx={editCtx as any} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function isV3Page(p: FsbAffiPage): boolean {
  return !!p.editorVersion && p.editorVersion >= 2 && !!(p.config && (p.config as any)[V3_MARKER]);
}

function DashboardView({
  pages, loading, onCreateQuick, onOpen, onDelete, onRefresh,
}: {
  pages: FsbAffiPage[];
  loading: boolean;
  onCreateQuick: () => void;
  onOpen: (p: FsbAffiPage) => void;
  onDelete: (p: FsbAffiPage) => void;
  onRefresh: () => void;
}) {
  const v3Pages = pages.filter(isV3Page);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", background: T.bgPanel, borderBottom: `1px solid ${T.border}`,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>FSN Editor — V3</div>
          <div style={{ fontSize: 12, color: T.textMute }}>Pages d'affiliation rapides (M1 = M4 V1)</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRefresh} style={btnGhost}>↻ Rafraîchir</button>
          <button onClick={onCreateQuick} style={btnPrimary}>+ Créer une page</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>
          Mes pages V3 <span style={{ fontSize: 14, color: T.textMute, fontWeight: 500 }}>· {v3Pages.length}</span>
        </h2>

        {loading ? (
          <div style={{ color: T.textMute, padding: 24, textAlign: "center" }}>Chargement…</div>
        ) : v3Pages.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            border: `1px dashed ${T.borderHi}`, borderRadius: 12, color: T.textMute,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>Aucune page V3 pour l'instant</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>Crée ta première page rapide en quelques secondes.</div>
            <button onClick={onCreateQuick} style={btnPrimary}>+ Créer une page</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {v3Pages.map((p) => {
              const inputs: V3QuickInputs | null = (p.config as any)?.[V3_INPUTS_KEY] || null;
              return (
                <div key={p.id} style={{
                  background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 12,
                  padding: 16, display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.brandName || p.slug}</div>
                    <span style={{ fontSize: 10, color: T.gold, background: `${T.gold}22`, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>V3</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.textMute }}>
                    /r/<code>{p.slug}</code>
                  </div>
                  {inputs ? (
                    <div style={{ fontSize: 12, color: T.textMute }}>
                      Déposez {inputs.depositAmount}€ → Jouer à {inputs.bonusAmount}€
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => onOpen(p)} style={{ ...btnGhost, flex: 1 }}>Modifier</button>
                    <a href={`/r/${p.slug}`} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none", textAlign: "center" }}>↗</a>
                    <button onClick={() => { if (confirm(`Supprimer "${p.brandName}" ?`)) onDelete(p); }} style={btnDanger}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Creation choice modal ──────────────────────────────────────────────────

function CreateChoiceModal({ onChoose, onCancel }: { onChoose: (mode: "quick" | "custom") => void; onCancel: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
      display: "grid", placeItems: "center", zIndex: 100, padding: 20,
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 14,
        padding: 28, maxWidth: 520, width: "100%",
      }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Créer une page</h3>
        <p style={{ color: T.textMute, fontSize: 14, marginTop: 8, marginBottom: 20 }}>
          Choisis ton mode de création.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <button onClick={() => onChoose("quick")} style={{
            background: T.bgPanel2, border: `1px solid ${T.borderHi}`, borderRadius: 10,
            padding: 16, textAlign: "left", cursor: "pointer", color: T.text,
          }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>⚡ Rapide</div>
            <div style={{ fontSize: 13, color: T.textMute }}>
              Wizard guidé : pseudo, lien d'affi, X/Y, image de profil, choix images cards. Page prête en 30 s.
            </div>
          </button>
          <button onClick={() => onChoose("custom")} style={{
            background: T.bgPanel2, border: `1px solid ${T.border}`, borderRadius: 10,
            padding: 16, textAlign: "left", cursor: "pointer", color: T.text, opacity: 0.65,
          }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🎨 Personnalisé</div>
            <div style={{ fontSize: 13, color: T.textMute }}>
              Éditeur bloc-par-bloc complet (V2). <em style={{ color: T.gold }}>Disponible — ouvre l'éditeur V2.</em>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button onClick={onCancel} style={btnGhost}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function EditorV3Page() {
  const { user, token } = useAuth();
  const allowed = !!user && FSB_ALLOWED_IDS.has(user.id);

  const [view, setView] = React.useState<"dashboard" | "wizard">("dashboard");
  const [pages, setPages] = React.useState<FsbAffiPage[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [showCreateChoice, setShowCreateChoice] = React.useState(false);

  const [wizardInputs, setWizardInputs] = React.useState<V3QuickInputs>(defaultV3QuickInputs());
  const [wizardPageId, setWizardPageId] = React.useState<number | null>(null);
  const [wizardSavedSlug, setWizardSavedSlug] = React.useState<string | null>(null);

  const refreshList = React.useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const r = await listFsbAffiPages(token);
      setPages(r.items);
    } catch { /* noop */ } finally { setLoadingList(false); }
  }, [token]);

  React.useEffect(() => { void refreshList(); }, [refreshList]);

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

  const handleCreateQuick = () => {
    setWizardInputs(defaultV3QuickInputs());
    setWizardPageId(null);
    setWizardSavedSlug(null);
    setView("wizard");
    setShowCreateChoice(false);
  };

  const handleOpen = (p: FsbAffiPage) => {
    const stored = (p.config as any)?.[V3_INPUTS_KEY] as V3QuickInputs | undefined;
    setWizardInputs(stored || defaultV3QuickInputs());
    setWizardPageId(p.id);
    setWizardSavedSlug(p.slug);
    setView("wizard");
  };

  const handleDelete = async (p: FsbAffiPage) => {
    if (!token) return;
    try { await deleteFsbAffiPage(token, p.id); void refreshList(); } catch { /* noop */ }
  };

  const handleSaved = (saved: FsbAffiPage) => {
    void refreshList();
    setWizardPageId(saved.id);
    setWizardSavedSlug(saved.slug);
    // Pas d'alert — le bouton "Copier URL" + "Ouvrir" apparaissent dans la topbar.
  };

  if (view === "wizard" && token) {
    return (
      <WizardQuickView
        initialInputs={wizardInputs}
        initialPageId={wizardPageId}
        initialSavedSlug={wizardSavedSlug}
        onCancel={() => setView("dashboard")}
        onSaved={handleSaved}
        token={token}
      />
    );
  }

  return (
    <>
      <DashboardView
        pages={pages}
        loading={loadingList}
        onCreateQuick={() => setShowCreateChoice(true)}
        onOpen={handleOpen}
        onDelete={handleDelete}
        onRefresh={refreshList}
      />
      {showCreateChoice ? (
        <CreateChoiceModal
          onChoose={(mode) => {
            if (mode === "quick") handleCreateQuick();
            else { window.open("/editorFSNV2", "_blank"); setShowCreateChoice(false); }
          }}
          onCancel={() => setShowCreateChoice(false)}
        />
      ) : null}
    </>
  );
}
