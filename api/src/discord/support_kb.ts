// api/src/discord/support_kb.ts
// Base de connaissance LunaLive — V1 Support
// Zéro dépendance, TypeScript pur, inline.

export type KbLink = { label: string; url: string };

export type KbEntry = {
  id: string;
  tags: string[];      // mots-clés en minuscules, sans accents — c'est ce qui fait matcher
  title: string;       // titre affiché dans l'embed de réponse
  answer: string;      // réponse affichée à l'utilisateur
  links?: KbLink[];    // liens utiles optionnels
};

// ─────────────────────────────────────────────────────────────
// RUBIS
// ─────────────────────────────────────────────────────────────

const RUBIS: KbEntry[] = [
  {
    id: "rubis_general",
    tags: ["rubis", "monnaie", "points", "currency", "coins", "argent", "c'est quoi", "kesako"],
    title: "💎 Les rubis LunaLive",
    answer:
      "Les **rubis** sont la monnaie virtuelle de LunaLive — entièrement gratuite.\n\n" +
      "Tu peux en gagner en regardant des streams, en claimant chaque jour sur Discord, ou lors d'événements.\n\n" +
      "Ils servent à soutenir les streamers (abonnements), jouer aux mini-jeux Discord et interagir dans le chat.\n\n" +
      "⚠️ Les rubis n'ont aucune valeur monétaire réelle.",
  },
  {
    id: "rubis_solde",
    tags: ["solde", "combien", "voir", "total", "balance", "rubis", "profil", "compte", "mes rubis"],
    title: "💎 Voir son solde de rubis",
    answer:
      "Ton solde de rubis est visible sur ton **profil LunaLive**.\n\n" +
      "Connecte-toi sur le site, ouvre ton profil — tu vois ton solde en haut de page.\n\n" +
      "Sur Discord, tu peux aussi utiliser `/whoami` pour vérifier que ton compte est bien lié.",
  },
  {
    id: "rubis_gagner",
    tags: [
      "gagner", "obtenir", "avoir", "gratuit", "rubis", "earn", "farm", "gratter",
      "recompense", "reward", "sources", "comment avoir", "comment gagner",
    ],
    title: "💎 Comment gagner des rubis ?",
    answer:
      "Plusieurs façons de gagner des rubis gratuitement :\n\n" +
      "• **`/claim` sur Discord** — rubis quotidiens (1x/24h). Plus tu claim régulièrement dans le mois, plus tu gagnes de bonus.\n" +
      "• **Regarder des streams actifs** sur LunaLive\n" +
      "• **Participer aux événements** organisés par les streamers\n\n" +
      "Le `/claim` Discord est de loin le plus rapide — fais-le chaque jour !",
  },
  {
    id: "rubis_utiliser",
    tags: [
      "utiliser", "depenser", "rubis", "abonnement", "acheter", "donner",
      "quoi faire", "a quoi ca sert", "dépense",
    ],
    title: "💎 À quoi servent les rubis ?",
    answer:
      "Avec tes rubis tu peux :\n\n" +
      "• **Soutenir un streamer** via un abonnement\n" +
      "• **Jouer** aux mini-jeux Discord (`/slot`, `/blackjack`)\n" +
      "• **Offrir un abonnement** à quelqu'un d'autre\n\n" +
      "Ton solde est visible sur ton profil LunaLive.",
  },
  {
    id: "rubis_discord_claim",
    tags: [
      "claim", "discord", "journalier", "daily", "commande", "slash",
      "24h", "bonus", "mensuel", "chaque jour",
    ],
    title: "💎 Le /claim Discord",
    answer:
      "La commande `/claim` te donne des rubis gratuits une fois par 24h.\n\n" +
      "**Pour en bénéficier :**\n" +
      "• Être dans le salon mini-jeux du serveur officiel\n" +
      "• Avoir lié ton compte LunaLive (commande `/link`)\n\n" +
      "**Bonus mensuel :** 10 claims dans le mois → bonus, 20 → bonus plus élevé, 30 → jackpot.",
  },
];

// ─────────────────────────────────────────────────────────────
// ABONNEMENTS
// ─────────────────────────────────────────────────────────────

