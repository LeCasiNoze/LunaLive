// api/src/discord/kb/types.ts
// Types de l'encyclopédie LunaLive — v2 avec blocs structurés

// ─────────────────────────────────────────────────────────────────────────────
// Types fondamentaux (inchangés)
// ─────────────────────────────────────────────────────────────────────────────

export type KbRole =
  | "viewer"
  | "streamer"
  | "staff"
  | "all";

export type KbSensitivity = "low" | "medium" | "high";
export type KbConfidence  = "confirmed" | "inferred" | "partial";

export type KbCategory =
  | "economy"
  | "social"
  | "streaming"
  | "account"
  | "discord"
  | "moderation"
  | "support";

export type KbLink = { label: string; url: string };

// ─────────────────────────────────────────────────────────────────────────────
// KbEntry — ancien format (conservé pour compatibilité)
// ─────────────────────────────────────────────────────────────────────────────

export type KbEntry = {
  id: string;
  category: KbCategory;
  subcategory?: string;
  tags: string[];
  title: string;
  answer: string;
  roles: KbRole[];
  sensitivity: KbSensitivity;
  confidence: KbConfidence;
  prerequisites?: string[];
  escalate?: boolean;
  links?: KbLink[];
  codeRefs?: string[];
  staffNotes?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// KbIntent — type d'intention utilisateur
// ─────────────────────────────────────────────────────────────────────────────

export type KbIntent =
  | "definition"   // "c'est quoi X ?"
  | "procedure"    // "comment faire X ?"
  | "location"     // "où est X ?"
  | "problem"      // "X ne marche pas / pourquoi X ?"
  | "obtain"       // "comment gagner/obtenir X ?"
  | "manage"       // "comment gérer/voir/supprimer X ?"
  | "configure";   // "comment activer/lier/installer X ?"

// ─────────────────────────────────────────────────────────────────────────────
// KbStep — étape procédurale
// ─────────────────────────────────────────────────────────────────────────────

export type KbStep = {
  text: string;
  note?: string;    // précision ou variante de l'étape
  role?: KbRole;    // si l'étape est spécifique à un rôle
};

// ─────────────────────────────────────────────────────────────────────────────
// KbFailure — cas d'échec connu
// ─────────────────────────────────────────────────────────────────────────────

export type KbFailure = {
  symptom: string;    // ce que l'utilisateur voit
  cause: string;      // pourquoi ça arrive
  solution?: string;  // quoi faire
  escalate?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// KbBlock — nouveau format structuré par intent/rôle/procédure
// ─────────────────────────────────────────────────────────────────────────────

export type KbBlock = {
  /** Identifiant unique snake_case */
  id: string;

  /** Sujet principal (ex: "calls", "rubis") */
  subject: string;

  /** Rôles concernés par ce bloc */
  audience: KbRole[];

  /** Intentions couvertes par ce bloc */
  intents: KbIntent[];

  /** Mots-clés pour la recherche */
  tags: string[];

  /** Titre affiché dans la réponse Discord */
  title: string;

  /** Résumé court 1 ligne (toujours présent) */
  summary: string;

  // ── Sections structurées (optionnelles) ──────────────────────────────────

  /** Définition / explication du concept */
  what_it_is?: string;

  /** Étapes procédurales */
  how_to_do_it?: KbStep[];

  /** Points d'entrée UI (ex: "Page streamer → section Calls") */
  entry_points?: string[];

  /** Commandes Discord ou chat (ex: "/claim", "!join") */
  commands?: string[];

  /** Chemins de navigation (ex: "Dashboard → Apparence → Overlays") */
  ui_paths?: string[];

  /** Prérequis nécessaires */
  prerequisites?: string[];

  /** Limites connues du système */
  limits?: string[];

  /** Variantes / cas particuliers */
  variants?: { label: string; description: string }[];

  /** Cas d'échec et solutions */
  common_failures?: KbFailure[];

  /** Étapes de dépannage */
  troubleshooting?: string[];

  /** IDs des blocs liés */
  related_topics?: string[];

  // ── Métadonnées ───────────────────────────────────────────────────────────

  sensitivity: KbSensitivity;
  confidence: KbConfidence;
  escalate?: boolean;
  links?: KbLink[];
  code_refs?: string[];
  staff_notes?: string;
};
