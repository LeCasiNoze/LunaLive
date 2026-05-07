// api/src/discord/constants.ts
// ─────────────────────────────────────────────
// IDs (LunaLive serveur officiel)
// ─────────────────────────────────────────────
export const GUILD_ID = "1467139956249067717";
// Tickets
export const STAFF_TICKETS_CATEGORY_ID = "1467141806922666034";
// Channel où il y a le bouton “Faire une demande streamer”
export const APPLY_CHANNEL_ID = "1467142148431413370";
// Channel où on envoie UNIQUEMENT le message de décision (accept/refuse)
export const STAFF_DECISIONS_CHANNEL_ID = "1467142397816209530";
export const STAFF_DECISIONS_PING_ROLE_ID = "1467140795105546441";
// Welcome / Goodbye (serveur officiel)
export const OFFICIAL_WELCOME_CHANNEL_ID = "1467142004470186077";
export const OFFICIAL_GOODBYE_CHANNEL_ID = "1468975937189052567";
// Channel où on dit aux gens de /link
export const OFFICIAL_LINK_CHANNEL_ID = "1467142026004009167";
// Reaction roles (serveur officiel)
export const OFFICIAL_REACTION_ROLES_CHANNEL_ID = "1467142050121252914";
export const ROLE_RESEAUX_GLOBAL_ID = "1468982992910155908";
export const ROLE_YOUTUBE_ID = "1468983076141928479";
export const ROLE_INSTA_ID = "1468983120664723507";
export const ROLE_TIKTOK_ID = "1468983145230766163";
// Custom IDs buttons
export const CID_RR_PREFIX = "rr:"; // rr:youtube | rr:insta | rr:tiktok | rr:reseaux
// Salon mini-jeux (serveur officiel uniquement)
export const OFFICIAL_GAMES_CHANNEL_ID = "1468997817627447400";
// Roles
export const ROLE_VERIFIED_ID = "1467140844233556231";
export const ROLE_VIEWER_ID = "1467140868288024742";
export const ROLE_STREAMER_ID = "1467140886793027656";
export const ROLE_PARTNER_ID = "1467140935954726984";
export const ROLE_MOD_LUNALIVE_ID = "1467140910771994801";
export const ROLE_RESTRICTED_ID = "1467140964773794005";
// Qui peut approuver/rejeter (dans le ticket)
export const STAFF_ROLE_IDS = ["1467140769436405981", "1467140795105546441"];
// ─────────────────────────────────────────────
// Support (salon public + tickets privés)
// ─────────────────────────────────────────────
// ⚠️ À remplir : ID du salon #support public sur le serveur officiel
// Créer un salon texte public sur Discord, copier son ID ici.
export const SUPPORT_CHANNEL_ID = process.env.DISCORD_SUPPORT_CHANNEL_ID ?? "";
// ─────────────────────────────────────────────
// Custom IDs (Discord components)
// ─────────────────────────────────────────────
export const CID_APPLY_OPEN = "apply:open";
export const CID_APPLY_MODAL = "apply:modal";
export const CID_APPLY_DECIDE_PREFIX = "apply:decide:"; // apply:decide:approve:<id> | reject
// Support
export const CID_SUPPORT_OPEN = "support:open";
export const CID_SUPPORT_CLOSE = "support:close";
export const CID_SUPPORT_ESCALATE = "support:escalate";
// Support — boutons d'évaluation de réponse bot
// Format : support:rate:{rating}:{ticketId}:{entryId}
// rating ∈ "helpful" | "ok" | "bad"
export const CID_SUPPORT_RATE_PREFIX = "support:rate:";
// ─────────────────────────────────────────────
// Fabiozsis — serveur streamer externe
// ─────────────────────────────────────────────
export const FABIO_GUILD_ID = "1237715340386107472";
// Catégories
export const FABIO_CAT_TICKETS_ID = "1241389159705477180";
export const FABIO_CAT_MODO_ID = "1493585209822675004";
export const FABIO_CAT_INFOS_ID = "1237715340889161851";
// Salons
export const FABIO_LOGS_TICKETS_ID = "1241389161001385984"; // 〈📋〉｜logs-tickets
export const FABIO_MODO_LOGS_BOT_ID = "1493585221214539950"; // 〈📋〉｜logs-bot
export const FABIO_ROLE_CHANNEL_ID = "1493585239782723584"; // 〈❄〉｜choix-de-rôle
export const FABIO_NOTIF_CHANNEL_ID = "1469708191406227693"; // 〈🔔〉｜notifs (stream + insta)
export const FABIO_STATS_CHANNEL_ID = "1493633561968775379"; // 〈📊〉｜stats
// Identifiants LunaLive (DB)
export const FABIO_STREAMER_ID = 23;
export const FABIO_STREAMER_SLUG = "fabiozsis";
// Custom IDs — giveaway
export const CID_FABIO_GIVEAWAY_ENTER = "fabio:giveaway:enter:"; // + giveawayId
export const CID_FABIO_GIVEAWAY_CANCEL = "fabio:giveaway:cancel:"; // + giveawayId (mod)
// Rôles
export const FABIO_ROLE_MOD_ID = "1237718032768438312"; // 🔪︱Modérateur
export const FABIO_ROLE_CHEF_ID = "1469716646624104459"; // 👑︱Le Chef
export const FABIO_ROLE_MEMBRE_ID = "1469711361163395193"; // 🙍︱Membres
export const FABIO_ROLE_NOTIF_INSTA = "1493586435876327485";
export const FABIO_ROLE_NOTIF_YT = "1493586439412121692";
export const FABIO_ROLE_NOTIF_TW = "1493586446651494543";
export const FABIO_ROLE_NOTIF_STREAM = "1493586450518769664";
// Custom IDs — tickets casino
export const CID_FABIO_TICKET_OPEN = "fabio:ticket:open";
export const CID_FABIO_TICKET_TYPE = "fabio:ticket:type"; // select menu
export const CID_FABIO_TICKET_OFFER = "fabio:ticket:offer"; // select menu offre
export const CID_FABIO_TICKET_MODAL = "fabio:ticket:modal:"; // + offerId
export const CID_FABIO_TICKET_APPROVE = "fabio:ticket:approve:"; // + ticketId
export const CID_FABIO_TICKET_REJECT = "fabio:ticket:reject:"; // + ticketId
export const CID_FABIO_TICKET_REJECT_MODAL = "fabio:ticket:reject_modal:"; // + ticketId
export const CID_FABIO_TICKET_REIMBURSE = "fabio:ticket:reimburse:"; // + ticketId
export const CID_FABIO_TICKET_VIREMENT = "fabio:ticket:virement:"; // + ticketId
export const CID_FABIO_TICKET_APPEAL = "fabio:ticket:appeal:"; // + ticketId
export const CID_FABIO_TICKET_APPEAL_ACK = "fabio:ticket:appeal_ack:"; // + ticketId:accept|reject
// Custom IDs — gestion offres (admin)
export const CID_FABIO_OFFER_ADD = "fabio:offer:add";
export const CID_FABIO_OFFER_ADD_MODAL = "fabio:offer:add_modal";
export const CID_FABIO_OFFER_EDIT = "fabio:offer:edit"; // select menu
export const CID_FABIO_OFFER_EDIT_MODAL = "fabio:offer:edit_modal:"; // + offerId
export const CID_FABIO_OFFER_TOGGLE = "fabio:offer:toggle"; // select menu
export const CID_FABIO_OFFER_EVENT = "fabio:offer:event"; // select menu → modal
export const CID_FABIO_OFFER_EVENT_MODAL = "fabio:offer:event_modal:"; // + offerId
// Custom IDs — rôles notifs
export const CID_FABIO_NOTIF_ROLE = "notif_role:"; // + roleId
// ─────────────────────────────────────────────
// Slash commands list (guild-scoped)
// ─────────────────────────────────────────────
export const SLASH_COMMANDS = [
    { name: "help", description: "Aide LunaLive" },
    { name: "whoami", description: "Afficher votre statut de liaison LunaLive" },
    { name: "link", description: "Lier votre Discord à votre compte LunaLive" },
    // ✅ Mini-jeux (serveur officiel / salon jeux uniquement)
    { name: "claim", description: "Récupérer des rubis gratuits (1x / 24h)" },
    { name: "slot", description: "Machine à sous (10 rubis, 1x / 6h)" },
    // ✅ Blackjack
    { name: "blackjack", description: "Jouer au blackjack (20 rubis, 1x / 12h)" },
    { name: "blackjack_plus", description: "Blackjack+ (side bets) (25 rubis, 1x / 12h)" },
    // ✅ Profil & stats
    { name: "solde", description: "Afficher tes rubis et ton niveau" },
    { name: "profil", description: "Afficher ta fiche profil complète" },
    { name: "succes", description: "Afficher tes récompenses débloquées" },
    // ─── Outils admin AGENCE / FSB (default_member_permissions: "0" =
    // invisibles à tous sauf admins. Tu peux étendre via Server Settings →
    // Integrations → LunaBot. Plus check runtime sur le salon QG).
    {
        name: "frais",
        description: "Frais d'agence",
        default_member_permissions: "0",
        options: [
            { name: "ajouter", description: "Ajouter un frais (modal)", type: 1 },
        ],
    },
    {
        name: "agence",
        description: "Outils agence",
        default_member_permissions: "0",
        options: [
            { name: "recap", description: "Récap mensuel agence", type: 1, options: [
                    { name: "mois", description: "YYYY-MM (défaut: mois courant)", type: 3, required: false },
                ] },
        ],
    },
    {
        name: "landing",
        description: "Landing pages affiliées",
        default_member_permissions: "0",
        options: [
            { name: "creer", description: "Créer une landing rapide (V3)", type: 1 },
            { name: "list", description: "Lister mes landings avec URLs", type: 1 },
        ],
    },
    {
        name: "dette",
        description: "Snapshot rapide des frais d'agence impayés",
        default_member_permissions: "0",
    },
    {
        name: "tiktok",
        description: "TikTok outreach",
        default_member_permissions: "0",
        options: [
            { name: "influenceur-add", description: "Ajouter un influenceur au réseau", type: 1, options: [
                    { name: "lien", description: "Lien TikTok ou handle (@xxx)", type: 3, required: true },
                ] },
        ],
    },
];
