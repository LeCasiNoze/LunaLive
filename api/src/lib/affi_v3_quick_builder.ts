// ─────────────────────────────────────────────────────────────────────────────
// Editor V3 — Quick wizard → V2Page builder
//
// La V3 réutilise 100 % la pipeline V2 (zones + blocks + RenderV2Page +
// /r/<slug>). On construit un V2Page (modèle M4V2) en partant du starter M4V2
// et en remplaçant la zone "aboveCards" + en personnalisant les 2 cards.
//
// Contrainte produit : la page rendue doit être pixel-identique à la M4 V1
// SAUF la zone hero qui est remplacée par
//   [image de profil ronde] + [pseudo encadré] + [Déposez X€] + [Jouer à Y€]
//
// Les controls de style "rapide" (couleur/police/taille) sont appliqués par
// ligne via V2TextStyle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type V2Page, type V2TextBlock, type V2ImageBlock, type V2ContainerBlock,
  type V2FsnCardM4Block, type V2TextStyle,
  makeV2BlockId,
} from "./affi_v2_types.js";
import { buildM4V2Starter } from "./affi_v2_starters.js";

// ─── Presets style "rapide" ─────────────────────────────────────────────────

export const V3_FONT_PRESETS = [
  { key: "poppins",   label: "Poppins",     family: "Poppins" },
  { key: "inter",     label: "Inter",       family: "Inter" },
  { key: "bebas",     label: "Bebas Neue",  family: "Bebas Neue" },
  { key: "anton",     label: "Anton",       family: "Anton" },
  { key: "montser",   label: "Montserrat",  family: "Montserrat" },
] as const;

export const V3_COLOR_PRESETS = [
  { key: "white",  label: "Blanc",  value: "#ffffff" },
  { key: "gold",   label: "Or",     value: "#FFD700" },
  { key: "ruby",   label: "Rubis",  value: "#E0115F" },
  { key: "green",  label: "Vert",   value: "#00E676" },
  { key: "muted",  label: "Gris",   value: "#AAA4B0" },
] as const;

export const V3_SIZE_SCALE = [
  { key: "xs",  label: "XS",  fontSize: "0.95rem",                         fontSizeMobile: "0.9rem" },
  { key: "s",   label: "S",   fontSize: "1.15rem",                         fontSizeMobile: "1.05rem" },
  { key: "m",   label: "M",   fontSize: "1.5rem",                          fontSizeMobile: "1.3rem" },
  { key: "l",   label: "L",   fontSize: "clamp(1.6rem, 4vw, 2.4rem)",      fontSizeMobile: "1.6rem" },
  { key: "xl",  label: "XL",  fontSize: "clamp(2rem, 5vw, 3rem)",          fontSizeMobile: "2rem" },
  { key: "xxl", label: "XXL", fontSize: "clamp(2.4rem, 6vw, 3.6rem)",      fontSizeMobile: "2.4rem" },
] as const;

export const V3_WEIGHT_PRESETS = [
  { key: "regular",  label: "Normal",  value: 500 },
  { key: "bold",     label: "Bold",    value: 700 },
  { key: "black",    label: "Black",   value: 900 },
] as const;

export type V3SizeKey = typeof V3_SIZE_SCALE[number]["key"];
export type V3WeightKey = typeof V3_WEIGHT_PRESETS[number]["key"];

export interface V3LineStyle {
  font?: string;          // family direct (ex "Inter")
  color?: string;         // hex
  size?: V3SizeKey;
  weight?: V3WeightKey;
  glow?: boolean;         // applique un textShadow doux de la couleur
}

// ─── Catalogue d'images jeu ─────────────────────────────────────────────────

export const V3_GAME_IMAGES = [
  {
    key: "penalty",
    label: "Penalty",
    url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png",
  },
  {
    key: "mines",
    label: "Mines",
    url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png",
  },
  {
    key: "tower",
    label: "Tower",
    url: "", // pas d'image disponible — l'utilisateur fournira un URL custom
  },
  {
    key: "chicken",
    label: "Chicken",
    url: "",
  },
] as const;

export type V3GameKey = typeof V3_GAME_IMAGES[number]["key"];

// ─── Aspect ratio + fit presets ────────────────────────────────────────────

export const V3_ASPECT_PRESETS = [
  { key: "16/9",  label: "16:9 (large)" },
  { key: "4/3",   label: "4:3" },
  { key: "1/1",   label: "1:1 (carré)" },
  { key: "21/9",  label: "21:9 (cinéma)" },
  { key: "3/4",   label: "3:4 (portrait)" },
] as const;

export type V3AspectKey = typeof V3_ASPECT_PRESETS[number]["key"];
export type V3ObjectFit = "cover" | "contain";

// ─── Inputs du wizard rapide ────────────────────────────────────────────────

