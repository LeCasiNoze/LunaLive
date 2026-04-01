// api/src/discord/kb/_taxonomy.ts
// Taxonomie complète LunaLive — catégories, sous-catégories, tags normalisés
// ─────────────────────────────────────────────────────────────────────────────
// Catégories et leurs sous-catégories officielles
// ─────────────────────────────────────────────────────────────────────────────
export const TAXONOMY = {
    economy: [
        "gains", // Obtenir des rubis
        "dépenses", // Dépenser des rubis
        "solde", // Consulter son solde
        "historique", // Historique des transactions
        "split", // Répartition streamer/plateforme
        "poids", // Système de poids weight_bp
    ],
    social: [
        "chat", // Messages dans le chat
        "emotes", // Emotes personnalisées
        "badges", // Badges de rang/abonnement
        "follow", // Suivre un streamer
        "notifications", // Alertes et notifications
    ],
    streaming: [
        "calls", // File d'attente de jeux casino
        "rain", // Distribution automatique de rubis
        "chest", // Coffre partagé
        "wheel", // Roue / tirage au sort
        "predictions", // Système de prédictions
        "hunt", // Calls avec mise en euros
        "overlay", // Overlay OBS
        "clips", // LunaClip
    ],
    account: [
        "inscription", // Créer un compte
        "connexion", // Se connecter
        "discord", // Lier son compte Discord
        "profil", // Modifier son profil
        "mot_de_passe", // Réinitialisation
        "suppression", // Supprimer son compte
    ],
    discord: [
        "bot", // Commandes bot Discord
        "roles", // Rôles Discord LunaLive
        "support", // Tickets support Discord
        "notifications", // Notifs Discord live/events
    ],
    moderation: [
        "ban", // Bannissement
        "timeout", // Mise en sourdine temporaire
        "report", // Signalement
        "mots_interdits", // Filtres de mots
        "appel", // Faire appel d'une sanction
    ],
    support: [
        "ticket", // Ouverture de ticket
        "escalade", // Escalade vers staff
        "contact", // Contacter l'équipe
    ],
};
// ─────────────────────────────────────────────────────────────────────────────
// Description des rôles pour le contexte du bot
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_LABELS = {
    viewer: "Spectateur",
    streamer: "Streamer",
    staff: "Staff LunaLive",
    all: "Tous les utilisateurs",
};
// ─────────────────────────────────────────────────────────────────────────────
// Tags normalisés (minuscules, sans accents) utilisés dans les KbEntry
// Utilisés pour le scoring dans support_search.ts
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_TAGS = [
    // Economy
    "rubis", "solde", "gagner", "perdre", "transaction", "historique",
    "recompense", "poids", "weight", "split", "pourcentage", "plateforme",
    // Abonnements
    "abonnement", "sub", "subscribe", "mensuel", "premium", "avantages",
    "badge", "emote", "rang",
    // Calls
    "call", "calls", "file", "attente", "queue", "jeu", "casino", "slot",
    "machine", "proposer", "rejoindre", "annuler", "position",
    // Chat / Overlay
    "chat", "overlay", "popup", "obs", "stream", "widget", "url", "apparaitre",
    "afficher", "message", "lien",
    // DLive
    "dlive", "synchroniser", "lier", "compte", "plateforme", "streaming",
    // Compte
    "compte", "inscription", "connexion", "discord", "lier", "profil",
    "email", "mot", "passe", "supprimer",
    // Streamer
    "streamer", "page", "dashboard", "activer", "desactiver", "outil",
    "configurer", "parametres",
    // Rain
    "rain", "pluie", "distribution", "automatique", "intervalle", "viewer",
    // Chest
    "coffre", "chest", "partager", "ouvrir", "rejoindre", "gagner", "commun",
    // Wheel
    "roue", "wheel", "tirage", "sort", "gagnant", "participer", "join",
    // Predictions
    "prediction", "pari", "vote", "issue", "resultat", "1", "2",
    // Clips
    "clip", "lunclip", "enregistrer", "replay", "partager", "video",
    // Shop
    "boutique", "shop", "cosmetique", "talent", "acheter", "skin", "effet",
    // Moderation
    "ban", "bannir", "timeout", "signaler", "report", "mute", "sanction",
    "appel", "moderation",
];
