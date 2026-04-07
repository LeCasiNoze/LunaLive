// api/src/discord/kb/blocks/bot_tools.ts
// Blocs enrichis — Outils bot streamer (Roue, Rain, Prédictions, Chest)
// Confiance : confirmed (services/wheel.ts, rain.ts, predictions.ts, chest.ts)
export const BOT_TOOLS_BLOCKS = [
    // ════════════════════════════════════════════════════════════════════════
    // ROUE (WHEEL)
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "wheel_viewer",
        subject: "wheel",
        audience: ["viewer"],
        intents: ["procedure", "definition"],
        tags: ["roue", "wheel", "participer", "join", "tirage", "sort", "gagner", "rubis", "comment"],
        title: "Participer à la roue",
        summary: "Tape !join dans le chat ou utilise le bouton quand la roue est ouverte — mise en rubis pour plus de chances.",
        what_it_is: "La roue est un tirage au sort organisé par le streamer. Tu paies des rubis pour entrer. Plus tu mises, plus ton poids dans le tirage est élevé. Un gagnant est tiré à la fin.",
        how_to_do_it: [
            { text: "Attends que le streamer ouvre la roue (annonce dans le chat ou sur la page)" },
            {
                text: "Tape `!join` dans le chat du stream, ou utilise le bouton affiché sur la page",
                note: "La mise en rubis est indiquée par le streamer",
            },
            { text: "Attends la fin du timer — le gagnant est annoncé automatiquement" },
        ],
        commands: ["!join"],
        entry_points: ["Chat du stream (commande !join)", "Page du streamer (bouton de participation)"],
        prerequisites: ["Être présent sur le stream", "Avoir suffisamment de rubis pour la mise"],
        variants: [
            {
                label: "Poids et chances",
                description: "Une mise plus élevée donne un poids plus important dans le tirage (weight_bp). Tes chances augmentent proportionnellement.",
            },
            {
                label: "Rubis perdus si tu ne gagnes pas",
                description: "Les mises des non-gagnants ne sont pas remboursées — c'est une participation volontaire.",
            },
        ],
        sensitivity: "low",
        confidence: "confirmed",
        related_topics: ["wheel_streamer"],
        code_refs: ["api/src/services/wheel.ts"],
    },
    {
        id: "wheel_streamer",
        subject: "wheel",
        audience: ["streamer"],
        intents: ["configure", "manage", "procedure"],
        tags: ["roue", "wheel", "lancer", "ouvrir", "configurer", "streamer", "tirage", "dashboard"],
        title: "Gérer la roue (streamer)",
        summary: "Dashboard → LunaBot → Roue — configure la mise, ouvre l'inscription, lance le tirage.",
        how_to_do_it: [
            { text: "Va sur Dashboard → LunaBot → section Roue" },
            { text: "Configure : mise requise, durée d'inscription" },
            { text: "Lance l'ouverture de la roue — les viewers peuvent rejoindre" },
            { text: "Après le timer, clique sur **Tirer le gagnant** pour lancer le tirage" },
            {
                text: "Le gagnant est annoncé automatiquement dans le chat et les rubis crédités",
                note: "Tu peux aussi ajouter manuellement des participants ou en retirer",
            },
        ],
        ui_paths: ["Dashboard → LunaBot → Roue"],
        entry_points: ["LunaLive.fr/dashboard → LunaBot → Roue"],
        prerequisites: ["Avoir l'outil Roue activé dans le dashboard"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/wheel.ts", "api/src/routes/streamer.ts"],
    },
    // ════════════════════════════════════════════════════════════════════════
    // RAIN (PLUIE)
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "rain_viewer",
        subject: "rain",
        audience: ["viewer"],
        intents: ["definition", "obtain"],
        tags: ["pluie", "rain", "recevoir", "rubis", "comment", "eligible", "c'est quoi"],
        title: "La pluie de rubis (Rain)",
        summary: "Le streamer distribue automatiquement des rubis à tous les viewers présents sur le stream.",
        what_it_is: "La pluie (rain) est une distribution automatique de rubis lancée par le streamer. Les rubis sont répartis équitablement entre tous les viewers actifs présents au moment du déclenchement.",
        how_to_do_it: [
            { text: "Sois présent et connecté sur le stream au moment où la pluie est lancée" },
            { text: "Aucune action n'est requise — les rubis tombent automatiquement sur ton compte" },
        ],
        limits: ["La pluie est distribuée uniquement aux viewers présents au moment du déclenchement"],
        common_failures: [
            {
                symptom: "La pluie a été annoncée mais je n'ai pas reçu de rubis",
                cause: "Tu n'étais peut-être pas compté comme viewer actif au moment du déclenchement",
                solution: "Vérifie ton historique de transactions. Si tu étais bien présent, ouvre un ticket",
            },
        ],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/rain.ts"],
    },
    {
        id: "rain_streamer",
        subject: "rain",
        audience: ["streamer"],
        intents: ["configure", "procedure"],
        tags: ["pluie", "rain", "lancer", "envoyer", "streamer", "distribuer", "rubis", "dashboard"],
        title: "Lancer une pluie de rubis (streamer)",
        summary: "Dashboard → LunaBot → Rain — configure le montant et lance la distribution.",
        how_to_do_it: [
            { text: "Va sur Dashboard → LunaBot → section Rain" },
            { text: "Indique le montant total de rubis à distribuer" },
            { text: "Lance la pluie — les rubis sont répartis automatiquement entre les viewers présents" },
            {
                text: "Pour la pluie automatique : active l'option de planification et configure l'intervalle",
                note: "La pluie auto se déclenche à intervalles réguliers pendant le live",
            },
        ],
        ui_paths: ["Dashboard → LunaBot → Rain"],
        prerequisites: ["Avoir l'outil Rain activé dans le dashboard", "Avoir suffisamment de rubis"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/rain.ts"],
    },
    // ════════════════════════════════════════════════════════════════════════
    // PRÉDICTIONS
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "predictions_voter",
        subject: "predictions",
        audience: ["viewer"],
        intents: ["procedure", "definition"],
        tags: ["prediction", "pari", "vote", "voter", "1", "2", "comment", "participer", "rubis", "parier"],
        title: "Voter dans une prédiction",
        summary: "Tape !1 ou !2 dans le chat avec ta mise en rubis quand une prédiction est ouverte.",
        what_it_is: "Les prédictions permettent de parier des rubis sur l'issue d'un événement posé par le streamer (ex : \"Je vais faire un jackpot ?\"). Les gagnants remportent une part de la cagnotte totale.",
        how_to_do_it: [
            { text: "Attends qu'une prédiction soit ouverte par le streamer" },
            {
                text: "Tape `!1` ou `!2` dans le chat pour voter, en précisant ta mise en rubis",
                note: "Exemple : `!1 100` pour voter pour l'option 1 avec 100 rubis",
            },
            { text: "Attends la résolution par le streamer — les gains sont crédités automatiquement" },
        ],
        commands: ["!1 [mise] (voter option 1)", "!2 [mise] (voter option 2)"],
        prerequisites: ["Être présent sur le stream", "Avoir des rubis disponibles"],
        variants: [
            {
                label: "Calcul des gains",
                description: "Si tu gagnes : mise initiale remboursée + part proportionnelle des mises perdantes.",
            },
            {
                label: "Annulation",
                description: "Si le streamer annule la prédiction, toutes les mises sont intégralement remboursées.",
            },
        ],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/predictions.ts"],
    },
    {
        id: "predictions_streamer",
        subject: "predictions",
        audience: ["streamer"],
        intents: ["configure", "manage", "procedure"],
        tags: ["prediction", "creer", "lancer", "resoudre", "streamer", "dashboard", "configurer"],
        title: "Créer et gérer une prédiction (streamer)",
        summary: "Dashboard → LunaBot → Prédictions — crée, laisse voter, puis résous avec la bonne option.",
        how_to_do_it: [
            { text: "Dashboard → LunaBot → section Prédictions" },
            { text: "Crée une prédiction : titre de la question + 2 options de réponse" },
            { text: "Ouvre le vote — les viewers tapent !1 ou !2 dans le chat" },
            { text: "Quand l'issue est connue, résous la prédiction en choisissant l'option gagnante" },
            {
                text: "Pour annuler : utilise l'option **Annuler** — tous les participants sont remboursés",
            },
        ],
        ui_paths: ["Dashboard → LunaBot → Prédictions"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/predictions.ts"],
    },
    // ════════════════════════════════════════════════════════════════════════
    // CHEST (COFFRE)
    // ════════════════════════════════════════════════════════════════════════
    {
        id: "chest_viewer",
        subject: "chest",
        audience: ["viewer"],
        intents: ["procedure", "definition"],
        tags: ["coffre", "chest", "participer", "rejoindre", "ouvrir", "rubis", "commun", "partage"],
        title: "Participer au coffre",
        summary: "Clique sur le bouton de participation quand le streamer ouvre un coffre — aucun rubis requis.",
        what_it_is: "Le coffre est un pot commun de rubis créé par le streamer. Il suffit de cliquer pour participer. À la fermeture, les rubis sont divisés équitablement entre tous les participants.",
        how_to_do_it: [
            { text: "Quand un coffre est ouvert, un bouton de participation apparaît sur la page du streamer" },
            { text: "Clique sur le bouton pour rejoindre — aucun rubis n'est requis" },
            { text: "À la fermeture du timer, les rubis du coffre sont répartis entre tous les participants" },
        ],
        prerequisites: ["Être présent sur la page du streamer pendant l'ouverture"],
        limits: ["Les rubis sont répartis entre TOUS les participants — plus il y en a, moins chacun reçoit"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/chest.ts"],
    },
    {
        id: "chest_streamer",
        subject: "chest",
        audience: ["streamer"],
        intents: ["configure", "procedure"],
        tags: ["coffre", "chest", "lancer", "creer", "streamer", "dashboard", "montant"],
        title: "Lancer un coffre (streamer)",
        summary: "Dashboard → LunaBot → Coffre — définis le montant et la durée, lance le coffre.",
        how_to_do_it: [
            { text: "Dashboard → LunaBot → section Coffre" },
            { text: "Définis le montant total de rubis et la durée d'ouverture" },
            { text: "Lance le coffre — les viewers peuvent rejoindre via le bouton" },
            { text: "À l'expiration, les rubis sont distribués automatiquement" },
        ],
        ui_paths: ["Dashboard → LunaBot → Coffre"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/chest.ts"],
    },
];
