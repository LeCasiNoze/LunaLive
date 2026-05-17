// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — renderer
//
// Transforme un V2Page (arbre de blocs) en JSX. Utilisé par la preview de
// l'éditeur ET par la page publiée /r/<slug> (quand editor_version === 2).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import type {
  V2Block,
  V2TextBlock,
  V2ImageBlock,
  V2ButtonBlock,
  V2ContainerBlock,
  V2SpacerBlock,
  V2DividerBlock,
  V2FsnCardM4Block,
  V2M4V1LowerSectionsBlock,
  V2V3GameModelBlock,
  V2CommonStyle,
  V2Effects,
  V2TextStyle,
  V2Page,
  V2ZoneKey,
} from "./editor_v2_types";
import { v2ZonesForModel } from "./editor_v2_types";
import { M4V1Card } from "../components/M4V1Card";
import { M4V1LowerSections } from "../components/M4V1LowerSections";
import { M3Wheel } from "../components/M3Wheel";
import { M4Scratch } from "../components/M4Scratch";
import { M5Slot } from "../components/M5Slot";
import { M6Chest } from "../components/M6Chest";
import { M7Plinko } from "../components/M7Plinko";
import { M8Penalty } from "../components/M8Penalty";
import { M9Crossy } from "../components/M9Crossy";
import { M10Cyclope } from "../components/M10Cyclope";
import { M11Aurix } from "../components/M11Aurix";
import { M12Chat } from "../components/M12Chat";
import { M13Ticket } from "../components/M13Ticket";
import { M14Magazine } from "../components/M14Magazine";

// ─── Edit mode context — propage onBlockClick + selection ─────────────────────
//
// En preview publique : pas de context, les blocs sont rendus sans interactivité.
// En éditeur : on fournit un onSelect qui reçoit { zone, indices } pour ouvrir
// le PropPanel correspondant + on highlight le bloc sélectionné.

export type V2EditCtx = {
  onSelect: (zone: V2ZoneKey, indices: number[]) => void;
  selected: { zone: V2ZoneKey; indices: number[] } | null;
};
const EditCtx = React.createContext<V2EditCtx | null>(null);

function isPathSelected(ctx: V2EditCtx | null, zone: V2ZoneKey, indices: number[]): boolean {
  if (!ctx?.selected) return false;
  if (ctx.selected.zone !== zone) return false;
  if (ctx.selected.indices.length !== indices.length) return false;
  return ctx.selected.indices.every((v, i) => v === indices[i]);
}

// ─── Style helpers ───────────────────────────────────────────────────────────

function commonToStyle(c: V2CommonStyle, isMobile: boolean): React.CSSProperties {
  // CRITIQUE : on omet les clés à `undefined` plutôt que de les inclure. Sinon
  // un spread `{ marginTop: 0, ...commonToStyle({}) }` donne `marginTop:
  // undefined` qui efface le 0 et fait revenir la marge par défaut du browser
  // (h1 ≈ 0.67em par exemple).
  const out: React.CSSProperties = {};
  const mt = (isMobile && c.marginTopMobile) || c.marginTop;
  if (mt !== undefined) out.marginTop = mt;
  const mb = (isMobile && c.marginBottomMobile) || c.marginBottom;
  if (mb !== undefined) out.marginBottom = mb;
  if (c.marginX !== undefined) {
    out.marginLeft = c.marginX;
    out.marginRight = c.marginX;
  }
  const pt = (isMobile && c.paddingTopMobile) || c.paddingTop;
  if (pt !== undefined) out.paddingTop = pt;
  const pb = (isMobile && c.paddingBottomMobile) || c.paddingBottom;
  if (pb !== undefined) out.paddingBottom = pb;
  if (c.paddingX !== undefined) {
    out.paddingLeft = c.paddingX;
    out.paddingRight = c.paddingX;
  }
  if (c.align && c.align !== "stretch") out.textAlign = c.align;
  return out;
}

function effectsToStyle(e: V2Effects): React.CSSProperties {
  const shadows = [e.shadow, e.glow ? `0 0 24px ${e.glow}` : undefined].filter(Boolean).join(", ");
  return {
    boxShadow: shadows || undefined,
    borderRadius: e.borderRadius,
    border: e.border,
    background: e.bgImage
      ? `${e.bg ? e.bg + ", " : ""}url("${e.bgImage}") center/cover no-repeat`
      : e.bg,
    opacity: e.bgOpacity,
    overflow: e.overflow,
    transition: e.hoverScale ? "transform 200ms ease, filter 200ms ease" : undefined,
  };
}

