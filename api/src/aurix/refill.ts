// Refill : /refill (montant fixe), /refill-cancel, /compte, cutoff quotidien + listener Telegram /done.
import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  type Guild,
  type Interaction,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, kvGetInt, one, query } from "./db.js";
import { loadEnv } from "./env.js";
import { logEvent } from "./tickets.js";

const log = (...a: unknown[]) => console.log("[aurix.refill]", ...a);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ───────────── Time helpers ─────────────
function tz(): string {
  return loadEnv().TIMEZONE;
}

function nowParts(zone: string): { y: number; m: number; d: number; h: number; mi: number } {
  // Convertit "maintenant" en heure locale via Intl.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour === "24" ? "00" : parts.hour),
    mi: Number(parts.minute),
  };
}

/** Date UTC correspondant à HH:MM heure locale demandée — résolu via essai/erreur (offset stable). */
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
  // Approche : on prend une date UTC candidate, on regarde quelle heure locale elle représente, et on ajuste l'écart.
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(candidate);
  const p = Object.fromEntries(local.map((x) => [x.type, x.value]));
  const ly = Number(p.year);
  const lm = Number(p.month);
  const ld = Number(p.day);
  const lh = Number(p.hour === "24" ? "00" : p.hour);
  const lmin = Number(p.minute);
  const asLocalAsUtcMs = Date.UTC(ly, lm - 1, ld, lh, lmin, 0);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = asLocalAsUtcMs - wantedMs;
  return new Date(candidate.getTime() - offsetMs);
}

async function cutoffHM(): Promise<{ h: number; m: number }> {
  const h = (await kvGetInt("refill_cutoff_hour", cfg.DEFAULTS.REFILL_CUTOFF_HOUR)) ?? cfg.DEFAULTS.REFILL_CUTOFF_HOUR;
  const m =
    (await kvGetInt("refill_cutoff_minute", cfg.DEFAULTS.REFILL_CUTOFF_MINUTE)) ?? cfg.DEFAULTS.REFILL_CUTOFF_MINUTE;
  return { h, m };
}

async function nextCutoffUtc(): Promise<Date> {
  const zone = tz();
  const np = nowParts(zone);
  const { h, m } = await cutoffHM();
  let target = localToUtc(np.y, np.m, np.d, h, m, zone);
  if (target.getTime() <= Date.now()) {
    const next = new Date(target.getTime() + 24 * 3600_000);
    target = next;
  }
  return target;
}

function humanDay(d: Date, zone: string): string {
  const today = nowParts(zone);
  const that = (() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
  })();

  const a = Date.UTC(today.y, today.m - 1, today.d);
  const b = Date.UTC(that.y, that.m - 1, that.d);
  const diff = Math.round((b - a) / (24 * 3600_000));
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === 2) return "après-demain";
  return `le ${String(that.d).padStart(2, "0")}/${String(that.m).padStart(2, "0")}`;
}

function fmtHHhMM(d: Date, zone: string): string {
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return f.format(d).replace(":", "h");
}

function fmtFull(d: Date, zone: string): string {
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return f.format(d).replace(", ", " à ").replace(":", "h");
}

function refillWindowText(cutoff: Date): string {
  const zone = tz();
  const end = new Date(cutoff.getTime() + 24 * 3600_000);
  return `entre **${fmtHHhMM(cutoff, zone)} ${humanDay(cutoff, zone)}** et **${fmtHHhMM(end, zone)} ${humanDay(end, zone)}**`;
}

// ───────────── DB types ─────────────
type Batch = {
  id: number;
  cutoff_at: Date;
  status: "open" | "locked" | "sent";
  message_id: string | null;
  channel_id: string | null;
  created_at: Date;
  sent_at: Date | null;
};
type Req = {
  id: number;
  batch_id: number;
  user_id: string;
  username: string;
  casino_username: string | null;
  email: string | null;
  amount: string | null;
  wager: string | null;
  notes: string | null;
  ticket_channel_id: string | null;
  requested_at: Date;
};
type Account = {
  user_id: string;
  telegram: string | null;
  email: string | null;
  casino_username: string | null;
  refill_amount: string | null;
  wager: string | null;
  updated_at: Date;
};

