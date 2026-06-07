// Sous-commandes /config + /ping + /refill-config
import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import * as cfg from "./config.js";
import { kvGet, kvGetInt, kvSet, one, query } from "./db.js";
import { loadEnv } from "./env.js";

export async function handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    const h = await kvGetInt("refill_cutoff_hour", cfg.DEFAULTS.REFILL_CUTOFF_HOUR);
    const m = await kvGetInt("refill_cutoff_minute", cfg.DEFAULTS.REFILL_CUTOFF_MINUTE);
    const manager = (await kvGet("manager_mention")) ?? "*(non défini)*";
    const env = loadEnv();
    const embed = new EmbedBuilder()
      .setTitle(`${cfg.EMOJI.info}  Configuration Aurix`)
      .setColor(cfg.COLOR.PRIMARY)
      .addFields(
        {
          name: "Cutoff refill",
          value: `\`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}\` ${env.TIMEZONE}`,
        },
        { name: "Manager à ping", value: manager },
        { name: "Guild ID", value: String(interaction.guild?.id ?? "?") }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (sub === "cutoff") {
    const h = interaction.options.getInteger("hour", true);
    const m = interaction.options.getInteger("minute") ?? 0;
    await kvSet("refill_cutoff_hour", h);
    await kvSet("refill_cutoff_minute", m);
    await interaction.reply({
      content: `${cfg.EMOJI.check} Cutoff configuré sur \`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}\`.\n*Les batches existants ne sont pas modifiés.*`,
      ephemeral: true,
    });
    return;
  }
  if (sub === "manager") {
    const v = interaction.options.getString("mention_or_text", true);
    await kvSet("manager_mention", v);
    await interaction.reply({
      content: `${cfg.EMOJI.check} Manager défini : ${v}`,
      ephemeral: true,
    });
    return;
  }
}

export async function handlePing(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: `🏓 Pong — \`${interaction.client.ws.ping}ms\``,
    ephemeral: true,
  });
}

// /aurix-resend-dm — renvoie le DM Celsius adapté (confirmation/vérifié/refusé) au viewer.
export async function handleResendDmCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const sub = await one<{
    id: number;
    celsius_pseudo: string;
    celsius_email: string;
    monthly_deposit: string;
    monthly_deposit_amount: string | null;
    status: "pending" | "verified" | "rejected";
    reject_reason: string | null;
    guild_name: string | null;
    viewer_username: string;
  }>(
    `SELECT id, celsius_pseudo, celsius_email, monthly_deposit, monthly_deposit_amount,
            status, reject_reason, guild_name, viewer_username
       FROM aurix_celsius_submissions
      WHERE viewer_user_id=$1
      ORDER BY created_at DESC LIMIT 1`,
    [target.id]
  );
  if (!sub) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Aucune inscription \`/celsius\` trouvée pour <@${target.id}>.`,
      ephemeral: true,
      allowedMentions: { users: [] },
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const dm = await import("./celsius_dm.js");
    const guildName = sub.guild_name ?? "ton serveur";
    if (sub.status === "verified") {
      const amt = sub.monthly_deposit_amount != null ? Number(sub.monthly_deposit_amount) : null;
      await dm.sendCelsiusValidatedDM(interaction.client, {
        viewerUserId: target.id,
        pseudo: sub.celsius_pseudo,
        monthlyDeposit: sub.monthly_deposit,
        monthlyDepositAmount: Number.isFinite(amt as number) ? (amt as number) : null,
        guildName,
      });
    } else if (sub.status === "rejected") {
      await dm.sendCelsiusRejectedDM(interaction.client, {
        viewerUserId: target.id,
        pseudo: sub.celsius_pseudo,
        rejectReason: sub.reject_reason,
      });
    } else {
      await dm.sendCelsiusConfirmationDM(interaction.client, {
        viewerUserId: target.id,
        viewerTag: sub.viewer_username,
        pseudo: sub.celsius_pseudo,
        email: sub.celsius_email,
        monthlyDeposit: sub.monthly_deposit,
        guildName,
      });
    }
    await interaction.editReply({
      content: `${cfg.EMOJI.check} DM (statut **${sub.status}**) renvoyé à <@${target.id}>.`,
      allowedMentions: { users: [] },
    });
  } catch (e) {
    await interaction.editReply({
      content: `${cfg.EMOJI.cross} Échec de l'envoi : ${String(e).slice(0, 200)}`,
    });
  }
}

