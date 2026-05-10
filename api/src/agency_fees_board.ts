// api/src/agency_fees_board.ts
//
// Tableau auto-actualisé des frais d'agence, posté dans le salon
// "┊💰・frais" de la catégorie AGENCE. Un SEUL message qui s'édite en place :
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ Partie supérieure : frais À PAYER (buckets retard / J0 / J2 / J7 /  │
//   │                     à venir) + total impayé                          │
//   │ Partie inférieure : DÉJÀ PAYÉS (30 derniers jours) + total payés    │
//   │ Bouton            : 🔄 Actualiser maintenant                         │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Refresh automatique toutes les 24h. Premier refresh ~60s après le boot.
// Le bouton déclenche un refresh immédiat (handler dans discord/bot.ts).
//
// État persisté dans `agency_fees_board` (singleton, mig110) — on stocke
// channel_id + message_id pour pouvoir éditer.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
} from "discord.js";
import { pool } from "./db.js";

const LOG = "[agency-fees-board]";

export const FEES_BOARD_CHANNEL_ID = "1501890675992432803";          // ┊💰・frais
export const FEES_BOARD_REFRESH_CID = "agency_fees_board:refresh";

const REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
const FIRST_REFRESH_DELAY_MS = 60_000;
const PAID_RECENT_LIMIT     = 15;
const PAID_RECENT_DAYS      = 30;

const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.onrender.com").replace(/\/$/, "");
const FSB_BOARD_URL = `${PUBLIC_WEB_BASE}/FSB_Board`;

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirnameLocal, "../assets/logo.png");

let _logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (_logoBuffer) return _logoBuffer;
  try { _logoBuffer = fs.readFileSync(LOGO_PATH); return _logoBuffer; }
  catch { return null; }
}

// ── Helpers format ───────────────────────────────────────────────────────────

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

function frenchDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short", day: "2-digit", month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function parisToday(): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ── Queries ──────────────────────────────────────────────────────────────────

type FeeRow = { id: number; description: string; amount: number; due_date: string; days_until: number };

import { loadUnpaidOccurrences } from "./lib/expenses_unpaid.js";

async function loadUnpaid(todayParis: string): Promise<FeeRow[]> {
  const rows = await loadUnpaidOccurrences(todayParis, 365, 15);
  return rows.map((r) => ({
    id: r.expense_id,
    description: r.description + (r.is_recurring ? " (mensuel)" : ""),
    amount: r.amount,
    due_date: r.due_date,
    days_until: r.days_until,
  }));
}

type PaidRow = { id: number; description: string; amount: number; paid_date: string };

async function loadPaidRecent(): Promise<{ rows: PaidRow[]; totalCount: number; totalSum: number }> {
  const recent = await pool.query(
    `
    SELECT id::text AS id, description, amount::float AS amount,
           to_char(paid_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS paid_date
    FROM expenses
    WHERE paid_at IS NOT NULL
      AND paid_at >= NOW() - ($1 || ' days')::interval
    ORDER BY paid_at DESC
    LIMIT $2
    `,
    [String(PAID_RECENT_DAYS), PAID_RECENT_LIMIT]
  );
  const totals = await pool.query(
    `
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::float AS sum
    FROM expenses
    WHERE paid_at IS NOT NULL
      AND paid_at >= NOW() - ($1 || ' days')::interval
    `,
    [String(PAID_RECENT_DAYS)]
  );
  return {
    rows: recent.rows.map((row: any) => ({
      id: Number(row.id),
      description: String(row.description || ""),
      amount: Number(row.amount || 0),
      paid_date: String(row.paid_date),
    })),
    totalCount: Number(totals.rows[0]?.cnt || 0),
    totalSum: Number(totals.rows[0]?.sum || 0),
  };
}

// ── Embed ────────────────────────────────────────────────────────────────────

type BucketKey = "overdue" | "today" | "j2" | "j7" | "upcoming";
const bucketOf = (d: number): BucketKey =>
  d < 0 ? "overdue" : d === 0 ? "today" : d === 2 ? "j2" : d === 7 ? "j7" : "upcoming";
const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue:  "⚠️   En retard",
  today:    "🔴   Aujourd'hui",
  j2:       "🟠   Dans 2 jours",
  j7:       "🟡   Dans 7 jours",
  upcoming: "📅   À venir",
};
const BUCKET_ORDER: BucketKey[] = ["overdue", "today", "j2", "j7", "upcoming"];