async function getOpenBatch(): Promise<Batch | null> {
  return one<Batch>("SELECT * FROM aurix_refill_batches WHERE status='open' ORDER BY id DESC LIMIT 1");
}

async function getRequests(batchId: number): Promise<Req[]> {
  return all<Req>("SELECT * FROM aurix_refill_requests WHERE batch_id=$1 ORDER BY id ASC", [batchId]);
}

async function getAccount(userId: string): Promise<Account | null> {
  return one<Account>("SELECT * FROM aurix_user_accounts WHERE user_id=$1", [userId]);
}

async function saveAccount(
  userId: string,
  partial: { telegram?: string | null; email?: string | null; casino_username?: string | null }
): Promise<Account> {
  const existing = (await getAccount(userId)) ?? {
    telegram: null,
    email: null,
    casino_username: null,
  };
  const next = {
    telegram: partial.telegram !== undefined ? partial.telegram : existing.telegram,
    email: partial.email !== undefined ? partial.email : existing.email,
    casino_username:
      partial.casino_username !== undefined ? partial.casino_username : existing.casino_username,
  };
  await query(
    `INSERT INTO aurix_user_accounts(user_id, telegram, email, casino_username, updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       telegram=EXCLUDED.telegram,
       email=EXCLUDED.email,
       casino_username=EXCLUDED.casino_username,
       updated_at=NOW()`,
    [userId, next.telegram, next.email, next.casino_username]
  );
  return (await getAccount(userId))!;
}

function normalizeTelegram(v: string): string {
  const t = v.trim();
  if (!t) return t;
  return t.startsWith("@") ? t : "@" + t;
}

function requestAmount(r: { amount?: string | null }): string {
  return (r.amount && r.amount.trim()) || cfg.DEFAULTS.REFILL_FIXED_AMOUNT;
}

