// bot/src/modules/notifications/config.ts
// Configuration des IDs Discord hardcodés pour éviter les variables d'environnement sur Render
export const DISCORD_CONFIG = {
    // Salon Discord pour les notifications de clips
    YOUTUBE_CHANNEL_ID: "1467142269122383883",
    // Rôles Discord à ping
    GLOBAL_ROLE_ID: "1468982992910155908",
    YOUTUBE_ROLE_ID: "1468983076141928479",
    INSTAGRAM_ROLE_ID: "1468983120664723507", // Préparé pour l'extensibilité
};
// ID de la chaîne YouTube LunaLive
export const YOUTUBE_CHANNEL_ID = "UCyjZ_Zf1SAjWqKXxwMIKU1A";
// Fréquence de polling (3 minutes par défaut)
export const YOUTUBE_POLL_INTERVAL_MS = 180_000;
