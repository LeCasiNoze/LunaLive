// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — types partagés
//
// Architecture : un page = un arbre de zones, chaque zone contient des blocs
// primitifs réordonnables. Aucun chevauchement avec le V1 (qui reste figé).
// ─────────────────────────────────────────────────────────────────────────────

export type V2Model = "M4V2" | "M5V2";

export type V2BlockType =
  | "text"
  | "image"
  | "button"
  | "container"
  | "spacer"
  | "divider";

export interface V2BaseBlock {
  id: string;
  type: V2BlockType;
  /** Nom custom affiché dans la sidebar/PropPanel (ex: "Pseudo", "Image card 1").
   *  Si absent, on utilise le label par défaut du type. */
  name?: string;
}

/** Style commun à tous les blocs visuels — overrides par device disponibles
 *  pour les valeurs qui changent souvent (font-size, padding, margin). */
export interface V2CommonStyle {
  marginTop?: string;
  marginBottom?: string;
  marginX?: string;             // = margin-left + margin-right
  paddingTop?: string;
  paddingBottom?: string;
  paddingX?: string;
  align?: "left" | "center" | "right" | "stretch";
  // Mobile overrides (ignored on desktop)
  marginTopMobile?: string;
  marginBottomMobile?: string;
  paddingTopMobile?: string;
  paddingBottomMobile?: string;
}

/** Effets visuels appliqués sur le wrapper du bloc. */
export interface V2Effects {
  shadow?: string;              // box-shadow CSS
  glow?: string;                // glow couleur (génère un drop-shadow)
  borderRadius?: string;
  border?: string;
  bg?: string;                  // background-color ou gradient
  bgImage?: string;             // url de fond
  bgOpacity?: number;           // 0..1
  hoverScale?: number;          // ex 1.03 pour zoom au hover
  animation?: "none" | "fadeIn" | "slideUp" | "pulse" | "float";
  animationDelay?: string;      // ex "0.2s"
  overflow?: "visible" | "hidden" | "auto";  // utile pour clipper enfants à un borderRadius
}

// ─── Text ────────────────────────────────────────────────────────────────────

export interface V2TextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: string;            // base
  fontSizeMobile?: string;
  fontSizeDesktop?: string;
  color?: string;
  letterSpacing?: string;
  lineHeight?: string;
  textTransform?: "none" | "uppercase" | "capitalize";
  textShadow?: string;
}

export interface V2TextBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "text";
  /** Texte simple — chaque ligne se rend en <span class="line"> séparé pour
   *  permettre stylage par ligne via la prop `lineStyles`. */
  content: string;
  /** Tag HTML : h1/h2/h3/p/span — affecte l'accessibilité + le SEO. */
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  style?: V2TextStyle;
  /** Style spécifique appliqué à une ligne précise (index 0-based). Permet
   *  d'avoir "Jimmy" doré ligne 1 et "Double ton dépôt" blanc ligne 2 par ex. */
  lineStyles?: Record<number, V2TextStyle>;
  /** Échappatoire HTML/SVG : si fourni, le contenu est rendu via
   *  dangerouslySetInnerHTML au lieu de `content`. Utilisé pour injecter des
   *  icônes SVG inline (gift, trending-up, info...) qui ne peuvent pas être
   *  représentées en texte/emoji de façon fidèle. `content` est ignoré. */
  htmlContent?: string;
}

// ─── Image ───────────────────────────────────────────────────────────────────

export interface V2ImageBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "image";
  src: string;
  alt?: string;
  width?: string;               // ex "100%", "300px"
  height?: string;
  /** Ratio CSS (ex "16/9", "1/1") — appliqué sur le wrapper de l'image. Permet
   *  de reproduire fidèlement les containers d'image responsives V1. */
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill" | "none";
  /** Texte superposé en overlay (ex pour bannière). */
  overlayText?: string;
  overlayStyle?: V2TextStyle;
  overlayPosition?: "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";
  /** Lien optionnel — wrap l'image dans un <a>. */
  href?: string;
}

// ─── Button ──────────────────────────────────────────────────────────────────

export interface V2ButtonBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "button";
  label: string;
  href: string;
  /** "primary" = gradient or doré, "outline" = bordure, "ghost" = transparent.
   *  Style rapide en plus des overrides custom. */
  variant?: "primary" | "outline" | "ghost" | "custom";
  width?: string;
  bgColor?: string;             // si variant=custom
  textColor?: string;
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: string;
  textTransform?: "none" | "uppercase" | "capitalize";
  iconLeft?: string;            // emoji ou char unicode pour l'instant
  iconRight?: string;
  fullWidth?: boolean;
}

// ─── Container ───────────────────────────────────────────────────────────────

export interface V2ContainerBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "container";
  layout: "stack" | "row" | "grid";
  gap?: string;
  /** Pour layout grid : nombre de colonnes (1-4). */
  columns?: number;
  children: V2Block[];
  /** Largeur max du conteneur. */
  maxWidth?: string;
  /** Largeur fixe (utile pour cercles parfaits ex: "36px"). */
  width?: string;
  /** Hauteur fixe (utile pour cercles parfaits). */
  height?: string;
  /** Empêche le shrink dans un parent flex (utile pour avatars/icônes). */
  flexShrink?: number;
  /** Justification horizontale des enfants (flex justify-content). */
  justify?: "start" | "center" | "end" | "between" | "around";
  /** Alignement vertical des enfants (flex align-items). */
  itemsAlign?: "start" | "center" | "end" | "stretch";
}

