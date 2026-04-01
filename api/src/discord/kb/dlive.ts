// api/src/discord/kb/dlive.ts
// Encyclopédie — Intégration DLive
// Confiance : confirmed (vérifié dans api/src/routes/dlive.ts, services/dlive.ts)

import type { KbEntry } from "./types.js";

export const DLIVE: KbEntry[] = [
  {
    id: "dlive_general",
    category: "streaming",
    subcategory: "overlay",
    tags: ["dlive", "integration", "lier", "connecter", "plateforme", "streaming", "synchroniser"],
    title: "Comment connecter mon compte DLive à LunaLive ?",
    answer:
      "Tu peux lier ton compte DLive à LunaLive depuis ton dashboard streamer, dans la section Intégrations. Une fois lié, LunaLive peut synchroniser certaines données de ton stream DLive (statut live, chat…).",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    prerequisites: ["Avoir un compte DLive actif", "Avoir une page streamer sur LunaLive"],
    codeRefs: ["api/src/routes/dlive.ts", "api/src/services/dlive.ts"],
  },
  {
    id: "dlive_avantages",
    category: "streaming",
    subcategory: "overlay",
    tags: ["dlive", "avantages", "pourquoi", "utilite", "benefice", "synchronisation"],
    title: "Pourquoi lier DLive à LunaLive ?",
    answer:
      "Lier DLive à LunaLive permet à la plateforme de détecter automatiquement quand tu es en live sur DLive, de synchroniser ton statut de stream, et d'activer certaines fonctionnalités LunaLive (rubis en direct, tools) pendant tes lives DLive.",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/dlive.ts"],
  },
  {
    id: "dlive_delier",
    category: "streaming",
    subcategory: "overlay",
    tags: ["delier", "deconnecter", "retirer", "dlive", "integration", "supprimer"],
    title: "Comment délier mon compte DLive ?",
    answer:
      "Tu peux délier ton compte DLive depuis ton dashboard streamer, dans la section Intégrations. Après la déconnexion, la synchronisation automatique est désactivée.",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "inferred",
    codeRefs: ["api/src/routes/dlive.ts"],
  },
  {
    id: "dlive_probleme",
    category: "streaming",
    subcategory: "overlay",
    tags: ["dlive", "erreur", "synchronisation", "ne fonctionne pas", "bug", "live", "detecte pas"],
    title: "Ma synchronisation DLive ne fonctionne pas",
    answer:
      "Si LunaLive ne détecte pas ton live DLive ou ne se synchronise plus :\n1. Vérifie que le compte DLive est bien lié dans tes intégrations\n2. Délie et relie le compte DLive\n3. Assure-toi que ton live est bien public sur DLive\n\nSi le problème persiste, ouvre un ticket support.",
    roles: ["streamer"],
    sensitivity: "medium",
    confidence: "inferred",
    escalate: true,
    codeRefs: ["api/src/services/dlive.ts"],
  },
];