function summarizeAmounts(reqs: Array<Pick<Req, "amount">>): string {
  if (reqs.length === 0) return cfg.DEFAULTS.REFILL_FIXED_AMOUNT;
  const counts = new Map<string, number>();
  for (const r of reqs) {
    const amount = requestAmount(r);
    counts.set(amount, (counts.get(amount) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([amount, count]) => `${count} × ${amount}`)
    .join(" · ");
}

// ───────────── Embed builder ─────────────
function buildBatchEmbed(batch: Batch, reqs: (Req & { email?: string | null })[]): EmbedBuilder {
  const zone = tz();
  const cutoffLocal = fmtFull(batch.cutoff_at, zone);
  const statusLabel =
    batch.status === "open"
      ? "🟢 En cours d'accumulation"
      : batch.status === "locked"
      ? "🟡 Verrouillé — à envoyer au manager"
      : "✅ Envoyé";
  const color =
    batch.status === "open"
      ? cfg.COLOR.PRIMARY
      : batch.status === "locked"
      ? cfg.COLOR.WARNING
      : cfg.COLOR.SUCCESS;

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.list}  Batch refill #${batch.id}`)
    .setDescription(
      [
        `**Cutoff :** \`${cutoffLocal}\` (${zone})`,
        `**Montants :** \`${summarizeAmounts(reqs)}\``,
        `**Statut :** ${statusLabel}`,
        `**Total demandes :** \`${reqs.length}\``,
      ].join("\n")
    )
    .setColor(color)
    .setFooter({ text: `${cfg.BRAND.NAME} • Mise à jour automatique` });

  if (reqs.length === 0) {
    embed.addFields({ name: "—", value: "*Aucune demande pour l'instant.*" });
  } else {
    const lines = reqs.map((r, i) => {
      // user_id negatif = sentinelle auto-refill (pas de mention Discord).
      const isAuto = Number(r.user_id) < 0;
      const who = isAuto ? `**${r.username}** _(auto)_` : `<@${r.user_id}>`;
      const parts = [`**${i + 1}.** ${who}`];
      if (r.casino_username) parts.push(`🎰 \`${r.casino_username}\``);
      if (r.email) parts.push(`✉️ \`${r.email}\``);
      const amountTxt = requestAmount(r);
      const wagerTxt = (r as any).wager || "no wag";
      parts.push(`💰 \`${amountTxt}\` _(${wagerTxt})_`);
      if (r.notes) parts.push(`📝 *${r.notes}*`);
      return parts.join(" · ");
    });

    let chunk: string[] = [];
    let size = 0;
    for (const line of lines) {
      if (size + line.length + 1 > 1000) {
        embed.addFields({ name: "​", value: chunk.join("\n") });
        chunk = [];
        size = 0;
      }
      chunk.push(line);
      size += line.length + 1;
    }
    if (chunk.length) embed.addFields({ name: "Demandes", value: chunk.join("\n") });
  }
  return embed;
}

function buildPlainListForManager(reqs: (Req & { email?: string | null })[]): string {
  if (reqs.length === 0) return "(aucune demande)";
  const lines = [
    `Demandes de refill du jour (${summarizeAmounts(reqs)}) :`,
    "",
  ];
  reqs.forEach((r, i) => {
    const chunks = [`${i + 1}. ${r.username}`];
    chunks.push(`montant : ${requestAmount(r)}`);
    chunks.push(`wager : ${r.wager || "no wag"}`);
    if (r.casino_username) chunks.push(`pseudo casino : ${r.casino_username}`);
    if (r.email) chunks.push(`email : ${r.email}`);
    if (r.notes) chunks.push(`note : ${r.notes}`);
    lines.push(chunks.join(" — "));
  });
  return lines.join("\n");
}

// ───────────── Public API ─────────────
export async function ensureOpenBatch(guild: Guild): Promise<Batch | null> {
  const existing = await getOpenBatch();
  if (existing) return existing;

  const chId = await kvGet("channel_refills_id");
  if (!chId) {
    log("Salon refills introuvable.");
    return null;
  }
  const ch = guild.channels.cache.get(chId);
  if (!ch || ch.type !== 0 /* GuildText */) return null;
  const channel = ch as TextChannel;

  const cutoff = await nextCutoffUtc();
  const insert = await one<{ id: number }>(
    "INSERT INTO aurix_refill_batches(cutoff_at, status, channel_id) VALUES($1,'open',$2) RETURNING id",
    [cutoff, channel.id]
  );
  if (!insert) return null;

  const batch: Batch = {
    id: insert.id,
    cutoff_at: cutoff,
    status: "open",
    message_id: null,
    channel_id: channel.id,
    created_at: new Date(),
    sent_at: null,
  };
  const msg = await channel.send({ embeds: [buildBatchEmbed(batch, [])] });
  await query("UPDATE aurix_refill_batches SET message_id=$1 WHERE id=$2", [msg.id, batch.id]);
  batch.message_id = msg.id;
  log(`Nouveau batch #${batch.id} créé (cutoff ${cutoff.toISOString()})`);
  return batch;
}

async function refreshBatchMessage(client: Client, batch: Batch): Promise<void> {
  if (!batch.channel_id || !batch.message_id) return;
  const ch = client.channels.cache.get(batch.channel_id);
  if (!ch || ch.type !== 0) return;
  const channel = ch as TextChannel;
  try {
    const msg = await channel.messages.fetch(batch.message_id);
    const reqs = await getRequests(batch.id);
    const enriched: (Req & { email: string | null })[] = [];
    for (const r of reqs) {
      const acc = await getAccount(r.user_id);
      enriched.push({ ...r, email: r.email ?? acc?.email ?? null });
    }
    await msg.edit({ embeds: [buildBatchEmbed(batch, enriched)] });
  } catch {
    /* ignore */
  }
}

// ───────────── Guards ─────────────
async function ensureInOwnTicket(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const ch = interaction.channel;
  if (!ch || ch.type !== 0) {
    await interaction.reply({ content: "Commande utilisable uniquement en salon.", ephemeral: true });
    return false;
  }
  const { getLinkedUserIds } = await import("./tickets.js");
  const linkedIds = await getLinkedUserIds(ch.id);
  if (linkedIds.length === 0) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} \`/refill\` n'est utilisable que dans **ton ticket privé**.`,
      ephemeral: true,
    });
    return false;
  }
  if (!linkedIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Seul le streamer propriétaire de ce ticket (ou son binôme déclaré) peut faire la demande.`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

/** Email fallback : si l'user n'a pas d'email enregistre, prend celui d'un binome lie. */
async function findGroupEmail(channelId: string, requesterId: string): Promise<string | null> {
  const { getLinkedUserIds } = await import("./tickets.js");
  const linkedIds = await getLinkedUserIds(channelId);
  // Try the requester first, then partners.
  const ordered = [requesterId, ...linkedIds.filter((id) => id !== requesterId)];
  for (const id of ordered) {
    const acc = await getAccount(id);
    if (acc?.email) return acc.email;
  }
  return null;
}

// ───────────── /refill ─────────────
export async function handleRefillCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await ensureInOwnTicket(interaction))) return;

  const channelId = interaction.channel!.id;
  const { getLinkedUserIds } = await import("./tickets.js");
  const linkedIds = await getLinkedUserIds(channelId);

  const batch = await getOpenBatch();
  if (batch) {
    // Dedup : 1 seule demande par GROUPE (owner + binomes) par batch.
    const dup = await one<{ id: number; user_id: string }>(
      "SELECT id, user_id FROM aurix_refill_requests WHERE batch_id=$1 AND user_id = ANY($2::bigint[])",
      [batch.id, linkedIds]
    );
    if (dup) {
      const who = dup.user_id === interaction.user.id ? "Tu as" : `<@${dup.user_id}> a`;
      await interaction.reply({
        content: `${cfg.EMOJI.info} ${who} déjà soumis une demande pour ce batch. Une seule demande par ticket et par jour (binôme inclus). Utilise \`/refill-cancel\` puis recommence si besoin.`,
        ephemeral: true,
        allowedMentions: { users: [] },
      });
      return;
    }
  }

  // Email : 1) du requester, 2) sinon d'un binome lie, 3) sinon modal.
  const groupEmail = await findGroupEmail(channelId, interaction.user.id);
  if (groupEmail) {
    await submitRefill(interaction, groupEmail);
    return;
  }

  // Modal pour la 1ère fois
  const modal = new ModalBuilder()
    .setCustomId("aurix:refill:firstEmail")
    .setTitle("Première demande de refill");
  const emailInput = new TextInputBuilder()
    .setCustomId("email")
    .setLabel("Adresse email du compte casino")
    .setPlaceholder("exemple@mail.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput));
  await interaction.showModal(modal);
}