function textStyleTo(s: V2TextStyle | undefined, isMobile: boolean): React.CSSProperties {
  if (!s) return {};
  return {
    fontFamily: s.fontFamily ? `"${s.fontFamily}", system-ui, sans-serif` : undefined,
    fontWeight: s.fontWeight,
    fontSize: (isMobile ? s.fontSizeMobile : s.fontSizeDesktop) || s.fontSize,
    color: s.color,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
    textTransform: s.textTransform,
    textShadow: s.textShadow,
  };
}

const animationCss: Record<string, string> = {
  fadeIn:   "v2-fade-in 0.6s ease-out both",
  slideUp:  "v2-slide-up 0.7s ease-out both",
  pulse:    "v2-pulse 2.4s ease-in-out infinite",
  float:    "v2-float 5s ease-in-out infinite",
  none:     "none",
};

export function V2Keyframes() {
  // useEffect : on garantit que la fonte Poppins (utilisée par M4V1Card et toute
  // page V2 qui veut matcher V1) est chargée même quand index.html ne la déclare
  // pas (ex: éditeur, page publiée, preview). Idempotent — un seul <link> est
  // posé en tête de document, peu importe le nombre de pages V2 montées.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("v2-poppins-link")) return;
    const link = document.createElement("link");
    link.id = "v2-poppins-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }, []);
  return (
    <style data-v2-keyframes>{`
      @keyframes v2-fade-in   { from { opacity:0; } to { opacity:1; } }
      @keyframes v2-slide-up  { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
      @keyframes v2-pulse     { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
      @keyframes v2-float     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      .v2-block[data-hover-scale]:hover { transform: scale(var(--v2-hover-scale, 1.02)); filter: brightness(1.05); }
    `}</style>
  );
}

// ─── Block renderers ─────────────────────────────────────────────────────────

function RenderText({ b, isMobile }: { b: V2TextBlock; isMobile: boolean }) {
  const Tag = (b.tag || "p") as keyof React.JSX.IntrinsicElements;
  // ATTENTION : on utilise les longhands marginTop/Right/Bottom/Left = 0 (et
  // pas le shorthand `margin: 0`) sinon ça écrase les marges custom posées
  // ensuite par commonToStyle (le navigateur normalise margin: 0 → 4 sides 0).
  const baseStyle: React.CSSProperties = {
    marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    ...commonToStyle(b, isMobile),
    ...effectsToStyle(b),
    ...textStyleTo(b.style, isMobile),
    animation: b.animation && b.animation !== "none" ? animationCss[b.animation] : undefined,
    animationDelay: b.animationDelay,
  };
  // Échappatoire HTML/SVG — si fourni, on bypass le rendu texte ligne-par-ligne
  if (b.htmlContent) {
    return React.createElement(Tag, {
      className: "v2-block v2-text",
      style: baseStyle,
      dangerouslySetInnerHTML: { __html: b.htmlContent },
    });
  }
  // Bloc texte vide (trim) → ne rien rendre (pas de hauteur résiduelle, pas de
  // marge). Pratique pour les champs optionnels (pseudo, etc.) qui ne doivent
  // prendre aucune place tant qu'ils ne sont pas remplis.
  if (!b.content || !b.content.trim()) return null;
  const lines = b.content.split("\n");
  return React.createElement(
    Tag,
    {
      className: "v2-block v2-text",
      style: baseStyle,
      "data-hover-scale": b.hoverScale ? "1" : undefined,
      ...(b.hoverScale ? { ["--v2-hover-scale" as any]: String(b.hoverScale) } : {}),
    },
    lines.map((ln, i) => {
      const lineSt = b.lineStyles?.[i];
      return (
        <span
          key={i}
          style={{
            display: "block",
            ...textStyleTo(lineSt, isMobile),
          }}
        >
          {ln || " "}
        </span>
      );
    })
  );
}

