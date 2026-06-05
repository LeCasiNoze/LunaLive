// api/src/discord/admin_commands.ts
//
// Slash commands admin/agence pour le salon QG de l'ombre. Tous les handlers
// vérifient :
//   1. Que l'utilisateur est dans la whitelist (LeCasiNoze + Fabiozsis +
//      Samyzsis quand ajouté).
//   2. Que la commande est exécutée dans le salon QG (ou un salon privé
//      autorisé) — sinon ephemeral refus.
//
// Discord ne permet PAS de restreindre programmatiquement la VISIBILITÉ d'une
// commande à un salon. Le `default_member_permissions: "0"` la masque pour les
// non-admins ; pour étendre à Fabiozsis/Samyzsis sans Admin role, utilise
// Server Settings → Integrations → LunaBot.
//
// Ce module exporte un seul `routeAdminInteraction()` à appeler depuis
// discord/bot.ts dans le handler interactionCreate.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";
import { pool } from "../db.js";
import { refreshAgencyFeesBoard } from "../agency_fees_board.js";
import { makeV2BlockId } from "../lib/affi_v2_types.js";
import { getM1Theme, themeToColors } from "../lib/m1_themes.js";
import { loadUnpaidOccurrences, markExpensePaid } from "../lib/expenses_unpaid.js";
const LOG = "[admin-cmd]";
const ALLOWED_USER_IDS = new Set([
    "682472610868887567", // LeCasiNoze
    "406965568755728395", // Fabiozsis
    "992099046472831066", // Samyzsis (eowite22)
]);
const QG_CHANNEL_ID = "1501890674620891268";
const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.onrender.com").replace(/\/$/, "");
const PUBLIC_LANDAURAX_BASE = String(process.env.PUBLIC_LANDAURAX_BASE || process.env.VITE_LANDAURAX_SITE_URL || "https://landaurax.onrender.com").replace(/\/$/, "");
const LANDING_EDITOR_RETURN_TO = "/FSB_Board?section=tools";
const eur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
function landingPublicUrl(slug, domain = "lunalive") {
    return domain === "landaurax" ? `${PUBLIC_LANDAURAX_BASE}/${slug}` : `${PUBLIC_WEB_BASE}/r/${slug}`;
}
function landingEditorUrl(pageId, slug) {
    const params = new URLSearchParams({
        pageId: String(pageId),
        slug,
        returnTo: LANDING_EDITOR_RETURN_TO,
    });
    return `${PUBLIC_WEB_BASE}/editorFSNV3?${params.toString()}`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Garde-fou : user + salon
// ─────────────────────────────────────────────────────────────────────────────
async function checkAllowedUser(interaction) {
    if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
        await interaction.reply({ ephemeral: true, content: "🚫 Cette commande est réservée à l'équipe agence." });
        return false;
    }
    return true;
}
async function checkAccess(interaction) {
    if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
        await interaction.reply({ ephemeral: true, content: "🚫 Cette commande est réservée à l'équipe agence." });
        return false;
    }
    if (interaction.channelId !== QG_CHANNEL_ID) {
        await interaction.reply({ ephemeral: true, content: `🚫 Cette commande s'utilise dans <#${QG_CHANNEL_ID}>.` });
        return false;
    }
    return true;
}
// ─────────────────────────────────────────────────────────────────────────────
// /frais ajouter
// ─────────────────────────────────────────────────────────────────────────────
const MODAL_FRAIS_AJOUTER = "admin:frais:ajouter:modal";
async function handleFraisAjouter(interaction) {
    if (!await checkAccess(interaction))
        return;
    const modal = new ModalBuilder().setCustomId(MODAL_FRAIS_AJOUTER).setTitle("Ajouter un frais");
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Short).setMaxLength(160).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("category").setLabel("Catégorie")
        .setPlaceholder("giveaway / offres / parrainage / abonnement / personnalise")
        .setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true).setValue("personnalise")), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Montant en € (ex: 145.50)").setStyle(TextInputStyle.Short).setMaxLength(12).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("date").setLabel("Date YYYY-MM-DD (laisser vide = aujourd'hui)").setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("notes").setLabel("Notes (optionnel)").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false)));
    await interaction.showModal(modal);
}
const VALID_CATEGORIES = new Set(["giveaway", "offres", "parrainage", "abonnement", "personnalise"]);
async function handleFraisAjouterSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const description = interaction.fields.getTextInputValue("description").trim();
        const category = interaction.fields.getTextInputValue("category").trim().toLowerCase();
        const amountStr = interaction.fields.getTextInputValue("amount").trim().replace(",", ".");
        const dateStr = interaction.fields.getTextInputValue("date").trim();
        const notes = interaction.fields.getTextInputValue("notes")?.trim() || null;
        if (!VALID_CATEGORIES.has(category))
            throw new Error(`Catégorie invalide. Doit être : ${[...VALID_CATEGORIES].join(", ")}`);
        const amount = Number(amountStr);
        if (!isFinite(amount) || amount <= 0)
            throw new Error("Montant invalide");
        const date = dateStr || new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            throw new Error("Date doit être YYYY-MM-DD");
        const r = await pool.query(`INSERT INTO expenses (description, category, amount, date, is_recurring, notes, source_type)
       VALUES ($1, $2, $3, $4::date, FALSE, $5, 'manual') RETURNING id`, [description, category, amount, date, notes]);
        const id = Number(r.rows[0].id);
        await interaction.editReply({
            content: `✅ Frais **#${id}** ajouté : **${eur(amount)}** — _${description}_ (catégorie: ${category}, date: ${date})`,
        });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /agence recap [mois]
