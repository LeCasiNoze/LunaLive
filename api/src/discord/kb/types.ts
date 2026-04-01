// api/src/discord/kb/types.ts
// Types étendus pour l'encyclopédie interne LunaLive

// ─────────────────────────────────────────────────────────────────────────────
// Rôles concernés par une entrée
// ─────────────────────────────────────────────────────────────────────────────
export type KbRole =
  | "viewer"    // Spectateur connecté sur la plateforme
  | "streamer"  // Streamer avec page active
  | "staff"     // Modérateur / admin LunaLive
  | "all";      // Tout le monde (public, non connecté inclus)

// ─────────────────────────────────────────────────────────────────────────────
// Sensibilité (impact si réponse incorrecte)
// ─────────────────────────────────────────────────────────────────────────────
export type KbSensitivity =
  | "low"    // Info générale, aucun impact en cas d'erreur
  | "medium" // Peut causer confusion ou mauvaise utilisation
  | "high";  // Touche à l'argent, données perso, ou décisions importantes

// ─────────────────────────────────────────────────────────────────────────────
// Niveau de confiance de l'entrée
// ─────────────────────────────────────────────────────────────────────────────
export type KbConfidence =
  | "confirmed" // Vérifié directement dans le code source
  | "inferred"  // Déduit du code, non documenté explicitement
  | "partial";  // Partiellement vérifié, complétion nécessaire

// ─────────────────────────────────────────────────────────────────────────────
// Catégories principales
// ─────────────────────────────────────────────────────────────────────────────
export type KbCategory =
  | "economy"     // Rubis, transactions, récompenses
  | "social"      // Chat, emotes, interactions
  | "streaming"   // Outils streamer (calls, rain, chest, wheel, predictions)
  | "account"     // Compte, auth, liaison Discord
  | "discord"     // Fonctionnalités bot Discord
  | "moderation"  // Bans, reports, restrictions
  | "support";    // Tickets, aide, contact

// ─────────────────────────────────────────────────────────────────────────────
// Lien externe ou interne associé à une entrée
// ─────────────────────────────────────────────────────────────────────────────
export type KbLink = {
  label: string;
  url: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Entrée encyclopédique complète
// ─────────────────────────────────────────────────────────────────────────────
export type KbEntry = {
  // Identifiant unique snake_case (ex: "rubis_solde", "calls_rejoindre")
  id: string;

  // Catégorie principale
  category: KbCategory;

  // Sous-catégorie libre (ex: "gains", "dépenses", "bugs")
  subcategory?: string;

  // Mots-clés pour la recherche plein texte (tous en minuscules)
  tags: string[];

  // Titre court de l'entrée (affiché dans les réponses Discord)
  title: string;

  // Réponse publique (affichée à l'utilisateur)
  // Doit être vraie avec certitude — ne pas mentionner ce qui est incertain
  answer: string;

  // Rôles concernés
  roles: KbRole[];

  // Niveau de sensibilité
  sensitivity: KbSensitivity;

  // Niveau de confiance de l'information
  confidence: KbConfidence;

  // Prérequis pour que la fonctionnalité soit disponible (optionnel)
  prerequisites?: string[];

  // Si true : le bot doit suggérer d'escalader vers le staff
  escalate?: boolean;

  // Liens utiles associés
  links?: KbLink[];

  // Références dans le code source (chemin:ligne approximatif)
  codeRefs?: string[];

  // Notes internes visibles staff uniquement (jamais affichées à l'utilisateur)
  staffNotes?: string;
};