export async function handleFirstRefillEmailModal(interaction: ModalSubmitInteraction): Promise<void> {
  const email = interaction.fields.getTextInputValue("email").trim();
  if (!EMAIL_RE.test(email)) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Adresse email invalide.`,
      ephemeral: true,
    });
    return;
  }
  await saveAccount(interaction.user.id, { email });
  await submitRefillFromModal(interaction, email);
}

async function submitRefill(interaction: ChatInputCommandInteraction, email: string): Promise<void> {
  await submitRefillCore(interaction, email);
}

async function submitRefillFromModal(interaction: ModalSubmitInteraction, email: string): Promise<void> {
  await submitRefillCore(interaction, email);
}

async function submitRefillCore(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  email: string
): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel || channel.type !== 0) {
    await replySmart(interaction, { content: "Contexte invalide.", ephemeral: true });
    return;
  }

  const batch = await ensureOpenBatch(guild);
  if (!batch) {
    await replySmart(interaction, {
      content: "Impossible d'enregistrer ta demande : configuration incomplète. Préviens un admin.",
      ephemeral: true,
    });
    return;
  }

  const acc = await getAccount(interaction.user.id);
  // Resolve per-user overrides (amount + wager), fallback aux defauts.
  const refillAmount = (acc as any)?.refill_amount || cfg.DEFAULTS.REFILL_FIXED_AMOUNT;
  const wager = (acc as any)?.wager || "no wag";
  await query(
    `INSERT INTO aurix_refill_requests(batch_id, user_id, username, casino_username, email, amount, wager, notes, ticket_channel_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(batch_id, user_id) DO NOTHING`,
    [
      batch.id,
      interaction.user.id,
      interaction.user.tag,
      acc?.casino_username ?? null,
      email,
      refillAmount,
      wager,
      null,
      channel.id,
    ]
  );

  const fresh = (await getOpenBatch()) ?? batch;
  await refreshBatchMessage(interaction.client, fresh);

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.check}  Demande de refill effectuée`)
    .setDescription(
      [
        `💰 Montant : **${refillAmount}**`,
        `✉️ Email : \`${email}\``,
        "",
        `📅 Refill prévu ${refillWindowText(fresh.cutoff_at)}`,
      ].join("\n")
    )
    .setColor(cfg.COLOR.SUCCESS)
    .setFooter({ text: `${cfg.BRAND.NAME} • Batch #${fresh.id}` });

  await replySmart(interaction, { embeds: [embed], ephemeral: false });

  await logEvent(
    guild,
    `💰 <@${interaction.user.id}> → refill ${refillAmount} (\`${email}\`) — batch #${fresh.id}`
  );
}

