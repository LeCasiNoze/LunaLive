export const COSMETICS_CATALOG = [
    // ─────────────────────────────────────────────
    // BADGES — SHOP
    // Prix: 250 rubis (LUNA + 777)
    // ─────────────────────────────────────────────
    {
        kind: "badge",
        code: "badge_luna",
        name: "Badge LUNA",
        rarity: "uncommon",
        unlock: "shop",
        priceRubis: 200,
        active: true,
        meta: { shape: "rect", text: "LUNA" },
    },
    {
        kind: "badge",
        code: "badge_777",
        name: "Badge 777",
        rarity: "legendary",
        unlock: "shop",
        priceRubis: 750,
        active: true,
        meta: { shape: "rect", text: "777" },
    },
    // ── Badges nouveaux ──────────────────────────────────────────
    // Renommé STREAM→Discord (retour Lucas) : récompense du succès « lier
    // son compte Discord à LunaLive » (succès existant discord_linked_bronze)
    { kind: "badge", code: "badge_discord", name: "Badge Discord", rarity: "rare", unlock: "achievement", priceRubis: null, active: true, meta: { shape: "rect", text: "🤖" } },
    { kind: "badge", code: "badge_og", name: "Badge OG", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { shape: "rect", text: "OG" } },
    { kind: "badge", code: "badge_rich", name: "Badge $$", rarity: "epic", unlock: "achievement", priceRubis: null, active: true, meta: { shape: "rect", text: "$$" } },
    // Prix badges par rareté : légendaire 750 / épique 500 / rare 300 / peu commun 200
    { kind: "badge", code: "badge_chef", name: "Badge Chef", rarity: "rare", unlock: "shop", priceRubis: 300, active: true, meta: { shape: "rect", text: "CHEF" } },
    { kind: "badge", code: "badge_skull", name: "Badge Skull", rarity: "epic", unlock: "shop", priceRubis: 500, active: true, meta: { shape: "rect", text: "💀" } },
    { kind: "badge", code: "badge_heart", name: "Badge Cœur", rarity: "uncommon", unlock: "shop", priceRubis: 200, active: true, meta: { shape: "rect", text: "❤️" } },
    { kind: "badge", code: "badge_star", name: "Badge Étoile", rarity: "uncommon", unlock: "shop", priceRubis: 200, active: true, meta: { shape: "rect", text: "⭐" } },
    { kind: "badge", code: "badge_lightning", name: "Badge Éclair", rarity: "rare", unlock: "shop", priceRubis: 300, active: true, meta: { shape: "rect", text: "⚡" } },
    // ─────────────────────────────────────────────
    // HATS
    // Prix shop: 500 rubis
    // Achievement: pas achetable (priceRubis: null)
    // ─────────────────────────────────────────────
    { kind: "hat", code: "hat_luna_cap", name: "Luna Cap", rarity: "rare", unlock: "shop", priceRubis: 500, active: true },
    { kind: "hat", code: "hat_carton_crown", name: "Carton Crown", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "hat", code: "hat_demon_horn", name: "Demon Horn", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "hat", code: "hat_eclipse_halo", name: "Eclipse Halo", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    // Prix hats par rareté (famille moins chère que cadrans/pseudos) :
    // mythique 2500 / légendaire 1500 / épique 800 / rare 500 / peu commun 300
    { kind: "hat", code: "hat_astral_helmet", name: "Astral Helmet", rarity: "legendary", unlock: "shop", priceRubis: 1500, active: true },
    { kind: "hat", code: "hat_lotus_aureole", name: "Lotus Aureole", rarity: "mythic", unlock: "shop", priceRubis: 2500, active: true },
    // ── Hats nouveaux ────────────────────────────────────────────
    { kind: "hat", code: "hat_top_hat", name: "Top Hat", rarity: "epic", unlock: "shop", priceRubis: 800, active: true, meta: { emoji: "🎩" } },
    { kind: "hat", code: "hat_santa", name: "Bonnet de Noël", rarity: "rare", unlock: "shop", priceRubis: 500, active: true, meta: { emoji: "🎅" } },
    { kind: "hat", code: "hat_witch", name: "Chapeau Sorcière", rarity: "rare", unlock: "shop", priceRubis: 500, active: true, meta: { emoji: "🧙" } },
    { kind: "hat", code: "hat_pirate", name: "Bandeau Pirate", rarity: "epic", unlock: "achievement", priceRubis: null, active: true, meta: { emoji: "🏴‍☠️" } },
    { kind: "hat", code: "hat_viking", name: "Casque Viking", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { emoji: "⚔️" } },
    { kind: "hat", code: "hat_propeller", name: "Beanie Hélice", rarity: "uncommon", unlock: "shop", priceRubis: 300, active: true, meta: { emoji: "🌀" } },
    // ─────────────────────────────────────────────
    // USERNAME
    // Prix shop: 2000 rubis
    // Achievement/system: pas achetable rubis (null)
    // ─────────────────────────────────────────────
    // ── Username nouveaux ────────────────────────────────────────
    // Reclassés rare→epic (règle raretés : rare = statique, épique = animé)
    { kind: "username", code: "uanim_pulse_red", name: "Pulse Rouge", rarity: "epic", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_pulse_blue", name: "Pulse Bleu", rarity: "epic", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_glitch", name: "Glitch", rarity: "legendary", unlock: "achievement", priceRubis: null, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_fire", name: "Feu", rarity: "epic", unlock: "achievement", priceRubis: null, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_ice", name: "Glace", rarity: "epic", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_silver_toggle", name: "Argenté", rarity: "rare", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_purple_toggle", name: "Pourpre royal", rarity: "rare", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_gradient_sunset", name: "Sunset gradient", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true },
    { kind: "username", code: "uanim_galaxy", name: "Galaxy", rarity: "legendary", unlock: "achievement", priceRubis: null, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_rainbow_scroll", name: "Arc-en-ciel défilant", rarity: "epic", unlock: "achievement", priceRubis: null, active: false /* remplace par la version moteur */ },
    // Nouveaux RARES statiques (uni/bicolore, règle raretés) — repeuplent le
    // tier rare après les reclassements ci-dessus.
    { kind: "username", code: "uanim_crimson", name: "Crimson", rarity: "rare", unlock: "shop", priceRubis: 2000, active: false /* remplace par la version moteur */ },
    { kind: "username", code: "uanim_ocean", name: "Océan", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "username", code: "uanim_mint", name: "Menthe givrée", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "username", code: "uanim_amber", name: "Ambre", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "username", code: "uanim_steel", name: "Acier", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    {
        kind: "username",
        code: "uanim_chroma_toggle",
        name: "Chroma (toggle)",
        rarity: "legendary",
        unlock: "achievement",
        priceRubis: null,
        active: false, /* remplace par la version moteur */
        meta: { toggle: true, style: "chroma" },
    },
    {
        kind: "username",
        code: "uanim_gold_toggle",
        name: "Gold (toggle)",
        rarity: "epic",
        unlock: "shop",
        priceRubis: 2000,
        active: false, /* remplace par la version moteur */
        meta: { toggle: true, style: "gold" },
    },
    { kind: "username", code: "uanim_neon_underline", name: "Néon + soulignage", rarity: "rare", unlock: "system", priceRubis: null, active: false /* remplace par la version moteur */ },
    // ─── USERNAME — FROST ───────────────────────────────────────────────────────
    {
        kind: "username",
        code: "uanim_frost",
        name: "Frost (glacé)",
        rarity: "rare",
        unlock: "shop",
        priceRubis: 1000,
        active: true,
        meta: { style: "frost" },
    },
    // ─── USERNAME — EMBER ───────────────────────────────────────────────────────
    {
        kind: "username",
        code: "uanim_ember",
        name: "Ember (braise)",
        rarity: "epic",
        unlock: "shop",
        priceRubis: 2000,
        active: false, /* remplace par la version moteur */
        meta: { style: "ember" },
    },
    // ─────────────────────────────────────────────
    // USERNAME — EFFETS MOTEUR (PixiJS/GSAP, canvas)
    // Remplacent les uanim_* désactivés ci-dessus. Les codes = ids du
    // registre moteur (web/src/fx/username). meta.engine = rendu canvas.
    // Obtentions = PROPOSITIONS (meta.proposal) — à arbitrer : chaque drop
    // doit venir d'un ÉVÉNEMENT, de la BOUTIQUE ou d'un SUCCÈS.
    // ─────────────────────────────────────────────
    // Prix actés par Lucas (11 juil) : mythique 5000 / légendaire 3000 /
    // épique 1500 / rare 1000. Succès reworkés selon ses retours.
    // ── Mythiques (7)
    { kind: "username", code: "garden-of-ashes", name: "Jardin des Cendres", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès event « Maître des Cendres » : terminer sur le podium (top 3) des 4 types d'event : Roue, Coffre, Boss, Semaine du viewer" } },
    { kind: "username", code: "jackpot-divin", name: "Jackpot Divin", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès « Jackpot Divin » : décrocher 3 fois le gain maximal de la roue quotidienne" } },
    { kind: "username", code: "leviathan-abyssal", name: "Léviathan Abyssal", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès event « Abysses » : 50 000 rubis contribués cumulés aux Coffres communs (toutes éditions)" } },
    { kind: "username", code: "forge-celeste", name: "Forge Céleste", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès event « Forge Céleste » : 50 000 dégâts cumulés sur les boss (toutes éditions)" } },
    { kind: "username", code: "nuee-obsidienne", name: "Nuée d'Obsidienne", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès « Noctambule ultime » : 60 nuits distinctes avec ≥ 30 min de watch entre minuit et 4 h" } },
    { kind: "username", code: "sablier-eternite", name: "Sablier d'Éternité", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "VALIDÉ — Succès : 365 jours de connexion cumulés" } },
    { kind: "username", code: "coeur-du-reacteur", name: "Cœur du Réacteur", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès « Cœur du Réacteur » : 3 victoires (#1) à la Semaine du viewer" } },
    // ── Légendaires (8)
    { kind: "username", code: "eveil-lunaire", name: "Éveil Lunaire", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès : 100 jours de connexion cumulés" } },
    { kind: "username", code: "orage-interieur", name: "Orage Intérieur", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès event « Orage Intérieur » : top 10 sur chaque type d'event classé (Roue, Coffre, Boss, Semaine du viewer)" } },
    { kind: "username", code: "spectre", name: "Spectre", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "VALIDÉ (heures montées) — Succès : 100 h de présence live cumulée sans écrire un seul message" } },
    { kind: "username", code: "cristallisation", name: "Cristallisation", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès « Hibernation » : 40 h de watch en période hivernale (décembre → février)" } },
    { kind: "username", code: "ufx-chroma", name: "Chroma", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "VALIDÉ — Hérite du succès Parfait (30 bonus quotidiens sur un mois)" } },
    { kind: "username", code: "ufx-glitch", name: "Glitch", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "VALIDÉ — Succès : 500 messages chat en une seule journée" } },
    { kind: "username", code: "ufx-galaxy", name: "Galaxy", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "VALIDÉ — Succès : 50 h de watch sur un mois" } },
    { kind: "username", code: "ufx-ice", name: "Glace", rarity: "legendary", unlock: "shop", priceRubis: 3000, active: true, meta: { engine: true } },
    // ── Épiques (5)
    { kind: "username", code: "ufx-fire", name: "Feu", rarity: "epic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Succès : série de connexion de 14 jours" } },
    { kind: "username", code: "ufx-gold", name: "Gold", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-pulse-red", name: "Pulse Rouge", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-pulse-blue", name: "Pulse Bleu", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-rainbow", name: "Arc-en-ciel", rarity: "epic", unlock: "achievement", priceRubis: null, active: true, meta: { engine: true, proposal: "Hérite du succès Ultime (20 succès débloqués)" } },
    // ── Rares (4)
    { kind: "username", code: "ufx-silver", name: "Argenté", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-purple", name: "Pourpre royal", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-crimson", name: "Crimson", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true, meta: { engine: true } },
    { kind: "username", code: "ufx-neon", name: "Néon", rarity: "rare", unlock: "system", priceRubis: null, active: true, meta: { engine: true, proposal: "Système : agenda 30 jours (comme l'actuel Néon + soulignage)" } },
    // ─────────────────────────────────────────────
    // MESSAGE FRAMES
    // Gold (shop): 3000 rubis
    // Achievements: pas achetable (null)
    // ─────────────────────────────────────────────
    // Cadrans EVENT (récompenses top-3, cf api/src/events/rewards.ts — codes
    // frame_* historiques conservés pour matcher les grants déjà en DB)
    { kind: "frame", code: "frame_wheel_roulette", name: "Cadran Roulette", rarity: "epic", unlock: "event", priceRubis: null, active: true },
    { kind: "frame", code: "frame_chest_vault", name: "Cadran Coffre-Fort", rarity: "epic", unlock: "event", priceRubis: null, active: true },
    { kind: "frame", code: "frame_boss_flames", name: "Cadran Champ de Bataille", rarity: "legendary", unlock: "event", priceRubis: null, active: true },
    { kind: "frame", code: "frame_viewer_hearts", name: "Cadran Roi des Viewers", rarity: "legendary", unlock: "event", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_gold", name: "Cadran Gold", rarity: "legendary", unlock: "shop", priceRubis: 3000, active: true },
    { kind: "frame", code: "mframe_lotus_crown", name: "Cadran Lotus Crown", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_eclipse", name: "Cadran Eclipse", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
    // ── Frames nouveaux ──────────────────────────────────────────
    // Prix cadrans rééchelonnés par rareté (grille Lucas 11 juil) :
    // mythique 5000 / légendaire 3000 / épique 1500 / rare 1000 / commun 500
    { kind: "frame", code: "mframe_neon_pink", name: "Cadran Néon Rose", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "frame", code: "mframe_neon_cyan", name: "Cadran Néon Cyan", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "frame", code: "mframe_galaxy", name: "Cadran Galaxy", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true },
    // monté epic→legendary (retour Lucas : sang qui dégouline + beam)
    { kind: "frame", code: "mframe_blood", name: "Cadran Blood", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_emerald", name: "Cadran Émeraude", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "frame", code: "mframe_royal", name: "Cadran Royal", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true },
    { kind: "frame", code: "mframe_glitch", name: "Cadran Glitch", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_diamond", name: "Cadran Diamant", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true },
    { kind: "frame", code: "mframe_phoenix", name: "Cadran Phénix", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_ice", name: "Cadran Glace", rarity: "epic", unlock: "shop", priceRubis: 1500, active: true },
    { kind: "frame", code: "mframe_sakura", name: "Cadran Sakura", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "frame", code: "mframe_fest_eclair", name: "Cadran Éclair", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "frame", code: "mframe_neon_rainbow", name: "Cadran Néon Rainbow", rarity: "mythic", unlock: "shop", priceRubis: 5000, active: true },
    { kind: "frame", code: "mframe_carbon", name: "Cadran Carbone", rarity: "rare", unlock: "shop", priceRubis: 1000, active: true },
    { kind: "frame", code: "mframe_paper", name: "Cadran Papier", rarity: "common", unlock: "shop", priceRubis: 500, active: true },
    {
        kind: "frame",
        code: "mframe_void",
        name: "Cadran Void",
        rarity: "mythic",
        unlock: "shop",
        priceRubis: 5000,
        active: true,
    },
    // ─── FRAME — AURORA ─────────────────────────────────────────────────────────
    {
        kind: "frame",
        code: "mframe_aurora",
        name: "Cadran Aurora",
        rarity: "rare",
        unlock: "shop",
        priceRubis: 1000,
        active: true,
    },
    // ─────────────────────────────────────────────
    // TITLES (Sprint 3.5b — uniquement débloqués via succès)
    // Tous les titres deviennent achievement-only. Les anciens titres shop
    // (BigMoula, LunaKing, All-in Man) sont conservés mais en source achievement
    // pour compatibilité — les users qui les ont déjà gardent leur entitlement.
    // ─────────────────────────────────────────────
    // ── Titres existants (5 achievement + 3 shop preserved) ──────────────────
    { kind: "title", code: "title_ratus", name: "Ratus", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_ca_tourne", name: "Ça tourne !", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_vrai_viewer", name: "Vrai Viewer", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_no_life", name: "No Life", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_batman", name: "Batman", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_bigmoula", name: "BigMoula", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_lunaking", name: "LunaKing", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_allin_man", name: "All-in Man", rarity: "mythic", unlock: "achievement", priceRubis: null, active: true },
    // ── Titres bronze (uncommon) ──────────────────────────────────────────────
    { kind: "title", code: "title_bienvenue_sur_lunalive", name: "Bienvenue sur LunaLive", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_pas", name: "Premier pas", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_live", name: "Premier live", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_message", name: "Premier message", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_follow", name: "Premier follow", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_cloche_activee", name: "Cloche activée", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_tour", name: "Premier tour", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_pack_de_depart", name: "Pack de départ", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_feed_lance", name: "Feed lancé", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_bonus", name: "Premier bonus", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_soutien", name: "Premier soutien", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_avatar_pose", name: "Avatar posé", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_style", name: "Premier style", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premiere_prediction", name: "Première prédiction", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_sous_la_pluie", name: "Sous la pluie", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_roue_sociale", name: "Roue sociale", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_parraine", name: "Parrainé", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_novice", name: "Novice", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_connecte", name: "Connecté", rarity: "uncommon", unlock: "achievement", priceRubis: null, active: true },
    // ── Titres silver (rare) ──────────────────────────────────────────────────
    { kind: "title", code: "title_habitue", name: "Habitué", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_discussion", name: "Discussion", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_regulier", name: "Régulier", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_curieux", name: "Curieux", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_touche_a_tout", name: "Touche-à-tout", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_retour_regulier", name: "Retour régulier", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_vrai_feed", name: "Vrai feed", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_coffres_compagnie", name: "Coffres & compagnie", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_look_complet", name: "Look complet", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_premier_achat_shop", name: "Premier achat shop", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_explorateur_streamer", name: "Explorateur streamer", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_clip_lover", name: "Clip lover", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_ping_pret", name: "Ping prêt", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_a_l_affut", name: "À l'affût", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_fouineur", name: "Fouineur", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_chanceux", name: "Chanceux", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_petite_frappe", name: "Petite frappe", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_gambler", name: "Gambler", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_nemo", name: "Nemo", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_21", name: "21", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_econome", name: "Économe", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_gratteur", name: "Gratteur", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_ruine", name: "Ruiné", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_rituel", name: "Rituel", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_spinner", name: "Spinner", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_assidu", name: "Assidu", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_rat", name: "Rat", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_random", name: "Random", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_vampire", name: "Vampire", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_first", name: "First", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_viewer", name: "Viewer", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_testeur", name: "Testeur", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_grinder", name: "Grinder", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_collectionneur", name: "Collectionneur", rarity: "rare", unlock: "achievement", priceRubis: null, active: true },
    // ── Titres gold (epic) ────────────────────────────────────────────────────
    { kind: "title", code: "title_marathon", name: "Marathon", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_roulette", name: "Roulette", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_grande_discussion", name: "Grande discussion", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_explorateur", name: "Explorateur", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_super_follow", name: "Super-follow", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_tour_complet", name: "Tour complet", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_rituel_lunalive", name: "Rituel LunaLive", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_mecene", name: "Mécène", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_cercle_fidele", name: "Cercle fidèle", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_coffre_fort", name: "Coffre-fort", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_early_bird", name: "Early Bird", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_devin", name: "Devin", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_maitre_du_bot", name: "Maître du bot", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_vitrine_complete", name: "Vitrine complète", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_tracker", name: "Tracker", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_rentier", name: "Rentier", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_grosse_frappe", name: "Grosse frappe", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_accro", name: "Accro", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_instinct", name: "Instinct", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_shark", name: "Shark", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_triplette", name: "Triplette", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_203", name: "203", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_big_blind", name: "Big Blind", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_banquier", name: "Banquier", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_flambeur", name: "Flambeur", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_routine", name: "Routine", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_studieux", name: "Studieux", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_beyblade", name: "Beyblade", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_toujours_la", name: "Toujours là", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_pilleur", name: "Pilleur", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_connu", name: "Connu", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_fidele", name: "Fidèle", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_slotteur", name: "Slotteur", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_pro", name: "Pro", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_chasseur", name: "Chasseur", rarity: "epic", unlock: "achievement", priceRubis: null, active: true },
    // ── Titres master (legendary) ─────────────────────────────────────────────
    { kind: "title", code: "title_sous_la_lune", name: "Sous la lune", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_pretre_de_la_roue", name: "Prêtre de la roue", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_archiviste", name: "Archiviste", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_pilier", name: "Pilier", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_parfait", name: "Parfait", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_polyvalent", name: "Polyvalent", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_collection_par_categorie", name: "Collection par catégorie", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_ultime", name: "Ultime", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_predateur", name: "Prédateur", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_trader", name: "Trader", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_max_frappe", name: "Max frappe", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_oracle", name: "Oracle", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_nessie", name: "Nessie", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_croupier_slayer", name: "Croupier slayer", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_baron", name: "Baron", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_rothschild", name: "Rothschild", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_acharne", name: "Acharné", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_inarretable", name: "Inarrêtable", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_one_piece", name: "One Piece", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_legende_du_chat", name: "Légende du chat", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_brother_eye", name: "Brother Eye", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_ephemeride", name: "Éphéméride", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_tryharder", name: "Tryharder", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_legende", name: "Légende", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
    { kind: "title", code: "title_sans_vie", name: "Sans vie", rarity: "legendary", unlock: "achievement", priceRubis: null, active: true },
];
