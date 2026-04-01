// api/src/discord/kb/blocks/rubis.ts
// Blocs enrichis — Rubis
// Confiance : confirmed (api/src/services/rubis.ts, routes/rubis.ts, discord/bot.ts)

import type { KbBlock } from "../types.js";

export const RUBIS_BLOCKS: KbBlock[] = [
  // ── Définition ────────────────────────────────────────────────────────────
  {
    id: "rubis_definition",
    subject: "rubis",
    audience: ["all"],
    intents: ["definition"],
    tags: ["rubis", "monnaie", "virtuelle", "c'est quoi", "kesako", "points", "coins"],
    title: "Les rubis LunaLive",
    summary: "Les rubis sont la monnaie virtuelle de LunaLive, gagnée gratuitement et utilisée pour interagir avec les streamers.",
    what_it_is:
      "Les rubis sont la monnaie virtuelle de LunaLive. Ils se gagnent gratuitement (streams, Discord) et s'utilisent pour interagir avec les streamers : calls, roue, prédictions, boutique.\n\n⚠️ Les rubis n'ont aucune valeur monétaire réelle.",
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["rubis_gagner", "rubis_depenser"],
    code_refs: ["api/src/services/rubis.ts"],
  },

  // ── Gagner des rubis (viewer) ─────────────────────────────────────────────
  {
    id: "rubis_gagner",
    subject: "rubis",
    audience: ["viewer"],
    intents: ["obtain", "procedure"],
    tags: ["gagner", "obtenir", "avoir", "rubis", "comment", "earn", "farm", "gratuit", "sources", "claim"],
    title: "Comment gagner des rubis",
    summary: "Regarde des streams, fais /claim sur Discord, et participe aux activités streamers.",
    what_it_is: "Les rubis se gagnent gratuitement via 3 sources principales.",
    how_to_do_it: [
      {
        text: "Commande `/claim` sur le serveur Discord LunaLive (dans le salon mini-jeux)",
        note: "1 fois par 24h. Bonus mensuel si tu claim régulièrement : 10 claims → bonus, 20 → bonus plus élevé, 30 → jackpot",
      },
      {
        text: "Regarde un stream actif sur LunaLive.fr — les rubis tombent automatiquement",
        note: "Source passive, requiert d'être connecté et sur la page du stream",
      },
      {
        text: "Participe aux activités lancées par les streamers : pluie (rain), coffre (chest), roue, prédictions",
        note: "Dépend des streamers actifs",
      },
    ],
    entry_points: ["Serveur Discord LunaLive → salon mini-jeux", "LunaLive.fr → n'importe quelle page stream"],
    commands: ["/claim", "/link (pour lier son compte avant d'utiliser /claim)"],
    prerequisites: [
      "Avoir un compte LunaLive",
      "Avoir lié son compte Discord avec /link pour utiliser /claim",
      "Être dans le serveur Discord officiel LunaLive pour /claim",
    ],
    limits: ["/claim : 1 fois par 24h"],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["compte_discord_lier", "rain_viewer", "chest_viewer"],
    code_refs: ["api/src/services/rubis.ts", "api/src/discord/bot.ts"],
  },

  // ── Utiliser / dépenser des rubis ─────────────────────────────────────────
  {
    id: "rubis_depenser",
    subject: "rubis",
    audience: ["viewer"],
    intents: ["procedure", "manage"],
    tags: ["depenser", "utiliser", "rubis", "ou", "comment", "spend", "quoi", "sert"],
    title: "Comment utiliser ses rubis",
    summary: "Les rubis se dépensent dans les calls, la roue, les prédictions et la boutique.",
    how_to_do_it: [
      { text: "Faire un call (recommander une slot au streamer) : page du streamer → section Calls" },
      { text: "Participer à la roue : page du streamer → section Roue — tape `!join` dans le chat ou utilise le bouton" },
      { text: "Voter dans une prédiction : page du streamer → tape `!1` ou `!2` dans le chat avec ta mise" },
      { text: "Acheter un cosmétique ou talent : LunaLive.fr/shop" },
    ],
    entry_points: [
      "Page du streamer (pour calls, roue, prédictions)",
      "LunaLive.fr/shop (pour la boutique)",
    ],
    commands: ["!join (rejoindre la roue)", "!1 / !2 (voter en prédiction)"],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["calls_faire_viewer", "wheel_viewer", "predictions_voter"],
    code_refs: ["api/src/services/calls.ts", "api/src/routes/shop.ts"],
  },

  // ── Voir son solde ────────────────────────────────────────────────────────
  {
    id: "rubis_solde",
    subject: "rubis",
    audience: ["viewer", "streamer"],
    intents: ["location", "procedure"],
    tags: ["solde", "voir", "combien", "rubis", "balance", "wallet", "profil", "total"],
    title: "Voir son solde de rubis",
    summary: "Le solde de rubis est visible sur ton profil LunaLive une fois connecté.",
    how_to_do_it: [
      { text: "Va sur LunaLive.fr et connecte-toi" },
      { text: "Ton solde est affiché en haut de l'interface sur ton profil" },
    ],
    entry_points: ["LunaLive.fr → Profil (en haut de page)"],
    commands: ["/whoami (Discord — confirme que ton compte est lié et affiche ton pseudo)"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/routes/rubis.ts"],
  },

  // ── Rubis disparus / manquants ────────────────────────────────────────────
  {
    id: "rubis_disparu",
    subject: "rubis",
    audience: ["viewer", "streamer"],
    intents: ["problem"],
    tags: ["rubis", "disparu", "manquant", "perdu", "bug", "vol", "moins", "transaction"],
    title: "Mes rubis ont disparu",
    summary: "Vérifier l'historique de transactions avant d'ouvrir un ticket.",
    troubleshooting: [
      "1. Va sur ton profil LunaLive et consulte l'historique de tes transactions",
      "2. Vérifie si une dépense normale explique la perte (call, roue, prédiction, boutique)",
      "3. Note le montant exact et la date approximative",
      "4. Si aucune transaction n'explique la perte → ouvre un ticket support",
    ],
    common_failures: [
      {
        symptom: "Rubis déduits après un call mais je n'étais pas dans la file",
        cause: "La mise est déduite à l'inscription dans la file, pas à l'exécution du call",
        solution: "Normal — les rubis sont remboursés si le call est annulé ou refusé par le streamer",
      },
      {
        symptom: "Solde inférieur à ce qu'il devrait être sans explication dans l'historique",
        cause: "Possible bug de transaction",
        solution: "Ouvre un ticket support avec : montant, date, et capture de ton historique",
        escalate: true,
      },
    ],
    sensitivity: "high",
    confidence: "confirmed",
    escalate: true,
    code_refs: ["api/src/routes/rubis.ts"],
  },

  // ── Mini-jeux Discord ─────────────────────────────────────────────────────
  {
    id: "rubis_minijeux",
    subject: "rubis",
    audience: ["viewer"],
    intents: ["procedure", "configure"],
    tags: ["slot", "blackjack", "mini", "jeu", "discord", "jouer", "gagner", "rubis", "machine"],
    title: "Les mini-jeux Discord (slot, blackjack)",
    summary: "LunaLive propose des mini-jeux Discord pour gagner ou parier des rubis.",
    what_it_is:
      "Le bot Discord LunaLive propose des mini-jeux dans le salon dédié du serveur officiel : `/slot` (machine à sous) et `/blackjack` (blackjack classique ou avec side bets).",
    how_to_do_it: [
      { text: "Rejoint le serveur Discord officiel LunaLive" },
      { text: "Lie ton compte avec `/link` si ce n'est pas encore fait" },
      { text: "Va dans le salon mini-jeux" },
      { text: "Tape `/slot` pour la machine à sous ou `/blackjack` pour le blackjack" },
    ],
    entry_points: ["Serveur Discord LunaLive → salon mini-jeux"],
    commands: ["/slot (cooldown 6h)", "/blackjack (cooldown 12h)", "/blackjack_plus (avec side bets, cooldown 12h)"],
    prerequisites: [
      "Être membre vérifié du serveur Discord LunaLive",
      "Avoir lié son compte LunaLive avec /link",
    ],
    limits: ["/slot : cooldown 6h", "/blackjack et /blackjack_plus : cooldown 12h"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/discord/bot.ts"],
  },
];