async function replySmart(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  payload: { content?: string; embeds?: EmbedBuilder[]; ephemeral?: boolean }
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

// ───────────── /refill-cancel ─────────────
export async function handleRefillCancelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await ensureInOwnTicket(interaction))) return;
  const batch = await getOpenBatch();
  if (!batch) {
    await interaction.reply({ content: "Aucun batch ouvert.", ephemeral: true });
    return;
  }
  // Annule la demande du groupe (binome inclus) — un seul refill par groupe.
  const channelId = interaction.channel!.id;
  const { getLinkedUserIds } = await import("./tickets.js");
  const linkedIds = await getLinkedUserIds(channelId);
  const row = await one<{ id: number; user_id: string }>(
    "SELECT id, user_id FROM aurix_refill_requests WHERE batch_id=$1 AND user_id = ANY($2::bigint[])",
    [batch.id, linkedIds]
  );
  if (!row) {
    await interaction.reply({ content: "Aucune demande en cours pour ce ticket.", ephemeral: true });
    return;
  }
  await query("DELETE FROM aurix_refill_requests WHERE id=$1", [row.id]);
  await refreshBatchMessage(interaction.client, batch);
  await interaction.reply({ content: `${cfg.EMOJI.check} Demande annulée.`, ephemeral: true });
  if (interaction.guild) {
    await logEvent(
      interaction.guild,
      `↩️ <@${interaction.user.id}> a annulé sa demande (batch #${batch.id})`
    );
  }
}

// ───────────── /compte ─────────────
export async function handleCompteCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const acc = await getAccount(interaction.user.id);
  const modal = new ModalBuilder().setCustomId("aurix:compte:save").setTitle("Mes informations");

  const tg = new TextInputBuilder()
    .setCustomId("telegram")
    .setLabel("Pseudo Telegram (@pseudo)")
    .setPlaceholder("@MonPseudo")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(64);
  if (acc?.telegram) tg.setValue(acc.telegram);

  const email = new TextInputBuilder()
    .setCustomId("email")
    .setLabel("Adresse email du compte casino")
    .setPlaceholder("exemple@mail.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(120);
  if (acc?.email) email.setValue(acc.email);

  const casino = new TextInputBuilder()
    .setCustomId("casino")
    .setLabel("Pseudo joueur (sur le casino)")
    .setPlaceholder("Ex : SpinKing92")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(64);
  if (acc?.casino_username) casino.setValue(acc.casino_username);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(tg),
    new ActionRowBuilder<TextInputBuilder>().addComponents(email),
    new ActionRowBuilder<TextInputBuilder>().addComponents(casino)
  );

  await interaction.showModal(modal);
}

