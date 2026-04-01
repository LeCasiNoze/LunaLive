// api/src/discord/kb/blocks/devenir_streamer.ts
// Blocs enrichis — Devenir streamer et onboarding
// Confiance : confirmed (/apply command, dashboard tabs from exploration)

import type { KbBlock } from "../types.js";

export const DEVENIR_STREAMER_BLOCKS: KbBlock[] = [
  // ── Candidature ──────────────────────────────────────────────────────────
  {
    id: "streamer_candidature",
    subject: "devenir_streamer",
    audience: ["viewer"],
    intents: ["procedure", "configure"],
    tags: ["devenir", "streamer", "candidature", "comment", "rejoindre", "apply", "demande", "inscription"],
    title: "Comment devenir streamer sur LunaLive",
    summary: "Tape /apply sur le serveur Discord LunaLive pour soumettre ta candidature.",
    what_it_is:
      "Pour devenir streamer sur LunaLive, tu dois passer par un processus de candidature. L'équipe LunaLive examine chaque demande individuellement.",
    how_to_do_it: [
      { text: "Rejoins le serveur Discord officiel LunaLive si ce n'est pas fait" },
      {
        text: "Tape `/apply` dans le salon approprié du Discord",
        note: "Un formulaire s'ouvre directement dans Discord (modal) — remplis les informations demandées",
      },
      { text: "Soumet ta candidature — l'équipe LunaLive te répondra par Discord" },
    ],
    entry_points: ["Serveur Discord LunaLive → commande /apply"],
    commands: ["/apply"],
    prerequisites: [
      "Être membre du serveur Discord officiel LunaLive",
      "Avoir une chaîne DLive ou un projet de streaming à présenter",
    ],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["streamer_dashboard", "dlive_lier"],
    code_refs: ["api/src/discord/bot.ts"],
  },

  // ── Dashboard streamer ────────────────────────────────────────────────────
  {
    id: "streamer_dashboard",
    subject: "devenir_streamer",
    audience: ["streamer"],
    intents: ["location", "definition"],
    tags: ["dashboard", "tableau", "bord", "outils", "streamer", "gerer", "configurer", "acces"],
    title: "Le dashboard streamer",
    summary: "Tout se gère sur LunaLive.fr/dashboard : tools, stream, apparence, revenus.",
    what_it_is:
      "Le dashboard streamer est ton espace de gestion complet sur LunaLive. Il est accessible sur LunaLive.fr/dashboard.",
    how_to_do_it: [
      { text: "Connecte-toi sur LunaLive.fr avec ton compte streamer" },
      { text: "Va sur LunaLive.fr/dashboard" },
    ],
    entry_points: ["LunaLive.fr/dashboard"],
    variants: [
      { label: "Overview", description: "Résumé, statut stream, liaison DLive" },
      { label: "LunaBot", description: "Commandes, auto-messages, logs, outils (wheel/rain/predictions/chest/clips)" },
      { label: "Stream", description: "Titre du stream, clé RTMP" },
      { label: "Modération", description: "Modérateurs, bans, règles du chat" },
      { label: "Apparence", description: "Image hors-ligne, thème chat, overlays OBS" },
      { label: "Emojis & GIFs", description: "Ajouter/retirer des emotes personnalisées" },
      { label: "Revenus", description: "Solde, distribution, cashout" },
      { label: "Stats", description: "Analytiques et périodes" },
    ],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["web/src/pages/DashboardPage.tsx"],
  },

  // ── Configurer son stream ────────────────────────────────────────────────
  {
    id: "streamer_configurer_stream",
    subject: "devenir_streamer",
    audience: ["streamer"],
    intents: ["configure", "procedure"],
    tags: ["stream", "rtmp", "cle", "titre", "configurer", "obs", "demarrer", "diffuser"],
    title: "Configurer son stream sur LunaLive",
    summary: "Dashboard → Stream : récupère ta clé RTMP et configure le titre de ton stream.",
    how_to_do_it: [
      { text: "Va sur Dashboard → onglet **Stream**" },
      { text: "Récupère ta clé RTMP (Server URL + Stream Key)" },
      { text: "Dans OBS : Paramètres → Diffusion → Service : Personnalisé → colle le Server URL et Stream Key" },
      { text: "Définis le titre de ton stream depuis cet onglet" },
    ],
    ui_paths: ["Dashboard → Stream"],
    prerequisites: ["Avoir une page streamer approuvée sur LunaLive"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["web/src/pages/DashboardPage.tsx"],
  },

  // ── Activer les outils ────────────────────────────────────────────────────
  {
    id: "streamer_activer_outils",
    subject: "devenir_streamer",
    audience: ["streamer"],
    intents: ["configure", "procedure"],
    tags: ["activer", "outils", "calls", "rain", "chest", "wheel", "predictions", "lunabot", "dashboard"],
    title: "Activer les outils de stream (calls, roue, rain…)",
    summary: "Dashboard → LunaBot — active et configure chaque outil indépendamment.",
    how_to_do_it: [
      { text: "Va sur Dashboard → onglet **LunaBot**" },
      { text: "Chaque outil (Calls, Rain, Coffre, Roue, Prédictions, Clips) s'active individuellement" },
      { text: "Configure les paramètres de chaque outil avant de l'activer" },
    ],
    ui_paths: ["Dashboard → LunaBot → [Outil]"],
    prerequisites: ["Avoir une page streamer approuvée"],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["calls_gerer_streamer", "wheel_streamer", "rain_streamer", "chest_streamer", "predictions_streamer"],
    code_refs: ["web/src/pages/DashboardPage.tsx"],
  },

  // ── Revenus streamer ──────────────────────────────────────────────────────
  {
    id: "streamer_revenus",
    subject: "devenir_streamer",
    audience: ["streamer"],
    intents: ["manage", "location"],
    tags: ["revenus", "argent", "cashout", "virement", "solde", "paiement", "dashboard"],
    title: "Revenus streamer — consulter et encaisser",
    summary: "Dashboard → Revenus : consulte ton solde et lance un cashout.",
    how_to_do_it: [
      { text: "Va sur Dashboard → onglet **Revenus**" },
      { text: "Consulte ton solde disponible et l'historique des transactions" },
      { text: "Utilise l'option **Cashout** pour encaisser (selon les conditions contractuelles)" },
    ],
    ui_paths: ["Dashboard → Revenus"],
    sensitivity: "high",
    confidence: "inferred",
    escalate: true,
    staff_notes: "Pour toute question sur le montant exact des reversements ou les délais, escalader systématiquement.",
  },
];
