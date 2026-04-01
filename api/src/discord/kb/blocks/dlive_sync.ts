// api/src/discord/kb/blocks/dlive_sync.ts
// Blocs enrichis — DLive, synchronisation, chat, bot Discord
// Confiance : confirmed (api/src/routes/streamer_dlive_link.ts, discord/bot.ts)

import type { KbBlock } from "../types.js";

export const DLIVE_SYNC_BLOCKS: KbBlock[] = [
  // ── Lier DLive à LunaLive (streamer) ─────────────────────────────────────
  {
    id: "dlive_lier",
    subject: "dlive",
    audience: ["streamer"],
    intents: ["configure", "procedure"],
    tags: ["dlive", "lier", "connecter", "synchroniser", "integration", "chaine", "dashboard", "comment"],
    title: "Lier sa chaîne DLive à LunaLive",
    summary: "Dashboard → Overview → section DLive → demande de lien → code de vérification.",
    what_it_is:
      "Lier DLive à LunaLive permet à la plateforme de détecter automatiquement tes lives DLive et d'activer les fonctionnalités LunaLive (rubis, tools) pendant tes streams.",
    how_to_do_it: [
      {
        text: "Connecte-toi sur LunaLive.fr/dashboard avec ton compte streamer",
      },
      {
        text: "Va dans l'onglet **Overview** — tu trouveras la section de liaison DLive",
        note: "C'est dans Overview, pas dans Paramètres",
      },
      {
        text: "Clique sur **Lier ma chaîne DLive** et saisis ton nom de chaîne DLive",
      },
      {
        text: "Un code de vérification te sera envoyé — suis les instructions pour le confirmer",
        note: "Processus en 2 étapes : demande de lien → vérification du code",
      },
      {
        text: "Une fois validé, LunaLive détecte automatiquement tes lives DLive",
      },
    ],
    entry_points: ["LunaLive.fr/dashboard → Overview → Liaison DLive"],
    ui_paths: ["Dashboard → Overview → section DLive"],
    prerequisites: [
      "Avoir un compte streamer approuvé sur LunaLive",
      "Avoir une chaîne DLive active",
    ],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["dlive_problemes", "streamer_dashboard"],
    code_refs: ["api/src/routes/streamer_dlive_link.ts"],
  },

  // ── Problèmes DLive ───────────────────────────────────────────────────────
  {
    id: "dlive_problemes",
    subject: "dlive",
    audience: ["streamer"],
    intents: ["problem"],
    tags: ["dlive", "bug", "sync", "live", "detecte pas", "marche pas", "offline", "affiche pas"],
    title: "Mon live DLive n'est pas détecté par LunaLive",
    summary: "Vérifier le lien DLive, la visibilité du stream, et le délai de détection.",
    troubleshooting: [
      "1. Vérifie que la liaison DLive est active dans ton Dashboard → Overview",
      "2. La détection peut prendre **2 à 5 minutes** après le début du live",
      "3. Assure-toi que ton live est **public** sur DLive (pas en privé)",
      "4. Si le problème dure plus de 10 minutes : délie et relie ton compte DLive",
      "5. Si ça ne résout pas → ouvre un ticket support",
    ],
    common_failures: [
      {
        symptom: "Le live est affiché comme hors ligne sur LunaLive alors que je stream",
        cause: "Délai de synchronisation ou lien cassé",
        solution: "Attends 5 min. Si toujours absent : Dashboard → Overview → réinitialiser la liaison DLive",
      },
    ],
    sensitivity: "medium",
    confidence: "confirmed",
    escalate: false,
    code_refs: ["api/src/routes/streamer_dlive_link.ts"],
  },

  // ── Délier DLive ──────────────────────────────────────────────────────────
  {
    id: "dlive_delier",
    subject: "dlive",
    audience: ["streamer"],
    intents: ["manage"],
    tags: ["delier", "deconnecter", "reset", "dlive", "supprimer", "lien"],
    title: "Délier / réinitialiser la liaison DLive",
    summary: "Dashboard → Overview → réinitialiser la liaison DLive.",
    how_to_do_it: [
      { text: "Va sur LunaLive.fr/dashboard → Overview" },
      { text: "Dans la section DLive, clique sur l'option de réinitialisation" },
      { text: "Confirme — la liaison est supprimée, tu peux en créer une nouvelle" },
    ],
    ui_paths: ["Dashboard → Overview → Liaison DLive → Réinitialiser"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/routes/streamer_dlive_link.ts"],
  },

  // ── Lier son compte Discord à LunaLive ────────────────────────────────────
  {
    id: "discord_lier_compte",
    subject: "discord",
    audience: ["viewer", "streamer"],
    intents: ["configure", "procedure"],
    tags: ["discord", "lier", "connecter", "compte", "lunalive", "link", "associer", "verification"],
    title: "Lier son compte Discord à LunaLive",
    summary: "Tape /link sur le serveur Discord LunaLive puis valide sur ton profil LunaLive.",
    what_it_is:
      "Lier Discord à LunaLive permet d'utiliser les commandes du bot (/claim, /slot, /blackjack…) et de synchroniser tes rôles Discord avec ton compte LunaLive.",
    how_to_do_it: [
      { text: "Rejoins le serveur Discord officiel LunaLive" },
      {
        text: "Dans le salon approprié, tape `/link`",
        note: "Le bot t'envoie un code temporaire en message privé (visible uniquement par toi)",
      },
      { text: "Va sur LunaLive.fr → Profil → **Lier Discord**" },
      { text: "Colle le code reçu — la liaison est immédiate" },
    ],
    entry_points: [
      "Serveur Discord LunaLive → commande /link",
      "LunaLive.fr/profile → Lier Discord",
    ],
    commands: ["/link", "/whoami (pour vérifier l'état de la liaison)"],
    prerequisites: ["Avoir un compte LunaLive", "Être membre du serveur Discord officiel LunaLive"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/discord/bot.ts", "api/src/routes/discord-link.ts"],
  },

  // ── Commandes Discord disponibles ─────────────────────────────────────────
  {
    id: "discord_commandes",
    subject: "discord",
    audience: ["all"],
    intents: ["definition", "location"],
    tags: ["commande", "bot", "discord", "slash", "liste", "disponible", "help", "quelles"],
    title: "Commandes Discord LunaLive",
    summary: "Liste des commandes disponibles sur le serveur Discord officiel LunaLive.",
    what_it_is: "Le bot Discord LunaLive propose plusieurs commandes slash :",
    how_to_do_it: [
      { text: "`/help` — affiche la liste des commandes disponibles" },
      { text: "`/link` — lie ton compte LunaLive à Discord" },
      { text: "`/whoami` — affiche le statut de ton compte lié" },
      { text: "`/claim` — récupère tes rubis quotidiens (1x/24h, dans le salon mini-jeux)" },
      { text: "`/slot` — joue à la machine à sous (cooldown 6h, salon mini-jeux)" },
      { text: "`/blackjack` — joue au blackjack (cooldown 12h, salon mini-jeux)" },
      { text: "`/blackjack_plus` — blackjack avec side bets (cooldown 12h, salon mini-jeux)" },
      { text: "`/apply` — fais une candidature pour devenir streamer LunaLive" },
      { text: "`/support` — ouvre un ticket de support privé" },
    ],
    commands: ["/help", "/link", "/whoami", "/claim", "/slot", "/blackjack", "/blackjack_plus", "/apply", "/support"],
    prerequisites: ["Être membre du serveur Discord officiel LunaLive"],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/discord/bot.ts"],
  },

  // ── Chat synchronisé DLive/LunaLive ──────────────────────────────────────
  {
    id: "dlive_chat_sync",
    subject: "dlive",
    audience: ["streamer"],
    intents: ["definition", "configure"],
    tags: ["chat", "dlive", "sync", "synchronisation", "lunalive", "messages", "overlay", "obs"],
    title: "Synchronisation chat DLive / LunaLive",
    summary: "Une fois DLive lié, le chat LunaLive peut être intégré dans OBS via l'URL overlay.",
    what_it_is:
      "Quand ta chaîne DLive est liée à LunaLive, tu peux afficher le chat LunaLive dans ton stream via l'overlay OBS. Les messages des viewers LunaLive apparaissent en temps réel pendant ton live.",
    how_to_do_it: [
      { text: "Lie d'abord ta chaîne DLive (Dashboard → Overview)" },
      { text: "Va dans Dashboard → **Apparence** → section Overlays" },
      { text: "Copie l'URL du chat overlay" },
      { text: "Dans OBS : Ajouter une source → **Source Navigateur** → colle l'URL" },
    ],
    ui_paths: ["Dashboard → Apparence → Overlays → Chat"],
    prerequisites: ["Chaîne DLive liée à LunaLive"],
    sensitivity: "low",
    confidence: "inferred",
    related_topics: ["dlive_lier"],
    code_refs: ["api/src/routes/overlay.ts"],
  },
];
