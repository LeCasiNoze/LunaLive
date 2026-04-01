// api/src/discord/kb/calls.ts
// Encyclopédie — Calls (file d'attente de jeux casino)
//
// DÉFINITION EXACTE : Dans le jargon gambling/casino, un "call" est une recommandation
// de slot machine. "Je call Dog House" = je te demande de jouer sur la slot Dog House.
// Sur LunaLive : les viewers soumettent leur call (leur pick de slot) dans une file d'attente
// avec une mise en rubis. Le streamer traite les calls en direct sur son stream.
//
// Confiance : confirmed (vérifié dans api/src/services/calls.ts, DB migrations)

import type { KbEntry } from "./types.js";

export const CALLS: KbEntry[] = [
  {
    id: "calls_general",
    category: "streaming",
    subcategory: "calls",
    tags: ["call", "calls", "c'est quoi", "principe", "kesako", "fonctionnement", "slot", "pick", "recommandation", "machine", "dog house", "casino"],
    title: "C'est quoi un call sur LunaLive ?",
    answer:
      "Dans le jargon casino/gambling, un \"call\" c'est un pick de slot — une recommandation de jeu. Exemple : \"je call Dog House\" = je demande au streamer d'aller jouer sur la slot Dog House.\n\nSur LunaLive, les calls fonctionnent en file d'attente : tu choisis ta slot, tu mises des rubis pour entrer dans la file, et le streamer traite les calls un par un en direct.",
    roles: ["viewer", "streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/calls.ts"],
    staffNotes: "IMPORTANT : calls ≠ appel vidéo. Ce sont des propositions de jeux casino dans une file d'attente.",
  },
  {
    id: "calls_rejoindre_viewer",
    category: "streaming",
    subcategory: "calls",
    tags: ["rejoindre", "participer", "call", "file", "attente", "entrer", "proposer", "jeu", "slot", "pick", "soumettre", "faire", "un call"],
    title: "Comment faire un call (soumettre son pick de slot) ?",
    answer:
      "Pour soumettre un call chez un streamer :\n1. Va sur la page du streamer\n2. Choisis la slot que tu veux lui recommander (ex : Dog House, Gates of Olympus…)\n3. Indique ta mise en rubis — elle définit ton poids dans la file\n4. Valide — ton call est dans la file\n\nLe streamer traite les calls un par un en live.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "confirmed",
    prerequisites: ["Avoir un compte LunaLive", "Avoir suffisamment de rubis"],
    codeRefs: ["api/src/services/calls.ts"],
  },
  {
    id: "calls_position",
    category: "streaming",
    subcategory: "calls",
    tags: ["position", "rang", "ordre", "file", "attente", "call", "quand", "tour"],
    title: "Comment voir ma position dans la file des calls ?",
    answer:
      "Ta position dans la file des calls est visible sur la page du streamer, dans la section calls. L'ordre dépend de ton poids (lié à ta mise en rubis) et de ton heure d'entrée dans la file.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/calls.ts"],
  },
  {
    id: "calls_annuler_viewer",
    category: "streaming",
    subcategory: "calls",
    tags: ["annuler", "retirer", "quitter", "file", "call", "sortir"],
    title: "Puis-je annuler ma participation à un call ?",
    answer:
      "Oui, tu peux te retirer de la file des calls avant que ton call soit traité. Rends-toi sur la page du streamer et annule ta participation depuis la section calls. Tes rubis misés te sont alors remboursés.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "inferred",
    codeRefs: ["api/src/services/calls.ts"],
  },
  {
    id: "calls_activer_streamer",
    category: "streaming",
    subcategory: "calls",
    tags: ["activer", "desactiver", "call", "streamer", "ouvrir", "fermer", "file", "parametres"],
    title: "Comment activer ou désactiver les calls sur mon stream ?",
    answer:
      "Tu peux activer ou désactiver la file des calls depuis ton dashboard streamer sur LunaLive. Tu peux aussi configurer les paramètres : mise minimum/maximum, jeux autorisés, limite de la file.",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    prerequisites: ["Avoir une page streamer active sur LunaLive"],
    codeRefs: ["api/src/services/calls.ts", "api/src/routes/streamer.ts"],
  },
  {
    id: "calls_traiter_streamer",
    category: "streaming",
    subcategory: "calls",
    tags: ["traiter", "valider", "refuser", "call", "streamer", "file", "passer"],
    title: "Comment traiter les calls en tant que streamer ?",
    answer:
      "Depuis ton dashboard ou l'overlay de stream, tu vois la file des calls en attente. Tu peux valider (passer au call suivant), refuser, ou gérer l'ordre manuellement. Chaque call indique le jeu proposé par le viewer et sa mise.",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/calls.ts"],
  },
  {
    id: "calls_rubis_remboursement",
    category: "economy",
    subcategory: "dépenses",
    tags: ["remboursement", "rubis", "call", "annule", "refus", "rembourse"],
    title: "Mes rubis sont-ils remboursés si mon call est refusé ?",
    answer:
      "Si un call est annulé ou refusé, tes rubis misés te sont remboursés. Si tu as un doute sur un remboursement qui ne serait pas arrivé, vérifie ton historique de transactions et ouvre un ticket si nécessaire.",
    roles: ["viewer"],
    sensitivity: "medium",
    confidence: "inferred",
    escalate: true,
    codeRefs: ["api/src/services/calls.ts"],
  },
  {
    id: "calls_hunt",
    category: "streaming",
    subcategory: "calls",
    tags: ["hunt", "chasse", "euro", "eur", "mise", "reel", "argent", "streamer"],
    title: "C'est quoi la Hunt ?",
    answer:
      "La Hunt est une variante des calls où la mise est en euros réels (et non en rubis). C'est une fonctionnalité réservée aux streamers qui souhaitent proposer des sessions de chasse avec des mises réelles. Les conditions et modalités sont définies par le streamer.",
    roles: ["viewer", "streamer"],
    sensitivity: "high",
    confidence: "confirmed",
    escalate: true,
    codeRefs: ["api/src/services/calls.ts"],
    staffNotes: "La Hunt implique de l'argent réel. Toujours escalader les questions liées à la Hunt vers le staff.",
  },
];
