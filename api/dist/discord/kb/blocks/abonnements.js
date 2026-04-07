// api/src/discord/kb/blocks/abonnements.ts
// Blocs enrichis — Abonnements
// Confiance : confirmed (api/src/routes/subscriptions.ts)
export const ABONNEMENTS_BLOCKS = [
    // ── Définition ────────────────────────────────────────────────────────────
    {
        id: "abo_definition",
        subject: "abonnements",
        audience: ["all"],
        intents: ["definition"],
        tags: ["abonnement", "sub", "subscribe", "c'est quoi", "kesako", "principe"],
        title: "C'est quoi un abonnement LunaLive ?",
        summary: "S'abonner à un streamer le soutient financièrement et donne des avantages exclusifs.",
        what_it_is: "Un abonnement LunaLive permet de soutenir financièrement un streamer chaque mois. En échange, tu obtiens des avantages exclusifs sur son stream : badge visible dans le chat, emotes personnalisées, et bonus de rubis selon le niveau.",
        sensitivity: "low",
        confidence: "confirmed",
        related_topics: ["abo_souscrire", "abo_avantages"],
        code_refs: ["api/src/routes/subscriptions.ts"],
    },
    // ── S'abonner ─────────────────────────────────────────────────────────────
    {
        id: "abo_souscrire",
        subject: "abonnements",
        audience: ["viewer"],
        intents: ["procedure"],
        tags: ["abonner", "souscrire", "comment", "abonnement", "soutenir", "streamer", "payer"],
        title: "Comment s'abonner à un streamer",
        summary: "Va sur la page du streamer → bouton Abonnement → choisis ton niveau.",
        how_to_do_it: [
            { text: "Va sur la page du streamer : LunaLive.fr/s/[slug du streamer]" },
            { text: "Clique sur le bouton **Abonnement**" },
            { text: "Choisis le niveau d'abonnement disponible" },
            { text: "Confirme le paiement — ton badge et tes emotes sont actifs immédiatement" },
        ],
        entry_points: ["LunaLive.fr/s/[slug] → Bouton Abonnement"],
        prerequisites: ["Avoir un compte LunaLive", "Avoir une méthode de paiement valide"],
        sensitivity: "medium",
        confidence: "confirmed",
        related_topics: ["abo_avantages", "abo_problemes"],
        code_refs: ["api/src/routes/subscriptions.ts"],
    },
    // ── Avantages ─────────────────────────────────────────────────────────────
    {
        id: "abo_avantages",
        subject: "abonnements",
        audience: ["viewer"],
        intents: ["definition"],
        tags: ["avantages", "benefices", "badge", "emote", "rubis", "bonus", "abonnement", "obtenir"],
        title: "Avantages d'un abonnement",
        summary: "Badge dans le chat, emotes exclusives, bonus de rubis selon le niveau.",
        what_it_is: "En t'abonnant, tu obtiens :\n• **Badge** visible dans le chat du streamer\n• **Emotes** personnalisées du streamer utilisables dans son chat\n• **Bonus de rubis** selon le niveau d'abonnement\n• Statut d'abonné visible dans la communauté",
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/routes/subscriptions.ts"],
    },
    // ── Gérer / résilier ──────────────────────────────────────────────────────
    {
        id: "abo_gerer",
        subject: "abonnements",
        audience: ["viewer"],
        intents: ["manage"],
        tags: ["resilier", "annuler", "gerer", "abonnement", "arreter", "liste", "actifs"],
        title: "Gérer et résilier ses abonnements",
        summary: "Gérez vos abonnements actifs depuis votre profil LunaLive.",
        how_to_do_it: [
            { text: "Va sur ton profil LunaLive → onglet **Social** ou section abonnements" },
            { text: "Trouve l'abonnement à gérer" },
            { text: "Clique pour résilier — la résiliation prend effet à la fin de la période en cours" },
        ],
        ui_paths: ["LunaLive.fr/profile → onglet Social → Abonnements actifs"],
        sensitivity: "low",
        confidence: "inferred",
        code_refs: ["api/src/routes/subscriptions.ts"],
    },
    // ── Problèmes avec badge/emote ────────────────────────────────────────────
    {
        id: "abo_problemes",
        subject: "abonnements",
        audience: ["viewer"],
        intents: ["problem"],
        tags: ["badge", "emote", "absent", "disparu", "pas visible", "affiche pas", "abonnement"],
        title: "Mon badge ou mes emotes d'abonné n'apparaissent pas",
        summary: "Se déconnecter/reconnecter règle la plupart des problèmes de badge.",
        troubleshooting: [
            "1. Déconnecte-toi de LunaLive et reconnecte-toi",
            "2. Attends 2-3 minutes — la synchronisation peut prendre un moment",
            "3. Vérifie que l'abonnement est bien actif dans ton profil",
            "4. Si le problème persiste après 10 minutes, ouvre un ticket support",
        ],
        common_failures: [
            {
                symptom: "Badge visible dans mon profil mais pas dans le chat",
                cause: "Délai de synchronisation post-paiement",
                solution: "Rafraîchis la page et/ou reconnecte-toi",
            },
            {
                symptom: "Abonnement débité mais avantages non reçus",
                cause: "Erreur de traitement de paiement",
                solution: "Ouvre un ticket support avec la date et le montant du paiement",
                escalate: true,
            },
        ],
        sensitivity: "medium",
        confidence: "inferred",
        escalate: true,
        code_refs: ["api/src/routes/subscriptions.ts"],
    },
];
