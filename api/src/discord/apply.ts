// api/src/discord/apply.ts
import { pool } from "../db.js";
import { ensureAssignedDliveAccount, releaseAccountForStreamerId } from "../provider_accounts.js";
import { slugify } from "../slug.js";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";

import {
  APPLY_CHANNEL_ID,
  CID_APPLY_DECIDE_PREFIX,
  CID_APPLY_MODAL,
  CID_APPLY_OPEN,
  STAFF_DECISIONS_CHANNEL_ID,
  STAFF_DECISIONS_PING_ROLE_ID,
  STAFF_ROLE_IDS,
  STAFF_TICKETS_CATEGORY_ID,
} from "./constants.js";

import { normalizeAccept, safeDm, type BotCtx } from "./utils.js";
import { hasAnyRole } from "./sync.js";

function rulesShortText() {
  return [
    "📜 RÈGLEMENT (résumé) :",
    "• Interdit : triche, détournement d’affiliation, botting/stats boosting.",
    "• Interdit : dépôts offerts -> pousse aux multi-comptes / toxicité.",
    "  ✅ Toléré : 1er dépôt remboursé jusqu’à 50% (max 50€).",
    "• Places limitées : être actif, ne pas gaspiller sa place.",
    "• Non-respect => révocation possible à tout moment.",
  ].join("\n");
}

export function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId(CID_APPLY_MODAL).setTitle("Demande Streamer LunaLive");

  const discordInput = new TextInputBuilder()
    .setCustomId("f_discord")
    .setLabel("Ton contact (Discord/Telegram) — OBLIGATOIRE")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: LeCasiNoze / LeCasiNoze#1234 / @telegram")
    .setRequired(true)
    .setMaxLength(120);

  const dliveInput = new TextInputBuilder()
    .setCustomId("f_dlive")
    .setLabel("Lien DLive (si tu en as déjà un)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://dlive.tv/LeCasinoze (ou vide si pas encore)")
    .setRequired(false)
    .setMaxLength(300);

  const linksInput = new TextInputBuilder()
    .setCustomId("f_links")
    .setLabel("Autres liens utiles (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Twitch / YouTube / X / Insta / Kick / autres… (optionnel)")
    .setRequired(false)
    .setMaxLength(1200);

  const expInput = new TextInputBuilder()
    .setCustomId("f_exp")
    .setLabel("Ton expérience + ce que tu veux faire :")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Décris ton contenu, fréquence, objectifs…")
    .setRequired(false)
    .setMaxLength(1200);

  const rulesInput = new TextInputBuilder()
    .setCustomId("f_rules")
    .setLabel("Règlement — tape exactement : J'ACCEPTE")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(rulesShortText() + "\n\n=> Tape: J'ACCEPTE")
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(discordInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(dliveInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(linksInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(expInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rulesInput)
  );

  return modal;
}

function ticketName(username: string, discordId: string) {
  const base = slugify(username || "user").slice(0, 16) || "user";
  const suf = discordId.slice(-4);
  return `ticket-streamer-${base}-${suf}`.slice(0, 95);
}

export async function ensureApplyMessage(guild: Guild, ctx: BotCtx) {
  try {
    const ch = await guild.channels.fetch(APPLY_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      ctx.log(`[discord] apply channel not found / not text: ${APPLY_CHANNEL_ID}`);
      return;
    }
    const channel = ch as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle("🎥 Faire une demande Streamer")
      .setDescription(
        [
          "Clique sur le bouton ci-dessous pour ouvrir le formulaire.",
          "",
          "⚠️ Conditions :",
          "• Être **vérifié** (faire `/link` d’abord).",
          "• Accepter le **règlement** (obligatoire).",
        ].join("\n")
      )
      .setFooter({ text: "LunaLive — demandes streamers" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CID_APPLY_OPEN).setLabel("Faire une demande streamer").setStyle(ButtonStyle.Primary)
    );

    // edit existing bot message if possible (last 30)
    const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const existing = msgs?.find((m) => m.author?.id === guild.client.user?.id && (m.components?.length ?? 0) > 0);

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
      ctx.log("[discord] apply message updated");
    } else {
      await channel.send({ embeds: [embed], components: [row] });
      ctx.log("[discord] apply message sent");
    }
  } catch (e: any) {
    ctx.log(`[discord] ensureApplyMessage failed: ${e?.message || e}`);
  }
}

