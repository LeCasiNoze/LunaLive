// api/src/discord/kb/_quiz_seeds.ts
// Seeds Q&A pour la phase de validation de l'encyclopédie
// Format : question → réponse attendue + ID de l'entrée KB source
// Utilisé pour tester la couverture et la qualité du moteur de recherche

export type QuizSeed = {
  question: string;
  expectedEntryId: string;
  expectedKeywords: string[]; // mots qui DOIVENT apparaître dans la réponse
  role: "viewer" | "streamer" | "staff" | "all";
  category: string;
};

export const QUIZ_SEEDS: QuizSeed[] = [
  // ── Rubis ─────────────────────────────────────────────────────────────────
  {
    question: "C'est quoi les rubis ?",
    expectedEntryId: "rubis_general",
    expectedKeywords: ["monnaie", "virtuelle"],
    role: "viewer",
    category: "economy",
  },
  {
    question: "Comment voir mon solde de rubis ?",
    expectedEntryId: "rubis_solde",
    expectedKeywords: ["solde", "profil"],
    role: "viewer",
    category: "economy",
  },
  {
    question: "Comment gagner des rubis ?",
    expectedEntryId: "rubis_gagner",
    expectedKeywords: ["stream", "pluie", "coffre"],
    role: "viewer",
    category: "economy",
  },
  {
    question: "Mes rubis ont disparu",
    expectedEntryId: "rubis_perdre",
    expectedKeywords: ["historique", "ticket"],
    role: "viewer",
    category: "economy",
  },

  // ── Abonnements ───────────────────────────────────────────────────────────
  {
    question: "Comment m'abonner à un streamer ?",
    expectedEntryId: "abo_general",
    expectedKeywords: ["abonnement", "streamer"],
    role: "viewer",
    category: "economy",
  },
  {
    question: "Mon badge d'abonné n'apparaît pas",
    expectedEntryId: "abo_badge_emote",
    expectedKeywords: ["badge", "reconnect"],
    role: "viewer",
    category: "social",
  },

  // ── Calls ─────────────────────────────────────────────────────────────────
  {
    question: "C'est quoi un call sur LunaLive ?",
    expectedEntryId: "calls_general",
    expectedKeywords: ["file", "casino", "jeu"],
    role: "viewer",
    category: "streaming",
  },
  {
    question: "Comment rejoindre la file des calls ?",
    expectedEntryId: "calls_rejoindre_viewer",
    expectedKeywords: ["rubis", "file"],
    role: "viewer",
    category: "streaming",
  },
  {
    question: "C'est quoi la hunt ?",
    expectedEntryId: "calls_hunt",
    expectedKeywords: ["euros", "réels"],
    role: "viewer",
    category: "streaming",
  },

  // ── Chat / Overlay ────────────────────────────────────────────────────────
  {
    question: "Comment mettre le chat dans OBS ?",
    expectedEntryId: "chatpopup_general",
    expectedKeywords: ["overlay", "OBS", "dashboard"],
    role: "streamer",
    category: "streaming",
  },
  {
    question: "Mon chat overlay ne s'affiche pas dans OBS",
    expectedEntryId: "chatpopup_probleme",
    expectedKeywords: ["URL", "rafraîchir"],
    role: "streamer",
    category: "streaming",
  },

  // ── DLive ────────────────────────────────────────────────────────────────
  {
    question: "Comment connecter mon compte DLive à LunaLive ?",
    expectedEntryId: "dlive_general",
    expectedKeywords: ["DLive", "intégrations", "dashboard"],
    role: "streamer",
    category: "streaming",
  },

  // ── Compte ────────────────────────────────────────────────────────────────
  {
    question: "Comment créer un compte LunaLive ?",
    expectedEntryId: "compte_creer",
    expectedKeywords: ["inscription", "email"],
    role: "all",
    category: "account",
  },
  {
    question: "Comment lier mon Discord à LunaLive ?",
    expectedEntryId: "compte_discord_lier",
    expectedKeywords: ["Discord", "profil"],
    role: "viewer",
    category: "account",
  },
  {
    question: "J'ai oublié mon mot de passe",
    expectedEntryId: "compte_mot_passe_oublie",
    expectedKeywords: ["réinitialisation", "email"],
    role: "all",
    category: "account",
  },

  // ── Streamer ──────────────────────────────────────────────────────────────
  {
    question: "Comment devenir streamer sur LunaLive ?",
    expectedEntryId: "streamer_devenir",
    expectedKeywords: ["candidature"],
    role: "viewer",
    category: "account",
  },

  // ── Rain ─────────────────────────────────────────────────────────────────
  {
    question: "C'est quoi la pluie sur LunaLive ?",
    expectedEntryId: "rain_general",
    expectedKeywords: ["rubis", "viewers", "distribue"],
    role: "viewer",
    category: "streaming",
  },

  // ── Chest ─────────────────────────────────────────────────────────────────
  {
    question: "Comment participer au coffre ?",
    expectedEntryId: "chest_rejoindre",
    expectedKeywords: ["bouton", "particip"],
    role: "viewer",
    category: "streaming",
  },

  // ── Wheel ─────────────────────────────────────────────────────────────────
  {
    question: "Comment participer à la roue ?",
    expectedEntryId: "wheel_participer",
    expectedKeywords: ["rubis", "poids"],
    role: "viewer",
    category: "streaming",
  },

  // ── Predictions ───────────────────────────────────────────────────────────
  {
    question: "Comment voter dans une prédiction ?",
    expectedEntryId: "predictions_voter",
    expectedKeywords: ["rubis", "option"],
    role: "viewer",
    category: "streaming",
  },

  // ── Shop ──────────────────────────────────────────────────────────────────
  {
    question: "Qu'est-ce que la boutique LunaLive ?",
    expectedEntryId: "shop_general",
    expectedKeywords: ["rubis", "cosmétiques"],
    role: "viewer",
    category: "economy",
  },

  // ── Moderation ────────────────────────────────────────────────────────────
  {
    question: "J'ai été banni, comment faire appel ?",
    expectedEntryId: "mod_ban_appel",
    expectedKeywords: ["ticket", "staff"],
    role: "viewer",
    category: "moderation",
  },
];
