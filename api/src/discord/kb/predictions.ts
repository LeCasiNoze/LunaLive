// api/src/discord/kb/predictions.ts
// Encyclopédie — Prédictions (!1 / !2)
// Confiance : confirmed (vérifié dans api/src/services/predictions.ts, DB schema)

import type { KbEntry } from "./types.js";

export const PREDICTIONS: KbEntry[] = [
  {
    id: "predictions_general",
    category: "streaming",
    subcategory: "predictions",
    tags: ["prediction", "pari", "vote", "c'est quoi", "principe", "pronostic"],
    title: "C'est quoi les prédictions sur LunaLive ?",
    answer:
      "Les prédictions permettent aux viewers de parier des rubis sur l'issue d'un événement posé par le streamer (ex : « Est-ce que je vais faire un jackpot ? »). Les viewers votent pour l'option 1 ou l'option 2 avec une mise en rubis. Les gagnants remportent une part de la cagnotte totale.",
    roles: ["viewer", "streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/predictions.ts"],
  },
  {
    id: "predictions_voter",
    category: "streaming",
    subcategory: "predictions",
    tags: ["voter", "parier", "prediction", "1", "2", "comment", "participer", "rubis"],
    title: "Comment voter dans une prédiction ?",
    answer:
      "Quand une prédiction est ouverte, tu vois les deux options sur la page du streamer. Choisis ton option (!1 ou !2 dans le chat, ou via les boutons) et indique ta mise en rubis. Tu ne peux voter qu'une fois par prédiction.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "confirmed",
    prerequisites: ["Avoir suffisamment de rubis", "La prédiction doit être ouverte"],
    codeRefs: ["api/src/services/predictions.ts"],
  },
  {
    id: "predictions_gagner",
    category: "streaming",
    subcategory: "predictions",
    tags: ["gagner", "gagnant", "prediction", "resultat", "rubis", "remporter", "calcul"],
    title: "Comment sont calculés les gains d'une prédiction ?",
    answer:
      "Si tu as parié sur la bonne option, tu reçois ta mise initiale plus une part proportionnelle de la mise totale des perdants. Plus tu as misé par rapport aux autres gagnants, plus ta part est grande.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/predictions.ts"],
  },
  {
    id: "predictions_resoudre_streamer",
    category: "streaming",
    subcategory: "predictions",
    tags: ["resoudre", "cloturer", "prediction", "streamer", "choisir", "resultat", "annuler"],
    title: "Comment clôturer une prédiction en tant que streamer ?",
    answer:
      "Une fois l'événement résolu, tu peux clôturer la prédiction depuis ton dashboard ou l'overlay en choisissant l'option gagnante (1 ou 2). Tu peux aussi annuler la prédiction, ce qui rembourse tous les participants.",
    roles: ["streamer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/predictions.ts"],
  },
  {
    id: "predictions_annulation",
    category: "streaming",
    subcategory: "predictions",
    tags: ["annulee", "annulation", "prediction", "rubis", "remboursement", "cancel"],
    title: "Ma prédiction a été annulée, suis-je remboursé ?",
    answer:
      "Oui. Si le streamer annule une prédiction, tous les participants sont remboursés intégralement de leur mise initiale.",
    roles: ["viewer"],
    sensitivity: "low",
    confidence: "confirmed",
    codeRefs: ["api/src/services/predictions.ts"],
  },
  {
    id: "predictions_rubis_non_credites",
    category: "streaming",
    subcategory: "predictions",
    tags: ["rubis", "non credites", "pas recu", "gagné", "manquant", "prediction", "bug"],
    title: "J'ai gagné une prédiction mais mes rubis ne sont pas arrivés",
    answer:
      "Vérifie d'abord ton historique de transactions. Les rubis sont normalement crédités immédiatement après la résolution. Si rien n'apparaît dans l'historique après quelques minutes, ouvre un ticket support.",
    roles: ["viewer"],
    sensitivity: "high",
    confidence: "inferred",
    escalate: true,
    codeRefs: ["api/src/services/predictions.ts"],
  },
];