export async function handleCompteModal(interaction: ModalSubmitInteraction): Promise<void> {
  const tgRaw = interaction.fields.getTextInputValue("telegram").trim();
  const emailRaw = interaction.fields.getTextInputValue("email").trim();
  const casinoRaw = interaction.fields.getTextInputValue("casino").trim();

  const tg = tgRaw ? normalizeTelegram(tgRaw) : null;
  const emailVal = emailRaw || null;
  const casinoVal = casinoRaw || null;

  if (emailVal && !EMAIL_RE.test(emailVal)) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Adresse email invalide.`,
      ephemeral: true,
    });
    return;
  }

  const acc = await saveAccount(interaction.user.id, {
    telegram: tg,
    email: emailVal,
    casino_username: casinoVal,
  });
  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.check}  Infos enregistrées`)
    .setColor(cfg.COLOR.SUCCESS)
    .addFields(
      { name: "Telegram", value: acc.telegram ?? "*(non défini)*" },
      { name: "Email", value: acc.email ?? "*(non défini)*" },
      { name: "Pseudo joueur", value: acc.casino_username ?? "*(non défini)*" }
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • Tu peux relancer /compte pour modifier` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ───────────── Cutoff task ─────────────
let cutoffTimer: NodeJS.Timeout | null = null;

export function startCutoffTask(client: Client): void {
  if (cutoffTimer) return;
  cutoffTimer = setInterval(() => {
    void tickCutoff(client).catch((e) => console.error("[aurix.refill] cutoff tick error", e));
  }, 30_000);
  log("Cutoff task démarré (poll 30s).");
}

async function tickCutoff(client: Client): Promise<void> {
  const batch = await getOpenBatch();
  if (!batch) return;
  if (Date.now() < batch.cutoff_at.getTime()) return;
  await triggerCutoff(client, batch);
}

async function triggerCutoff(client: Client, batch: Batch): Promise<void> {
  await query("UPDATE aurix_refill_batches SET status='locked' WHERE id=$1", [batch.id]);
  batch.status = "locked";
  await refreshBatchMessage(client, batch);

  const env = loadEnv();
  let guild: Guild | undefined;
  if (env.GUILD_ID) guild = client.guilds.cache.get(env.GUILD_ID);
  if (!guild) guild = client.guilds.cache.first();
  if (!guild) return;

  // Injecte les auto-refills dus pour ce batch (non-Discord users : dealjb, etc).
  await injectAutoRefills(batch);

  // Si aucune demande dans le batch -> aucun message envoye (ni staff-chat
  // ni Telegram). On auto-mark 'sent' pour pas laisser le batch en
  // 'locked' eternel.
  const reqsCount = await getRequests(batch.id);
  if (reqsCount.length === 0) {
    log(`Cutoff: batch #${batch.id} vide -> aucun message envoye.`);
    await query("UPDATE aurix_refill_batches SET status='sent', sent_at=NOW() WHERE id=$1", [batch.id]);
    batch.status = "sent";
    await refreshBatchMessage(client, batch);
    await ensureOpenBatch(guild);
    return;
  }

  const staffChatId = await kvGet("channel_staff_chat_id");
  const staffChat = staffChatId ? guild.channels.cache.get(staffChatId) : null;
  if (!staffChat || staffChat.type !== 0) {
    log("staff-chat introuvable pour cutoff.");
  } else {
    const roleDirectionId = await kvGet("role_direction_id");
    const roleModerateurId = await kvGet("role_moderateur_id");
    const managerMention = (await kvGet("manager_mention")) ?? "*(à configurer via /config manager)*";

    const reqs = reqsCount;
    const enriched: (Req & { email: string | null })[] = [];
    for (const r of reqs) {
      const acc = await getAccount(r.user_id);
      enriched.push({ ...r, email: r.email ?? acc?.email ?? null });
    }
    const plain = buildPlainListForManager(enriched);

    const mentions: string[] = [];
    if (roleDirectionId) mentions.push(`<@&${roleDirectionId}>`);
    if (roleModerateurId) mentions.push(`<@&${roleModerateurId}>`);

    const embed = new EmbedBuilder()
      .setTitle("⏰  Heure du cutoff — envoyez la liste au manager")
      .setDescription(
        [
          `Le batch refill **#${batch.id}** est **verrouillé**.`,
          `**Manager à ping :** ${managerMention}`,
          `**Nombre de demandes :** \`${reqs.length}\` (${summarizeAmounts(enriched)})`,
          "",
          `📋 Liste prête à copier-coller :`,
          "```",
          plain.slice(0, 1800),
          "```",
        ].join("\n")
      )
      .setColor(cfg.COLOR.WARNING)
      .setFooter({ text: `${cfg.BRAND.NAME} • Manager confirmera via /done sur Telegram` });

    await (staffChat as TextChannel).send({
      content: mentions.join(" ") || undefined,
      embeds: [embed],
      allowedMentions: { roles: mentions.length ? [roleDirectionId, roleModerateurId].filter((x): x is string => !!x) : [] },
    });

    // Construit la liste enrichie avec displayName Discord (nickname > globalName > username).
    const guildForCutoff = guild;
    const items = await Promise.all(
      enriched.map(async (r) => {
        let displayName = r.username;
        const isAuto = Number(r.user_id) < 0;
        if (!isAuto) {
          try {
            const m = await guildForCutoff.members.fetch(r.user_id);
            displayName = m.displayName || m.user.globalName || m.user.username;
          } catch {
            /* membre parti, on garde le username stocke */
          }
        }
        return {
          ticket_channel_id: r.ticket_channel_id,
          user_id: r.user_id,
          displayName,
          email: r.email,
          casinoUsername: r.casino_username,
          amount: r.amount,
          wager: r.wager,
        };
      })
    );

    // Envoi Telegram puis, SI succes, auto-mark batch envoye + notify tickets.
    try {
      const { sendRefillBatchToTelegram } = await import("./telegram.js");
      const dayDateFr = fmtDayDateFr(batch.cutoff_at, tz());
      const res = await sendRefillBatchToTelegram({
        batchId: batch.id,
        dayDateFr,
        managerMention,
        fixedAmount: cfg.DEFAULTS.REFILL_FIXED_AMOUNT,
        count: reqs.length,
        items: items.map((it) => ({
          displayName: it.displayName,
          casinoUsername: it.casinoUsername,
          email: it.email,
          amount: it.amount,
          wager: it.wager,
        })),
      });

      if (res.ok) {
        // Le batch reste 'locked' jusqu'a ce que le manager tape /done sur Telegram.
        // On notifie juste les streamers que leur demande est transmise.
        await notifyRequestersTransmitted(guildForCutoff, batch.id, items);
      } else {
        log(`Telegram send returned not ok: ${res.reason} — pas de notification ticket.`);
      }
    } catch (e) {
      log("Telegram send failed:", e);
    }
  }

  await ensureOpenBatch(guild);
}

