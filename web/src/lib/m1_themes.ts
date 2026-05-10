// ─────────────────────────────────────────────────────────────────────────────
// M1 themes — palettes globales pour le modèle V3 M1.
//
// Quand inputs.m1UseTheme est true, ces palettes remplacent en bloc tous les
// "or" du V1 M4 : pseudo, ligne Recevez, bouton JOUER, info-box (Recevez X€),
// span "JOUEURS" du h2 reviews, icône FAQ, sticky CTA, animation pulseGold,
// borders et backgrounds (bg-page, bg-card).
// ─────────────────────────────────────────────────────────────────────────────

export type M1ThemeKey =
  | "gold" | "ruby" | "emerald" | "sapphire"
  | "amethyst" | "obsidian" | "rose" | "jade";

export interface M1Theme {
  key: M1ThemeKey;
  label: string;
  /** Accent principal (= --brand-gold V1). */
  accent: string;
  /** Variante claire pour le hover/end de gradient. */
  accentLight: string;
  /** Glow rgba (pour shadow/textShadow). */
  accentGlow: string;
  /** Soft transparent — bg du icon-circle, pseudo pill bg. */
  accentSoft: string;
  /** Border subtle — pseudo pill, badges. */
  accentBorder: string;
  /** Bg page (--bg-page). */
  bgPage: string;
  /** Bg card (--bg-card). */
  bgCard: string;
  /** Border color (--border-color). */
  borderColor: string;
}

export const M1_THEMES: M1Theme[] = [
  {
    key: "gold", label: "Or",
    accent: "#FFD700", accentLight: "#FFC200",
    accentGlow: "rgba(255,214,0,.4)",
    accentSoft: "rgba(255,214,0,.08)",
    accentBorder: "rgba(255,214,0,.35)",
    bgPage: "#080212", bgCard: "#150821", borderColor: "#331A47",
  },
  {
    key: "ruby", label: "Rubis",
    accent: "#E0115F", accentLight: "#FF4080",
    accentGlow: "rgba(224,17,95,.45)",
    accentSoft: "rgba(224,17,95,.08)",
    accentBorder: "rgba(224,17,95,.35)",
    bgPage: "#15050C", bgCard: "#260914", borderColor: "#4A1530",
  },
  {
    key: "emerald", label: "Émeraude",
    accent: "#00E676", accentLight: "#4DFF99",
    accentGlow: "rgba(0,230,118,.4)",
    accentSoft: "rgba(0,230,118,.08)",
    accentBorder: "rgba(0,230,118,.35)",
    bgPage: "#06120D", bgCard: "#0D2418", borderColor: "#1F4030",
  },
  {
    key: "sapphire", label: "Saphir",
    accent: "#4A90E2", accentLight: "#7AB3F0",
    accentGlow: "rgba(74,144,226,.4)",
    accentSoft: "rgba(74,144,226,.08)",
    accentBorder: "rgba(74,144,226,.35)",
    bgPage: "#06101A", bgCard: "#0E1D2E", borderColor: "#1F3550",
  },
  {
    key: "amethyst", label: "Améthyste",
    accent: "#B855F5", accentLight: "#D080FF",
    accentGlow: "rgba(184,85,245,.4)",
    accentSoft: "rgba(184,85,245,.08)",
    accentBorder: "rgba(184,85,245,.35)",
    bgPage: "#10061A", bgCard: "#1F0E2E", borderColor: "#3A1F50",
  },
  {
    key: "obsidian", label: "Obsidian",
    accent: "#E8E8E8", accentLight: "#FFFFFF",
    accentGlow: "rgba(232,232,232,.35)",
    accentSoft: "rgba(232,232,232,.08)",
    accentBorder: "rgba(232,232,232,.25)",
    bgPage: "#050505", bgCard: "#161616", borderColor: "#2F2F2F",
  },
  {
    key: "rose", label: "Rose",
    accent: "#FF6B9D", accentLight: "#FF95B8",
    accentGlow: "rgba(255,107,157,.4)",
    accentSoft: "rgba(255,107,157,.08)",
    accentBorder: "rgba(255,107,157,.35)",
    bgPage: "#15060F", bgCard: "#260F1D", borderColor: "#4A1F38",
  },
  {
    key: "jade", label: "Jade",
    accent: "#00C9A7", accentLight: "#4DFFD0",
    accentGlow: "rgba(0,201,167,.4)",
    accentSoft: "rgba(0,201,167,.08)",
    accentBorder: "rgba(0,201,167,.35)",
    bgPage: "#061212", bgCard: "#0D2424", borderColor: "#1F4040",
  },
];

export function getM1Theme(key: M1ThemeKey | undefined): M1Theme {
  return M1_THEMES.find((t) => t.key === (key || "gold")) || M1_THEMES[0];
}
