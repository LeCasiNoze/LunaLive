// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — types partagés
// ─────────────────────────────────────────────────────────────────────────────

export type V2Model = "M4V2" | "M5V2";

export type V2BlockType =
  | "text"
  | "image"
  | "button"
  | "container"
  | "spacer"
  | "divider"
  | "fsnCardM4"
  | "m4V1LowerSections"
  | "v3GameModel";

export interface V2BaseBlock {
  id: string;
  type: V2BlockType;
  name?: string;
}

export interface V2CommonStyle {
  marginTop?: string;
  marginBottom?: string;
  marginX?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingX?: string;
  align?: "left" | "center" | "right" | "stretch";
  marginTopMobile?: string;
  marginBottomMobile?: string;
  paddingTopMobile?: string;
  paddingBottomMobile?: string;
}

export interface V2Effects {
  shadow?: string;
  glow?: string;
  borderRadius?: string;
  border?: string;
  bg?: string;
  bgImage?: string;
  bgOpacity?: number;
  hoverScale?: number;
  animation?: "none" | "fadeIn" | "slideUp" | "pulse" | "float";
  animationDelay?: string;
  overflow?: "visible" | "hidden" | "auto";
}

export interface V2TextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: string;
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
  content: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  style?: V2TextStyle;
  lineStyles?: Record<number, V2TextStyle>;
  htmlContent?: string;
}

export interface V2ImageBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "image";
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill" | "none";
  overlayText?: string;
  overlayStyle?: V2TextStyle;
  overlayPosition?: "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";
  href?: string;
}

export interface V2ButtonBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "button";
  label: string;
  href: string;
  variant?: "primary" | "outline" | "ghost" | "custom";
  width?: string;
  bgColor?: string;
  textColor?: string;
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: string;
  textTransform?: "none" | "uppercase" | "capitalize";
  iconLeft?: string;
  iconRight?: string;
  fullWidth?: boolean;
}

export interface V2ContainerBlock extends V2BaseBlock, V2CommonStyle, V2Effects {
  type: "container";
  layout: "stack" | "row" | "grid";
  gap?: string;
  columns?: number;
  children: V2Block[];
  maxWidth?: string;
  width?: string;
  height?: string;
  flexShrink?: number;
  justify?: "start" | "center" | "end" | "between" | "around";
  itemsAlign?: "start" | "center" | "end" | "stretch";
}

export interface V2SpacerBlock extends V2BaseBlock {
  type: "spacer";
  height?: string;
  heightMobile?: string;
}

export interface V2DividerBlock extends V2BaseBlock, V2CommonStyle {
  type: "divider";
  color?: string;
  thickness?: string;
  width?: string;
  style?: "solid" | "dashed" | "dotted";
}

export interface V2FsnCardM4Block extends V2BaseBlock, V2CommonStyle {
  type: "fsnCardM4";
  imgSrc: string;
  imgAlt?: string;
  depositAmount: string;
  bonusAmount: string;
  bonusPct?: string;
  href: string;
  animationDelay?: string;
  imageAspectRatio?: string;
  imageObjectFit?: "cover" | "contain";
  theme?: M4ThemeColors;
}

export interface M4ThemeColors {
  accent?: string;
  accentLight?: string;
  accentGlow?: string;
  accentSoft?: string;
  accentBorder?: string;
  bgPage?: string;
  bgCard?: string;
  borderColor?: string;
}

export interface V2M4V1LowerSectionsBlock extends V2BaseBlock {
  type: "m4V1LowerSections";
  affiLink: string;
  brandName?: string;
  theme?: M4ThemeColors;
}

export type V3GameModelKind = "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "M9" | "M10" | "M11" | "M12" | "M13" | "M15" | "M16";

export interface V2V3GameModelBlock extends V2BaseBlock {
  type: "v3GameModel";
  gameKind: V3GameModelKind;
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  theme?: M4ThemeColors;
  penaltyTeam?: string;
  pseudoSub?: string;
  followersCount?: string;
  socialHandle?: string;
  gameImageUrl?: string;
  gameLabel?: string;
  gameBonusPct?: string;
  pseudoVariant?: "fade" | "outline" | "3d" | "neon" | "stamp" | "gold";
  pseudoAnimation?: "none" | "pulse" | "float" | "glow";
  pseudoStyle?: any;
  /** Affiche explicitement les elements VIP du modele (prioritaire sur hideVip). */
  showVip?: boolean;
  /** Masque les elements VIP du modele (M10 : teaser + mini sticky). */
  hideVip?: boolean;
}

export type V2Block =
  | V2TextBlock
  | V2ImageBlock
  | V2ButtonBlock
  | V2ContainerBlock
  | V2SpacerBlock
  | V2DividerBlock
  | V2FsnCardM4Block
  | V2M4V1LowerSectionsBlock
  | V2V3GameModelBlock;

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
  affiCode: string;
  affiLink: string;
  casinoName: string;
  slug: string;
  pageTitle?: string;
  compactSpacing?: boolean;
  zones: Record<V2ZoneKey, V2Block[]>;
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

export function makeV2BlockId(type: V2BlockType): string {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

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

export function buildV2DefaultSlug(affiLink: string, modelKind: V2Model): string {
  const code = extractAffiCode(affiLink);
  const n = modelKind === "M4V2" ? "4" : "5";
  return code ? `${code}M${n}` : "";
}

export function v2ZonesForModel(model: V2Model): V2ZoneKey[] {
  if (model === "M4V2") return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
  return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
}

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
export function newFsnCardM4Block(): V2FsnCardM4Block {
  return {
    id: makeV2BlockId("fsnCardM4"),
    type: "fsnCardM4",
    imgSrc: "",
    imgAlt: "",
    depositAmount: "10€",
    bonusAmount: "20€",
    bonusPct: "100%",
    href: "",
    animationDelay: "0s",
  };
}

export function newBlockOfType(type: V2BlockType): V2Block {
  switch (type) {
    case "text":      return newTextBlock();
    case "image":     return newImageBlock();
    case "button":    return newButtonBlock();
    case "container": return newContainerBlock();
    case "spacer":    return newSpacerBlock();
    case "divider":   return newDividerBlock();
    case "fsnCardM4": return newFsnCardM4Block();
    case "m4V1LowerSections":
      return { id: makeV2BlockId("m4V1LowerSections"), type: "m4V1LowerSections", affiLink: "" };
    case "v3GameModel":
      return { id: makeV2BlockId("v3GameModel"), type: "v3GameModel", gameKind: "M3", affiLink: "" };
  }
}