export interface V3QuickInputs {
  /** Modèle utilisé (en V3 : "M1" = M4V1 dupliqué). */
  modelKind: "M1";
  pseudo?: string;                 // optionnel
  affiLink: string;                // requis
  /** X (en €) — null = champ vidé : on cache la ligne « Déposez X€ ». */
  depositAmount: number | null;
  /** Y (en €) — null = champ vidé : on cache la ligne « Jouer à Y€ ». */
  bonusAmount: number | null;
  profileImageUrl?: string;        // ronde + bordure si fournie
  /** 2 images parmi penalty/mines/tower/chicken/custom URL. */
  card1Image: { kind: V3GameKey | "custom"; url: string };
  card2Image: { kind: V3GameKey | "custom"; url: string };
  /** Aspect ratio + fit appliqués aux 2 cards (uniformes pour cohérence visuelle). */
  cardAspect: V3AspectKey;
  cardObjectFit: V3ObjectFit;
  /** Styles par ligne (par défaut conservent les valeurs M4 V1). */
  pseudoStyle?: V3LineStyle;
  depositLineStyle?: V3LineStyle;
  bonusLineStyle?: V3LineStyle;
}

export function defaultV3QuickInputs(): V3QuickInputs {
  return {
    modelKind: "M1",
    pseudo: "",
    affiLink: "",
    depositAmount: 10,
    bonusAmount: 20,
    profileImageUrl: "",
    card1Image: { kind: "penalty", url: V3_GAME_IMAGES[0].url },
    card2Image: { kind: "mines",   url: V3_GAME_IMAGES[1].url },
    cardAspect: "16/9",
    cardObjectFit: "cover",
    pseudoStyle:      { font: "Inter", color: "#FFD700", size: "m",  weight: "black", glow: true },
    depositLineStyle: { font: "Inter", color: "#ffffff", size: "l",  weight: "black" },
    bonusLineStyle:   { font: "Inter", color: "#FFD700", size: "l",  weight: "black", glow: true },
  };
}

// ─── Style helper ───────────────────────────────────────────────────────────

function lineStyleToV2(s: V3LineStyle | undefined, fallbackColor = "#ffffff"): V2TextStyle {
  const sizeEntry = V3_SIZE_SCALE.find((x) => x.key === (s?.size || "l"))!;
  const weightEntry = V3_WEIGHT_PRESETS.find((x) => x.key === (s?.weight || "black"))!;
  const color = s?.color || fallbackColor;
  return {
    fontFamily:     s?.font || "Inter",
    fontSize:       sizeEntry.fontSize,
    fontSizeMobile: sizeEntry.fontSizeMobile,
    fontWeight:     weightEntry.value,
    color,
    letterSpacing:  "-0.5px",
    lineHeight:     "1.1",
    textShadow:     s?.glow ? `0 0 16px ${color}66` : undefined,
  };
}

// ─── Builder principal ──────────────────────────────────────────────────────

