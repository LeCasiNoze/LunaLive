// ─────────────────────────────────────────────────────────────────────────────
// Editor V2 — types partagés
//
// Architecture : un page = un arbre de zones, chaque zone contient des blocs
// primitifs réordonnables. Aucun chevauchement avec le V1 (qui reste figé).
// ─────────────────────────────────────────────────────────────────────────────
export const V2_ZONE_LABELS = {
    aboveCards: "Au-dessus des cartes",
    cards: "Cartes promo",
    belowCards: "En-dessous des cartes",
    reviews: "Section avis",
    faq: "Section FAQ",
    footer: "Pied de page",
};
// ─── Helpers ─────────────────────────────────────────────────────────────────
export function makeV2BlockId(type) {
    return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
/** Extrait le code d'affi depuis une URL. Ex: https://celsius.games/UHyEqTtNlL → UHyEqTtNlL */
export function extractAffiCode(affiLink) {
    if (!affiLink)
        return "";
    try {
        const u = new URL(affiLink);
        const last = u.pathname.split("/").filter(Boolean).pop() || "";
        return last.replace(/[^A-Za-z0-9_-]/g, "");
    }
    catch {
        return "";
    }
}
/** Construit le slug par défaut : <code>M<N> sans tiret. Ex: UHyEqTtNlLM4 */
export function buildV2DefaultSlug(affiLink, modelKind) {
    const code = extractAffiCode(affiLink);
    const n = modelKind === "M4V2" ? "4" : "5";
    return code ? `${code}M${n}` : "";
}
/** Liste des zones pour un modèle donné. */
export function v2ZonesForModel(model) {
    if (model === "M4V2")
        return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
    // M5V2 a ses propres zones — à définir quand on attaquera M5
    return ["aboveCards", "cards", "belowCards", "reviews", "faq", "footer"];
}
/** Nouvelle page vide — zéro défaut hardcodé (pas de Celsius/LeCasiNoze). */
export function newV2Page(modelKind) {
    const zones = {};
    for (const z of v2ZonesForModel(modelKind))
        zones[z] = [];
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
export function newTextBlock(content = "Mon texte") {
    return { id: makeV2BlockId("text"), type: "text", content, tag: "p" };
}
export function newImageBlock(src = "") {
    return { id: makeV2BlockId("image"), type: "image", src, alt: "" };
}
export function newButtonBlock(label = "Cliquer ici", href = "") {
    return { id: makeV2BlockId("button"), type: "button", label, href, variant: "primary" };
}
export function newContainerBlock(layout = "stack") {
    return { id: makeV2BlockId("container"), type: "container", layout, children: [], gap: "12px" };
}
export function newSpacerBlock() {
    return { id: makeV2BlockId("spacer"), type: "spacer", height: "20px" };
}
export function newDividerBlock() {
    return { id: makeV2BlockId("divider"), type: "divider", thickness: "1px", color: "#444", width: "60%" };
}
export function newFsnCardM4Block() {
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
export function newBlockOfType(type) {
    switch (type) {
        case "text": return newTextBlock();
        case "image": return newImageBlock();
        case "button": return newButtonBlock();
        case "container": return newContainerBlock();
        case "spacer": return newSpacerBlock();
        case "divider": return newDividerBlock();
        case "fsnCardM4": return newFsnCardM4Block();
        case "m4V1LowerSections":
            return { id: makeV2BlockId("m4V1LowerSections"), type: "m4V1LowerSections", affiLink: "" };
    }
}
