// api/src/discord/kb/blocks/calls.ts
// Blocs enrichis — Calls (picks de slots en file d'attente)
//
// RAPPEL : un "call" dans le jargon gambling = recommandation de slot.
// "Je call Dog House" = je demande au streamer de jouer sur la slot Dog House.
// LunaLive = système de file d'attente pour ces picks, avec mise en rubis.
//
// Confiance : confirmed (api/src/services/calls.ts)
export const CALLS_BLOCKS = [
    // ── Définition ────────────────────────────────────────────────────────────
    {
        id: "calls_definition",
        subject: "calls",
        audience: ["all"],
        intents: ["definition"],
        tags: ["call", "calls", "c'est quoi", "kesako", "principe", "slot", "pick", "recommandation"],
        title: "C'est quoi un call ?",
        summary: "Un call = recommander une slot machine au streamer. Les viewers soumettent leur pick avec une mise en rubis.",
        what_it_is: 'Dans le jargon casino/gambling, un "call" est un pick de slot — une recommandation de jeu. Exemple : "je call Dog House" = je demande au streamer de jouer sur la slot Dog House.\n\nSur LunaLive, les calls fonctionnent en file d\'attente : chaque viewer peut soumettre son pick avec une mise en rubis. Le streamer traite les calls un par un en direct.',
        sensitivity: "low",
        confidence: "confirmed",
        related_topics: ["calls_faire_viewer", "calls_gerer_streamer"],
        code_refs: ["api/src/services/calls.ts"],
    },
    // ── Viewer : faire un call ─────────────────────────────────────────────────
    {
        id: "calls_faire_viewer",
        subject: "calls",
        audience: ["viewer"],
        intents: ["procedure", "location"],
        tags: ["call", "faire", "soumettre", "rejoindre", "file", "attente", "slot", "comment", "ou", "entrer", "pick"],
        title: "Comment faire un call (viewer)",
        summary: "Va sur la page du streamer → section Calls → choisis ta slot → mise en rubis → valide.",
        how_to_do_it: [
            { text: "Va sur la page du streamer sur LunaLive.fr" },
            { text: "Ouvre la section **Calls** (visible quand le streamer a activé les calls)" },
            { text: "Choisis la slot que tu veux recommander (ex : Dog House, Gates of Olympus…)" },
            { text: "Indique ta mise en rubis — elle détermine ton poids dans la file" },
            { text: "Valide — ton call est dans la file, le streamer le traitera en live" },
        ],
        entry_points: ["LunaLive.fr → Page du streamer → Section Calls"],
        prerequisites: [
            "Avoir un compte LunaLive",
            "Avoir suffisamment de rubis pour la mise",
            "Le streamer doit avoir activé les calls",
        ],
        limits: ["1 call actif à la fois par streamer"],
        common_failures: [
            {
                symptom: "La section Calls n'apparaît pas sur la page du streamer",
                cause: "Le streamer n'a pas activé les calls ou le stream n'est pas en live",
                solution: "Attends que le streamer active les calls ou reviens quand il est en live",
            },
            {
                symptom: "Pas assez de rubis pour la mise minimale",
                cause: "Le streamer a défini une mise minimum",
                solution: "Gagne des rubis (/claim sur Discord, regarder des streams) puis réessaie",
            },
        ],
        sensitivity: "low",
        confidence: "confirmed",
        related_topics: ["calls_position_viewer", "rubis_gagner"],
        code_refs: ["api/src/services/calls.ts"],
    },
    // ── Viewer : position dans la file ────────────────────────────────────────
    {
        id: "calls_position_viewer",
        subject: "calls",
        audience: ["viewer"],
        intents: ["location", "manage"],
        tags: ["position", "rang", "ordre", "file", "attente", "call", "tour", "quand", "voir"],
        title: "Ma position dans la file des calls",
        summary: "Ta position est visible sur la page du streamer. L'ordre dépend du poids (mise en rubis).",
        how_to_do_it: [
            { text: "Va sur la page du streamer → section Calls" },
            { text: "Ta position dans la file est affichée avec l'ordre d'attente" },
        ],
        entry_points: ["LunaLive.fr → Page du streamer → Section Calls"],
        what_it_is: "L'ordre de la file dépend du poids de chaque participant. Le poids est lié à la mise en rubis (système weight_bp de 0 à 10 000). En cas d'égalité de poids, l'ordre d'arrivée est prioritaire (FIFO).",
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/calls.ts"],
    },
    // ── Viewer : annuler un call ───────────────────────────────────────────────
    {
        id: "calls_annuler_viewer",
        subject: "calls",
        audience: ["viewer"],
        intents: ["manage"],
        tags: ["annuler", "retirer", "quitter", "call", "sortir", "rembourse", "annulation"],
        title: "Annuler son call",
        summary: "Tu peux annuler ton call avant qu'il soit traité — tes rubis sont remboursés.",
        how_to_do_it: [
            { text: "Va sur la page du streamer → section Calls" },
            { text: "Trouve ton call dans la file" },
            { text: "Utilise l'option pour l'annuler — tes rubis misés sont immédiatement remboursés" },
        ],
        common_failures: [
            {
                symptom: "L'option d'annulation n'est plus disponible",
                cause: "Le call est en cours de traitement par le streamer",
                solution: "Trop tard pour annuler — les rubis sont conservés selon les règles du streamer",
            },
        ],
        sensitivity: "low",
        confidence: "inferred",
        code_refs: ["api/src/services/calls.ts"],
    },
    // ── Streamer : gérer les calls ────────────────────────────────────────────
    {
        id: "calls_gerer_streamer",
        subject: "calls",
        audience: ["streamer"],
        intents: ["procedure", "manage", "configure"],
        tags: ["calls", "streamer", "activer", "desactiver", "gerer", "traiter", "dashboard", "file", "configurer"],
        title: "Gérer les calls (streamer)",
        summary: "Depuis le dashboard, active les calls, configure les paramètres, et traite la file en live.",
        how_to_do_it: [
            {
                text: "Va sur ton Dashboard LunaLive → section LunaBot",
                note: "Dashboard disponible sur LunaLive.fr/dashboard",
            },
            { text: "Active l'outil Calls et configure les paramètres : mise min/max, limite de file" },
            { text: "Pendant le live, la file des calls est visible dans ton interface de stream ou l'overlay" },
            { text: "Traite les calls dans l'ordre : valide (lance le jeu), refuse, ou modifie l'ordre" },
        ],
        entry_points: [
            "LunaLive.fr/dashboard → LunaBot → Calls",
            "Overlay OBS (si configuré)",
        ],
        ui_paths: ["Dashboard → LunaBot → Calls"],
        prerequisites: ["Avoir une page streamer active sur LunaLive"],
        limits: ["Les viewers ne peuvent avoir qu'1 call actif à la fois dans ta file"],
        sensitivity: "low",
        confidence: "confirmed",
        code_refs: ["api/src/services/calls.ts", "api/src/routes/streamer.ts"],
    },
    // ── Hunt ─────────────────────────────────────────────────────────────────
    {
        id: "calls_hunt",
        subject: "calls",
        audience: ["viewer", "streamer"],
        intents: ["definition"],
        tags: ["hunt", "chasse", "euros", "eur", "mise", "reel", "argent", "argent reel"],
        title: "C'est quoi la Hunt ?",
        summary: "La Hunt est une variante des calls où la mise est en euros réels, pas en rubis.",
        what_it_is: "La Hunt est une fonctionnalité avancée des calls où les mises sont en euros réels (et non en rubis). C'est une session de chasse casino avec des stakes réels, organisée par le streamer selon ses propres conditions.",
        sensitivity: "high",
        confidence: "confirmed",
        escalate: true,
        staff_notes: "La Hunt implique de l'argent réel. Ne jamais donner de détails sur les montants, règles ou modalités. Toujours escalader.",
        code_refs: ["api/src/services/calls.ts"],
    },
    // ── Troubleshoot calls ─────────────────────────────────────────────────────
    {
        id: "calls_troubleshoot",
        subject: "calls",
        audience: ["viewer"],
        intents: ["problem"],
        tags: ["call", "bug", "erreur", "marche pas", "probleme", "disparu", "rembourse", "pas traite"],
        title: "Problèmes avec les calls",
        summary: "Dépannage : call non remboursé, section absente, erreur à la soumission.",
        troubleshooting: [
            "**La section Calls est absente** → le streamer n'a pas activé les calls pour ce live",
            "**Erreur lors de la soumission** → vérifie que tu as assez de rubis et que tu n'as pas déjà un call actif",
            "**Call refusé, rubis non remboursés** → vérifie l'historique de transactions (profil LunaLive). Si les rubis manquent, ouvre un ticket",
        ],
        sensitivity: "medium",
        confidence: "confirmed",
        escalate: false,
        related_topics: ["rubis_disparu"],
    },
];
