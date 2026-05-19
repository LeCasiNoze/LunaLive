// Sous-commandes /config + /ping
import { EmbedBuilder } from "discord.js";
import * as cfg from "./config.js";
import { kvGet, kvGetInt, kvSet } from "./db.js";
import { loadEnv } from "./env.js";
export async function handleConfig(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "show") {
        const h = await kvGetInt("refill_cutoff_hour", cfg.DEFAULTS.REFILL_CUTOFF_HOUR);
        const m = await kvGetInt("refill_cutoff_minute", cfg.DEFAULTS.REFILL_CUTOFF_MINUTE);
        const manager = (await kvGet("manager_mention")) ?? "*(non défini)*";
        const env = loadEnv();
        const embed = new EmbedBuilder()
            .setTitle(`${cfg.EMOJI.info}  Configuration Aurix`)
            .setColor(cfg.COLOR.PRIMARY)
            .addFields({
            name: "Cutoff refill",
            value: `\`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}\` ${env.TIMEZONE}`,
        }, { name: "Manager à ping", value: manager }, { name: "Guild ID", value: String(interaction.guild?.id ?? "?") });
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
export async function handlePing(interaction) {
    await interaction.reply({
        content: `🏓 Pong — \`${interaction.client.ws.ping}ms\``,
        ephemeral: true,
    });
}