function RenderImage({ b, isMobile }: { b: V2ImageBlock; isMobile: boolean }) {
  const wrapper: React.CSSProperties = {
    ...commonToStyle(b, isMobile),
    ...effectsToStyle(b),
    position: "relative",
    width: b.width,
    height: b.height,
    aspectRatio: b.aspectRatio,
    overflow: "hidden",
    display: "block",
    animation: b.animation && b.animation !== "none" ? animationCss[b.animation] : undefined,
    animationDelay: b.animationDelay,
  };
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: b.objectFit || "cover",
    display: "block",
  };
  const overlayPos: Record<string, React.CSSProperties> = {
    "top-left":     { top: 12, left: 12 },
    "top-right":    { top: 12, right: 12 },
    "center":       { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
    "bottom-left":  { bottom: 12, left: 12 },
    "bottom-right": { bottom: 12, right: 12 },
  };
  const inner = (
    <>
      {b.src ? (
        <img src={b.src} alt={b.alt || ""} style={imgStyle} />
      ) : (
        <div style={{ ...imgStyle, background: "rgba(255,255,255,.04)", display: "grid", placeItems: "center", color: "#666", fontSize: 12 }}>
          Image vide
        </div>
      )}
      {b.overlayText ? (
        <div style={{
          position: "absolute",
          ...(overlayPos[b.overlayPosition || "center"]),
          ...textStyleTo(b.overlayStyle, isMobile),
          pointerEvents: "none",
        }}>
          {b.overlayText}
        </div>
      ) : null}
    </>
  );
  return b.href
    ? <a className="v2-block v2-image" href={b.href} target="_blank" rel="noreferrer" style={wrapper}>{inner}</a>
    : <div className="v2-block v2-image" style={wrapper}>{inner}</div>;
}

function RenderButton({ b, isMobile }: { b: V2ButtonBlock; isMobile: boolean }) {
  const variantStyle: React.CSSProperties =
    b.variant === "primary" ? {
      background: "linear-gradient(135deg,#FFD700,#FFC200)",
      color: "#000",
      boxShadow: "0 8px 18px rgba(255,214,0,0.36)",
    } :
    b.variant === "outline" ? {
      background: "transparent",
      color: b.textColor || "#fff",
      border: `1px solid ${b.textColor || "#fff"}`,
    } :
    b.variant === "ghost" ? {
      background: "transparent",
      color: b.textColor || "#fff",
    } :
    /* custom */ {
      background: b.bgColor || "#FFD700",
      color: b.textColor || "#000",
    };
  const style: React.CSSProperties = {
    ...commonToStyle(b, isMobile),
    ...effectsToStyle(b),
    ...variantStyle,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: b.fullWidth ? "100%" : b.width,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight ?? 800,
    fontFamily: b.fontFamily ? `"${b.fontFamily}", system-ui` : undefined,
    letterSpacing: b.letterSpacing,
    textTransform: b.textTransform,
    padding: b.paddingX || "14px 22px",
    borderRadius: b.borderRadius || "10px",
    cursor: "pointer",
    textDecoration: "none",
    animation: b.animation && b.animation !== "none" ? animationCss[b.animation] : undefined,
    animationDelay: b.animationDelay,
  };
  return (
    <a className="v2-block v2-button" href={b.href || "#"} target="_blank" rel="noreferrer" style={style} data-hover-scale={b.hoverScale ? "1" : undefined}>
      {b.iconLeft ? <span>{b.iconLeft}</span> : null}
      <span>{b.label}</span>
      {b.iconRight ? <span>{b.iconRight}</span> : null}
    </a>
  );
}

function RenderContainer({ b, isMobile, zone, indices }: { b: V2ContainerBlock; isMobile: boolean; zone?: V2ZoneKey; indices?: number[] }) {
  const justifyMap: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around" };
  const itemsMap: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
  const style: React.CSSProperties = {
    ...commonToStyle(b, isMobile),
    ...effectsToStyle(b),
    display: b.layout === "grid" ? "grid" : "flex",
    flexDirection: b.layout === "row" ? "row" : "column",
    gridTemplateColumns: b.layout === "grid" ? `repeat(${b.columns || 2}, minmax(0, 1fr))` : undefined,
    gap: b.gap,
    maxWidth: b.maxWidth,
    width: b.width || "100%",
    height: b.height,
    flexShrink: b.flexShrink,
    // Centrage horizontal via auto left/right SEULEMENT si aucune largeur ni
    // marginX n'est défini. On utilise les longhands sinon le shorthand
    // `margin: "0 auto"` écraserait les marginTop/Bottom de commonToStyle.
    ...(!b.width && b.marginX === undefined ? { marginLeft: "auto", marginRight: "auto" } : {}),
    justifyContent: b.justify ? justifyMap[b.justify] : undefined,
    alignItems: b.itemsAlign ? itemsMap[b.itemsAlign] : undefined,
    animation: b.animation && b.animation !== "none" ? animationCss[b.animation] : undefined,
    animationDelay: b.animationDelay,
    boxSizing: "border-box",
  };
  return (
    <div className="v2-block v2-container" style={style} data-hover-scale={b.hoverScale ? "1" : undefined}>
      {b.children.map((child, i) => (
        <RenderBlock
          key={child.id || i}
          b={child}
          isMobile={isMobile}
          zone={zone}
          indices={indices ? [...indices, i] : undefined}
        />
      ))}
    </div>
  );
}