function fmtDayDateFr(d: Date, zone: string): string {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: zone }).format(d);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", timeZone: zone }).format(d);
  const month = new Intl.DateTimeFormat("fr-FR", { month: "2-digit", timeZone: zone }).format(d);
  const year = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: zone }).format(d);
  return `${weekday} ${day}/${month}/${year}`;
}

async function notifyRequestersTransmitted(
  guild: Guild,
  batchId: number,
  items: Array<{ ticket_channel_id: string | null; user_id: string; displayName: string; amount?: string | null }>
): Promise<void> {
  for (const it of items) {
    if (!it.ticket_channel_id) continue;
    const ch = guild.channels.cache.get(it.ticket_channel_id);
    if (!ch || ch.type !== 0) continue;
    try {
      const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.check} Demande transmise au manager`)
        .setDescription(
          [
            `Salut <@${it.user_id}> 👋`,
            "",
            `Ta demande de refill de **${requestAmount(it)}** vient d'être **transmise au manager**.`,
            `Il s'occupera du virement sur ton compte casino dès que possible — tu n'as rien à faire de plus.`,
            "",
            `À demain pour une nouvelle demande ${cfg.EMOJI.diamond}`,
          ].join("\n")
        )
        .setColor(cfg.COLOR.SUCCESS)
        .setFooter({ text: `${cfg.BRAND.NAME} • Batch #${batchId}` });

      await (ch as TextChannel).send({
        content: `<@${it.user_id}>`,
        embeds: [embed],
        allowedMentions: { users: [it.user_id] },
      });
    } catch (e) {
      log("notifyRequestersTransmitted failed for ticket", it.ticket_channel_id, e);
    }
  }
}

// ═════════════════════════════════════════════════════════
// Telegram /done — le manager confirme que les refills sont effectués.
// On marque le batch sent + on notifie chaque ticket.
// ═════════════════════════════════════════════════════════

export function startTelegramRefillHandler(client: Client): void {
  void import("./telegram.js").then(({ startTelegramListener }) => {
    startTelegramListener(async (text) => {
      const t = text.trim();
      if (!/^\/done(@\w+)?$/i.test(t)) return;
      await processRefillDone(client);
    });
  });
}

