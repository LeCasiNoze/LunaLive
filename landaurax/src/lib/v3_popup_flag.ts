export const V3_POPUP_ENABLED = false;

export function openAffiLink(href: string) {
  if (typeof window === "undefined") return;
  if (!href || href === "#") return;
  try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* noop */ }
}