// ─── Spacer ──────────────────────────────────────────────────────────────────

export interface V2SpacerBlock extends V2BaseBlock {
  type: "spacer";
  height?: string;              // ex "20px", "2rem"
  heightMobile?: string;
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export interface V2DividerBlock extends V2BaseBlock, V2CommonStyle {
  type: "divider";
  color?: string;
  thickness?: string;           // ex "1px"
  width?: string;               // ex "100%", "60%"
  style?: "solid" | "dashed" | "dotted";
}

// ─── Union ───────────────────────────────────────────────────────────────────

export type V2Block =
  | V2TextBlock
  | V2ImageBlock
  | V2ButtonBlock
  | V2ContainerBlock
  | V2SpacerBlock
  | V2DividerBlock;

// ─── Page complète ───────────────────────────────────────────────────────────

/** Zones structurelles pour M4 V2. M5 V2 aura sa propre liste de zones. */
export type V2ZoneKey = "aboveCards" | "cards" | "belowCards" | "reviews" | "faq" | "footer";

export const V2_ZONE_LABELS: Record<V2ZoneKey, string> = {
  aboveCards: "Au-dessus des cartes",
  cards:      "Cartes promo",
  belowCards: "En-dessous des cartes",
  reviews:    "Section avis",
  faq:        "Section FAQ",
  footer:     "Pied de page",
};

export interface V2Page {
  modelKind: V2Model;
  /** Code extrait automatiquement de affiLink (dernier segment URL). */
  affiCode: string;
  affiLink: string;
  casinoName: string;
  /** Slug verrouillé — user-editable mais ne change pas auto. */
  slug: string;
  /** Métadonnées SEO. */
  pageTitle?: string;
  /** Zones structurelles avec leurs blocs. */
  zones: Record<V2ZoneKey, V2Block[]>;
  /** Variables CSS globales. */
  globals: {
    bgPage?: string;
    bgCard?: string;
    brandGold?: string;
    brandRuby?: string;
    casinoGreen?: string;
    borderColor?: string;
    fontPrimary?: string;
    fontHeading?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function makeV2BlockId(type: V2BlockType): string {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Extrait le code d'affi depuis une URL. Ex: https://celsius.games/UHyEqTtNlL → UHyEqTtNlL */
export function extractAffiCode(affiLink: string): string {
  if (!affiLink) return "";
  try {
    const u = new URL(affiLink);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return last.replace(/[^A-Za-z0-9_-]/g, "");
  } catch {
    return "";
  }
}

/** Construit le slug par défaut : <code>M<N> sans tiret. Ex: UHyEqTtNlLM4 */
export function buildV2DefaultSlug(affiLink: string, modelKind: V2Model): string {
  const code = extractAffiCode(affiLink);
  const n = modelKind === "M4V2" ? "4" : "5";
  return code ? `${code}M${n}` : "";
}

/** Liste des zones pour un modèle donné. */
export function v2ZonesForModel(model: V2Model): V2ZoneKey[] {
  if (model === "M4V2") return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
  // M5V2 a ses propres zones — à définir quand on attaquera M5
  return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
}

/** Nouvelle page vide — zéro défaut hardcodé (pas de Celsius/LeCasiNoze). */
export function newV2Page(modelKind: V2Model): V2Page {
  const zones = {} as Record<V2ZoneKey, V2Block[]>;
  for (const z of v2ZonesForModel(modelKind)) zones[z] = [];
  return {
    modelKind,
    affiCode: "",
    affiLink: "",
    casinoName: "",
    slug: "",
    pageTitle: "",
    zones,
    globals: {},
  };
}

// ─── Default factories pour création rapide d'un bloc ────────────────────────

export function newTextBlock(content = "Mon texte"): V2TextBlock {
  return { id: makeV2BlockId("text"), type: "text", content, tag: "p" };
}
export function newImageBlock(src = ""): V2ImageBlock {
  return { id: makeV2BlockId("image"), type: "image", src, alt: "" };
}
export function newButtonBlock(label = "Cliquer ici", href = ""): V2ButtonBlock {
  return { id: makeV2BlockId("button"), type: "button", label, href, variant: "primary" };
}
export function newContainerBlock(layout: V2ContainerBlock["layout"] = "stack"): V2ContainerBlock {
  return { id: makeV2BlockId("container"), type: "container", layout, children: [], gap: "12px" };
}
export function newSpacerBlock(): V2SpacerBlock {
  return { id: makeV2BlockId("spacer"), type: "spacer", height: "20px" };
}
export function newDividerBlock(): V2DividerBlock {
  return { id: makeV2BlockId("divider"), type: "divider", thickness: "1px", color: "#444", width: "60%" };
}

export function newBlockOfType(type: V2BlockType): V2Block {
  switch (type) {
    case "text":      return newTextBlock();
    case "image":     return newImageBlock();
    case "button":    return newButtonBlock();
    case "container": return newContainerBlock();
    case "spacer":    return newSpacerBlock();
    case "divider":   return newDividerBlock();
  }
}
