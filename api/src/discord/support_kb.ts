// api/src/discord/support_kb.ts
// Shim de compatibilité — re-exporte depuis l'encyclopédie modulaire kb/
// Ne pas modifier ce fichier : éditer les modules dans kb/ directement.

export type {
  KbEntry,
  KbLink,
  KbRole,
  KbCategory,
  KbSensitivity,
  KbConfidence,
} from "./kb/index.js";
export { KB_ENTRIES } from "./kb/index.js";