const ABONNEMENTS: KbEntry[] = [
  {
    id: "abo_general",
    tags: [
      "abonnement", "sub", "subscribe", "souscrire", "soutenir",
      "badge", "avantages", "streamer", "payer",
    ],
    title: "🔔 Les abonnements LunaLive",
    answer:
      "Les **abonnements** permettent de soutenir un streamer avec tes rubis.\n\n" +
      "**Ce que tu obtiens :**\n" +
      "• Un badge d'abonné visible dans le chat du streamer\n" +
      "• Des avantages supplémentaires si le streamer en a configuré\n\n" +
      "**Comment faire :** va sur la page du streamer → clique sur **Abonnement** → choisis ton niveau.",
  },
  {
    id: "abo_offrir",
    tags: ["offrir", "gift", "cadeau", "abonnement", "autre personne", "donner", "gifter"],
    title: "🎁 Offrir un abonnement",
    answer:
      "Tu peux **offrir un abonnement** à un autre utilisateur depuis la page d'un streamer.\n\n" +
      "Le coût est débité en rubis depuis ton compte. L'autre personne reçoit une notification avec le cadeau.",
  },
  {
    id: "abo_cout",
    tags: ["cout", "combien", "prix", "coute", "tarif", "rubis", "abonnement", "cher"],
    title: "🔔 Coût d'un abonnement",
    answer:
      "Le coût d'un abonnement dépend du niveau choisi et de la configuration du streamer.\n\n" +
      "Il est payable uniquement en **rubis** — aucune transaction réelle n'est impliquée.\n\n" +
      "Consulte la page du streamer pour voir les niveaux disponibles et leurs prix en rubis.",
  },
];

// ─────────────────────────────────────────────────────────────
// CALLS
// ─────────────────────────────────────────────────────────────

const CALLS: KbEntry[] = [
  {
    id: "calls_general",
    tags: [
      "call", "calls", "appel", "inviter", "invitation", "rejoindre", "webcam",
      "video", "camera", "micro", "c'est quoi", "comment ca marche",
    ],
    title: "📞 Les calls LunaLive",
    answer:
      "Les **calls** permettent à un streamer d'inviter un viewer à apparaître en direct dans son stream — par webcam ou micro.\n\n" +
      "**Pour le viewer :**\n" +
      "• Pas de téléchargement — tout se passe dans le navigateur\n" +
      "• Webcam et micro sont optionnels\n\n" +
      "**Pour le streamer :**\n" +
      "• Active les calls depuis ton interface de stream\n" +
      "• Invite les viewers que tu veux directement depuis le chat",
  },
  {
    id: "calls_rejoindre",
    tags: [
      "rejoindre", "participer", "call", "appel", "comment", "invitation",
      "accepter", "recevoir", "invite", "etre invite",
    ],
    title: "📞 Comment rejoindre un call ?",
    answer:
      "Tu ne peux pas rejoindre un call toi-même — c'est le **streamer qui t'invite**.\n\n" +
      "**Quand tu es invité :**\n" +
      "1. Une notification apparaît dans le chat du stream\n" +
      "2. Clique dessus pour rejoindre\n" +
      "3. Autorise caméra/micro si besoin\n\n" +
      "Il n'y a pas de liste d'attente publique. Être actif dans le chat augmente tes chances.",
  },
  {
    id: "calls_activer_streamer",
    tags: [
      "activer", "call", "streamer", "configurer", "actif", "lancer",
      "comment activer", "ouvrir", "demarrer",
    ],
    title: "📞 Activer les calls (streamers)",
    answer:
      "Pour activer les calls sur ton stream LunaLive :\n\n" +
      "1. Lance ton stream depuis ton tableau de bord streamer\n" +
      "2. Dans l'interface de stream, ouvre le panneau **Calls**\n" +
      "3. Active l'option — les viewers peuvent maintenant être invités\n" +
      "4. Clique sur un viewer dans le chat pour l'inviter\n\n" +
      "Tu gardes le contrôle total : tu choisis qui tu invites et quand.",
  },
  {
    id: "calls_conditions",
    tags: [
      "conditions", "requis", "besoin", "call", "prérequis", "eligible",
      "comment etre invite", "invitation", "criteres",
    ],
    title: "📞 Comment être invité en call ?",
    answer:
      "Il n'y a pas de critères officiels imposés par LunaLive — **c'est le streamer qui décide**.\n\n" +
      "En pratique, les streamers invitent souvent les viewers :\n" +
      "• Actifs dans le chat\n" +
      "• Connus du streamer\n" +
      "• Disponibles au bon moment\n\n" +
      "Consulte la page ou le Discord du streamer — certains ont leurs propres règles.",
  },
];