async function processRefillDone(client: Client): Promise<void> {
  const { sendTelegramText } = await import("./telegram.js");

  const batch = await one<Batch>(
    "SELECT * FROM aurix_refill_batches WHERE status='locked' ORDER BY id DESC LIMIT 1"
  );
  if (!batch) {
    await sendTelegramText(
      "⚠️ Aucun batch en attente côté Aurix. Rien à marquer comme effectué."
    );
    return;
  }

  await query(
    "UPDATE aurix_refill_batches SET status='sent', sent_at=NOW() WHERE id=$1",
    [batch.id]
  );
  batch.status = "sent";
  await refreshBatchMessage(client, batch);

  const env = loadEnv();
  let guild: Guild | undefined;
  if (env.GUILD_ID) guild = client.guilds.cache.get(env.GUILD_ID);
  if (!guild) guild = client.guilds.cache.first();
  if (!guild) {
    await sendTelegramText(`✅ Batch #${batch.id} marqué effectué (impossible de notifier les tickets — guild introuvable).`);
    return;
  }

  const reqs = await getRequests(batch.id);
  let notified = 0;
  for (const r of reqs) {
    if (!r.ticket_channel_id) continue;
    const ch = guild.channels.cache.get(r.ticket_channel_id);
    if (!ch || ch.type !== 0) continue;
    try {
      const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.money} Refill effectué !`)
        .setDescription(
          [
            `Salut <@${r.user_id}>,`,
            "",
            `Ton refill de **${requestAmount(r)}** vient d'être **effectué** par le manager Aurix.`,
            `Jette un œil à ton compte casino — c'est crédité (ou ça arrive d'une minute à l'autre).`,
            "",
            `Bon stream ${cfg.EMOJI.fire}`,
          ].join("\n")
        )
        .setColor(cfg.COLOR.SUCCESS)
        .setFooter({ text: `${cfg.BRAND.NAME} • Batch #${batch.id}` });

      await (ch as TextChannel).send({
        content: `<@${r.user_id}>`,
        embeds: [embed],
        allowedMentions: { users: [r.user_id] },
      });
      notified++;
    } catch (e) {
      log("ticket notify (done) failed:", r.ticket_channel_id, e);
    }
  }

  await sendTelegramText(
    `✅ Batch #${batch.id} marqué effectué — ${notified} streamer(s) notifié(s) sur Discord.`
  );
}

// ═════════════════════════════════════════════════════════
// Auto-refills (recurrents, non-Discord users : dealjb, etc).
// ═════════════════════════════════════════════════════════
// On insere dans aurix_refill_requests avec un user_id sentinelle
// negatif (= -auto.id) pour eviter toute collision avec un Discord ID
// (toujours > 0). La fetch de membre Discord echouera silencieusement
// au moment du Telegram et on retombera sur le `username` stocke
// (= display_name de l'auto-refill).

async function injectAutoRefills(batch: Batch): Promise<void> {
  const autos = await all<{
    id: string;
    email: string;
    amount: string;
    wager: string | null;
    display_name: string;
    cadence_days: number;
  }>(
    `SELECT id, email, amount, wager, display_name, cadence_days
       FROM aurix_auto_refills
      WHERE active = TRUE AND next_run_at <= NOW()
      ORDER BY id`
  );

  for (const a of autos) {
    const virtualUserId = `-${a.id}`; // sentinelle (negatif)
    const insRes = await query(
      `INSERT INTO aurix_refill_requests(batch_id, user_id, username, casino_username, email, amount, wager, notes, ticket_channel_id)
       VALUES($1, $2, $3, NULL, $4, $5, $6, $7, NULL)
       ON CONFLICT (batch_id, user_id) DO NOTHING`,
      [batch.id, virtualUserId, a.display_name, a.email, a.amount, a.wager || "no wag", `Auto-refill recurrent (cadence ${a.cadence_days}j)`]
    );

    await query(
      `UPDATE aurix_auto_refills
          SET next_run_at = next_run_at + (cadence_days * INTERVAL '1 day'),
              updated_at = NOW()
        WHERE id = $1`,
      [a.id]
    );

    if ((insRes.rowCount ?? 0) > 0) {
      log(`Auto-refill injecte: ${a.display_name} ${a.amount} -> batch #${batch.id}`);
    } else {
      log(`Auto-refill ${a.display_name} deja present dans batch #${batch.id} (idempotent skip)`);
    }
  }
}