// ─────────────────────────────────────────────────────────────────────────────
async function handleAgenceRecap(interaction) {
    if (!await checkAccess(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    const moisInput = interaction.options.getString("mois");
    const monthKey = (moisInput && /^\d{4}-\d{2}$/.test(moisInput))
        ? moisInput
        : new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date()).replace("-", "-");
    const monthStart = `${monthKey}-01`;
    try {
        const [byStreamer, byCasino, totals] = await Promise.all([
            pool.query(`
        SELECT ags.display_name AS streamer,
               COALESCE(SUM(st.ftd), 0)::int      AS ftd,
               COALESCE(SUM(st.total_deposits), 0)::float AS dep,
               COALESCE(SUM(st.rs_value), 0)::float AS rs
        FROM agency_streamer_assignments asa
        JOIN agency_streamers ags ON ags.id = asa.agency_streamer_id
        LEFT JOIN agency_streamer_assignment_stats st
          ON st.assignment_id = asa.id AND st.month_key = $1::date
        WHERE asa.start_date <= $1::date
          AND (asa.end_date IS NULL OR asa.end_date >= $1::date)
        GROUP BY ags.display_name
        ORDER BY ftd DESC, dep DESC
        LIMIT 10
        `, [monthStart]),
            pool.query(`
        SELECT c.name AS casino,
               COALESCE(SUM(st.ftd), 0)::int      AS ftd,
               COALESCE(SUM(st.total_deposits), 0)::float AS dep
        FROM agency_streamer_assignments asa
        JOIN agency_deals d   ON d.id = asa.deal_id
        JOIN agency_casinos c ON c.id = d.casino_id
        LEFT JOIN agency_streamer_assignment_stats st
          ON st.assignment_id = asa.id AND st.month_key = $1::date
        WHERE asa.start_date <= $1::date
          AND (asa.end_date IS NULL OR asa.end_date >= $1::date)
        GROUP BY c.name
        ORDER BY ftd DESC
        LIMIT 10
        `, [monthStart]),
            pool.query(`
        SELECT
          COALESCE(SUM(amount), 0)::float AS total_payouts,
          COUNT(*) FILTER (WHERE paid_at IS NULL)::int AS unpaid_count,
          COALESCE(SUM(amount) FILTER (WHERE paid_at IS NULL), 0)::float AS unpaid_sum
        FROM expenses
        WHERE source_type = 'agency_streamer_payout'
          AND agency_month_key = $1::date
        `, [monthStart]),
        ]);
        const streamerLines = byStreamer.rows.map((r, i) => `${i + 1}. **${r.streamer}** — ${r.ftd} FTD · ${eur(Number(r.dep))} dép · RS ${eur(Number(r.rs))}`).join("\n") || "_Aucune stat._";
        const casinoLines = byCasino.rows.map((r) => `• **${r.casino}** — ${r.ftd} FTD · ${eur(Number(r.dep))}`).join("\n") || "_Aucune stat._";
        const t = totals.rows[0];
        const embed = new EmbedBuilder()
            .setColor(0x9D4BFF)
            .setTitle(`📊 Récap agence — ${monthKey}`)
            .setURL(`${PUBLIC_WEB_BASE}/FSB_Board`)
            .setDescription(`**Total payouts du mois :** ${eur(Number(t.total_payouts))}\n` +
            `**Impayés :** ${t.unpaid_count} échéance${t.unpaid_count > 1 ? "s" : ""} — ${eur(Number(t.unpaid_sum))}`)
            .addFields({ name: "🏆 Top streamers (FTD)", value: streamerLines, inline: false }, { name: "🎰 Top casinos (FTD)", value: casinoLines, inline: false })
            .setFooter({ text: "LunaLive • Récap agence" })
            .setTimestamp(new Date());
        await interaction.editReply({ embeds: [embed] });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /landing creer  +  /landing list
// ─────────────────────────────────────────────────────────────────────────────
const MODAL_LANDING_CREER = "admin:landing:creer:modal";
const LANDING_MODEL_LABEL = {
    M1: "Cards + Reviews",
    M3: "Spinning Wheel",
    M4: "Scratch Card",
    M5: "Slot Machine",
    M6: "Treasure Chest",
};
async function handleLandingCreer(interaction) {
    if (!await checkAccess(interaction))
        return;
    {
        const quickModal = new ModalBuilder()
            .setCustomId(MODAL_LANDING_CREER)
            .setTitle("Landing V3 - M10");
        quickModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pseudo").setLabel("Pseudo / nom du streamer").setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("affiLink").setLabel("Lien d'affiliation (URL complete)").setStyle(TextInputStyle.Short).setMaxLength(400).setRequired(true)));
        await interaction.showModal(quickModal);
        return;
    }
    const modelKind = "M10";
    const themeKey = "cyclope";
    const modal = new ModalBuilder()
        .setCustomId(MODAL_LANDING_CREER)
        .setTitle(`Landing V3 — ${modelKind} / ${getM1Theme(themeKey).label}`.slice(0, 45));
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pseudo").setLabel("Pseudo / nom du streamer").setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("affiLink").setLabel("Lien d'affiliation (URL complète)").setStyle(TextInputStyle.Short).setMaxLength(400).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("depositAmount").setLabel("Dépôt min en € (vide = ligne masquée)").setStyle(TextInputStyle.Short).setMaxLength(8).setRequired(false).setValue("10")), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bonusAmount").setLabel("Bonus € à jouer (vide = ligne masquée)").setStyle(TextInputStyle.Short).setMaxLength(8).setRequired(false).setValue("20")), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("profileImageUrl").setLabel("URL photo de profil (optionnel)").setStyle(TextInputStyle.Short).setMaxLength(400).setRequired(false)));
    await interaction.showModal(modal);
}
async function handleLandingCreerSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        {
            const pseudo = interaction.fields.getTextInputValue("pseudo").trim();
            const affiLink = interaction.fields.getTextInputValue("affiLink").trim();
            if (!pseudo)
                throw new Error("Pseudo requis");
            if (!/^https?:\/\//i.test(affiLink))
                throw new Error("Lien d'affiliation invalide (doit commencer par http(s)://)");
            const depositAmount = 20;
            const bonusAmount = 40;
            const publishDomain = "landaurax";
            const inputs = {
                modelKind: "M10",
                m1UseTheme: true,
                m1Theme: "cyclope",
                pseudo,
                affiLink,
                depositAmount,
                bonusAmount,
                profileImageUrl: "",
                gameImageUrl: "/affi_templates/cyclope/chicken.jpg",
                gameLabel: "POULET",
                gameBonusPct: "550%",
                pseudoVariant: "fade",
                pseudoAnimation: "none",
                showVip: false,
            };
            const v2Page = buildLandingM10Page({
                pseudo,
                affiLink,
                depositAmount,
                bonusAmount,
                showVip: false,
            });
            const builderSlug = String(v2Page.slug || "").trim();
            const baseSlug = builderSlug || pseudo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            const slug = await resolveUniqueSlug(baseSlug || "landing");
            v2Page.slug = slug;
            const config = { ...v2Page, __v3: true, __v3Inputs: inputs };
            const ownerUserId = await resolveOwnerUserIdForDiscord(interaction.user.id);
            const r = await pool.query(`
        INSERT INTO affi_landing_pages
          (slug, model, variant, brand_name, title, config, editor_version, owner_user_id, publish_domain, created_at, updated_at)
        VALUES ($1, 4, NULL, $2, $3, $4::jsonb, 2, $5, $6, NOW(), NOW())
        RETURNING id, slug, publish_domain
        `, [slug, pseudo, pseudo, JSON.stringify(config), ownerUserId, publishDomain]);
            const id = Number(r.rows[0].id);
            const finalSlug = String(r.rows[0].slug);
            const finalDomain = r.rows[0].publish_domain === "landaurax" ? "landaurax" : "lunalive";
            const publicUrl = landingPublicUrl(finalSlug, finalDomain);
            const editorUrl = landingEditorUrl(id, finalSlug);
            const embed = new EmbedBuilder()
                .setColor(0xFF4B6E)
                .setTitle("Landing V3 creee - M10")
                .setURL(publicUrl)
                .setDescription(`Page **${pseudo}** creee et publiee sur **Landaurax** (#${id}, slug \`${finalSlug}\`).\n\n` +
                `Montants par defaut : **20 EUR / 40 EUR**. Ouvre le lien de modification pour l'ajuster directement dans le FSB Board V3.`)
                .addFields({ name: "URL publique", value: publicUrl, inline: false }, { name: "Modifier dans le FSB Board V3", value: editorUrl, inline: false });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Voir la page").setURL(publicUrl), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Modifier (V3)").setURL(editorUrl));
            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
        }
        /*
        // customId = "admin:landing:creer:modal:M3:emerald" → parse model + theme
        const suffix = interaction.customId.slice(MODAL_LANDING_CREER.length + 1);
        const [rawModel, rawTheme] = suffix.split(":");
        const modelUp = (rawModel || "").toUpperCase();
        const modelKind: LandingModelKind = (["M1","M3","M4","M5","M6"].includes(modelUp) ? modelUp : "M1") as LandingModelKind;
        const themeLo = (rawTheme || "gold").toLowerCase();
        const themeKey: M1ThemeKey = (M1_THEMES.some(t => t.key === themeLo) ? themeLo : "gold") as M1ThemeKey;
    
        const pseudo  = interaction.fields.getTextInputValue("pseudo").trim();
        const affiLink = interaction.fields.getTextInputValue("affiLink").trim();
        const depStr  = interaction.fields.getTextInputValue("depositAmount").trim();
        const bonStr  = interaction.fields.getTextInputValue("bonusAmount").trim();
        const profile = interaction.fields.getTextInputValue("profileImageUrl")?.trim() || "";
    
        if (!pseudo) throw new Error("Pseudo requis");
        if (!/^https?:\/\//i.test(affiLink)) throw new Error("Lien d'affiliation invalide (doit commencer par http(s)://)");
    
        const depositAmount = depStr === "" ? null : Number(depStr);
        const bonusAmount   = bonStr === "" ? null : Number(bonStr);
        if (depositAmount !== null && !isFinite(depositAmount)) throw new Error("Dépôt invalide");
        if (bonusAmount   !== null && !isFinite(bonusAmount))   throw new Error("Bonus invalide");
    
        // Inputs partagés (le wizard V3 côté front les relit via __v3Inputs).
        const inputs: any = {
          modelKind,
          m1UseTheme: true,
          m1Theme: themeKey,
          pseudo,
          affiLink,
          depositAmount,
          bonusAmount,
          profileImageUrl: profile,
          card1Image: { kind: "penalty", url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png" },
          card2Image: { kind: "mines",   url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png" },
          cardAspect: "1/1",
          cardObjectFit: "cover",
          pseudoStyle:      { font: "Inter", color: "#FFD700", size: "m",  weight: "black", glow: true },
          depositLineStyle: { font: "Inter", color: "#ffffff", size: "l",  weight: "black" },
          bonusLineStyle:   { font: "Inter", color: "#FFD700", size: "l",  weight: "black", glow: true },
        };
    
        // Build V2Page selon le modèle. M1 = builder M4V1-dupliqué ; M3-M6 = bloc
        // unique v3GameModel (mini-jeu plein écran, idem buildV3GameModelPage côté front).
        const v2Page = modelKind === "M1"
          ? buildV3PageFromQuickInputs(inputs as V3QuickInputs)
          : buildV3GameModelPageMin(modelKind, themeKey, { pseudo, affiLink, depositAmount, bonusAmount, profileImageUrl: profile });
    
        // Slug : si le builder a déduit un slug depuis affiLink, on l'utilise ;
        // sinon fallback sur slugify(pseudo). Puis garantit unicité.
        const builderSlug = String((v2Page as any).slug || "").trim();
        const baseSlug = builderSlug || pseudo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const slug = await resolveUniqueSlug(baseSlug || "landing");
        (v2Page as any).slug = slug;
    
        // Marqueurs V3 dans le config pour qu'à la ré-ouverture, le wizard
        // puisse pré-remplir ses inputs (cohérent avec le save côté EditorV3Page).
        const config: any = { ...v2Page, __v3: true, __v3Inputs: inputs };
    
        const ownerUserId = await resolveOwnerUserIdForDiscord(interaction.user.id);
    
        const r = await pool.query(
          `
          INSERT INTO affi_landing_pages
            (slug, model, variant, brand_name, title, config, editor_version, owner_user_id, created_at, updated_at)
          VALUES ($1, 4, NULL, $2, $3, $4::jsonb, 2, $5, NOW(), NOW())
          RETURNING id, slug
          `,
          [slug, pseudo, pseudo, JSON.stringify(config), ownerUserId]
        );
        const id = Number(r.rows[0].id);
        const finalSlug = String(r.rows[0].slug);
    
        const publicUrl = `${PUBLIC_WEB_BASE}/r/${finalSlug}`;
        const editorUrl = `${PUBLIC_WEB_BASE}/editorFSNV3`;
    
        const embed = new EmbedBuilder()
          .setColor(0x9D4BFF)
          .setTitle(`🌐 Landing V3 créée — ${modelKind} (${LANDING_MODEL_LABEL[modelKind]})`)
          .setURL(publicUrl)
          .setDescription(
            `Page **${pseudo}** créée et publiée (#${id}, slug \`${finalSlug}\`, modèle ${modelKind}, thème ${getM1Theme(themeKey).label}).\n\n` +
            `🎯 La page est **directement live** — pseudo, lien d'affi, dépôt et bonus sont déjà appliqués. ` +
            `Ouvre l'éditeur V3 pour ajuster les images, polices, couleurs ou ajouter une photo de profil si besoin.`
          )
          .addFields(
            { name: "🔗 URL publique", value: publicUrl, inline: false },
            { name: "✏️  Éditeur V3",  value: editorUrl, inline: false },
          );
    
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("🌐 Voir la page").setURL(publicUrl),
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("✏️  Modifier (V3)").setURL(editorUrl),
        );
    
        await interaction.editReply({ embeds: [embed], components: [row] });
        */
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// Construit un V2Page minimal pour M3-M6 : un seul bloc full-page
// `v3GameModel` (rendu côté front par le composant correspondant) + le bloc
// preset `m4V1LowerSections` en footer (reviews/FAQ/footer/sticky CTA).
// Mirroir de buildV3GameModelPage() côté web/src/lib/editor_v3_quick_builder.ts.
function buildV3GameModelPageMin(kind, themeKey, inputs) {
    const pseudo = inputs.pseudo.trim();
    const theme = getM1Theme(themeKey);
    const themeColors = themeToColors(theme);
    let affiCode = "";
    try {
        const u = new URL(inputs.affiLink);
        const last = u.pathname.split("/").filter(Boolean).pop() || "";
        affiCode = last.replace(/[^A-Za-z0-9_-]/g, "");
    }
    catch { /* noop */ }
    return {
        modelKind: "M4V2",
        affiCode,
        affiLink: inputs.affiLink,
        casinoName: pseudo || kind,
        slug: affiCode ? `${affiCode}V3` : "",
        pageTitle: pseudo || kind,
        compactSpacing: true,
        zones: {
            aboveCards: [],
            cards: [
                {
                    id: makeV2BlockId("container"),
                    type: "v3GameModel",
                    gameKind: kind,
                    pseudo,
                    profileImageUrl: inputs.profileImageUrl || "",
                    depositAmount: inputs.depositAmount,
                    bonusAmount: inputs.bonusAmount,
                    affiLink: inputs.affiLink,
                    theme: themeColors,
                },
            ],
            belowCards: [],
            reviews: [],
            faq: [],
            footer: [
                {
                    id: makeV2BlockId("m4V1LowerSections"),
                    type: "m4V1LowerSections",
                    affiLink: inputs.affiLink,
                    brandName: pseudo,
                    theme: themeColors,
                },
            ],
        },
        globals: {
            bgPage: theme.bgPage,
            bgCard: theme.bgCard,
            brandGold: theme.accent,
            borderColor: theme.borderColor,
        },
    };
}
function buildLandingM10Page(inputs) {
    const pseudo = inputs.pseudo.trim();
    const theme = getM1Theme("cyclope");
    const themeColors = themeToColors(theme);
    let affiCode = "";
    try {
        const u = new URL(inputs.affiLink);
        const last = u.pathname.split("/").filter(Boolean).pop() || "";
        affiCode = last.replace(/[^A-Za-z0-9_-]/g, "");
    }
    catch { /* noop */ }
    return {
        modelKind: "M4V2",
        affiCode,
        affiLink: inputs.affiLink,
        casinoName: pseudo || "M10",
        slug: affiCode ? `${affiCode}V3` : "",
        pageTitle: pseudo || "M10",
        compactSpacing: true,
        zones: {
            aboveCards: [],
            cards: [
                {
                    id: makeV2BlockId("v3GameModel"),
                    type: "v3GameModel",
                    gameKind: "M10",
                    pseudo,
                    profileImageUrl: "",
                    depositAmount: inputs.depositAmount,
                    bonusAmount: inputs.bonusAmount,
                    affiLink: inputs.affiLink,
                    theme: themeColors,
                    pseudoSub: "",
                    followersCount: "",
                    socialHandle: "",
                    gameImageUrl: "/affi_templates/cyclope/chicken.jpg",
                    gameLabel: "POULET",
                    gameBonusPct: "550%",
                    pseudoVariant: "fade",
                    pseudoAnimation: "none",
                    showVip: inputs.showVip,
                },
            ],
            belowCards: [],
            reviews: [],
            faq: [],
            footer: [],
        },
        globals: {
            bgPage: theme.bgPage,
            bgCard: theme.bgCard,
            brandGold: theme.accent,
            borderColor: theme.borderColor,
        },
    };
}
async function resolveUniqueSlug(base) {
    let candidate = base;
    let n = 2;
    while (true) {
        const r = await pool.query(`SELECT 1 FROM affi_landing_pages WHERE LOWER(slug) = LOWER($1) LIMIT 1`, [candidate]);
        if (r.rowCount === 0)
            return candidate;
        candidate = `${base}-${n++}`;
    }
}
async function resolveOwnerUserIdForDiscord(discordUserId) {
    const r = await pool.query(`SELECT user_id FROM discord_links WHERE discord_user_id = $1 LIMIT 1`, [discordUserId]);
    return Number(r.rows[0]?.user_id || 0);
}
async function handleLandingList(interaction) {
    if (!await checkAccess(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const ownerUserId = await resolveOwnerUserIdForDiscord(interaction.user.id);
        const r = await pool.query(`
      SELECT id, slug, brand_name AS brand, title, model, editor_version, publish_domain, created_at
      FROM affi_landing_pages
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT 25
      `, [ownerUserId]);
        if (r.rowCount === 0) {
            await interaction.editReply({ content: "_Aucune landing trouvée._" });
            return;
        }
        const lines = r.rows.map((row) => `**${row.brand}** · model ${row.model} V${row.editor_version}\n` +
            `${landingPublicUrl(String(row.slug), row.publish_domain === "landaurax" ? "landaurax" : "lunalive")}`);
        const totalCount = r.rowCount ?? lines.length;
        const embed = new EmbedBuilder()
            .setColor(0x9D4BFF)
            .setTitle(`🌐 Mes landings — ${totalCount} pages`)
            .setDescription(lines.slice(0, 15).join("\n\n"))
            .setFooter({ text: totalCount > 15 ? `+ ${totalCount - 15} de plus — voir le FSB Board` : "LunaLive" });
        await interaction.editReply({ embeds: [embed] });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /dette
// ─────────────────────────────────────────────────────────────────────────────
async function handleDette(interaction) {
    if (!await checkAccess(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const todayParis = new Intl.DateTimeFormat("fr-CA", {
            timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const fees = await loadUnpaidOccurrences(todayParis, 365, 15);
        if (fees.length === 0) {
            await interaction.editReply({ content: "✅ Aucun frais impayé. Profite." });
            return;
        }
        const total = fees.reduce((s, f) => s + f.amount, 0);
        const overdue = fees.filter(f => f.days_until < 0);
        const overdueSum = overdue.reduce((s, f) => s + f.amount, 0);
        const next = fees.find(f => f.days_until >= 0);
        const nextStr = next
            ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long" }).format(new Date(next.due_date + "T12:00:00Z"))
            : "—";
        await interaction.editReply({
            content: `💰 **${fees.length}** impayé${fees.length > 1 ? "s" : ""} • Total : **${eur(total)}**` +
                (overdue.length > 0 ? ` • 🚨 **${overdue.length} en retard** : ${eur(overdueSum)}` : "") +
                ` • Prochaine échéance : ${nextStr}`,
        });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /tiktok influenceur-add <lien>
// ─────────────────────────────────────────────────────────────────────────────
function extractTikTokHandle(input) {
    const s = input.trim();
    // @handle direct
    const at = s.match(/^@([a-zA-Z0-9._]{2,})$/);
    if (at)
        return at[1].toLowerCase();
    // URL tiktok.com/@xxx
    const url = s.match(/tiktok\.com\/@([a-zA-Z0-9._]{2,})/i);
    if (url)
        return url[1].toLowerCase();
    // handle nu (sans @)
    const nu = s.match(/^([a-zA-Z0-9._]{2,})$/);
    if (nu)
        return nu[1].toLowerCase();
    return null;
}
async function handleTiktokInfluenceurAdd(interaction) {
    if (!await checkAccess(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const lien = interaction.options.getString("lien", true);
        const handle = extractTikTokHandle(lien);
        if (!handle)
            throw new Error("Lien/handle TikTok invalide. Formats acceptés : `@handle`, `handle`, `https://tiktok.com/@handle`");
        // Insère comme seed (table tiktok_seed_accounts probablement) ou
        // tiktok_influencers selon ce qui existe. On essaye d'abord seed.
        const exists = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, ["tiktok_seed_accounts"]);
        if (exists.rowCount === 0)
            throw new Error("Table tiktok_seed_accounts introuvable");
        const dup = await pool.query(`SELECT 1 FROM tiktok_seed_accounts WHERE LOWER(handle) = LOWER($1) LIMIT 1`, [handle]);
        if (dup.rowCount && dup.rowCount > 0) {
            await interaction.editReply({ content: `ℹ️ @${handle} est déjà dans le réseau.` });
            return;
        }
        await pool.query(`INSERT INTO tiktok_seed_accounts (handle, created_at) VALUES ($1, NOW()) ON CONFLICT DO NOTHING`, [handle]);
        await interaction.editReply({
            content: `✅ **@${handle}** ajouté au réseau TikTok.\n` +
                `Le scan réseau permettra ensuite de découvrir ses interactions et candidats associés. ` +
                `URL : https://www.tiktok.com/@${handle}`,
        });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /purge X — supprime les X derniers messages du salon
// ─────────────────────────────────────────────────────────────────────────────
async function handlePurge(interaction) {
    if (!await checkAllowedUser(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const x = interaction.options.getInteger("x", true);
        const channel = interaction.channel;
        if (!channel || !("bulkDelete" in channel)) {
            await interaction.editReply({ content: "❌ Salon non textuel ou bulkDelete indisponible." });
            return;
        }
        // Discord bulkDelete : max 100 messages, < 14 jours
        const deleted = await channel.bulkDelete(Math.min(Math.max(1, x), 100), true);
        const count = deleted?.size ?? 0;
        await interaction.editReply({
            content: `🗑️ ${count} message${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}.` +
                (count < x ? ` (Discord ne peut pas supprimer les messages > 14 jours)` : ""),
        });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// /todo <message> [fichier]
// ─────────────────────────────────────────────────────────────────────────────
async function handleTodo(interaction) {
    if (!await checkAccess(interaction))
        return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const message = interaction.options.getString("message", true).trim();
        const file = interaction.options.getAttachment("fichier");
        if (!message)
            throw new Error("Message requis");
        const r = await pool.query(`INSERT INTO fsb_todos (message, attachment_url, attachment_name, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`, [
            message,
            file?.url || null,
            file?.name || null,
            interaction.user.id,
            interaction.user.username || interaction.user.globalName || null,
        ]);
        const id = Number(r.rows[0].id);
        const fileNote = file ? ` 📎 ${file.name}` : "";
        await interaction.editReply({
            content: `✅ Todo **#${id}** ajouté : _${message.slice(0, 200)}_${fileNote}\n` +
                `Visible sur le [FSB Board](${PUBLIC_WEB_BASE}/FSB_Board).`,
        });
    }
    catch (e) {
        await interaction.editReply({ content: `❌ ${e?.message || e}` });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Mark-paid : bouton sur le board frais → select menu → marque payés
// ─────────────────────────────────────────────────────────────────────────────
export const FEES_BOARD_MARK_PAID_OPEN_CID = "agency_fees_board:mark_paid_open";
export const FEES_BOARD_MARK_PAID_SELECT_CID = "agency_fees_board:mark_paid_select";
async function handleMarkPaidOpen(interaction) {
    // Open : autorisé pour les whitelisted seulement, mais peu importe le salon
    // (ce bouton est dans #frais qui est dans la catégorie privée).
    if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
        await interaction.reply({ ephemeral: true, content: "🚫 Réservé à l'équipe agence." });
        return;
    }
    try {
        const todayParis = new Intl.DateTimeFormat("fr-CA", {
            timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const fees = await loadUnpaidOccurrences(todayParis, 365, 15);
        if (fees.length === 0) {
            await interaction.reply({ ephemeral: true, content: "_Aucun frais impayé._" });
            return;
        }
        const items = fees.slice(0, 25); // Discord StringSelect max 25 options
        const { StringSelectMenuBuilder } = await import("discord.js");
        const select = new StringSelectMenuBuilder()
            .setCustomId(FEES_BOARD_MARK_PAID_SELECT_CID)
            .setPlaceholder("Sélectionner un ou plusieurs frais à marquer payés")
            .setMinValues(1)
            .setMaxValues(items.length)
            .addOptions(items.map((f) => {
            const lateMark = f.days_until < 0 ? "⚠️ " : "";
            const recMark = f.is_recurring ? " (mensuel)" : "";
            return {
                label: `${lateMark}${eur(f.amount)} — ${f.description}${recMark}`.slice(0, 100),
                description: `Échéance ${f.due_date}`.slice(0, 100),
                // Format value : "<expense_id>:<occurrence_date|>"  — vide si non-récurrent
                value: `${f.expense_id}:${f.occurrence_date ?? ""}`.slice(0, 100),
            };
        }));
        await interaction.reply({
            ephemeral: true,
            content: "Choisis les frais à marquer comme **payés** :",
            components: [new ActionRowBuilder().addComponents(select)],
        });
    }
    catch (e) {
        await interaction.reply({ ephemeral: true, content: `❌ ${e?.message || e}` });
    }
}
async function handleMarkPaidSelect(interaction) {
    if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
        await interaction.reply({ ephemeral: true, content: "🚫 Réservé à l'équipe agence." });
        return;
    }
    await interaction.deferUpdate();
    try {
        const values = interaction.values;
        if (!values?.length)
            return;
        // Charge les détails (montants) pour le résumé
        const todayParis = new Intl.DateTimeFormat("fr-CA", {
            timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const allUnpaid = await loadUnpaidOccurrences(todayParis, 365, 15);
        const byKey = new Map(allUnpaid.map(f => [`${f.expense_id}:${f.occurrence_date ?? ""}`, f]));
        let count = 0;
        let sum = 0;
        for (const v of values) {
            const idx = v.indexOf(":");
            if (idx < 0)
                continue;
            const expenseId = Number(v.slice(0, idx));
            const occ = v.slice(idx + 1) || null;
            if (!Number.isFinite(expenseId))
                continue;
            await markExpensePaid(expenseId, occ);
            const f = byKey.get(v);
            if (f) {
                count++;
                sum += f.amount;
            }
        }
        await interaction.editReply({
            content: `✅ ${count} frais marqué${count > 1 ? "s" : ""} payé${count > 1 ? "s" : ""} • ${eur(sum)} • Tableau actualisé.`,
            components: [],
        });
        void refreshAgencyFeesBoard();
    }
    catch (e) {
        try {
            await interaction.editReply({ content: `❌ ${e?.message || e}`, components: [] });
        }
        catch { }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Routeur principal — appelé depuis discord/bot.ts
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns true if the interaction was handled by an admin command/handler.
 * Le caller dans bot.ts doit `return` aussitôt si true pour ne pas matcher
 * d'autres handlers.
 */
export async function routeAdminInteraction(interaction) {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            const sub = interaction.options.getSubcommand(false);
            if (commandName === "frais" && sub === "ajouter") {
                await handleFraisAjouter(interaction);
                return true;
            }
            if (commandName === "agence" && sub === "recap") {
                await handleAgenceRecap(interaction);
                return true;
            }
            if (commandName === "landing" && sub === "creer") {
                await handleLandingCreer(interaction);
                return true;
            }
            if (commandName === "landing" && sub === "list") {
                await handleLandingList(interaction);
                return true;
            }
            if (commandName === "dette") {
                await handleDette(interaction);
                return true;
            }
            if (commandName === "tiktok" && sub === "influenceur-add") {
                await handleTiktokInfluenceurAdd(interaction);
                return true;
            }
            if (commandName === "purge") {
                await handlePurge(interaction);
                return true;
            }
            if (commandName === "todo") {
                await handleTodo(interaction);
                return true;
            }
        }
        if (interaction.isModalSubmit()) {
            if (interaction.customId === MODAL_FRAIS_AJOUTER) {
                await handleFraisAjouterSubmit(interaction);
                return true;
            }
            if (interaction.customId === MODAL_LANDING_CREER || interaction.customId.startsWith(MODAL_LANDING_CREER + ":")) {
                await handleLandingCreerSubmit(interaction);
                return true;
            }
        }
        if (interaction.isButton()) {
            if (interaction.customId === FEES_BOARD_MARK_PAID_OPEN_CID) {
                await handleMarkPaidOpen(interaction);
                return true;
            }
        }
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === FEES_BOARD_MARK_PAID_SELECT_CID) {
                await handleMarkPaidSelect(interaction);
                return true;
            }
        }
    }
    catch (e) {
        console.error(`${LOG} unhandled error: ${e?.message || e}`);
        try {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ ephemeral: true, content: `❌ ${e?.message || e}` });
            }
        }
        catch { }
    }
    return false;
}