function RenderSpacer({ b, isMobile }: { b: V2SpacerBlock; isMobile: boolean }) {
  return <div className="v2-block v2-spacer" style={{ height: (isMobile && b.heightMobile) || b.height || "20px", flexShrink: 0 }} />;
}

function RenderFsnCardM4({ b, isMobile }: { b: V2FsnCardM4Block; isMobile: boolean }) {
  // Bloc preset : on délègue 100% du rendu au composant partagé pour garantir
  // que le visuel reste pixel-identique à la card V1. On n'applique que les
  // marges externes ; AUCUNE altération du style interne.
  const wrapperStyle: React.CSSProperties = commonToStyle(b, isMobile);
  return (
    <div className="v2-block v2-fsn-card-m4" style={wrapperStyle}>
      <M4V1Card
        imgSrc={b.imgSrc}
        imgAlt={b.imgAlt}
        depositAmount={b.depositAmount}
        bonusAmount={b.bonusAmount}
        bonusPct={b.bonusPct}
        href={b.href}
        animationDelay={b.animationDelay}
        isMobile={isMobile}
        imageAspectRatio={b.imageAspectRatio}
        imageObjectFit={b.imageObjectFit}
        theme={b.theme}
      />
    </div>
  );
}

function RenderM4V1LowerSections({ b, previewMode }: { b: V2M4V1LowerSectionsBlock; previewMode?: boolean }) {
  return <M4V1LowerSections affiLink={b.affiLink} brandName={b.brandName} previewMode={previewMode} theme={b.theme} />;
}

function RenderV3GameModel({ b }: { b: V2V3GameModelBlock }) {
  const props = {
    pseudo: b.pseudo,
    profileImageUrl: b.profileImageUrl,
    depositAmount: b.depositAmount,
    bonusAmount: b.bonusAmount,
    affiLink: b.affiLink,
    theme: b.theme,
    pseudoStyle: b.pseudoStyle,
  };
  switch (b.gameKind) {
    case "M3": return <M3Wheel {...props} />;
    case "M4": return <M4Scratch {...props} />;
    case "M5": return <M5Slot {...props} />;
    case "M6": return <M6Chest {...props} />;
    case "M7": return <M7Plinko {...props} />;
    case "M8": return <M8Penalty {...props} penaltyTeam={b.penaltyTeam} />;
    case "M9": return <M9Crossy {...props} />;
    case "M10": return (
      <M10Cyclope
        {...props}
        pseudoSub={b.pseudoSub}
        followersCount={b.followersCount}
        socialHandle={b.socialHandle}
        gameImageUrl={b.gameImageUrl}
        gameLabel={b.gameLabel}
        gameBonusPct={b.gameBonusPct}
        pseudoVariant={b.pseudoVariant}
        pseudoAnimation={b.pseudoAnimation}
      />
    );
    case "M11": return (
      <M11Aurix
        {...props}
        pseudoSub={b.pseudoSub}
        followersCount={b.followersCount}
        socialHandle={b.socialHandle}
        gameImageUrl={b.gameImageUrl}
        gameLabel={b.gameLabel}
        gameBonusPct={b.gameBonusPct}
      />
    );
    case "M12": return <M12Chat {...props} />;
    case "M13": return <M13Ticket {...props} />;
    case "M14": return <M14Magazine {...props} />;
  }
}