export function buildV3PageFromQuickInputs(inputs: V3QuickInputs): V2Page {
  // 1) Partir du starter M4V2 fidèle V1 (cards/reviews/faq/footer déjà OK).
  const page = buildM4V2Starter();

  // 2) Hero zone : remplacer les 3 blocs par défaut par notre composition V3.
  const aboveCards: V2Page["zones"]["aboveCards"] = [];

  // 2a) Image de profil ronde (si fournie)
  if (inputs.profileImageUrl && inputs.profileImageUrl.trim()) {
    const profileBlock: V2ImageBlock = {
      id: makeV2BlockId("image"),
      type: "image",
      name: "Image de profil",
      src: inputs.profileImageUrl.trim(),
      alt: inputs.pseudo || "Profil",
      width: "120px",
      height: "120px",
      objectFit: "cover",
      borderRadius: "50%",
      border: "3px solid #FFD700",
      shadow: "0 8px 24px rgba(0,0,0,.45)",
      glow: "rgba(255,215,0,.45)",
      align: "center",
      marginTop: "32px",
      marginBottom: "16px",
    };
    // wrapper container pour bien centrer (l'image n'a pas display:block centré seule)
    const wrap: V2ContainerBlock = {
      id: makeV2BlockId("container"),
      type: "container",
      name: "Wrapper image profil",
      layout: "stack",
      children: [profileBlock],
      justify: "center",
      itemsAlign: "center",
      marginTop: "24px",
      marginBottom: "8px",
    };
    aboveCards.push(wrap);
  }

  // 2b) Pseudo encadré (si fourni)
  if (inputs.pseudo && inputs.pseudo.trim()) {
    const pseudoStyle = lineStyleToV2(inputs.pseudoStyle, "#FFD700");
    const pseudoText: V2TextBlock = {
      id: makeV2BlockId("text"),
      type: "text",
      name: "Pseudo",
      tag: "span",
      content: inputs.pseudo.trim(),
      align: "center",
      style: pseudoStyle,
    };
    const pseudoBox: V2ContainerBlock = {
      id: makeV2BlockId("container"),
      type: "container",
      name: "Cadre pseudo",
      layout: "stack",
      children: [pseudoText],
      justify: "center",
      itemsAlign: "center",
      bg: "rgba(255,214,0,.08)",
      border: "1px solid rgba(255,214,0,.35)",
      borderRadius: "999px",
      paddingX: "18px",
      paddingTop: "6px",
      paddingBottom: "6px",
      marginTop: inputs.profileImageUrl ? "0px" : "32px",
      marginBottom: "40px",   // ↑ espace entre pseudo et "Déposez X€"
      maxWidth: "fit-content",
      // pas de width fixe → RenderContainer applique margin: 0 auto = centré.
    };
    aboveCards.push(pseudoBox);
  }

  // 2c) "Déposez X€" — caché si X null
  if (inputs.depositAmount != null) {
    aboveCards.push({
      id: makeV2BlockId("text"),
      type: "text",
      name: "Ligne — Déposez X€",
      tag: "h1",
      content: `Déposez ${inputs.depositAmount}€`,
      align: "center",
      style: lineStyleToV2(inputs.depositLineStyle, "#ffffff"),
      marginBottom: "4px",
    });
  }

  // 2d) "Jouer à Y€" — caché si Y null
  // marginBottom = 8px : compense les 32px de padding (16 bottom de
  // aboveCards + 16 top de cards) pour que le total visible (8 + 32 = 40)
  // = la marginBottom du pseudo box (40). → équidistance pseudo↔cards.
  if (inputs.bonusAmount != null) {
    aboveCards.push({
      id: makeV2BlockId("text"),
      type: "text",
      name: "Ligne — Jouer à Y€",
      tag: "h1",
      content: `Jouer à ${inputs.bonusAmount}€`,
      align: "center",
      style: lineStyleToV2(inputs.bonusLineStyle, "#FFD700"),
      marginBottom: "8px",
    });
  }

  // Le DERNIER bloc visible du hero impose la distance avant les cartes.
  // On force sa marginBottom à 8px : 8 (margin) + 16 (aboveCards section
  // padding-bottom) + 16 (cards section padding-top) = 40px visible. Cette
  // valeur correspond au pseudo.marginBottom (40) → bloc offre équidistant.
  const last = aboveCards[aboveCards.length - 1] as any;
  if (last) last.marginBottom = "8px";

  page.zones.aboveCards = aboveCards;

  // Sections du bas : remplacer reviews + faq + footer par le bloc preset V1
  // (rend exactement le HTML/CSS de model4.html). Le sticky CTA est inclus.
  page.zones.reviews = [];
  page.zones.faq = [];
  page.zones.belowCards = [];
  page.zones.footer = [
    {
      id: makeV2BlockId("m4V1LowerSections"),
      type: "m4V1LowerSections",
      affiLink: inputs.affiLink,
      brandName: inputs.pseudo?.trim() || "",
    } as any,
  ];

  // 3) Cards : appliquer images, montants, lien d'affi.
  const cardsContainer = page.zones.cards[0] as V2ContainerBlock | undefined;
  if (cardsContainer && cardsContainer.type === "container") {
    const [c1, c2] = cardsContainer.children as V2FsnCardM4Block[];
    // Si null, on passe une string vide → M4V1Card masque la info-box.
    const dep = inputs.depositAmount != null ? `${inputs.depositAmount}€` : "";
    const bon = inputs.bonusAmount != null ? `${inputs.bonusAmount}€` : "";
    if (c1 && c1.type === "fsnCardM4") {
      c1.imgSrc = inputs.card1Image.url || c1.imgSrc;
      c1.imgAlt = inputs.card1Image.kind;
      c1.depositAmount = dep;
      c1.bonusAmount = bon;
      c1.href = inputs.affiLink;
      c1.imageAspectRatio = inputs.cardAspect;
      c1.imageObjectFit = inputs.cardObjectFit;
    }
    if (c2 && c2.type === "fsnCardM4") {
      c2.imgSrc = inputs.card2Image.url || c2.imgSrc;
      c2.imgAlt = inputs.card2Image.kind;
      c2.depositAmount = dep;
      c2.bonusAmount = bon;
      c2.href = inputs.affiLink;
      c2.imageAspectRatio = inputs.cardAspect;
      c2.imageObjectFit = inputs.cardObjectFit;
    }
  }

  // 4) Affi link / code → slug.
  page.affiLink = inputs.affiLink;
  try {
    const u = new URL(inputs.affiLink);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    page.affiCode = last.replace(/[^A-Za-z0-9_-]/g, "");
  } catch {
    page.affiCode = "";
  }
  // V3 : slug = <code>V3 (différencie des slugs V2 <code>M4 / <code>M5)
  page.slug = page.affiCode ? `${page.affiCode}V3` : "";
  page.casinoName = inputs.pseudo?.trim() || page.affiCode || "Page V3";
  page.pageTitle = page.casinoName;

  return page;
}