// ─────────────────────────────────────────────────────────────
// CHAT POP-UP
// ─────────────────────────────────────────────────────────────

const CHAT_POPUP: KbEntry[] = [
  {
    id: "chatpopup_general",
    tags: [
      "chat", "overlay", "obs", "stream", "afficher", "superposition",
      "messages", "chat overlay", "incrustation", "streamlabs",
    ],
    title: "💬 Le chat overlay LunaLive",
    answer:
      "Le **chat overlay** (pop-up chat) affiche les messages du chat LunaLive directement dans ton stream — comme une incrustation OBS.\n\n" +
      "**Pour l'utiliser :**\n" +
      "1. Va dans ton tableau de bord streamer sur LunaLive\n" +
      "2. Trouve la section **Chat overlay** (ou pop-up chat)\n" +
      "3. Copie l'URL fournie\n" +
      "4. Dans OBS : Sources → Ajouter → **Source Navigateur** → colle l'URL\n\n" +
      "Le chat se met à jour en temps réel dans ton stream.",
  },
  {
    id: "chatpopup_obs",
    tags: [
      "obs", "streamlabs", "source navigateur", "browser source", "ajouter",
      "configurer", "setup", "taille", "position", "layout",
    ],
    title: "💬 Configurer le chat dans OBS",
    answer:
      "**Dans OBS Studio :**\n" +
      "1. Sources → `+` → **Source Navigateur**\n" +
      "2. Colle l'URL du chat overlay (depuis ton tableau de bord LunaLive)\n" +
      "3. Largeur recommandée : 400–500px, hauteur : selon ton layout\n" +
      "4. Positionne la source dans ta scène\n\n" +
      "**Dans Streamlabs OBS :** même procédure — cherche \"Browser Source\".\n\n" +
      "Pas besoin de rafraîchir — la source se met à jour automatiquement.",
  },
  {
    id: "chatpopup_probleme",
    tags: [
      "chat", "overlay", "marche pas", "bug", "vide", "rien", "blanc",
      "ne s'affiche pas", "invisible", "problème", "url",
    ],
    title: "💬 Le chat overlay ne s'affiche pas",
    answer:
      "Si le chat overlay ne fonctionne pas :\n\n" +
      "• Vérifie que l'URL est bien celle fournie dans ton **tableau de bord streamer** (pas une URL inventée)\n" +
      "• Assure-toi que le type de source est bien **Source Navigateur** dans OBS\n" +
      "• Essaie de cliquer **Actualiser le cache** dans les propriétés de la source\n" +
      "• Vérifie que tu es bien en train de streamer — certains overlays n'affichent rien hors live\n\n" +
      "Si ça ne résout pas, contacte le staff avec une capture d'écran.",
  },
];

// ─────────────────────────────────────────────────────────────
// LIER CHAÎNE DLIVE
// ─────────────────────────────────────────────────────────────