export async function createTicketChannel(guild: Guild, member: GuildMember, ctx: BotCtx) {
  const name = ticketName(member.user.username, member.id);

  const overwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: guild.client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const rid of STAFF_ROLE_IDS) {
    overwrites.push({
      id: rid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: STAFF_TICKETS_CATEGORY_ID,
    topic: `Streamer apply ticket | user=${member.user.tag} (${member.id})`,
    permissionOverwrites: overwrites,
    reason: "Streamer apply ticket",
  });

  ctx.log(`[discord] ticket created ${ch.id} for user=${member.id}`);
  return ch;
}

export async function dbUpsertStreamerRequest(discordUserId: string, payload: any) {
  const link = await pool.query(`SELECT user_id FROM discord_links WHERE discord_user_id=$1 LIMIT 1`, [discordUserId]);
  const userId = link.rows?.[0]?.user_id ? Number(link.rows[0].user_id) : null;
  if (!userId) return { ok: false as const, error: "not_linked" as const };

  const discord = String(payload.discord || "").slice(0, 200);
  const channelUrl = String(payload.dliveUrl || "").slice(0, 300);

  const up = await pool.query(
    `
    INSERT INTO streamer_requests (user_id, status, discord, channel_url, rules_accepted, payload, updated_at)
    VALUES ($1, 'pending', $2, $3, TRUE, $4::jsonb, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET status='pending', discord=EXCLUDED.discord, channel_url=EXCLUDED.channel_url, rules_accepted=TRUE, payload=EXCLUDED.payload, updated_at=NOW()
    RETURNING id, user_id, status, created_at, updated_at
    `,
    [userId, discord, channelUrl, JSON.stringify(payload)]
  );

  return { ok: true as const, request: up.rows[0], userId };
}

export async function sendDecisionLog(guild: Guild, content: string, ctx: BotCtx) {
  try {
    const ch = await guild.channels.fetch(STAFF_DECISIONS_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      ctx.log(`[discord] decisions channel not found / not text: ${STAFF_DECISIONS_CHANNEL_ID}`);
      return;
    }
    await (ch as TextChannel).send({
      content: `<@&${STAFF_DECISIONS_PING_ROLE_ID}> ${content}`,
      allowedMentions: { roles: [STAFF_DECISIONS_PING_ROLE_ID] },
    });
  } catch (e: any) {
    ctx.log(`[discord] sendDecisionLog failed: ${e?.message || e}`);
  }
}

