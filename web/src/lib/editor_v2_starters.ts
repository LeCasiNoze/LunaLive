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
  textMuted: "rgba(255,255,255,.66)",
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

function buildM4Card(label: string, bonusPct: string, defaultImg: string): V2ContainerBlock {
  return ct("stack", [
    // image promo en haut, ratio 16/9 — reprise du M4 V1 par défaut
    img(defaultImg, {
      width: "100%",
      height: "auto",
      objectFit: "cover",
      borderRadius: "0",
      align: "stretch",
    }),
    // body
    ct("stack", [
      // offer-header (icône cercle gold parfait + "OFFRE DE BIENVENUE") — centré
      ct("row", [
        // Cercle parfait 36x36 avec emoji centré
        ct("stack", [
          txt("🎁", {
            tag: "span",
            align: "center",
            style: { fontSize: "16px", lineHeight: "1" },
          }),
        ], {
          width: "36px",
          height: "36px",
          flexShrink: 0,
          bg: "rgba(255, 214, 0, 0.1)",
          borderRadius: "50%",
          border: "1px solid rgba(255,214,0,0.25)",
          justify: "center",
          itemsAlign: "center",
        }),
        txt("OFFRE DE BIENVENUE", {
          tag: "span",
          style: {
            fontFamily: "Inter",
            fontSize: "1rem",
            fontWeight: 800,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "1px",
          },
        }),
      ], { gap: "12px", justify: "center", itemsAlign: "center", marginBottom: "8px" }),

      // offer-subtitle (✓ + "Bonus 100% AUTOMATIQUE") — centré
      txt(`✓ Bonus ${bonusPct} AUTOMATIQUE`, {
        tag: "p",
        align: "center",
        style: { fontSize: "0.9rem", color: "#ffffff", fontWeight: 500 },
        marginBottom: "20px",
      }),

      // info-box (C'EST SIMPLE / Déposez X / → / Recevez Y) — centrée
      ct("stack", [
        txt("⊙ C'EST SIMPLE", {
          tag: "p",
          align: "center",
          style: {
            fontSize: "0.8rem",
            fontWeight: 700,
            color: M4.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          },
          marginBottom: "10px",
        }),
        ct("row", [
          txt("Déposez 10€", {
            tag: "span",
            style: { fontSize: "1rem", fontWeight: 800, color: "#ffffff" },
          }),
          txt("→", {
            tag: "span",
            style: { fontSize: "1.1rem", color: "#ffffff", fontWeight: 800 },
          }),
          txt("Recevez 20€", {
            tag: "span",
            style: {
              fontSize: "1rem", fontWeight: 800,
              color: M4.brandGold,
              textShadow: `0 0 10px ${M4.brandGold}`,
            },
          }),
        ], { gap: "8px", justify: "center", itemsAlign: "center" }),
      ], {
        bg: "rgba(0,0,0,0.5)",
        borderRadius: "8px",
        paddingTop: "16px", paddingBottom: "16px", paddingX: "16px",
        border: `1px solid ${M4.borderColor}`,
        marginBottom: "20px",
      }),

      // bouton "JOUER"
      btn("JOUER", {
        variant: "primary",
        fullWidth: true,
        borderRadius: "8px",
        paddingX: "0",
        fontSize: "1.1rem",
        fontWeight: 800,
        textTransform: "uppercase",
        animation: "pulse",
      }),
    ], {
      paddingX: "22px",
      paddingTop: "22px",
      paddingBottom: "22px",
    }),
  ], {
    bg: M4.bgCard,
    borderRadius: "16px",
    border: `2px solid ${M4.borderColor}`,
    shadow: "0 30px 60px rgba(0, 0, 0, 0.9)",
    animation: "float",
    animationDelay: label === "Card 1" ? "0s" : "-3s",
  });
}

function buildM4ReviewCard(name: string, gain: string, text: string): V2ContainerBlock {
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
          txt("✓", { tag: "span", style: { fontSize: "0.75rem", color: M4.casinoGreen, fontWeight: 800 } }),
        ], { gap: "6px", justify: "center", itemsAlign: "center" }),
        txt(`Gain Encaissé · ${gain}`, {
          tag: "span",
          align: "center",
          style: { fontSize: "0.78rem", color: M4.textMuted, fontWeight: 500 },
        }),
      ], { gap: "2px" }),
    ], { gap: "10px", justify: "center", itemsAlign: "center", marginBottom: "12px" }),

    // texte du témoignage — centré
    txt(text, {
      tag: "p",
      align: "center",
      style: { fontSize: "0.95rem", lineHeight: "1.7", color: M4.textMuted },
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
    txt(`▸ ${q}`, {
      tag: "p",
      align: "center",
      style: { fontSize: "1rem", fontWeight: 700, color: "#ffffff" },
      marginBottom: "8px",
    }),
    txt(a, {
      tag: "p",
      align: "center",
      style: { fontSize: "0.9rem", lineHeight: "1.6", color: M4.textMuted },
    }),
  ], {
    bg: M4.bgCard,
    borderRadius: "10px",
    border: `1px solid ${M4.borderColor}`,
    paddingX: "20px",
    paddingTop: "16px",
    paddingBottom: "16px",
    marginBottom: "12px",
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
        buildM4Card("Card 1", "100%", M4_DEFAULT_IMG_1),
        buildM4Card("Card 2", "100%", M4_DEFAULT_IMG_2),
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
        "Offre VIP validée. Le bonus s'est activé en 1 minute après mon dépôt. Cashout de 400€ reçu par virement SEPA. Rapide et discret."),
      buildM4ReviewCard("Sophie M.", "180€",
        "Interface haute qualité sur téléphone, on se croirait dans un casino VIP. Pas de bugs sur les mini-jeux. Le bonus est un vrai plus."),
      buildM4ReviewCard("Karim B.", "100€",
        "Inscription et vérification ultra-rapide. Dépôt sécurisé, j'ai posé 50€, j'ai eu 100€ de capital. Service client très réactif."),
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
    fontPrimary: "Inter",
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
