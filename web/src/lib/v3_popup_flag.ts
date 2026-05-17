// ─────────────────────────────────────────────────────────────────────────────
// v3_popup_flag — toggle global pour activer/desactiver le V3OfferPopup.
//
// Quand `V3_POPUP_ENABLED = false` : tous les clicks CTA des modeles M3-M14
// redirigent DIRECTEMENT vers le lien d'affi (ouverture dans nouvel onglet,
// pas d'etape intermediaire). Reduit les frictions, max conversion.
//
// Pour reactiver le popup (auto-redirect + animation reveal) : flipper a true.
// Aucun autre changement requis, le code popup est preserve dans chaque modele.
// ─────────────────────────────────────────────────────────────────────────────

export const V3_POPUP_ENABLED = false;

/** Helper qui ouvre l'affi link dans un nouvel onglet (skipping le popup). */
export function openAffiLink(href: string) {
  if (typeof window === "undefined") return;
  if (!href || href === "#") return;
  try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
}
