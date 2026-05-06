// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — starter templates fidèles aux modèles V1
// (le but : que la V2 vide ressemble exactement au M4 V1, mais 100 %
//  modifiable bloc par bloc, contrairement au V1 où les classes CSS étaient
//  hardcodées dans le HTML template).
// ─────────────────────────────────────────────────────────────────────────────

import {
  type V2Page,
  type V2Block,
  type V2Model,
  type V2TextBlock,
  type V2ImageBlock,
  type V2ButtonBlock,
  type V2ContainerBlock,
  newV2Page,
  makeV2BlockId,
} from "./editor_v2_types";

// ─── M4 palette (extrait du model4.html) ────────────────────────────────────
const M4 = {
  bgPage: "#080212",
  bgCard: "#150821",
  brandGold: "#FFD700",
  brandRuby: "#E0115F",
  casinoGreen: "#00E676",
  borderColor: "#331A47",
  textMuted: "#AAA4B0", // V1: --text-muted exact
  fontPrimary: "Poppins", // V1: body font
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function txt(content: string, override: Partial<V2TextBlock> = {}): V2TextBlock {
  return { id: makeV2BlockId("text"), type: "text", content, tag: "p", ...override };
}
function img(src: string, override: Partial<V2ImageBlock> = {}): V2ImageBlock {
  return { id: makeV2BlockId("image"), type: "image", src, alt: "", ...override };
}
function btn(label: string, override: Partial<V2ButtonBlock> = {}): V2ButtonBlock {
  return { id: makeV2BlockId("button"), type: "button", label, href: "", variant: "primary", ...override };
}
function ct(layout: V2ContainerBlock["layout"], children: V2Block[], override: Partial<V2ContainerBlock> = {}): V2ContainerBlock {
  return { id: makeV2BlockId("container"), type: "container", layout, children, ...override };
}

// ─── M4 V2 — clone fidèle du rendu V1 ────────────────────────────────────────

// Catalogue d'images par défaut M4 (gallerie sélectionnable dans l'éditeur)
export const M4_DEFAULT_IMAGES: Array<{ name: string; url: string }> = [
  { name: "Penalty Duel",       url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png" },
  { name: "Jeu des Mines",      url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png" },
  { name: "Sweet Bonanza",      url: "https://cdn.phototourl.com/member/2026-04-10-af97004c-818f-40d3-b081-404c3ad3dfa7.png" },
];

const M4_DEFAULT_IMG_1 = M4_DEFAULT_IMAGES[0].url;
const M4_DEFAULT_IMG_2 = M4_DEFAULT_IMAGES[1].url;

// Copie 1:1 du M4 V1 (web/public/affi_templates/model4.html lignes 595-640).
// Chaque div / span / styling V1 devient un V2Block primitif modifiable.
function buildM4Card(
  label: string,
  bonusPct: string,
  defaultImg: string,
  depositAmount: string,
  bonusAmount: string,
  animationDelay: string = "0s",
): V2ContainerBlock {
  return ct("stack", [
    // .promo-image-container V1 : aspect-ratio 16/9, bg #000, object-fit:contain,
    // border-bottom 2px (rendu via le divider sibling).
    img(defaultImg, {
      name: "Image promo",
      width: "100%",
      aspectRatio: "16/9",
      objectFit: "contain",
      align: "stretch",
      bg: "#000",
    }),
    // séparateur 2px = .promo-image-container { border-bottom: 2px solid border-color } V1
    {
      id: makeV2BlockId("divider"),
      type: "divider",
      name: "Séparateur image/body",
      thickness: "2px",
      color: M4.borderColor,
      width: "100%",
      marginTop: "0",
      marginBottom: "0",
    } as V2Block,
    // .promo-body — padding 22px, alignement gauche (V1 fidèle)
    ct("stack", [
      // .offer-header — left aligned, gap 12px
      ct("row", [
        // .icon-circle 36×36 cercle parfait + SVG gift V1 (18×18, gold)
        ct("stack", [
          txt("", {
            tag: "span",
            htmlContent: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${M4.brandGold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 5 12 8c0-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"></path></svg>`,
            style: { lineHeight: "1" },
          }),
        ], {
          name: "Icon circle",
          width: "36px",
          height: "36px",
          flexShrink: 0,
          bg: "rgba(255, 214, 0, 0.1)",
          borderRadius: "50%",
          border: "1px solid rgba(255,214,0,0.2)",
          justify: "center",
          itemsAlign: "center",
        }),
        // .offer-title
        txt("Offre de Bienvenue", {
          name: "Titre offre",
          tag: "span",
          style: {
            fontFamily: "Poppins",
            fontSize: "1rem",
            fontWeight: 800,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "1px",
          },
        }),
      ], {
        name: "Header offre",
        gap: "12px",
        justify: "start",
        itemsAlign: "center",
        marginBottom: "8px",
      }),

      // .offer-subtitle : SVG trending-up vert + "BONUS 100% AUTOMATIQUE"
      // 100% en strong (plus gras) — V1 fidèle (model4.html ligne 612-618)
      ct("row", [
        txt("", {
          name: "Icône bonus",
          tag: "span",
          htmlContent: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${M4.casinoGreen}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
          style: { lineHeight: "1" },
        }),
        // V1 : ".offer-subtitle" font-size 0.9rem, gap 8px ; "BONUS … AUTOMATIQUE"
        // est du texte normal (font-weight hérité 400), seul "<strong>100%</strong>"
        // est en gras (700). Police Poppins, couleur #fff.
        txt("BONUS", {
          name: "Texte BONUS",
          tag: "span",
          style: { fontFamily: "Poppins", fontSize: "0.9rem", fontWeight: 400, color: "#ffffff" },
        }),
        txt(bonusPct, {
          name: "Pct bonus",
          tag: "span",
          style: { fontFamily: "Poppins", fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" },
        }),
        txt("AUTOMATIQUE", {
          name: "Texte AUTOMATIQUE",
          tag: "span",
          style: { fontFamily: "Poppins", fontSize: "0.9rem", fontWeight: 400, color: "#ffffff" },
        }),
      ], {
        name: "Sous-titre offre",
        gap: "8px",
        justify: "start",
        itemsAlign: "center",
        marginBottom: "20px",
      }),

      // .info-box — bg noir, padding 16px, radius 8px
      ct("stack", [
        // .info-title — SVG info-circle gold + "C'est simple" — left aligned
        ct("row", [
          txt("", {
            name: "Icône info",
            tag: "span",
            htmlContent: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${M4.brandGold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
            style: { lineHeight: "1" },
          }),
          txt("C'est simple", {
            name: "Label info",
            tag: "span",
            style: {
              fontFamily: "Poppins",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: M4.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            },
          }),
        ], { gap: "8px", justify: "start", itemsAlign: "center", marginBottom: "10px" }),

        // .info-steps — JUSTIFY SPACE-BETWEEN (V1)
        ct("row", [
          txt(`Déposez ${depositAmount}`, {
            name: "Step déposez",
            tag: "span",
            style: { fontFamily: "Poppins", fontSize: "1rem", fontWeight: 800, color: "#ffffff" },
          }),
          txt("→", {
            tag: "span",
            style: { fontFamily: "Poppins", fontSize: "1.1rem", color: "#ffffff", fontWeight: 800 },
          }),
          txt(`Recevez ${bonusAmount}`, {
            name: "Step recevez",
            tag: "span",
            style: {
              fontFamily: "Poppins",
              fontSize: "1rem", fontWeight: 800,
              color: M4.brandGold,
              textShadow: `0 0 10px ${M4.brandGold}`,
            },
          }),
        ], { gap: "8px", justify: "between", itemsAlign: "center" }),
      ], {
        name: "Box C'est simple",
        bg: "rgba(0,0,0,0.5)",
        borderRadius: "8px",
        paddingTop: "16px", paddingBottom: "16px", paddingX: "16px",
        border: `1px solid ${M4.borderColor}`,
        marginBottom: "20px",
      }),

      // .btn-jouer V1 — gradient gold 135deg #FFD700→#FFC200, padding 16px 0,
      // radius 8px, font 1.1rem/800/uppercase Poppins, shadow gold, pulseGold.
      btn("JOUER", {
        name: "Bouton JOUER",
        variant: "primary",
        fullWidth: true,
        borderRadius: "8px",
        paddingX: "0",
        paddingTop: "16px",
        paddingBottom: "16px",
        fontFamily: "Poppins",
        fontSize: "1.1rem",
        fontWeight: 800,
        textTransform: "uppercase",
        animation: "pulse",
        shadow: "0 8px 15px rgba(255, 214, 0, 0.4)",
      }),
    ], {
      name: "Body card",
      paddingX: "22px",
      paddingTop: "22px",
      paddingBottom: "22px",
    }),
  ], {
    name: label,
    bg: M4.bgCard,
    // V1: .promo-card { border-radius: var(--radius=12px); border: 2px solid var(--border-color);
    //                   overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,.9);
    //                   animation: float 6s ease-in-out infinite; }
    borderRadius: "12px",
    border: `2px solid ${M4.borderColor}`,
    shadow: "0 30px 60px rgba(0, 0, 0, 0.9)",
    overflow: "hidden",
    animation: "float",
    animationDelay,
  });
}

function buildM4ReviewCard(name: string, gain: string, text: string, when: string): V2ContainerBlock {
  return ct("stack", [
    // top : avatar + nom + verified + gain — centré
    ct("row", [
      // Avatar cercle parfait 44x44
      ct("stack", [
        txt("👤", {
          tag: "span",
          align: "center",
          style: { fontSize: "20px", lineHeight: "1" },
        }),
      ], {
        width: "44px",
        height: "44px",
        flexShrink: 0,
        bg: "rgba(255,214,0,.12)",
        border: "1px solid rgba(255,214,0,.25)",
        borderRadius: "50%",
        justify: "center",
        itemsAlign: "center",
      }),
      ct("stack", [
        ct("row", [
          txt(name, { tag: "span", style: { fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" } }),
          // badge "vérifié" pastille verte
          ct("row", [
            txt("✓", { tag: "span", style: { fontSize: "0.7rem", color: "#0a0", fontWeight: 900 } }),
            txt("Vérifié", { tag: "span", style: { fontSize: "0.7rem", color: M4.casinoGreen, fontWeight: 700 } }),
          ], {
            gap: "3px",
            justify: "center",
            itemsAlign: "center",
            bg: "rgba(0,230,118,.12)",
            border: "1px solid rgba(0,230,118,.3)",
            borderRadius: "999px",
            paddingX: "8px",
            paddingTop: "2px",
            paddingBottom: "2px",
          }),
        ], { gap: "8px", justify: "center", itemsAlign: "center" }),
        txt(`Gain encaissé · ${gain}`, {
          tag: "span",
          align: "center",
          style: { fontSize: "0.78rem", color: M4.textMuted, fontWeight: 500 },
        }),
      ], { gap: "2px" }),
    ], { gap: "10px", justify: "center", itemsAlign: "center", marginBottom: "10px" }),

    // étoiles 5/5 + date
    ct("row", [
      txt("★★★★★", {
        tag: "span",
        style: { fontSize: "0.95rem", color: M4.brandGold, letterSpacing: "1px" },
      }),
      txt(`· ${when}`, {
        tag: "span",
        style: { fontSize: "0.75rem", color: M4.textMuted, fontWeight: 500 },
      }),
    ], { gap: "8px", justify: "center", itemsAlign: "center", marginBottom: "12px" }),

    // texte du témoignage — centré
    txt(text, {
      tag: "p",
      align: "center",
      style: { fontSize: "0.95rem", lineHeight: "1.7", color: "rgba(255,255,255,.82)" },
    }),
  ], {
    bg: M4.bgCard,
    borderRadius: "14px",
    border: `1px solid ${M4.borderColor}`,
    paddingX: "20px",
    paddingTop: "20px",
    paddingBottom: "20px",
    animation: "fadeIn",
  });
}

function buildM4FaqItem(q: string, a: string): V2ContainerBlock {
  return ct("stack", [
    // question — icône Q dorée + texte
    ct("row", [
      ct("stack", [
        txt("?", {
          tag: "span",
          align: "center",
          style: { fontSize: "14px", fontWeight: 900, color: M4.brandGold, lineHeight: "1" },
        }),
      ], {
        width: "28px",
        height: "28px",
        flexShrink: 0,
        bg: "rgba(255,214,0,.12)",
        border: "1px solid rgba(255,214,0,.3)",
        borderRadius: "50%",
        justify: "center",
        itemsAlign: "center",
      }),
      txt(q, {
        tag: "p",
        style: { fontSize: "1rem", fontWeight: 700, color: "#ffffff", lineHeight: "1.4" },
      }),
    ], { gap: "12px", justify: "center", itemsAlign: "center", marginBottom: "10px" }),
    // réponse
    txt(a, {
      tag: "p",
      align: "center",
      style: { fontSize: "0.9rem", lineHeight: "1.65", color: M4.textMuted },
    }),
  ], {
    bg: M4.bgCard,
    borderRadius: "12px",
    border: `1px solid ${M4.borderColor}`,
    paddingX: "20px",
    paddingTop: "18px",
    paddingBottom: "18px",
    marginBottom: "14px",
  });
}

export function buildM4V2Starter(): V2Page {
  const page = newV2Page("M4V2");

  // HERO ZONE (aboveCards) — 3 lignes : pseudo (vide), "Déposer X", "Jouer avec Y"
  // Pseudo vide par défaut → le bloc est masqué automatiquement (RenderText
  // retourne null si content vide). L'user remplit s'il veut, et c'est centré.
  page.zones.aboveCards.push(
    // 1) Pseudo — vide par défaut
    txt("", {
      name: "Pseudo",
      tag: "h2",
      align: "center",
      style: {
        fontFamily: "Inter",
        fontSize: "1.5rem",
        fontWeight: 800,
        color: M4.brandGold,
        letterSpacing: ".01em",
        textShadow: `0 0 18px ${M4.brandGold}55`,
      },
      marginTop: "32px",
      marginBottom: "8px",
    }),
    // 2) "Déposer 10€"
    txt("Déposer 10€", {
      name: "Hero — Déposer X",
      tag: "h1",
      align: "center",
      style: {
        fontFamily: "Inter",
        fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
        fontSizeMobile: "1.6rem",
        fontWeight: 900,
        color: "#ffffff",
        letterSpacing: "-0.5px",
        lineHeight: "1.1",
      },
      marginBottom: "4px",
    }),
    // 3) "Jouer avec 20€" — en doré pour faire écho au gain
    txt("Jouer avec 20€", {
      name: "Hero — Jouer avec Y",
      tag: "h1",
      align: "center",
      style: {
        fontFamily: "Inter",
        fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
        fontSizeMobile: "1.6rem",
        fontWeight: 900,
        color: M4.brandGold,
        letterSpacing: "-0.5px",
        lineHeight: "1.1",
        textShadow: `0 0 16px ${M4.brandGold}66`,
      },
      marginBottom: "20px",
    }),
  );

  // CARDS ZONE — empilées (1 colonne au lieu de grid 2)
  page.zones.cards.push(
    ct("stack",
      [
        buildM4Card("Card 1", "100%", M4_DEFAULT_IMG_1, "10€", "20€", "0s"),
        buildM4Card("Card 2", "100%", M4_DEFAULT_IMG_2, "10€", "20€", "-3s"),
      ],
      {
        gap: "28px",
        maxWidth: "440px",
        marginBottom: "60px",
        align: "center",
      }),
  );

  // BELOW (vide pour l'instant — l'user peut y ajouter du contenu)
  // REVIEWS ZONE
  page.zones.reviews.push(
    txt("AVIS DES JOUEURS", {
      tag: "h2",
      align: "center",
      style: {
        fontFamily: "Inter",
        fontSize: "clamp(2rem, 4vw, 3rem)",
        fontWeight: 900,
        color: "#ffffff",
        letterSpacing: "-0.5px",
      },
      marginTop: "60px",
      marginBottom: "8px",
    }),
    txt("Plus de 50 000 joueurs nous font confiance", {
      tag: "p",
      align: "center",
      style: { fontSize: "1rem", color: M4.textMuted },
      marginBottom: "32px",
    }),
    ct("stack", [
      buildM4ReviewCard("Pierre L.", "400€",
        "Offre VIP validée. Le bonus s'est activé en 1 minute après mon dépôt. Cashout de 400€ reçu par virement SEPA. Rapide et discret.",
        "il y a 2 jours"),
      buildM4ReviewCard("Sophie M.", "180€",
        "Interface haute qualité sur téléphone, on se croirait dans un casino VIP. Pas de bugs sur les mini-jeux. Le bonus est un vrai plus.",
        "il y a 5 jours"),
      buildM4ReviewCard("Karim B.", "100€",
        "Inscription et vérification ultra-rapide. Dépôt sécurisé, j'ai posé 50€, j'ai eu 100€ de capital. Service client très réactif.",
        "il y a 1 semaine"),
    ], {
      gap: "16px",
      maxWidth: "440px",
      marginBottom: "40px",
      align: "center",
    }),
  );

  // FAQ ZONE
  page.zones.faq.push(
    txt("QUESTIONS FRÉQUENTES", {
      tag: "h2",
      align: "center",
      style: {
        fontFamily: "Inter",
        fontSize: "clamp(2rem, 4vw, 3rem)",
        fontWeight: 900,
        color: "#ffffff",
        letterSpacing: "-0.5px",
      },
      marginTop: "60px",
      marginBottom: "32px",
    }),
    ct("stack", [
      buildM4FaqItem(
        "Quelles sont les garanties de sécurité des dépôts ?",
        "La plateforme utilise un cryptage SSL 256 bits certifiant l'anonymat et la sécurité totale de vos transactions. Vos fonds sont stockés sur des serveurs régulés."
      ),
      buildM4FaqItem(
        "Comment retirer mes gains ?",
        "Les demandes de retrait SEPA sont traitées sous 24h ouvrées. Le délai bancaire légal s'ajoute pour que les fonds apparaissent sur votre compte."
      ),
      buildM4FaqItem(
        "Le bonus est-il garanti ?",
        "Oui. Dès que ton premier dépôt est validé, le bonus est crédité automatiquement. Aucune condition cachée."
      ),
    ], {
      maxWidth: "440px",
    }),
  );

  // FOOTER
  page.zones.footer.push(
    txt(
      "Les jeux d'argent comportent des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09-74-75-13-13. Cette offre est strictement interdite aux mineurs.",
      {
        tag: "p",
        align: "center",
        style: { fontSize: "0.78rem", color: M4.textMuted, lineHeight: "1.6" },
        paddingTop: "60px", paddingBottom: "20px",
        paddingX: "20px",
      }
    ),
  );

  page.globals = {
    bgPage: M4.bgPage,
    bgCard: M4.bgCard,
    brandGold: M4.brandGold,
    brandRuby: M4.brandRuby,
    casinoGreen: M4.casinoGreen,
    borderColor: M4.borderColor,
    fontPrimary: M4.fontPrimary,
  };

  return page;
}

// ─── M5 V2 — placeholder simple (le user veut bosser sur M5 plus tard) ──────

export function buildM5V2Starter(): V2Page {
  const page = newV2Page("M5V2");
  page.zones.aboveCards.push(
    img("", {
      width: "120px", height: "120px", objectFit: "cover",
      borderRadius: "50%", align: "center",
      glow: "#FFD700", shadow: "0 8px 32px rgba(0,0,0,.4)",
      marginTop: "40px", marginBottom: "20px",
    }),
    txt("DÉPOSEZ 20€\nJOUE À 40€", {
      tag: "h1", align: "center",
      style: {
        fontFamily: "Bebas Neue",
        fontSize: "3rem",
        fontWeight: 900,
        letterSpacing: ".02em",
        lineHeight: "1.05",
      },
      lineStyles: {
        0: { color: "#ffffff" },
        1: { color: "#FFD700", textShadow: "0 0 18px rgba(255,215,0,.6)" },
      },
      marginTop: "10px", marginBottom: "12px",
    }),
    txt("+20€ offerts dès ton premier dépôt", {
      tag: "p", align: "center",
      style: { fontSize: "1rem", color: "rgba(255,255,255,.78)", fontWeight: 500 },
      marginBottom: "24px",
    }),
  );
  page.zones.belowCards.push(
    btn("RÉCLAME 20€ OFFERTS", {
      variant: "primary", fullWidth: true,
      borderRadius: "14px",
      animation: "pulse",
      marginTop: "8px", marginBottom: "32px",
    }),
  );
  page.globals = { brandGold: "#FFD700", bgPage: "#0a0712" };
  return page;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export function getStarterTemplateV2(model: V2Model): V2Page {
  if (model === "M4V2") return buildM4V2Starter();
  return buildM5V2Starter();
}