function fitField(lines: string[]): string {
  // Field value max 1024 chars. Si dépasse → on tronque et on ajoute "...".
  let out = "";
  let truncated = 0;
  for (const ln of lines) {
    if ((out + (out ? "\n\n" : "") + ln).length > 980) { truncated++; continue; }
    out = out ? `${out}\n\n${ln}` : ln;
  }
  if (truncated > 0) out += `\n\n_+ ${truncated} de plus — voir [FSB Board](${FSB_BOARD_URL})_`;
  return out || "_(rien)_";
}

function buildBoardEmbed(
  unpaid: FeeRow[],
  paid: { rows: PaidRow[]; totalCount: number; totalSum: number },
  hasLogo: boolean,
) {
  const grouped: Record<BucketKey, FeeRow[]> = { overdue: [], today: [], j2: [], j7: [], upcoming: [] };
  for (const f of unpaid) grouped[bucketOf(f.days_until)].push(f);

  const totalUnpaid  = unpaid.reduce((s, f) => s + f.amount, 0);
  const overdueCount = grouped.overdue.length;

  const accent = overdueCount > 0 ? 0xE53935 : (unpaid.length > 0 ? 0x9D4BFF : 0x4CAF50);

  const embed = new EmbedBuilder()
    .setColor(accent)
    .setAuthor({
      name: "LunaLive  •  Tableau frais d'agence",
      ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
      url: FSB_BOARD_URL,
    })
    .setTitle(unpaid.length === 0
      ? `✅   Aucun frais en attente`
      : `📊   Frais d'agence — ${unpaid.length} à payer`)
    .setURL(FSB_BOARD_URL)
    .setDescription(
      `**Vue d'ensemble** — actualisé toutes les 24h, ou via le bouton ci-dessous.\n` +
      `Détail complet sur le [FSB Board](${FSB_BOARD_URL}).`
    );

  // ─── Section À PAYER ──────────────────────────────────────────────────────
  embed.addFields({
    name: "▰▰▰▰▰  À PAYER  ▰▰▰▰▰",
    value: `**Total impayé : ${eur(totalUnpaid)}**` +
           (overdueCount > 0
             ? `\n🚨 **${overdueCount} en retard** : ${eur(grouped.overdue.reduce((s, f) => s + f.amount, 0))}`
             : ""),
    inline: false,
  });

  if (unpaid.length === 0) {
    embed.addFields({ name: "​", value: "_Aucun frais à payer pour l'instant 🎉_", inline: false });
  } else {
    for (const key of BUCKET_ORDER) {
      const list = grouped[key];
      if (list.length === 0) continue;
      const sub = list.reduce((s, f) => s + f.amount, 0);
      const lines = list.map(f => {
        if (key === "overdue") {
          const late = -f.days_until;
          return `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)} — retard ${late}j*`;
        }
        return `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)}*`;
      });
      embed.addFields({
        name: `${BUCKET_LABELS[key]}  •  ${eur(sub)}  (${list.length})`,
        value: fitField(lines),
        inline: false,
      });
    }
  }

  // ─── Section DÉJÀ PAYÉS ───────────────────────────────────────────────────
  embed.addFields({
    name: `▰▰▰▰▰  DÉJÀ PAYÉS  •  ${PAID_RECENT_DAYS} derniers jours  ▰▰▰▰▰`,
    value: `**Total payé : ${eur(paid.totalSum)}**  •  ${paid.totalCount} échéance${paid.totalCount > 1 ? "s" : ""}`,
    inline: false,
  });

  if (paid.rows.length === 0) {
    embed.addFields({ name: "​", value: "_Aucun paiement enregistré sur la période._", inline: false });
  } else {
    const lines = paid.rows.map(p =>
      `• **${eur(p.amount)}** — ${p.description}\n   *Payé le ${frenchDate(p.paid_date)}*`
    );
    embed.addFields({
      name: `✅   Paiements récents  (${paid.rows.length}${paid.totalCount > paid.rows.length ? `/${paid.totalCount}` : ""})`,
      value: fitField(lines),
      inline: false,
    });
  }

  embed.setFooter({
    text: `LunaLive  •  Refresh auto toutes les 24h  •  Dernière maj`,
    ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
  })
  .setTimestamp(new Date());

  if (hasLogo) embed.setThumbnail("attachment://logo.png");
  return embed;
}

// CustomId du bouton "Marquer payé" — handler dans discord/admin_commands.ts
const FEES_BOARD_MARK_PAID_OPEN_CID = "agency_fees_board:mark_paid_open";

function buildButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(FEES_BOARD_MARK_PAID_OPEN_CID)
      .setLabel("✅  Marquer comme payé(s)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(FEES_BOARD_REFRESH_CID)
      .setLabel("🔄  Actualiser")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📊  FSB Board")
      .setURL(FSB_BOARD_URL),
  );
}

// ── Refresh principal ────────────────────────────────────────────────────────

let _refreshInFlight = false;

export async function refreshAgencyFeesBoard(): Promise<void> {
  if (_refreshInFlight) {
    console.log(`${LOG} refresh déjà en cours — skip`);
    return;
  }
  _refreshInFlight = true;
  try {
    const client = (global as any).discordClient as Client | null | undefined;
    if (!client) { console.warn(`${LOG} Discord client absent — skip`); return; }

    const channel = await client.channels.fetch(FEES_BOARD_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(`${LOG} channel ${FEES_BOARD_CHANNEL_ID} introuvable ou non textuel`);
      return;
    }

    const today = parisToday();
    const [unpaid, paid] = await Promise.all([loadUnpaid(today), loadPaidRecent()]);

    // Pas de logo joint : Discord l'affichait comme image séparée au-dessus
    // du message → bruit visuel inutile. On garde l'embed pur.
    const embed = buildBoardEmbed(unpaid, paid, false);
    const row = buildButtons();
    const files: AttachmentBuilder[] = [];

    // Récupère message_id existant
    const stored = await pool.query(
      `SELECT message_id FROM agency_fees_board WHERE id = 1 LIMIT 1`
    );
    const existingMsgId = stored.rows[0]?.message_id ? String(stored.rows[0].message_id) : null;

    if (existingMsgId) {
      // Tente d'éditer le message existant
      try {
        const msg = await (channel as any).messages.fetch(existingMsgId);
        // Note : on NE peut PAS modifier les attachments d'un message via edit()
        // → on n'envoie les files qu'à la création. Pour l'edit, on retire les
        // refs attachment:// et on bascule sur le logo URL si on en avait un.
        const editEmbed = buildBoardEmbed(unpaid, paid, false); // hasLogo=false → pas de réf attachment
        await msg.edit({ embeds: [editEmbed], components: [row] });
        await pool.query(
          `UPDATE agency_fees_board SET last_refreshed_at = NOW() WHERE id = 1`
        );
        console.log(`${LOG} ✅ message édité (${existingMsgId}) — unpaid=${unpaid.length} paid=${paid.rows.length}`);
        return;
      } catch (e: any) {
        console.warn(`${LOG} edit échoué (${e?.message || e}) — recréation du message`);
      }
    }

    // Création initiale (ou recréation si l'ancien message a été supprimé)
    const sent = await (channel as any).send({ embeds: [embed], components: [row], files });
    await pool.query(
      `
      INSERT INTO agency_fees_board (id, channel_id, message_id, last_refreshed_at)
      VALUES (1, $1, $2, NOW())
      ON CONFLICT (id) DO UPDATE
        SET channel_id = EXCLUDED.channel_id,
            message_id = EXCLUDED.message_id,
            last_refreshed_at = NOW()
      `,
      [FEES_BOARD_CHANNEL_ID, sent.id]
    );
    console.log(`${LOG} ✅ message créé (${sent.id})`);
  } catch (e: any) {
    console.error(`${LOG} refresh failed: ${e?.message || e}`);
  } finally {
    _refreshInFlight = false;
  }
}

// ── Handler bouton (appelé depuis discord/bot.ts) ────────────────────────────

export async function handleFeesBoardRefreshButton(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });
    await refreshAgencyFeesBoard();
    await interaction.editReply({ content: "✅ Tableau actualisé." });
  } catch (e: any) {
    console.error(`${LOG} button refresh error: ${e?.message || e}`);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Échec du refresh : " + (e?.message || e) });
      } else {
        await interaction.reply({ ephemeral: true, content: "❌ Échec du refresh." });
      }
    } catch {}
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export function startAgencyFeesBoard(): void {
  setTimeout(() => { void refreshAgencyFeesBoard(); }, FIRST_REFRESH_DELAY_MS);
  const id = setInterval(() => { void refreshAgencyFeesBoard(); }, REFRESH_INTERVAL_MS);
  (id as any).unref?.();
  console.log(`${LOG} started — refresh toutes les ${REFRESH_INTERVAL_MS / 3600_000}h`);
}