function RenderDivider({ b, isMobile }: { b: V2DividerBlock; isMobile: boolean }) {
  return (
    <hr className="v2-block v2-divider" style={{
      ...commonToStyle(b, isMobile),
      border: "none",
      borderTop: `${b.thickness || "1px"} ${b.style || "solid"} ${b.color || "#444"}`,
      width: b.width || "100%",
      margin: "0 auto",
    }} />
  );
}

export function RenderBlock({ b, isMobile, zone, indices }: { b: V2Block; isMobile: boolean; zone?: V2ZoneKey; indices?: number[] }) {
  const ctx = React.useContext(EditCtx);
  const sel = !!ctx && zone && indices && isPathSelected(ctx, zone, indices);
  // Mode preview : présent dès qu'on a un editCtx (= rendu dans l'éditeur).
  const previewMode = !!ctx;
  let inner: React.ReactNode = null;
  switch (b.type) {
    case "text":      inner = <RenderText b={b} isMobile={isMobile} />; break;
    case "image":     inner = <RenderImage b={b} isMobile={isMobile} />; break;
    case "button":    inner = <RenderButton b={b} isMobile={isMobile} />; break;
    case "container": inner = <RenderContainer b={b} isMobile={isMobile} zone={zone} indices={indices} />; break;
    case "spacer":    inner = <RenderSpacer b={b} isMobile={isMobile} />; break;
    case "divider":   inner = <RenderDivider b={b} isMobile={isMobile} />; break;
    case "fsnCardM4": inner = <RenderFsnCardM4 b={b} isMobile={isMobile} />; break;
    case "m4V1LowerSections": inner = <RenderM4V1LowerSections b={b} previewMode={previewMode} />; break;
    case "v3GameModel": inner = <RenderV3GameModel b={b} />; break;
  }
  // Mode preview publique : aucun overlay, comportement standard
  if (!ctx || !zone || !indices) return <>{inner}</>;
  // Mode éditeur : wrap avec un span clickable + highlight si sélectionné
  return (
    <div
      onClick={(e) => { e.stopPropagation(); ctx.onSelect(zone, indices); }}
      style={{
        position: "relative",
        outline: sel ? "2px solid #7c5cff" : "1px dashed transparent",
        outlineOffset: sel ? "2px" : "0",
        transition: "outline-color 120ms",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.outline = "1px dashed rgba(124,92,255,.5)"; }}
      onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.outline = "1px dashed transparent"; }}
    >
      {inner}
    </div>
  );
}

// ─── Page renderer ───────────────────────────────────────────────────────────

export function RenderV2Page({ page, isMobile, editCtx }: { page: V2Page; isMobile: boolean; editCtx?: V2EditCtx }) {
  const g = page.globals || {};
  const pageStyle: React.CSSProperties = {
    background: g.bgPage || "#080212",
    color: "#ffffff",
    fontFamily: g.fontPrimary ? `"${g.fontPrimary}", system-ui` : "system-ui, -apple-system, sans-serif",
    minHeight: "100%",
    width: "100%",
  };
  // CRITIQUE : PostgreSQL JSONB ne préserve PAS l'ordre d'insertion des clés
  // (il les sort par longueur puis lexicographiquement). Donc Object.keys()
  // après un roundtrip DB renvoie un ordre faux. On utilise l'ordre canonique
  // défini par le modèle.
  const canonical = v2ZonesForModel(page.modelKind);
  const zones = canonical.filter((z) => (page.zones[z] || []).length > 0);
  const tree = (
    <div className="v2-page" style={pageStyle}>
      <V2Keyframes />
      {zones.map((zk) => {
        // Si la zone contient un bloc full-bleed (preset V1 lower sections),
        // on retire la padding du <section> pour qu'il s'étende edge-to-edge.
        const hasFullBleed = page.zones[zk].some((b) => b.type === "m4V1LowerSections");
        // Mode compactSpacing : les blocs gèrent leur propre spacing.
        const sectionPad = hasFullBleed ? 0 : (page.compactSpacing ? 0 : "16px 12px");
        return (
          <section key={zk} data-zone={zk} style={{ padding: sectionPad }}>
            {page.zones[zk].map((b, i) => (
              <RenderBlock
                key={b.id || i}
                b={b}
                isMobile={isMobile}
                zone={editCtx ? zk : undefined}
                indices={editCtx ? [i] : undefined}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
  return editCtx ? <EditCtx.Provider value={editCtx}>{tree}</EditCtx.Provider> : tree;
}