// /refill-config — configure amount + wager pour un Discord user OU un auto-refill par email.
export async function handleRefillConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user");
  const autoEmail = interaction.options.getString("auto_email")?.trim();
  const amount = interaction.options.getString("amount")?.trim() || null;
  const wager = interaction.options.getString("wager")?.trim() || null;

  if (!targetUser && !autoEmail) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Précise soit \`user:\` (un membre Discord), soit \`auto_email:\` (email d'un auto-refill).`,
      ephemeral: true,
    });
    return;
  }
  if (targetUser && autoEmail) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Précise **soit** \`user:\` **soit** \`auto_email:\`, pas les deux.`,
      ephemeral: true,
    });
    return;
  }
  if (!amount && !wager) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Précise au moins \`amount:\` ou \`wager:\`.`,
      ephemeral: true,
    });
    return;
  }

  if (targetUser) {
    // Met a jour aurix_user_accounts (upsert si absent).
    const exists = await one<{ user_id: string }>(
      "SELECT user_id FROM aurix_user_accounts WHERE user_id=$1",
      [targetUser.id]
    );
    if (!exists) {
      await query(
        `INSERT INTO aurix_user_accounts(user_id, refill_amount, wager)
         VALUES($1, $2, $3)
         ON CONFLICT(user_id) DO UPDATE
           SET refill_amount = COALESCE(EXCLUDED.refill_amount, aurix_user_accounts.refill_amount),
               wager         = COALESCE(EXCLUDED.wager,         aurix_user_accounts.wager),
               updated_at    = NOW()`,
        [targetUser.id, amount, wager]
      );
    } else {
      await query(
        `UPDATE aurix_user_accounts
            SET refill_amount = COALESCE($2, refill_amount),
                wager         = COALESCE($3, wager),
                updated_at    = NOW()
          WHERE user_id = $1`,
        [targetUser.id, amount, wager]
      );
    }
    const row = await one<{ refill_amount: string | null; wager: string | null }>(
      "SELECT refill_amount, wager FROM aurix_user_accounts WHERE user_id=$1",
      [targetUser.id]
    );
    await interaction.reply({
      content:
        `${cfg.EMOJI.check} Config refill mise à jour pour <@${targetUser.id}> :\n` +
        `• Montant : \`${row?.refill_amount || `${cfg.DEFAULTS.REFILL_FIXED_AMOUNT} (défaut)`}\`\n` +
        `• Wager : \`${row?.wager || "no wag (défaut)"}\``,
      allowedMentions: { users: [] },
      ephemeral: true,
    });
    return;
  }

  // Auto-refill par email.
  const auto = await one<{ id: string; amount: string; wager: string | null; display_name: string }>(
    "SELECT id, amount, wager, display_name FROM aurix_auto_refills WHERE lower(email)=lower($1)",
    [autoEmail]
  );
  if (!auto) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Aucun auto-refill trouvé avec l'email \`${autoEmail}\`.`,
      ephemeral: true,
    });
    return;
  }
  await query(
    `UPDATE aurix_auto_refills
        SET amount     = COALESCE($2, amount),
            wager      = COALESCE($3, wager),
            updated_at = NOW()
      WHERE id = $1`,
    [auto.id, amount, wager]
  );
  const refreshed = await one<{ amount: string; wager: string | null }>(
    "SELECT amount, wager FROM aurix_auto_refills WHERE id=$1",
    [auto.id]
  );
  await interaction.reply({
    content:
      `${cfg.EMOJI.check} Config auto-refill mise à jour pour \`${auto.display_name}\` (\`${autoEmail}\`) :\n` +
      `• Montant : \`${refreshed?.amount || auto.amount}\`\n` +
      `• Wager : \`${refreshed?.wager || "no wag"}\``,
    ephemeral: true,
  });
}