export async function approveRequest(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE streamer_requests SET status='approved', updated_at=NOW() WHERE id=$1 RETURNING user_id`,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" as const };
    }

    const userId = Number(upd.rows[0].user_id);
    await client.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);

    const u = await client.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const username = String(u.rows[0]?.username || `user-${userId}`);
    let slug = slugify(username);

    const exists = await client.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
    if (exists.rows[0]) slug = `${slug}-${userId}`;

    await client.query(
      `
      INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
      VALUES ($1,$2,$3,'',0,false)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [slug, username, userId]
    );

    await client.query(`UPDATE streamers SET suspended_until=NULL, updated_at=NOW() WHERE user_id=$1`, [userId]);

    const s = await client.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = Number(s.rows[0]?.id || 0);
    if (!streamerId) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "streamer_missing" as const };
    }

    const conn = await ensureAssignedDliveAccount(client, streamerId);
    if (!conn) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "no_free_provider_account" as const };
    }

    await client.query("COMMIT");
    return { ok: true as const, userId, username, streamer: { id: streamerId, slug: String(s.rows[0]?.slug || slug) } };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectRequest(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE streamer_requests SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING user_id`,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" as const };
    }

    const userId = Number(upd.rows[0].user_id);
    await client.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);

    const s = await client.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
    if (streamerId) {
      await releaseAccountForStreamerId(client, streamerId);
      await client.query(
        `UPDATE streamers SET suspended_until='infinity'::timestamptz, featured=false, updated_at=NOW() WHERE id=$1`,
        [streamerId]
      );
    }

    await client.query("COMMIT");
    return { ok: true as const, userId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export function validateRulesInput(rulesField: string) {
  return normalizeAccept(rulesField) === normalizeAccept("J'ACCEPTE");
}

export function buildStaffActionsRow(requestId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CID_APPLY_DECIDE_PREFIX}approve:${requestId}`)
      .setLabel("✅ Approuver")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CID_APPLY_DECIDE_PREFIX}reject:${requestId}`)
      .setLabel("❌ Refuser")
      .setStyle(ButtonStyle.Danger)
  );
}

export function buildDisabledActionsRowApproved() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("noop1").setLabel("✅ Approuvé").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("noop2").setLabel("❌ Refuser").setStyle(ButtonStyle.Danger).setDisabled(true)
  );
}

export function buildDisabledActionsRowRejected() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("noop1").setLabel("✅ Approuver").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("noop2").setLabel("❌ Refusé").setStyle(ButtonStyle.Danger).setDisabled(true)
  );
}

export async function handleStaffDecisionButton(opts: {
  client: Client | null;
  guild: Guild;
  staffMember: GuildMember;
  requestId: number;
  action: "approve" | "reject";
  ctx: BotCtx;
  interactionChannelId: string;
  interactionMessageEdit: (p: { content: string; components: any[] }) => Promise<any>;
}) {
  const { client, guild, staffMember, requestId, action, ctx, interactionChannelId, interactionMessageEdit } = opts;

  const r = await pool.query(`SELECT payload FROM streamer_requests WHERE id=$1 LIMIT 1`, [requestId]);
  if (!r.rows[0]) return { ok: false as const, error: "not_found" as const };
  const payload = r.rows[0]?.payload || {};
  const applicantDiscordUserId = String(payload?.discordUserId || "").trim();

  if (action === "approve") {
    const res = await approveRequest(requestId);
    if (!res.ok) return { ok: false as const, error: res.error };

    await sendDecisionLog(
      guild,
      `✅ **APPROUVÉ** — request #${requestId} — par <@${staffMember.id}>` +
        (applicantDiscordUserId ? ` — user <@${applicantDiscordUserId}>` : ""),
      ctx
    );

    await interactionMessageEdit({
      content: `✅ Décision traitée. (Log envoyé dans <#${STAFF_DECISIONS_CHANNEL_ID}>)`,
      components: [buildDisabledActionsRowApproved()],
    });

    if (applicantDiscordUserId) {
      await safeDm(
        client,
        applicantDiscordUserId,
        `✅ Ta demande Streamer LunaLive a été **approuvée**.\nTu peux suivre le ticket si besoin : <#${interactionChannelId}>`,
        ctx
      );
    }

    return { ok: true as const, applicantDiscordUserId, kind: "approved" as const };
  }

  const res = await rejectRequest(requestId);
  if (!res.ok) return { ok: false as const, error: res.error };

  await sendDecisionLog(
    guild,
    `❌ **REFUSÉ** — request #${requestId} — par <@${staffMember.id}>` +
      (applicantDiscordUserId ? ` — user <@${applicantDiscordUserId}>` : ""),
    ctx
  );

  await interactionMessageEdit({
    content: `✅ Décision traitée. (Log envoyé dans <#${STAFF_DECISIONS_CHANNEL_ID}>)`,
    components: [buildDisabledActionsRowRejected()],
  });

  if (applicantDiscordUserId) {
    await safeDm(
      client,
      applicantDiscordUserId,
      `❌ Ta demande Streamer LunaLive a été **refusée**.\nTu peux répondre dans le ticket si tu veux des précisions : <#${interactionChannelId}>`,
      ctx
    );
  }

  return { ok: true as const, applicantDiscordUserId, kind: "rejected" as const };
}

export function staffCanDecide(member: GuildMember) {
  return hasAnyRole(member, STAFF_ROLE_IDS);
}
