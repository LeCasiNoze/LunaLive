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
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { RenderV2Page } from "../lib/editor_v2_render";
import {
  buildV3PageDispatch,
  defaultV3QuickInputs,
  V3_FONT_PRESETS, V3_ANIMATION_PRESETS, V3_EFFECT_PRESETS,
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
  getFsbAffiStatsSummary,
  getFsbAffiDailyStats,
  fetchSocialProfile,
  type AffiDailyPoint,
  type FsbAffiPage, type AffiPageStats,
} from "../lib/api_affi_pages";
import {
  buildM5V1ConfigForSave,
  M5V1_VARIANTS,
} from "../lib/m5_v1_apply";
import { M1_THEMES } from "../lib/m1_themes";
import { V3_PENALTY_TEAMS } from "../lib/v3_penalty_teams";
import { M5V1Preview } from "../components/M5V1Preview";

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
  hideColor,
}: {
  label: string;
  value: V3LineStyle | undefined;
  onChange: (s: V3LineStyle) => void;
  /** Quand true (theme global actif) : la couleur est imposée par le thème,
   *  on cache la sous-section "Couleur" pour éviter la confusion. */
  hideColor?: boolean;
}) {
  const v: V3LineStyle = value || {};
  const [customColor, setCustomColor] = React.useState(v.color || "");

  return (
    <div style={{ background: label ? T.bgPanel2 : "transparent", border: label ? `1px solid ${T.border}` : "none", borderRadius: 10, padding: label ? 12 : 0, marginTop: label ? 8 : 0 }}>
      {label ? <div style={{ fontSize: 12, fontWeight: 700, color: T.textMute, marginBottom: 10 }}>{label}</div> : null}

      <div style={{ marginBottom: 10 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>Police</div>
        <select
          value={v.font || ""}
          onChange={(e) => onChange({ ...v, font: e.target.value || undefined })}
          style={{
            ...inputStyle,
            appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
            paddingRight: 32,
            backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23999' stroke-width='1.6'><path d='M2 4l4 4 4-4'/></svg>\")",
            backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", backgroundSize: "12px",
            cursor: "pointer",
            fontFamily: v.font ? `"${v.font}", system-ui` : undefined,
          }}
        >
          <option value="">— Défaut —</option>
          {V3_FONT_PRESETS.map((f) => (
            <option key={f.key} value={f.family} style={{ fontFamily: `"${f.family}", system-ui` }}>{f.label}</option>
          ))}
        </select>
      </div>

      {hideColor ? null : (
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
      )}

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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Habillage texte</div>
          <select
            value={v.effect || "plain"}
            onChange={(e) => onChange({ ...v, effect: e.target.value as any })}
            style={{
              ...inputStyle,
              appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 28,
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23999' stroke-width='1.6'><path d='M2 4l4 4 4-4'/></svg>\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "11px", cursor: "pointer",
            }}
          >
            {V3_EFFECT_PRESETS.map((eff) => (
              <option key={eff.key} value={eff.key}>{eff.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Animation</div>
          <select
            value={v.animation || "none"}
            onChange={(e) => onChange({ ...v, animation: e.target.value as any })}
            style={{
              ...inputStyle,
              appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 28,
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23999' stroke-width='1.6'><path d='M2 4l4 4 4-4'/></svg>\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "11px", cursor: "pointer",
            }}
          >
            {V3_ANIMATION_PRESETS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
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

type SectionKey = "profile" | "pseudo" | "deposit" | "bonus" | "card1" | "card2" | "amounts" | "visual" | "background" | "color";

function SocialProfileLoader({
  token, update,
}: {
  token: string;
  update: (patch: Partial<V3QuickInputs>) => void;
}) {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: "idle" | "ok" | "error"; msg?: string }>({ kind: "idle" });

  const fetchProfile = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setStatus({ kind: "idle" });
    try {
      const r = await fetchSocialProfile(token, url.trim());
      update({
        socialHandle: r.socialHandle,
        followersCount: r.followersLabel || (r.followers != null ? String(r.followers) : ""),
      });
      setStatus({ kind: "ok", msg: `${r.network || "social"} · ${r.socialHandle}${r.followersLabel ? ` · ${r.followersLabel} followers` : ""}` });
    } catch (e: any) {
      const msg = (e?.message || "").toLowerCase();
      const friendly = msg.includes("no_handle") ? "URL invalide"
        : msg.includes("fetch_failed") ? "Profil inaccessible (privé ou bloqué)"
        : "Erreur — saisis le handle et followers à la main";
      setStatus({ kind: "error", msg: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      marginBottom: 14, padding: 12, border: `1px solid ${T.border}`, borderRadius: 10, background: T.bgInput,
    }}>
      <label style={labelStyle}>Auto-remplir handle + followers</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tiktok.com/@xxx  ou  instagram.com/xxx"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fetchProfile(); } }}
        />
        <button
          type="button"
          onClick={fetchProfile}
          disabled={loading || !url.trim()}
          style={{ ...btnPrimary, padding: "8px 12px", fontSize: 12, opacity: loading ? .6 : 1 }}
        >
          {loading ? "..." : "Récupérer"}
        </button>
      </div>
      {status.kind === "ok" ? (
        <div style={{ marginTop: 6, fontSize: 11, color: T.ok }}>✓ {status.msg}</div>
      ) : status.kind === "error" ? (
        <div style={{ marginTop: 6, fontSize: 11, color: T.danger }}>⚠ {status.msg}</div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, color: T.textDim }}>
          Colle un lien TikTok ou Instagram, on extrait @handle + nb de followers.
        </div>
      )}
    </div>
  );
}

// Domaine alternatif de publication (site landaurax.com — pubication-only,
// branche sur la meme API LunaLive). Surchargeable via env. La route publique
// la-bas est `/:slug` (pas `/r/:slug`).
const LANDAURAX_SITE_URL = ((import.meta.env.VITE_LANDAURAX_SITE_URL as string | undefined) ?? "https://landaurax.onrender.com").replace(/\/$/, "");
function publicUrlFor(slug: string, domain: "lunalive" | "landaurax"): string {
  if (domain === "landaurax") return `${LANDAURAX_SITE_URL}/${slug}`;
  return `${window.location.origin}/r/${slug}`;
}

function WizardQuickView({
  initialInputs,
  initialPageId,
  initialSavedSlug,
  initialPublishDomain,
  onCancel,
  onSaved,
  token,
}: {
  initialInputs: V3QuickInputs;
  initialPageId: number | null;
  initialSavedSlug: string | null;
  initialPublishDomain: "lunalive" | "landaurax";
  onCancel: () => void;
  onSaved: (saved: FsbAffiPage) => void;
  token: string;
}) {
  const [inputs, setInputs] = React.useState<V3QuickInputs>(initialInputs);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobilePreview, setIsMobilePreview] = React.useState(true);
  const previewWrapRef = React.useRef<HTMLDivElement>(null);
  const [openSection, setOpenSection] = React.useState<SectionKey | null>(null);
  const [savedSlug, setSavedSlug] = React.useState<string | null>(initialSavedSlug);
  const [publishDomain, setPublishDomain] = React.useState<"lunalive" | "landaurax">(initialPublishDomain);
  const [copyOk, setCopyOk] = React.useState(false);
  // Local pageId state — pour eviter la closure-trap : apres POST, on stocke
  // l'ID retourne par le serveur. Le prochain save lit cette valeur (pas
  // initialPageId qui pourrait etre stale dans le closure).
  const [pageId, setPageId] = React.useState<number | null>(initialPageId);
  // Sync si le parent change la prop (ex: ouverture d'une autre page existante)
  React.useEffect(() => { setPageId(initialPageId); }, [initialPageId]);

  // Page V2 (uniquement M1). Pour M2 on saute la construction.
  const page = React.useMemo(
    () => inputs.modelKind === "M2" ? null : buildV3PageDispatch(inputs),
    [inputs]
  );

  // Slug commun M1/M2 = <code>V3 (collision auto-renommée par l'API).
  const computedSlug = React.useMemo(() => {
    try {
      const u = new URL(inputs.affiLink);
      const code = (u.pathname.split("/").filter(Boolean).pop() || "")
        .replace(/[^A-Za-z0-9_-]/g, "");
      return code ? `${code}V3` : "";
    } catch { return ""; }
  }, [inputs.affiLink]);

  const update = (patch: Partial<V3QuickInputs>) => setInputs((prev) => ({ ...prev, ...patch }));
  const toggleSection = (k: SectionKey) => setOpenSection((cur) => (cur === k ? null : k));

  const canSave = inputs.affiLink.trim().length > 0 && !!computedSlug;

  const publicUrl = savedSlug ? publicUrlFor(savedSlug, publishDomain) : null;
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
        const top = page?.zones.aboveCards[indices[0]] as any;
        const name: string = top?.name || "";
        if (name === "Wrapper image profil") setOpenSection("profile");
        else if (name === "Cadre pseudo") setOpenSection("pseudo");
        else if (name === "Ligne — Déposez X€") setOpenSection("deposit");
        else if (name === "Ligne — Recevez Y€") setOpenSection("bonus");
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
      // Slug : sur premier save (creation), on calcule depuis affiLink.
      // Sur les saves suivants (page deja existante), on conserve le slug
      // serveur pour ne pas changer l'URL publique apres chaque "Mettre a
      // jour" (sinon les bookmarks/liens partages se cassent).
      const slugToSend = (pageId && savedSlug) ? savedSlug : computedSlug;
      // Nom de page : custom > pseudo > fallback (computedSlug)
      const displayName = (inputs.customPageName?.trim() || inputs.pseudo?.trim() || "").trim();
      let payload;
      if (inputs.modelKind !== "M2" && page) {
        // M1 + M3-M6 : sauvegarde V2 (zones + blocks) avec marqueurs V3
        const cfg: any = { ...page, [V3_MARKER]: true, [V3_INPUTS_KEY]: inputs };
        payload = {
          slug: slugToSend,
          model: 4,
          variant: null,
          brandName: displayName || page.casinoName || slugToSend,
          title: page.pageTitle || displayName || page.casinoName || slugToSend,
          config: cfg,
          editorVersion: 2,
          publishDomain,
        };
      } else {
        // M2 : sauvegarde V1 (Config flat) avec model=5, variant=goldenVariant.
        // Marqueurs V3 stockés au même niveau (sérialisables JSON).
        const variant = inputs.m5Variant || "gold";
        const v1Cfg = buildM5V1ConfigForSave({
          affiLink: inputs.affiLink,
          pseudo: inputs.pseudo,
          depositAmount: inputs.depositAmount,
          bonusAmount: inputs.bonusAmount,
          profileImageUrl: inputs.profileImageUrl,
          chestUrl: inputs.m5ChestUrl,
          jeuxUrl: inputs.m5JeuxUrl,
          visualMode: inputs.m5VisualMode,
          backgroundUrl: inputs.m5BackgroundUrl,
          telegramUrl: inputs.telegramUrl,
        });
        const cfg: any = {
          ...v1Cfg,
          [V3_MARKER]: "1",
          [V3_INPUTS_KEY]: JSON.stringify(inputs),
        };
        const brand = displayName || inputs.pseudo?.trim() || computedSlug;
        payload = {
          slug: slugToSend,
          model: 5,
          variant,
          brandName: brand,
          title: brand,
          config: cfg,
          editorVersion: 1,
          publishDomain,
        };
      }
      // Sur PUT 404 (page deja supprimee depuis le dashboard ou autre tab),
      // fallback automatique sur POST pour recreer. Le slug auto-renome avec
      // suffixe -2 si collision (cf resolveUniqueSlug cote API).
      let result;
      if (pageId) {
        try {
          result = await updateFsbAffiPage(token, pageId, payload);
        } catch (err: any) {
          const msg = String(err?.message || "");
          if (msg === "not_found" || msg.includes("404")) {
            // La page a disparu cote serveur -> on recree (POST)
            // En forcant slug=null cote payload, le backend regenere depuis
            // affiCode + suffixe -N si collision (au lieu d'echouer sur UNIQUE).
            const recreatePayload = { ...payload, slug: payload.slug };
            result = await createFsbAffiPage(token, recreatePayload);
          } else {
            throw err;
          }
        }
      } else {
        result = await createFsbAffiPage(token, payload);
      }
      setSavedSlug(result.item.slug);
      setPageId(result.item.id);
      onSaved(result.item);
    } catch (e: any) {
      const msg = e?.message || "Erreur de sauvegarde";
      // Messages plus parlants pour l'utilisateur
      const friendly =
        msg === "not_found" ? "La page n'existe plus côté serveur — réessaie, elle sera recréée."
        : msg.includes("UNIQUE") || msg.includes("duplicate") ? "Conflit de slug — un autre page utilise déjà ce lien d'affi."
        : msg;
      setError(friendly);
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>Wizard rapide — Modèle {inputs.modelKind}</div>
            <div style={{ fontSize: 12, color: T.textMute }}>Slug : <code>{computedSlug || "(sans code d'affi)"}</code></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {error ? <div style={{ color: T.danger, fontSize: 13 }}>{error}</div> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.bg }}>
            <span style={{ fontSize: 10, color: T.textMute, marginRight: 4, letterSpacing: ".5px" }}>PUBLIER&nbsp;SUR</span>
            <button
              type="button"
              onClick={() => setPublishDomain("lunalive")}
              style={{
                background: publishDomain === "lunalive" ? T.gold : "transparent",
                color: publishDomain === "lunalive" ? "#000" : T.textMute,
                border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
              title="lunalive.win/r/<slug>"
            >
              LunaLive
            </button>
            <button
              type="button"
              onClick={() => setPublishDomain("landaurax")}
              style={{
                background: publishDomain === "landaurax" ? "#e0115f" : "transparent",
                color: publishDomain === "landaurax" ? "#fff" : T.textMute,
                border: "none", padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
              title="landaurax.onrender.com/<slug>"
            >
              Landaurax
            </button>
          </div>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12", "M13", "M15"] as const).map((k) => (
                <Chip key={k} active={inputs.modelKind === k} onClick={() => update({ modelKind: k })}>{k}</Chip>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 6, lineHeight: 1.5 }}>
              {inputs.modelKind === "M1" && "M1 = M4 V1 (offre VIP doublée + cards promo + reviews)"}
              {inputs.modelKind === "M2" && "M2 = M5 V1 (golden chance, 8 variants couleur)"}
              {inputs.modelKind === "M3" && "M3 = Roue à tourner — segments néon, bonus à l'arrivée"}
              {inputs.modelKind === "M4" && "M4 = Loot Box Opening — coffre s'ouvre, rail d'items défile et stoppe sur ton bonus (style case CSGO)"}
              {inputs.modelKind === "M5" && "M5 = Slot Machine 3×3 — ligne bonus centrale"}
              {inputs.modelKind === "M6" && "M6 = Mines 3×3 sans bombe"}
              {inputs.modelKind === "M7" && "M7 = Lucky Cards — 5 cartes face cachée, retourne-les pour accumuler multiplier, cash out avant BUST"}
              {inputs.modelKind === "M8" && "M8 = Penalty — thème d'équipe configurable"}
              {inputs.modelKind === "M9" && "M9 = Crossy Road — checkpoint 100%"}
              {inputs.modelKind === "M10" && "M10 = Cyclope — storytelling rose/or (halo, hero card, FAQ)"}
              {inputs.modelKind === "M11" && "M11 = Aurix — aurora + spotlight + parallax + magnetic CTA"}
              {inputs.modelKind === "M12" && "M12 = Paliers VIP — Bronze→Diamond, bonus 100% scalé + places restantes + capture email VIP gros joueurs"}
              {inputs.modelKind === "M13" && "M13 = S1 Celsius — mini-site premium FR/EN (welcome package 4 paliers, VIP host, payments, FAQ) — pseudo + image facultatifs"}
              {inputs.modelKind === "M15" && "M15 = Cyclope (Lovable) — landing l'Héritier importée telle quelle (header + hero + steps + gains + témoignages + FAQ + sticky CTA)"}
            </div>
          </div>

          {inputs.modelKind === "M2" ? (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Variant (couleur)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {M5V1_VARIANTS.map((v) => (
                  <Chip
                    key={v.value}
                    active={inputs.m5Variant === v.value}
                    color={v.accent}
                    onClick={() => update({ m5Variant: v.value })}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: v.accent, display: "inline-block" }} />
                      {v.label}
                    </span>
                  </Chip>
                ))}
              </div>
              <div style={{ display: "none", fontSize: 11, color: T.textDim, marginTop: 6, paddingLeft: 26 }}>
                DÃ©cochÃ© = le bouton "AccÃ¨s VIP" et le mini lien sticky restent masquÃ©s. CochÃ© = ils rÃ©apparaissent.
              </div>
            </div>
          ) : null}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Pseudo (optionnel){(inputs.modelKind === "M10" || inputs.modelKind === "M11") ? " · ligne 1" : ""}
            </label>
            <input type="text" value={inputs.pseudo || ""} onChange={(e) => update({ pseudo: e.target.value })} style={inputStyle} placeholder={inputs.modelKind === "M10" ? "ex: CYCLOPE" : inputs.modelKind === "M11" ? "ex: AURIX" : "ex: Jimmy"} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nom dans le dashboard (optionnel)</label>
            <input
              type="text"
              value={inputs.customPageName || ""}
              onChange={(e) => update({ customPageName: e.target.value })}
              style={inputStyle}
              placeholder={inputs.pseudo?.trim() ? `Par défaut : ${inputs.pseudo}` : "ex: Alex Invest (sert juste à s'y retrouver)"}
            />
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
              Sert d'identifiant dans "Mes pages V3". Si vide, on prend le pseudo, sinon l'affi code.
            </div>
          </div>

          {inputs.modelKind === "M2" ? (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Lien Telegram (optionnel)</label>
              <input
                type="url"
                value={inputs.telegramUrl || ""}
                onChange={(e) => update({ telegramUrl: e.target.value })}
                style={inputStyle}
                placeholder="https://t.me/ton_canal"
              />
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                Affiche un 2e bouton "Rejoindre le Telegram" sous le CTA principal.
              </div>
            </div>
          ) : null}

          {(inputs.modelKind === "M10" || inputs.modelKind === "M11") ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Pseudo ligne 2 (optionnel)</label>
                <input type="text" value={inputs.pseudoSub || ""} onChange={(e) => update({ pseudoSub: e.target.value })} style={inputStyle} placeholder="ex: L'HÉRITIER (laisser vide si pseudo sur 1 ligne)" />
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                  2e ligne en cream solide letterspaced, sous la ligne chrome.
                </div>
              </div>
              {token ? <SocialProfileLoader token={token} update={update} /> : null}
            </>
          ) : null}

          {inputs.modelKind === "M10" ? (
            <div style={{ marginBottom: 14, padding: 12, background: T.bgPanel2, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: T.text }}>
                <input
                  type="checkbox"
                  checked={typeof inputs.showVip === "boolean" ? inputs.showVip : !(inputs.hideVip ?? false)}
                  onChange={(e) => update({ showVip: e.target.checked, hideVip: undefined })}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <span><strong>Afficher le block VIP</strong> (teaser principal + mini sticky)</span>
              </label>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 6, paddingLeft: 26 }}>
                Decoche = le bouton VIP et le mini lien sticky restent masques. Coche = ils reapparaissent.
              </div>
              <div style={{ display: "none", fontSize: 11, color: T.textDim, marginTop: 6, paddingLeft: 26 }}>
                DÃ©cochÃ© = le bouton "AccÃ¨s VIP" et le mini lien sticky restent masquÃ©s. CochÃ© = ils rÃ©apparaissent.
              </div>
              <div style={{ display: "none", fontSize: 11, color: T.textDim, marginTop: 6, paddingLeft: 26 }}>
                Retire entièrement le bouton "Accès VIP" + le mini lien sous le sticky CTA. Le popup VIP n'est jamais déclenché.
              </div>
            </div>
          ) : null}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Lien d'affiliation *</label>
            <input type="url" value={inputs.affiLink} onChange={(e) => update({ affiLink: e.target.value })} style={inputStyle} placeholder="https://celsius.games/UHyEqTtNlL" />
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
              Code détecté : <code>{(computedSlug.replace(/V3$/, "")) || "(aucun — vérifie l'URL)"}</code>
            </div>
          </div>

          <div ref={(el) => { sectionRefs.current.amounts = el; }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Déposez X (€)</label>
              <input
                type="number"
                value={inputs.depositAmount ?? ""}
                placeholder="vide = caché"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return update({ depositAmount: null });
                  const n = Number(raw);
                  update({ depositAmount: Number.isFinite(n) ? n : null });
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Jouer à Y (€)</label>
              <input
                type="number"
                value={inputs.bonusAmount ?? ""}
                placeholder="vide = caché"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return update({ bonusAmount: null });
                  const n = Number(raw);
                  update({ bonusAmount: Number.isFinite(n) ? n : null });
                }}
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

          {inputs.modelKind !== "M2" ? (
            <>
              {inputs.modelKind === "M1" ? (
                <>
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
                </>
              ) : null}

              <h3 style={{ margin: "20px 0 10px", fontSize: 14, color: T.textMute, textTransform: "uppercase", letterSpacing: ".5px" }}>Couleur & thème</h3>

              <Accordion
                sectionRef={(el) => { sectionRefs.current.color = el; }}
                label="Couleur du site"
                hint={inputs.m1UseTheme !== false
                  ? (M1_THEMES.find((t) => t.key === (inputs.m1Theme || "gold"))?.label || "Or")
                  : "Custom (par texte)"}
                open={openSection === "color"} onToggle={() => toggleSection("color")}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13, color: T.text, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inputs.m1UseTheme !== false}
                    onChange={(e) => update({ m1UseTheme: e.target.checked })}
                  />
                  <span><strong>Thématique</strong> — applique une palette globale (pseudo, Recevez Y€, JOUER, accent reviews/FAQ).</span>
                </label>

                {inputs.m1UseTheme !== false ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ ...labelStyle, marginBottom: 6 }}>Variant</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {M1_THEMES.map((th) => (
                        <Chip
                          key={th.key}
                          active={(inputs.m1Theme || "gold") === th.key}
                          color={th.accent}
                          onClick={() => update({ m1Theme: th.key })}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: th.accent, display: "inline-block" }} />
                            {th.label}
                          </span>
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(inputs.modelKind === "M10" || inputs.modelKind === "M11") ? (
                  <>
                    <div style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Handle social (pill)</label>
                        <input type="text" value={inputs.socialHandle || ""}
                          onChange={(e) => update({ socialHandle: e.target.value })}
                          placeholder="@pseudo"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Nb followers (pill)</label>
                        <input type="text" value={inputs.followersCount || ""}
                          onChange={(e) => update({ followersCount: e.target.value })}
                          placeholder="250K"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Image hero du jeu</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        <Chip
                          active={inputs.gameImageUrl === "/affi_templates/cyclope/chicken.jpg"}
                          onClick={() => update({ gameImageUrl: "/affi_templates/cyclope/chicken.jpg" })}
                        >
                          Cyclope (défaut)
                        </Chip>
                        {V3_GAME_IMAGES.map((g) => {
                          const isActive = inputs.gameImageUrl === g.url;
                          return (
                            <Chip
                              key={g.key}
                              active={isActive}
                              onClick={() => update({ gameImageUrl: g.url })}
                            >
                              {g.label}
                            </Chip>
                          );
                        })}
                      </div>
                      <input type="url" value={inputs.gameImageUrl || ""}
                        onChange={(e) => update({ gameImageUrl: e.target.value })}
                        placeholder="ou colle une URL custom…"
                        style={inputStyle}
                      />
                      {inputs.gameImageUrl ? (
                        <div style={{ marginTop: 8 }}>
                          <img src={inputs.gameImageUrl} alt="" style={{ width: "100%", maxWidth: 200, aspectRatio: "1/1", objectFit: "cover", borderRadius: 12, border: "1px solid #FFB930" }} />
                        </div>
                      ) : null}
                    </div>
                    <div style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Sticker top hero</label>
                        <input type="text" value={inputs.gameLabel || ""}
                          onChange={(e) => update({ gameLabel: e.target.value })}
                          placeholder="🐔 JEU DU POULET"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>% bonus inclus</label>
                        <input type="text" value={inputs.gameBonusPct || ""}
                          onChange={(e) => update({ gameBonusPct: e.target.value })}
                          placeholder="550%"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 14 }}>
                      Tous les champs sont optionnels. Vides = masqués / placeholder neutre.
                    </div>
                  </>
                ) : null}

                {inputs.modelKind === "M8" ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ ...labelStyle, marginBottom: 6 }}>Équipe penalty</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {V3_PENALTY_TEAMS.map((team) => (
                        <Chip
                          key={team.key}
                          active={(inputs.penaltyTeam || "france") === team.key}
                          color={team.accent}
                          onClick={() => update({ penaltyTeam: team.key })}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: team.accent, display: "inline-block" }} />
                            {team.label}
                          </span>
                        </Chip>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
                      Applique la palette du stade, du gardien, du bouton principal et des sections basses.
                    </div>
                  </div>
                ) : null}

                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Fond du site</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="color"
                      value={inputs.m1CustomBgPage || "#080212"}
                      onChange={(e) => update({ m1CustomBgPage: e.target.value })}
                      style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
                    />
                    <input
                      type="text"
                      value={inputs.m1CustomBgPage || ""}
                      onChange={(e) => update({ m1CustomBgPage: e.target.value })}
                      placeholder="vide = couleur du thème"
                      style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
                    />
                    {inputs.m1CustomBgPage ? (
                      <button onClick={() => update({ m1CustomBgPage: "" })} style={btnGhost}>Reset</button>
                    ) : null}
                  </div>
                </div>
              </Accordion>

              {/* Style des textes — pseudo visible pour M1 + M3-M6 (mais pas M2).
                  Lignes Déposez/Recevez : uniquement M1 (M3-M6 baked in game). */}
              <h3 style={{ margin: "20px 0 10px", fontSize: 14, color: T.textMute, textTransform: "uppercase", letterSpacing: ".5px" }}>Style des textes</h3>

              {inputs.pseudo ? (
                <Accordion
                  sectionRef={(el) => { sectionRefs.current.pseudo = el; }}
                  label="Pseudo"
                  open={openSection === "pseudo"} onToggle={() => toggleSection("pseudo")}
                >
                  <LineStylePicker label="" value={inputs.pseudoStyle} onChange={(s) => update({ pseudoStyle: s })} hideColor={inputs.m1UseTheme !== false} />
                </Accordion>
              ) : null}

              {inputs.modelKind === "M1" ? (
                <>
                  <Accordion
                    sectionRef={(el) => { sectionRefs.current.deposit = el; }}
                    label="« Déposez X€ »"
                    open={openSection === "deposit"} onToggle={() => toggleSection("deposit")}
                  >
                    <LineStylePicker label="" value={inputs.depositLineStyle} onChange={(s) => update({ depositLineStyle: s })} />
                  </Accordion>
                  <Accordion
                    sectionRef={(el) => { sectionRefs.current.bonus = el; }}
                    label="« Recevez Y€ »"
                    open={openSection === "bonus"} onToggle={() => toggleSection("bonus")}
                  >
                    <LineStylePicker label="" value={inputs.bonusLineStyle} onChange={(s) => update({ bonusLineStyle: s })} hideColor={inputs.m1UseTheme !== false} />
                  </Accordion>
                </>
              ) : null}
            </>
          ) : null}

          {inputs.modelKind === "M2" ? (
            <>
              <h3 style={{ margin: "20px 0 10px", fontSize: 14, color: T.textMute, textTransform: "uppercase", letterSpacing: ".5px" }}>Visuel & images</h3>

              <div ref={(el) => { sectionRefs.current.visual = el; }} style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Mode visuel</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <Chip active={(inputs.m5VisualMode || "chest") === "chest"} onClick={() => update({ m5VisualMode: "chest" })}>Coffre</Chip>
                  <Chip active={inputs.m5VisualMode === "jeux"} onClick={() => update({ m5VisualMode: "jeux" })}>Jeux</Chip>
                  <Chip active={inputs.m5VisualMode === "none"} onClick={() => update({ m5VisualMode: "none" })}>Aucun</Chip>
                </div>
              </div>

              {(inputs.m5VisualMode || "chest") === "chest" ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>URL coffre custom (optionnel)</label>
                  <input type="url"
                    value={inputs.m5ChestUrl || ""}
                    onChange={(e) => update({ m5ChestUrl: e.target.value })}
                    style={inputStyle}
                    placeholder="https://… (laisser vide = chest du variant)"
                  />
                </div>
              ) : null}

              {inputs.m5VisualMode === "jeux" ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>URL image jeux</label>
                  <input type="url"
                    value={inputs.m5JeuxUrl || ""}
                    onChange={(e) => update({ m5JeuxUrl: e.target.value })}
                    style={inputStyle}
                    placeholder="https://… (laisser vide = jeux du variant)"
                  />
                </div>
              ) : null}

              <div ref={(el) => { sectionRefs.current.background = el; }} style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Background hero (optionnel)</label>
                <input type="url"
                  value={inputs.m5BackgroundUrl || ""}
                  onChange={(e) => update({ m5BackgroundUrl: e.target.value })}
                  style={inputStyle}
                  placeholder="https://… (laisser vide = background variant)"
                />
              </div>

              <div style={{ background: T.bgPanel2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginTop: 8, fontSize: 12, color: T.textMute }}>
                💡 Le pseudo, X et Y sont mappés sur les champs M5 V1 (brand, deposit, bonus). Le total = X + Y est calculé automatiquement. Pour fine-tuning avancé (textures, animations, sections custom), ouvrir la page dans <code>/editorFSN</code>.
              </div>
            </>
          ) : null}
        </div>

        {/* Preview */}
        <div style={{ background: "#000", display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", minHeight: 0 }}>
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bgPanel, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: T.textMute, fontWeight: 600 }}>APERÇU LIVE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Chip active={isMobilePreview} onClick={() => setIsMobilePreview(true)}>📱 Mobile</Chip>
              <Chip active={!isMobilePreview} onClick={() => setIsMobilePreview(false)}>🖥 Desktop</Chip>
              <button
                type="button"
                onClick={() => exportV3PreviewAsHtml(previewWrapRef.current, page, inputs.modelKind)}
                title="Exporter le HTML autonome de l'aperçu courant"
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
                  background: "linear-gradient(135deg,#FFB930,#FF4B6E)", color: "#1a0510", border: "1px solid #FFB930",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >⬇ Export HTML</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 0", minHeight: 0 }}>
            <div ref={previewWrapRef} style={{
              width: isMobilePreview ? 420 : "min(720px, 100%)",
              maxWidth: isMobilePreview ? 420 : 720,
              margin: "0 auto",
              border: `1px solid ${T.border}`,
              borderRadius: isMobilePreview ? 24 : 8,
              overflow: "hidden",
              // Cree un nouveau containing block pour position:fixed → tous les
              // sticky/social-proof "fixed" des modeles M3-M10 restent confines
              // dans le preview au lieu de coller a la fenetre.
              transform: "translateZ(0)",
              background: inputs.modelKind === "M2" ? "#0f0d14" : (page?.globals?.bgPage || "#080212"),
              // M2 (iframe) a besoin d'une hauteur fixe pour scroller à l'intérieur.
              height: inputs.modelKind === "M2" ? (isMobilePreview ? 920 : 1100) : undefined,
            }}>
              {inputs.modelKind === "M2" ? (
                <M5V1Preview
                  cfg={{
                    affiLink: inputs.affiLink,
                    pseudo: inputs.pseudo,
                    depositAmount: inputs.depositAmount,
                    bonusAmount: inputs.bonusAmount,
                    profileImageUrl: inputs.profileImageUrl,
                    chestUrl: inputs.m5ChestUrl,
                    jeuxUrl: inputs.m5JeuxUrl,
                    visualMode: inputs.m5VisualMode,
                    backgroundUrl: inputs.m5BackgroundUrl,
                    telegramUrl: inputs.telegramUrl,
                  }}
                  variant={inputs.m5Variant || "gold"}
                  isMobile={isMobilePreview}
                  onElementClick={(key) => {
                    if (key === "pseudo") setOpenSection("pseudo");
                    else if (key === "profile") setOpenSection("profile");
                    else if (key === "amounts") setOpenSection("amounts");
                    else if (key === "visual") setOpenSection("visual");
                    else if (key === "background") setOpenSection("background");
                  }}
                />
              ) : page ? (
                // M1, M3, M4, M5, M6 : tous rendus via V2 (RenderV2Page)
                <RenderV2Page page={page} isMobile={isMobilePreview} editCtx={editCtx as any} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function isV3Page(p: FsbAffiPage): boolean {
  // M1 pages : editorVersion=2 + __v3 boolean true
  // M2 pages : editorVersion=1 + __v3 string "1" (V1 config = string-only par convention)
  return !!(p.config && (p.config as any)[V3_MARKER]);
}

// ─── Stats & Classement section ────────────────────────────────────────────

type RankingSort = "views" | "clicks" | "ctr";

function getPageMeta(p: FsbAffiPage): { modelLabel: string; isV3: boolean } {
  const cfg = p.config as any;
  const isV3 = !!(cfg && cfg[V3_MARKER]);
  if (isV3) {
    const raw = cfg[V3_INPUTS_KEY];
    let inputs: V3QuickInputs | null = null;
    if (typeof raw === "string") {
      try { inputs = JSON.parse(raw); } catch { /* noop */ }
    } else if (raw && typeof raw === "object") {
      inputs = raw as V3QuickInputs;
    }
    return { modelLabel: `V3·${inputs?.modelKind || "M1"}`, isV3: true };
  }
  if (p.editorVersion === 2) return { modelLabel: "V2", isV3: false };
  return { modelLabel: `V1·M${p.model || "?"}`, isV3: false };
}

// Couleurs par modèle V3 — utilisées pour colorer la courbe d'une page
const MODEL_COLORS: Record<string, string> = {
  M1: "#3b82f6", M2: "#a855f7", M3: "#f59e0b", M4: "#fb923c", M5: "#10b981",
  M6: "#06b6d4", M7: "#ef4444", M8: "#6366f1", M9: "#ec4899",
};
function pageColor(p: FsbAffiPage): string {
  const meta = getPageMeta(p);
  if (meta.isV3) {
    const m = meta.modelLabel.split("·")[1] || "M1";
    return MODEL_COLORS[m] || "#64748b";
  }
  return "#64748b";
}

// Export du preview V3 en HTML autonome
//   - M2 (M5V1Preview = iframe srcdoc) : on prend directement outerHTML de
//     l'iframe — c'est deja une page complete autonome
//   - M1, M3-M9 (RenderV2Page) : snapshot du DOM + fonts Google
//   - M10+ (composants Lovable Tailwind) : idem + Tailwind CDN injecte
//   - Toutes les URLs d'assets relatives sont absolutisees vers window.location.origin
function exportV3PreviewAsHtml(
  wrap: HTMLDivElement | null,
  page: { pageTitle?: string; slug?: string; globals?: { bgPage?: string } } | null,
  modelKind: string,
) {
  if (!wrap) {
    alert("Aperçu non disponible — vérifie que la page se charge correctement.");
    return;
  }

  const origin = window.location.origin;
  const safeSlug = (page?.slug || `v3_${modelKind}`).replace(/[^a-zA-Z0-9_-]/g, "_");

  // Cas special M2 : preview deja en iframe complete (srcdoc) -> extract outerHTML
  if (modelKind === "M2") {
    const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (!doc) {
      alert("Impossible d'extraire l'iframe M2 — réessaie quand l'aperçu est totalement chargé.");
      return;
    }
    // Clone le document pour ne pas alterer le preview live
    const cloneDoc = doc.documentElement.cloneNode(true) as HTMLElement;
    // 1. Retire le script click-to-edit (intercepte les clics + preventDefault)
    cloneDoc.querySelectorAll("script[data-affi-m5-v3-click-to-edit]").forEach((el) => el.remove());
    // 2. Retire la <style> runtime qui dessine les dashed outlines au hover
    cloneDoc.querySelectorAll("style").forEach((el) => {
      if (el.textContent && /\.brand-logo-main:hover|outline:\s*2px\s+dashed/i.test(el.textContent)) {
        el.remove();
      }
    });
    // 3. Reecrit target="_blank" en _top (l'iframe d'export est probablement
    // elle-meme dans une iframe via un shortener)
    cloneDoc.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
      a.setAttribute("target", "_top");
      a.setAttribute("rel", "sponsored noopener");
    });
    let html = "<!DOCTYPE html>\n" + cloneDoc.outerHTML;
    html = absolutizeAssetUrls(html, origin);
    triggerDownload(html, `${safeSlug}_export.html`);
    return;
  }

  // Cas general : clone DOM, normalise links + URLs, wrap HTML
  const clone = wrap.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
    a.setAttribute("target", "_top");
    a.setAttribute("rel", "sponsored noopener");
  });
  // Absolutise <img src>, <source srcset> pour qu'ils marchent hors localhost
  clone.querySelectorAll<HTMLImageElement>("img[src]").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("/")) img.setAttribute("src", origin + src);
  });
  let bodyHtml = clone.innerHTML;
  // Absolutise aussi les url(...) dans les style inlines + backgrounds
  bodyHtml = bodyHtml.replace(/url\((['"]?)\/([^)'"]+)\1\)/g, `url($1${origin}/$2$1)`);

  // Detection Tailwind : si on trouve des classes utilitaires typiques dans le
  // markup, injecte le runtime CDN (modeles Lovable M10+ en dependent)
  const usesTailwind = /class="[^"]*\b(flex|grid|relative|absolute|w-full|h-full|min-h-screen|text-\w+|bg-\w+|px-\d|py-\d|mx-auto|rounded(-\w+)?|shadow)\b/.test(bodyHtml);

  const fontHref = "https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Space+Grotesk:wght@400;500;700&family=Bebas+Neue&family=Anton&family=Chakra+Petch:wght@400;700&family=DM+Sans:wght@400;500;700&family=Syne:wght@400;700;800&family=Playfair+Display:wght@400;700;900&family=Poppins:wght@400;600;700;900&family=Inter:wght@400;500;700;900&family=Montserrat:wght@400;600;700&display=swap";

  const bgPage = page?.globals?.bgPage || "#080212";
  const title = (page?.pageTitle || `Affi ${modelKind}`).replace(/[<>"]/g, "");

  const tailwindCdn = usesTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${fontHref}" rel="stylesheet" />
${tailwindCdn}
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:${bgPage};color:#fff;font-family:'Space Grotesk','DM Sans',-apple-system,sans-serif;min-height:100vh;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  img{max-width:100%;display:block}
  button{font-family:inherit}
  body{position:relative}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  triggerDownload(html, `${safeSlug}_export.html`);
}

function absolutizeAssetUrls(html: string, origin: string): string {
  // src="/..." -> src="origin/..." (idem href= et url())
  let out = html.replace(/\s(src|href)="\/([^"]*)"/g, ` $1="${origin}/$2"`);
  out = out.replace(/url\((['"]?)\/([^)'"]+)\1\)/g, `url($1${origin}/$2$1)`);
  return out;
}

function triggerDownload(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Mini chart SVG : 30 jours, courbes vues + clics, tooltip au survol, click -> drill-down 24h
type ChartSeries = { label: string; color: string; data: AffiDailyPoint[]; pageId?: number };

type HourlyPoint = { hour: number; views: number; clicks: number; uniqueViews: number; uniqueClicks: number };

// Panel detail d'une journee : fetch hourly stats par page + chart 24h
function DayDetailPanel({
  date, seriesList, token, onClose,
}: {
  date: string; seriesList: ChartSeries[]; token: string | null; onClose: () => void;
}) {
  const [byPage, setByPage] = React.useState<Record<number, HourlyPoint[] | "loading" | "error">>({});
  React.useEffect(() => {
    let cancelled = false;
    for (const s of seriesList) {
      if (!s.pageId || !token) continue;
      const pid = s.pageId;
      setByPage((p) => ({ ...p, [pid]: "loading" }));
      const apiBase = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
      fetch(`${apiBase}/api/fsb/affi-pages/${pid}/hourly-stats?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j?.ok && Array.isArray(j.series)) {
            setByPage((p) => ({ ...p, [pid]: j.series as HourlyPoint[] }));
          } else {
            setByPage((p) => ({ ...p, [pid]: "error" }));
          }
        })
        .catch(() => { if (!cancelled) setByPage((p) => ({ ...p, [pid]: "error" })); });
    }
    return () => { cancelled = true; };
  }, [date, seriesList, token]);

  // Aggrege total jour par page (somme des heures)
  const totals = seriesList.map((s) => {
    const h = s.pageId ? byPage[s.pageId] : null;
    if (!Array.isArray(h)) return { ...s, views: 0, clicks: 0, uniqueViews: 0, uniqueClicks: 0, ready: false };
    return {
      ...s,
      views: h.reduce((a, x) => a + x.views, 0),
      clicks: h.reduce((a, x) => a + x.clicks, 0),
      uniqueViews: h.reduce((a, x) => a + x.uniqueViews, 0),
      uniqueClicks: h.reduce((a, x) => a + x.uniqueClicks, 0),
      ready: true,
    };
  });
  const allReady = totals.every((t) => t.ready);

  // Hourly chart : barres groupees par heure, une couleur par page
  const W = 720, H = 180;
  const PADDING = { top: 14, right: 12, bottom: 22, left: 30 };
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  let maxVal = 1;
  for (const t of totals) {
    const h = t.pageId ? byPage[t.pageId] : null;
    if (Array.isArray(h)) for (const p of h) if (p.views > maxVal) maxVal = p.views;
  }
  const stepX = innerW / 24;
  const xAt = (h: number) => PADDING.left + h * stepX + stepX / 2;
  const yAt = (v: number) => PADDING.top + innerH - (v / maxVal) * innerH;

  const dateLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 12,
      background: "rgba(15,23,42,.6)", border: "1px solid rgba(255,255,255,.08)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,.7)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
            Détail journée
          </div>
          <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, textTransform: "capitalize" }}>{dateLabel}</div>
        </div>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
          color: "rgba(226,232,240,.85)", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer",
        }}>✕ Fermer</button>
      </div>
      {/* Cards totaux par page */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(totals.length, 4)}, 1fr)`, gap: 8, marginBottom: 14 }}>
        {totals.map((t, i) => (
          <div key={i} style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,255,255,.03)", border: `1px solid ${t.color}33`,
            borderLeft: `3px solid ${t.color}`,
          }}>
            <div style={{ fontSize: 10, color: t.color, fontWeight: 700, letterSpacing: ".04em" }}>{t.label}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: "#fff" }}>
              <span><b>{t.views}</b><span style={{ color: "rgba(148,163,184,.6)" }}>v · {t.uniqueViews}u</span></span>
              <span><b>{t.clicks}</b><span style={{ color: "rgba(148,163,184,.6)" }}>c · {t.uniqueClicks}u</span></span>
              <span style={{ color: t.views > 0 ? "#22c55e" : "rgba(148,163,184,.5)" }}>
                {t.views > 0 ? `${((t.clicks / t.views) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Chart 24h */}
      {!allReady ? (
        <div style={{ color: "rgba(148,163,184,.6)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>Chargement…</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,.6)", marginBottom: 4 }}>Répartition par heure (UTC) — barres vues, points clics</div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {[0, 0.5, 1].map((p, i) => (
              <line key={i} x1={PADDING.left} y1={PADDING.top + innerH * (1 - p)} x2={W - PADDING.right} y2={PADDING.top + innerH * (1 - p)}
                stroke="rgba(255,255,255,.05)" strokeDasharray="2 4" />
            ))}
            {[0, 6, 12, 18, 23].map((h) => (
              <text key={h} x={xAt(h)} y={H - 6} fontSize="9" fill="rgba(148,163,184,.6)" textAnchor="middle" fontFamily="monospace">
                {String(h).padStart(2, "0")}h
              </text>
            ))}
            {totals.map((t, si) => {
              const h = t.pageId ? byPage[t.pageId] : null;
              if (!Array.isArray(h)) return null;
              const barW = (stepX - 4) / totals.length;
              const offsetX = -((stepX - 4) / 2) + si * barW;
              return (
                <g key={si}>
                  {h.map((pt, i) => (
                    <g key={i}>
                      {pt.views > 0 ? (
                        <rect x={xAt(i) + offsetX} y={yAt(pt.views)} width={Math.max(barW - 1, 2)} height={Math.max(yAt(0) - yAt(pt.views), 1)}
                          fill={t.color} opacity={0.8} rx={1} />
                      ) : null}
                      {pt.clicks > 0 ? (
                        <circle cx={xAt(i) + offsetX + barW / 2} cy={yAt(pt.clicks)} r={2.2}
                          fill="#0f172a" stroke={t.color} strokeWidth={1.4} />
                      ) : null}
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}

function MultiDailyChart({ seriesList, token }: { seriesList: ChartSeries[]; token?: string | null }) {
  const W = 720;
  const H = 240;
  const PADDING = { top: 18, right: 14, bottom: 24, left: 34 };
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const valid = seriesList.filter((s) => s.data.length > 0);
  const ref = valid[0]?.data || [];
  // max sur views ET clicks de TOUTES les series
  let maxVal = 1;
  for (const s of valid) for (const p of s.data) {
    if (p.views > maxVal) maxVal = p.views;
    if (p.clicks > maxVal) maxVal = p.clicks;
  }
  const stepX = ref.length > 1 ? innerW / (ref.length - 1) : innerW;
  const xAt = (i: number) => PADDING.left + i * stepX;
  const yAt = (v: number) => PADDING.top + innerH - (v / maxVal) * innerH;
  const pathFor = (data: AffiDailyPoint[], key: "views" | "clicks") =>
    data.map((s, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(s[key]).toFixed(1)}`).join(" ");

  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: PADDING.top + innerH * (1 - p),
    label: Math.round(maxVal * p),
  }));
  const xTicks = [0, Math.floor((ref.length - 1) / 2), ref.length - 1].filter((i) => i >= 0 && i < ref.length);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PADDING.left} y1={t.y} x2={W - PADDING.right} y2={t.y}
              stroke="rgba(255,255,255,.06)" strokeDasharray="2 4" />
            <text x={PADDING.left - 6} y={t.y + 3} fontSize="10" fill="rgba(148,163,184,.7)" textAnchor="end" fontFamily="monospace">{t.label}</text>
          </g>
        ))}
        {xTicks.map((idx) => {
          if (!ref[idx]) return null;
          const d = new Date(ref[idx].date);
          const fmt = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          return (
            <text key={idx} x={xAt(idx)} y={H - 6} fontSize="10" fill="rgba(148,163,184,.7)" textAnchor="middle" fontFamily="monospace">{fmt}</text>
          );
        })}
        {/* Une courbe par serie : views (plein) + clics (pointille) */}
        {valid.map((s, si) => (
          <g key={si}>
            <path d={pathFor(s.data, "views")} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" opacity={hoverIdx !== null ? 0.5 : 1} />
            <path d={pathFor(s.data, "clicks")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 4" opacity={hoverIdx !== null ? 0.45 : 0.75} />
            {s.data.map((pt, i) => (
              <g key={i}>
                <circle cx={xAt(i)} cy={yAt(pt.views)} r={hoverIdx === i ? 4.5 : 2.5} fill={s.color} stroke="#0f172a" strokeWidth="1.5" />
                <circle cx={xAt(i)} cy={yAt(pt.clicks)} r={hoverIdx === i ? 4 : 2} fill="#0f172a" stroke={s.color} strokeWidth="1.5" />
              </g>
            ))}
          </g>
        ))}
        {/* Hitboxes mutualisees */}
        {ref.map((pt, i) => (
          <rect key={i} x={xAt(i) - stepX / 2} y={PADDING.top} width={stepX} height={innerH} fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onClick={() => setSelectedDate(pt.date)}
            style={{ cursor: "pointer" }} />
        ))}
        {/* Marker visible sur la date selectionnee */}
        {selectedDate && ref.findIndex((p) => p.date === selectedDate) >= 0 ? (() => {
          const i = ref.findIndex((p) => p.date === selectedDate);
          return (
            <line x1={xAt(i)} y1={PADDING.top - 4} x2={xAt(i)} y2={PADDING.top + innerH + 4}
              stroke="#FFB930" strokeWidth="1.5" />
          );
        })() : null}
        {hoverIdx !== null ? (
          <line x1={xAt(hoverIdx)} y1={PADDING.top} x2={xAt(hoverIdx)} y2={PADDING.top + innerH}
            stroke="rgba(255,255,255,.18)" strokeDasharray="2 3" />
        ) : null}
      </svg>
      {hoverIdx !== null && ref[hoverIdx] ? (
        <div style={{
          position: "absolute",
          left: `${(xAt(hoverIdx) / W) * 100}%`, top: 6,
          transform: "translateX(-50%)",
          background: "rgba(2,6,23,.94)",
          border: `1px solid rgba(255,255,255,.12)`,
          borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#fff",
          whiteSpace: "nowrap", pointerEvents: "none",
          boxShadow: `0 4px 14px rgba(0,0,0,.6)`,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {new Date(ref[hoverIdx].date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {valid.map((s, i) => {
              const pt = s.data[hoverIdx];
              if (!pt) return null;
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: s.color, fontWeight: 700, minWidth: 70, fontSize: 10 }}>{s.label}</span>
                  <span style={{ color: "#fff" }}>{pt.views}v</span>
                  <span style={{ color: "rgba(226,232,240,.7)" }}>{pt.clicks}c</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "rgba(148,163,184,.85)", marginTop: 8, paddingLeft: 8 }}>
        {valid.map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: s.color, fontWeight: 700 }}>━</span>
            <span>{s.label}</span>
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: "rgba(148,163,184,.5)" }}>━ vues · ┄ clics · clic sur une date</span>
      </div>
      {selectedDate ? (
        <DayDetailPanel
          date={selectedDate}
          seriesList={valid}
          token={token ?? null}
          onClose={() => setSelectedDate(null)}
        />
      ) : null}
    </div>
  );
}

function StatsRankingSection({
  pages, statsByPage, token,
}: {
  pages: FsbAffiPage[];
  statsByPage: Record<string, AffiPageStats>;
  token: string | null;
}) {
  const [sortBy, setSortBy] = React.useState<RankingSort>("views");
  const [filterScope, setFilterScope] = React.useState<"all" | "v3" | "v1v2">("all");
  const [expanded, setExpanded] = React.useState(false);
  const [expandedBrand, setExpandedBrand] = React.useState<string | null>(null);
  const [dailyCache, setDailyCache] = React.useState<Record<number, AffiDailyPoint[] | "loading" | "error">>({});

  const toggleGroup = React.useCallback(async (brandKey: string, pageIds: number[]) => {
    if (expandedBrand === brandKey) { setExpandedBrand(null); return; }
    setExpandedBrand(brandKey);
    if (!token) return;
    // Fetch en parallele toutes les pages de la personne (skip celles deja en cache)
    const toFetch = pageIds.filter((id) => !dailyCache[id] || dailyCache[id] === "error");
    if (toFetch.length === 0) return;
    setDailyCache((prev) => {
      const next = { ...prev };
      for (const id of toFetch) next[id] = "loading";
      return next;
    });
    await Promise.all(toFetch.map(async (id) => {
      try {
        const r = await getFsbAffiDailyStats(token, id, 30);
        setDailyCache((prev) => ({ ...prev, [id]: r.series || [] }));
      } catch {
        setDailyCache((prev) => ({ ...prev, [id]: "error" }));
      }
    }));
  }, [expandedBrand, dailyCache, token]);

  // Tableau enrichi avec stats + meta, filtré + trié
  const ranked = React.useMemo(() => {
    const rows = pages.map((p) => {
      const stats = statsByPage[String(p.id)] || { views: 0, uniqueViews: 0, clicks: 0, uniqueClicks: 0, ctr: 0, uniqueCtr: 0, periodDays: 30 };
      const meta = getPageMeta(p);
      return { page: p, stats, meta };
    });
    // Filter scope
    const filtered = rows.filter((r) => {
      if (filterScope === "v3") return r.meta.isV3;
      if (filterScope === "v1v2") return !r.meta.isV3;
      return true;
    });
    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "views") return b.stats.views - a.stats.views;
      if (sortBy === "clicks") return b.stats.clicks - a.stats.clicks;
      // CTR : on filtre les pages sans vue pour ne pas avoir des 0/0 en tête
      const ctrA = a.stats.views > 0 ? a.stats.ctr : -1;
      const ctrB = b.stats.views > 0 ? b.stats.ctr : -1;
      return ctrB - ctrA;
    });
    return filtered;
  }, [pages, statsByPage, sortBy, filterScope]);

  // Agrégats globaux
  const totals = React.useMemo(() => {
    const v = ranked.reduce((sum, r) => sum + r.stats.views, 0);
    const c = ranked.reduce((sum, r) => sum + r.stats.clicks, 0);
    const uv = ranked.reduce((sum, r) => sum + r.stats.uniqueViews, 0);
    const uc = ranked.reduce((sum, r) => sum + r.stats.uniqueClicks, 0);
    const pagesWithTraffic = ranked.filter((r) => r.stats.views > 0).length;
    const avgCtr = v > 0 ? (c / v) * 100 : 0;
    return { v, c, uv, uc, pagesWithTraffic, avgCtr };
  }, [ranked]);

  // Groupement par brandName — 1 ligne par personne, stats agregees, pages listees
  const grouped = React.useMemo(() => {
    const byBrand = new Map<string, { key: string; brandName: string; pages: typeof ranked }>();
    for (const r of ranked) {
      const key = (r.page.brandName || r.page.slug || "").toLowerCase().trim() || `_${r.page.id}`;
      if (!byBrand.has(key)) {
        byBrand.set(key, { key, brandName: r.page.brandName || r.page.slug || "Sans nom", pages: [] });
      }
      byBrand.get(key)!.pages.push(r);
    }
    const groups = Array.from(byBrand.values()).map((g) => {
      const totals = g.pages.reduce((acc, r) => ({
        views: acc.views + r.stats.views,
        uniqueViews: acc.uniqueViews + r.stats.uniqueViews,
        clicks: acc.clicks + r.stats.clicks,
        uniqueClicks: acc.uniqueClicks + r.stats.uniqueClicks,
      }), { views: 0, uniqueViews: 0, clicks: 0, uniqueClicks: 0 });
      return { ...g, totals, ctr: totals.views > 0 ? totals.clicks / totals.views : 0 };
    });
    // Sort selon sortBy
    groups.sort((a, b) => {
      if (sortBy === "views") return b.totals.views - a.totals.views;
      if (sortBy === "clicks") return b.totals.clicks - a.totals.clicks;
      const ctrA = a.totals.views > 0 ? a.ctr : -1;
      const ctrB = b.totals.views > 0 ? b.ctr : -1;
      return ctrB - ctrA;
    });
    return groups;
  }, [ranked, sortBy]);

  const rowsToShow = expanded ? grouped : grouped.slice(0, 10);

  const sortBtn = (key: RankingSort, label: string) => (
    <button
      onClick={() => setSortBy(key)}
      style={{
        background: sortBy === key ? T.primary + "33" : "transparent",
        color: sortBy === key ? T.primary : T.textMute,
        border: `1px solid ${sortBy === key ? T.primary : T.border}`,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: ".04em",
      }}
    >
      {label}
    </button>
  );

  const scopeBtn = (key: "all" | "v3" | "v1v2", label: string) => (
    <button
      onClick={() => setFilterScope(key)}
      style={{
        background: filterScope === key ? T.gold + "22" : "transparent",
        color: filterScope === key ? T.gold : T.textMute,
        border: `1px solid ${filterScope === key ? T.gold : T.border}`,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: ".04em",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      background: T.bgPanel,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 20,
      marginBottom: 28,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
          📊 Stats & Classement <span style={{ fontSize: 12, color: T.textMute, fontWeight: 500 }}>· 30 derniers jours</span>
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          {scopeBtn("all", "Toutes")}
          {scopeBtn("v3", "V3 only")}
          {scopeBtn("v1v2", "V1/V2 only")}
        </div>
      </div>

      {/* KPIs globaux */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
        <div style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: T.textMute, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Total vues</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{totals.v}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>{totals.uv} uniques</div>
        </div>
        <div style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: T.textMute, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Total clics CTA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{totals.c}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>{totals.uc} uniques</div>
        </div>
        <div style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: T.textMute, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>CTR moyen</div>
          <div style={{
            fontSize: 22, fontWeight: 800,
            color: totals.avgCtr >= 30 ? T.ok : totals.avgCtr >= 10 ? T.gold : T.text,
          }}>{totals.avgCtr.toFixed(1)}%</div>
          <div style={{ fontSize: 10, color: T.textDim }}>clics/vues</div>
        </div>
        <div style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: T.textMute, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Pages actives</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{totals.pagesWithTraffic}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>sur {ranked.length}</div>
        </div>
      </div>

      {/* Tri + classement */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.textMute, fontWeight: 600, letterSpacing: ".05em" }}>Trier par :</span>
        {sortBtn("views", "👁 Vues")}
        {sortBtn("clicks", "🎯 Clics")}
        {sortBtn("ctr", "% CTR")}
      </div>

      {ranked.length === 0 ? (
        <div style={{ color: T.textDim, padding: 24, textAlign: "center", fontSize: 13 }}>
          Aucune page dans ce filtre
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginLeft: -8, marginRight: -8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: T.textMute, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", textAlign: "left" }}>
                <th style={{ padding: "8px", fontWeight: 600 }}>#</th>
                <th style={{ padding: "8px", fontWeight: 600 }}>Page</th>
                <th style={{ padding: "8px", fontWeight: 600 }}>Modèle</th>
                <th style={{ padding: "8px", fontWeight: 600, textAlign: "right" }}>Vues</th>
                <th style={{ padding: "8px", fontWeight: 600, textAlign: "right" }}>Clics</th>
                <th style={{ padding: "8px", fontWeight: 600, textAlign: "right" }}>CTR</th>
                <th style={{ padding: "8px", fontWeight: 600, textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {rowsToShow.map((g, i) => {
                const ctr = g.totals.views > 0 ? g.ctr * 100 : null;
                const isTop = i < 3 && g.totals.views > 0;
                const isOpen = expandedBrand === g.key;
                const pageIds = g.pages.map((p) => p.page.id);
                // Etat de chargement global : si AU MOINS une page est loading → loading
                const anyLoading = pageIds.some((id) => dailyCache[id] === "loading");
                const allReady = pageIds.every((id) => Array.isArray(dailyCache[id]));
                // Multi-courbes : une serie par page (couleur = couleur du modele)
                const chartSeriesList: ChartSeries[] = allReady ? g.pages.map((p) => ({
                  label: p.meta.modelLabel,
                  color: pageColor(p.page),
                  data: dailyCache[p.page.id] as AffiDailyPoint[],
                  pageId: Number(p.page.id),
                })) : [];
                return (
                  <React.Fragment key={g.key}>
                  <tr
                    style={{
                      borderTop: `1px solid ${T.border}`,
                      color: T.text,
                      background: isOpen ? "rgba(148,163,184,.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 8px", fontWeight: 700, color: isTop ? T.gold : T.textMute, width: 32 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td
                      style={{ padding: "10px 8px", maxWidth: 240, cursor: "pointer", userSelect: "none" }}
                      onClick={() => toggleGroup(g.key, pageIds)}
                      title="Voir l'évolution 30 jours (toutes pages fusionnées)"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: T.textMute, fontSize: 10, transition: "transform .15s ease", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {g.brandName}
                          </div>
                          <div style={{ fontSize: 10, color: T.textDim }}>
                            {g.pages.length} page{g.pages.length > 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {g.pages.map((p) => (
                          <span key={p.page.id} style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: p.meta.isV3 ? T.gold + "22" : T.bgInput,
                            color: p.meta.isV3 ? T.gold : T.textMute,
                          }}>
                            {p.meta.modelLabel}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <div style={{ fontWeight: 700 }}>{g.totals.views}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>{g.totals.uniqueViews} uniq</div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <div style={{ fontWeight: 700 }}>{g.totals.clicks}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>{g.totals.uniqueClicks} uniq</div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {ctr === null ? (
                        <span style={{ color: T.textDim }}>—</span>
                      ) : (
                        <span style={{
                          fontWeight: 800,
                          color: ctr >= 50 ? T.ok : ctr >= 20 ? T.gold : ctr >= 5 ? T.text : T.textMute,
                        }}>
                          {ctr.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      {g.pages.length === 1 ? (
                        <a href={`/r/${g.pages[0].page.slug}`} target="_blank" rel="noreferrer" style={{ color: T.textMute, textDecoration: "none", fontSize: 14 }} title="Ouvrir">↗</a>
                      ) : (
                        <span style={{ color: T.textDim, fontSize: 11 }}>{g.pages.length}</span>
                      )}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr style={{ background: "rgba(2,6,23,.4)", borderTop: `1px solid ${T.border}` }}>
                      <td colSpan={7} style={{ padding: "16px 20px 20px" }}>
                        {anyLoading ? (
                          <div style={{ color: T.textMute, fontSize: 12, padding: "20px 0", textAlign: "center" }}>Chargement de l'évolution…</div>
                        ) : !allReady ? (
                          <div style={{ color: T.danger, fontSize: 12, padding: "20px 0", textAlign: "center" }}>Erreur de chargement</div>
                        ) : chartSeriesList.length > 0 ? (
                          <>
                            <div style={{ fontSize: 11, color: T.textMute, marginBottom: 10, letterSpacing: ".04em" }}>
                              {g.brandName} · {g.pages.length} page{g.pages.length > 1 ? "s" : ""} · une courbe par modèle (comparaison)
                            </div>
                            <MultiDailyChart seriesList={chartSeriesList} token={token} />
                            {/* Liste des pages de la personne */}
                            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                              {g.pages.map((p) => (
                                <div key={p.page.id} style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                  padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,.02)", fontSize: 12,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                                      background: p.meta.isV3 ? T.gold + "22" : T.bgInput,
                                      color: p.meta.isV3 ? T.gold : T.textMute,
                                      flexShrink: 0,
                                    }}>
                                      {p.meta.modelLabel}
                                    </span>
                                    <span style={{ color: T.textDim, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      /r/{p.page.slug}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", gap: 12, alignItems: "center", color: T.textMute, fontSize: 11 }}>
                                    <span>{p.stats.views}<span style={{ opacity: .5 }}>v</span></span>
                                    <span>{p.stats.clicks}<span style={{ opacity: .5 }}>c</span></span>
                                    <a href={`/r/${p.page.slug}`} target="_blank" rel="noreferrer" style={{ color: T.textMute, textDecoration: "none" }} title="Ouvrir">↗</a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {grouped.length > 10 ? (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 14, background: "transparent", border: `1px solid ${T.border}`,
            color: T.textMute, padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: "pointer", width: "100%",
          }}
        >
          {expanded ? "Réduire" : `Voir tout (${grouped.length} personne${grouped.length > 1 ? "s" : ""})`}
        </button>
      ) : null}
    </div>
  );
}

// ─── Topbar partagée (dashboard + stats) ──────────────────────────────────
function V3Topbar({
  activeView, onSwitchView, onCreateQuick, onRefresh,
}: {
  activeView: "dashboard" | "stats";
  onSwitchView: (v: "dashboard" | "stats") => void;
  onCreateQuick: () => void;
  onRefresh: () => void;
}) {
  const tabBtn = (key: "dashboard" | "stats", label: string, icon: string) => (
    <button
      onClick={() => onSwitchView(key)}
      style={{
        background: activeView === key ? T.bgPanel2 : "transparent",
        color: activeView === key ? T.text : T.textMute,
        border: "none",
        borderBottom: `2px solid ${activeView === key ? T.primary : "transparent"}`,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: ".02em",
        transition: "color .15s ease",
      }}
    >
      {icon} {label}
    </button>
  );
  return (
    <div style={{ background: T.bgPanel, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px 0", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>FSN Editor — V3</div>
          <div style={{ fontSize: 11, color: T.textMute }}>Pages d'affiliation + analytics</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onRefresh} style={btnGhost}>↻ Rafraîchir</button>
          <button onClick={onCreateQuick} style={btnPrimary}>+ Créer une page</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0 24px", marginTop: 12, alignItems: "flex-end" }}>
        {tabBtn("dashboard", "Mes pages", "📁")}
        {tabBtn("stats", "Stats & Classement", "📊")}
      </div>
    </div>
  );
}

// Lit les V3QuickInputs serialises depuis la config de la page (string ou object).
function readV3Inputs(p: FsbAffiPage): V3QuickInputs | null {
  const raw = (p.config as any)?.[V3_INPUTS_KEY];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as V3QuickInputs; } catch { return null; }
  }
  if (raw && typeof raw === "object") return raw as V3QuickInputs;
  return null;
}

function DashboardView({
  pages, loading, onCreateQuick, onOpen, onDelete, onRefresh, statsByPage, onSwitchView,
}: {
  pages: FsbAffiPage[];
  loading: boolean;
  onCreateQuick: () => void;
  onOpen: (p: FsbAffiPage) => void;
  onDelete: (p: FsbAffiPage) => void;
  onRefresh: () => void;
  statsByPage: Record<string, AffiPageStats>;
  onSwitchView: (v: "dashboard" | "stats") => void;
}) {
  const v3PagesAll = pages.filter(isV3Page);

  // Recherche + tri (client-side)
  const [searchQ, setSearchQ] = React.useState("");
  const [sortBy, setSortBy] = React.useState<
    "createdDesc" | "createdAsc" | "updatedDesc" | "alphaAsc" | "alphaDesc" | "viewsDesc" | "viewsAsc"
  >("updatedDesc");

  const v3Pages = React.useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    let arr = v3PagesAll;
    if (q) {
      arr = arr.filter((p) => {
        const inputs = readV3Inputs(p);
        const haystack = [
          p.brandName || "",
          p.slug || "",
          inputs?.pseudo || "",
          inputs?.affiLink || "",
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }
    const getViews = (p: FsbAffiPage) => statsByPage[String(p.id)]?.views ?? 0;
    const cmpName = (a: FsbAffiPage, b: FsbAffiPage) =>
      (a.brandName || a.slug || "").toLowerCase().localeCompare((b.brandName || b.slug || "").toLowerCase(), "fr");
    const getTime = (p: FsbAffiPage, key: "createdAt" | "updatedAt") => {
      const v = (p as any)[key];
      return v ? new Date(v).getTime() : 0;
    };
    const sorters: Record<typeof sortBy, (a: FsbAffiPage, b: FsbAffiPage) => number> = {
      createdDesc: (a, b) => getTime(b, "createdAt") - getTime(a, "createdAt"),
      createdAsc: (a, b) => getTime(a, "createdAt") - getTime(b, "createdAt"),
      updatedDesc: (a, b) => getTime(b, "updatedAt") - getTime(a, "updatedAt"),
      alphaAsc: cmpName,
      alphaDesc: (a, b) => -cmpName(a, b),
      viewsDesc: (a, b) => getViews(b) - getViews(a),
      viewsAsc: (a, b) => getViews(a) - getViews(b),
    };
    return [...arr].sort(sorters[sortBy]);
  }, [v3PagesAll, searchQ, sortBy, statsByPage]);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <V3Topbar activeView="dashboard" onSwitchView={onSwitchView} onCreateQuick={onCreateQuick} onRefresh={onRefresh} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            Mes pages V3 <span style={{ fontSize: 14, color: T.textMute, fontWeight: 500 }}>· {v3Pages.length}{searchQ ? `/${v3PagesAll.length}` : ""}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="🔍 Pseudo, slug, lien d'affi…"
              style={{
                background: T.bgInput, border: `1px solid ${T.border}`, color: T.text,
                borderRadius: 8, padding: "8px 12px", fontSize: 13, width: 260, fontFamily: "inherit", outline: "none",
              }}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: T.bgInput, border: `1px solid ${T.border}`, color: T.text,
                borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer",
              }}
              title="Trier"
            >
              <option value="updatedDesc">↻ Modifiées récemment</option>
              <option value="createdDesc">🆕 Créées récemment</option>
              <option value="createdAsc">📅 Créées (anciennes)</option>
              <option value="alphaAsc">A → Z</option>
              <option value="alphaDesc">Z → A</option>
              <option value="viewsDesc">👁 Vues ↓</option>
              <option value="viewsAsc">👁 Vues ↑</option>
            </select>
          </div>
        </div>

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
              const rawInputs = (p.config as any)?.[V3_INPUTS_KEY];
              let inputs: V3QuickInputs | null = null;
              if (typeof rawInputs === "string") {
                try { inputs = JSON.parse(rawInputs); } catch { /* noop */ }
              } else if (rawInputs && typeof rawInputs === "object") {
                inputs = rawInputs as V3QuickInputs;
              }
              const modelLabel = (inputs?.modelKind || "M1");
              const stats = statsByPage[String(p.id)];
              const ctrPct = stats && stats.views > 0 ? Math.round(stats.ctr * 1000) / 10 : null;
              return (
                <div key={p.id} style={{
                  background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 12,
                  padding: 16, display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.brandName || p.slug}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={{ fontSize: 10, color: T.textMute, background: T.bgInput, padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>{modelLabel}</span>
                      <span style={{ fontSize: 10, color: T.gold, background: `${T.gold}22`, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>V3</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.textMute }}>
                    /r/<code>{p.slug}</code>
                  </div>
                  {inputs ? (
                    <div style={{ fontSize: 12, color: T.textMute }}>
                      {inputs.depositAmount != null ? `Déposez ${inputs.depositAmount}€` : ""}
                      {inputs.depositAmount != null && inputs.bonusAmount != null ? " → " : ""}
                      {inputs.bonusAmount != null ? `Recevez ${inputs.bonusAmount}€` : ""}
                    </div>
                  ) : null}
                  {stats ? (
                    <div style={{
                      display: "flex", gap: 6, alignItems: "center",
                      fontSize: 11, color: T.textMute,
                      paddingTop: 4, borderTop: `1px solid ${T.border}`,
                    }}>
                      <span>👁 <strong style={{ color: T.text }}>{stats.views}</strong> vues</span>
                      <span>·</span>
                      <span>🎯 <strong style={{ color: T.text }}>{stats.clicks}</strong> clics</span>
                      {ctrPct !== null ? (
                        <span style={{ marginLeft: "auto", color: ctrPct >= 10 ? T.ok : ctrPct >= 5 ? T.gold : T.textMute, fontWeight: 700 }}>
                          {ctrPct}% CTR
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: T.textDim, paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
                      Pas encore de stats (30j)
                    </div>
                  )}
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

// ─── Vue Stats dédiée ───────────────────────────────────────────────────────

function StatsView({
  pages, loading, statsByPage, token, onCreateQuick, onRefresh, onSwitchView,
}: {
  pages: FsbAffiPage[];
  loading: boolean;
  statsByPage: Record<string, AffiPageStats>;
  token: string | null;
  onCreateQuick: () => void;
  onRefresh: () => void;
  onSwitchView: (v: "dashboard" | "stats") => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <V3Topbar activeView="stats" onSwitchView={onSwitchView} onCreateQuick={onCreateQuick} onRefresh={onRefresh} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>📊 Analytics globales</h2>
          <div style={{ fontSize: 13, color: T.textMute }}>
            Vue d'ensemble du trafic et des conversions sur l'ensemble de tes landings (V1, V2, V3 confondus).
          </div>
        </div>

        {loading ? (
          <div style={{ color: T.textMute, padding: 24, textAlign: "center" }}>Chargement des stats…</div>
        ) : pages.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            border: `1px dashed ${T.borderHi}`, borderRadius: 12, color: T.textMute,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>Aucune page d'affiliation</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>Crée ta première page pour démarrer le tracking.</div>
            <button onClick={onCreateQuick} style={btnPrimary}>+ Créer une page</button>
          </div>
        ) : (
          <StatsRankingSection pages={pages} statsByPage={statsByPage} token={token} />
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = React.useState<"dashboard" | "stats" | "wizard">("dashboard");
  const [pages, setPages] = React.useState<FsbAffiPage[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [showCreateChoice, setShowCreateChoice] = React.useState(false);

  const [wizardInputs, setWizardInputs] = React.useState<V3QuickInputs>(defaultV3QuickInputs());
  const [wizardPageId, setWizardPageId] = React.useState<number | null>(null);
  const [wizardSavedSlug, setWizardSavedSlug] = React.useState<string | null>(null);
  const [wizardPublishDomain, setWizardPublishDomain] = React.useState<"lunalive" | "landaurax">("landaurax");
  const [statsByPage, setStatsByPage] = React.useState<Record<string, AffiPageStats>>({});

  const refreshList = React.useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const r = await listFsbAffiPages(token);
      setPages(r.items);
      // En parallèle : charge les stats agrégées (30j) pour le ranking
      try {
        const s = await getFsbAffiStatsSummary(token, 30);
        setStatsByPage(s.byPage || {});
      } catch { /* noop */ }
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
    setWizardPublishDomain("landaurax");
    setView("wizard");
    setShowCreateChoice(false);
  };

  const handleOpen = React.useCallback((p: FsbAffiPage) => {
    const raw = (p.config as any)?.[V3_INPUTS_KEY];
    let stored: V3QuickInputs | undefined;
    // M1 (editorVersion=2) : objet directement, M2 (editorVersion=1) : string JSON
    if (typeof raw === "string") {
      try { stored = JSON.parse(raw); } catch { stored = undefined; }
    } else if (raw && typeof raw === "object") {
      stored = raw as V3QuickInputs;
    }
    const fallback = p.editorVersion === 1 ? defaultV3QuickInputs("M2") : defaultV3QuickInputs("M1");
    setWizardInputs(stored || fallback);
    setWizardPageId(p.id);
    setWizardSavedSlug(p.slug);
    setWizardPublishDomain(p.publishDomain === "landaurax" ? "landaurax" : "lunalive");
    setView("wizard");
  }, []);

  React.useEffect(() => {
    if (loadingList) return;
    const requestedPageId = Number(searchParams.get("pageId") || 0);
    const requestedSlug = (searchParams.get("slug") || "").trim().toLowerCase();
    if (!requestedPageId && !requestedSlug) return;
    const match = pages.find((p) =>
      (requestedPageId > 0 && p.id === requestedPageId) ||
      (!!requestedSlug && p.slug.toLowerCase() === requestedSlug)
    );
    if (!match) return;
    handleOpen(match);
    const next = new URLSearchParams(searchParams);
    next.delete("pageId");
    next.delete("slug");
    setSearchParams(next, { replace: true });
  }, [handleOpen, loadingList, pages, searchParams, setSearchParams]);

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
        initialPublishDomain={wizardPublishDomain}
        onCancel={() => setView("dashboard")}
        onSaved={handleSaved}
        token={token}
      />
    );
  }

  const switchView = (v: "dashboard" | "stats") => setView(v);

  return (
    <>
      {view === "stats" ? (
        <StatsView
          pages={pages}
          loading={loadingList}
          statsByPage={statsByPage}
          token={token}
          onCreateQuick={() => setShowCreateChoice(true)}
          onRefresh={refreshList}
          onSwitchView={switchView}
        />
      ) : (
        <DashboardView
          pages={pages}
          loading={loadingList}
          onCreateQuick={() => setShowCreateChoice(true)}
          onOpen={handleOpen}
          onDelete={handleDelete}
          onRefresh={refreshList}
          statsByPage={statsByPage}
          onSwitchView={switchView}
        />
      )}
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