const DLIVE: KbEntry[] = [
  {
    id: "dlive_general",
    tags: [
      "dlive", "chaine", "lier", "link", "connecter", "associer",
      "synchroniser", "compte dlive", "plateforme", "integration",
    ],
    title: "🎬 Lier sa chaîne DLive à LunaLive",
    answer:
      "LunaLive peut synchroniser ton stream **DLive** pour qu'il apparaisse automatiquement sur la plateforme quand tu es live.\n\n" +
      "**Prérequis :**\n" +
      "• Avoir un compte **streamer approuvé** sur LunaLive\n" +
      "• Avoir une chaîne DLive active\n\n" +
      "Si tu n'es pas encore streamer LunaLive, fais d'abord une demande dans **#candidature-streamer**.",
  },
  {
    id: "dlive_comment",
    tags: [
      "dlive", "etapes", "lier", "associer", "url", "lien dlive",
      "comment faire", "tableau de bord", "parametres",
    ],
    title: "🎬 Lier DLive — étapes",
    answer:
      "**Étapes pour lier ta chaîne DLive :**\n\n" +
      "1. Connecte-toi sur LunaLive avec ton compte **streamer**\n" +
      "2. Tableau de bord streamer → **Paramètres** → section DLive\n" +
      "3. Colle l'URL de ta chaîne DLive (format : `https://dlive.tv/TonPseudo`)\n" +
      "4. Enregistre — la synchronisation démarre automatiquement\n\n" +
      "Ton stream apparaîtra sur LunaLive dès que tu seras live sur DLive.",
  },
  {
    id: "dlive_probleme",
    tags: [
      "probleme", "bug", "marche pas", "synchronisation", "dlive",
      "offline", "pas affiche", "stream introuvable", "detecte pas",
    ],
    title: "🎬 Mon stream DLive n'est pas détecté",
    answer:
      "Si ton stream DLive ne s'affiche pas sur LunaLive :\n\n" +
      "• Vérifie que l'URL DLive enregistrée est correcte (`https://dlive.tv/TonPseudo`)\n" +
      "• La détection peut prendre **2 à 5 minutes** après le début du live\n" +
      "• Assure-toi que ton stream est bien **public** sur DLive\n" +
      "• Vérifie que ton compte streamer LunaLive est actif (pas suspendu)\n\n" +
      "Si le problème dure plus de 10 minutes, contacte le staff avec le lien de ta chaîne DLive.",
  },
];

// ─────────────────────────────────────────────────────────────
// COMPTE / DISCORD LINK
// ─────────────────────────────────────────────────────────────

const COMPTE: KbEntry[] = [
  {
    id: "compte_link_discord",
    tags: [
      "link", "lier", "discord", "compte", "lunalive", "connecter", "associer",
      "code", "profil", "synchronisation", "liaison", "relier",
    ],
    title: "🔗 Lier Discord à LunaLive",
    answer:
      "Pour connecter ton Discord à ton compte LunaLive :\n\n" +
      "1. Tape `/link` dans ce serveur Discord\n" +
      "2. Tu reçois un code temporaire (visible uniquement par toi)\n" +
      "3. Va sur **LunaLive.fr** → ton Profil → **Lier Discord**\n" +
      "4. Colle le code — c'est immédiat\n\n" +
      "Tes rôles Discord (Viewer, Streamer…) se synchronisent automatiquement après la liaison.",
  },
  {
    id: "compte_creer",
    tags: [
      "créer", "creer", "inscription", "compte", "lunalive", "s'inscrire",
      "register", "nouveau compte", "pas de compte", "créer un compte",
    ],
    title: "🔗 Créer un compte LunaLive",
    answer:
      "Pour créer un compte LunaLive, rends-toi sur **LunaLive.fr** et clique sur **S'inscrire**.\n\n" +
      "Une fois inscrit :\n" +
      "• Reviens ici et tape `/link` pour lier ton Discord\n" +
      "• Tu obtiendras le rôle Viewer et accès aux mini-jeux Discord\n\n" +
      "L'inscription est gratuite et ne nécessite pas de carte bancaire.",
  },
  {
    id: "compte_role",
    tags: [
      "role", "verifie", "verifié", "streamer", "viewer", "discord",
      "sync", "grade", "badge", "rang", "mauvais role",
    ],
    title: "🔗 Mes rôles Discord LunaLive",
    answer:
      "Les rôles Discord sont attribués automatiquement selon ton compte LunaLive :\n\n" +
      "• **Vérifié** — ton Discord est lié à un compte LunaLive\n" +
      "• **Viewer** — compte LunaLive actif\n" +
      "• **Streamer** — compte streamer approuvé\n" +
      "• **Partner** — streamer partenaire\n\n" +
      "Si ton rôle est incorrect ou manquant, fais `/whoami` pour vérifier le statut, puis `/link` si tu n'es pas encore lié.",
  },
];

// ─────────────────────────────────────────────────────────────
// Export global
// ─────────────────────────────────────────────────────────────

export const KB_ENTRIES: KbEntry[] = [
  ...RUBIS,
  ...ABONNEMENTS,
  ...CALLS,
  ...CHAT_POPUP,
  ...DLIVE,
  ...COMPTE,
];
