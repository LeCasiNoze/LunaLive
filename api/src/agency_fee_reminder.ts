// api/src/agency_fee_reminder.ts
//
// Rappel quotidien à Fabiozsis (DM Discord) des frais d'agence à payer :
// 7 jours avant, 2 jours avant, et le jour J. Tout est consolidé dans UN seul
// DM par jour pour éviter le spam (même si plusieurs frais tombent dans
// plusieurs buckets le même jour).
//
// Source des données :
//   - Table `expenses` filtrée sur `source_type = 'agency_streamer_payout'`
//     (générée automatiquement par syncAgencyExpensesForMonth dans
//     api/src/routes/expenses.ts).
//   - Frais "à payer" = `paid_at IS NULL`.
//
// Logique :
//   - Trigger d'envoi = il existe au moins un frais impayé dans les buckets
//     actionables : EN RETARD (date < today), J-0, J-2, J-7.
//   - Quand on envoie, on liste TOUS les frais impayés (retards + à venir),
//     groupés en buckets visuels — pour avoir une vue complète de la file.
//
// Idempotence : un row par jour dans `agency_fee_reminder_runs` (mig109).
//   INSERT ON CONFLICT DO NOTHING — si déjà envoyé aujourd'hui → no-op.
//
// Cadence : tick toutes les 30 min ; envoi déclenché au premier tick après
// 09:00 (heure Paris). Si l'API démarre après 9h, l'envoi se fait au boot.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  type Client,
} from "discord.js";
import { pool } from "./db.js";

const LOG = "[agency-fee-reminder]";

// Salon ┊💀・qg-de-l-ombre-de-la-mort-qui-tue (catégorie privée AGENCE)
// — c'est ici que vont les RAPPELS (pings J-7/J-2/J-0/retards). Le tableau
// auto-actualisé vit dans un autre salon (cf. agency_fees_board.ts).
const FEES_CHANNEL_ID = "1501890674620891268";

// Mention au-dessus de l'embed pour déclencher la notification Discord.
const PING_USER_IDS = [
  "682472610868887567", // LeCasiNoze
  "406965568755728395", // Fabiozsis
  "992099046472831066", // Samyzsis (eowite22)
];

const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
const FSB_BOARD_URL = `${PUBLIC_WEB_BASE}/FSB_Board`;

const TICK_INTERVAL_MS = 30 * 60_000; // 30 min
const SEND_HOUR_PARIS  = 9;

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirnameLocal, "../assets/logo.png");

let _logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (_logoBuffer) return _logoBuffer;
  try { _logoBuffer = fs.readFileSync(LOGO_PATH); return _logoBuffer; }
  catch { return null; }
}

// ── Date Paris ───────────────────────────────────────────────────────────────

function parisNow(): { date: string; hour: number } {
  // YYYY-MM-DD + heure (0-23) en zone Europe/Paris
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  return { date, hour };
}

// ── Query : frais à payer dans 0/2/7 jours ──────────────────────────────────

type FeeRow = {
  id: number;
  description: string;
  amount: number;
  due_date: string;        // YYYY-MM-DD
  days_until: number;      // <0 = en retard, 0 = aujourd'hui, >0 = à venir
};

const ACTIONABLE_DAYS = new Set([0, 2, 7]); // déclencheurs (en plus du retard)

import { loadUnpaidOccurrences } from "./lib/expenses_unpaid.js";

async function loadAllUnpaidFees(todayParis: string): Promise<FeeRow[]> {
  const rows = await loadUnpaidOccurrences(todayParis, 365, 15);
  return rows.map((r) => ({
    id:          r.expense_id,
    description: r.description + (r.is_recurring ? " (mensuel)" : ""),
    amount:      r.amount,
    due_date:    r.due_date,
    days_until:  r.days_until,
  }));
}

function shouldTrigger(fees: FeeRow[]): boolean {
  return fees.some(f => f.days_until < 0 || ACTIONABLE_DAYS.has(f.days_until));
}

// ── Embed ────────────────────────────────────────────────────────────────────

function eur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function frenchDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "2-digit", month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

type BucketKey = "overdue" | "today" | "j2" | "j7" | "upcoming";

function bucketOf(daysUntil: number): BucketKey {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil === 2) return "j2";
  if (daysUntil === 7) return "j7";
  return "upcoming";
}

const BUCKET_META: Record<BucketKey, { order: number; label: (count: number) => string }> = {
  overdue:  { order: 0, label: (n) => `⚠️   En retard  •  ${n} ${n > 1 ? "frais" : "frais"} non payé${n > 1 ? "s" : ""}` },
  today:    { order: 1, label: ()  => `🔴   Aujourd'hui` },
  j2:       { order: 2, label: ()  => `🟠   Dans 2 jours` },
  j7:       { order: 3, label: ()  => `🟡   Dans 7 jours` },
  upcoming: { order: 4, label: ()  => `📅   À venir (autres échéances)` },
};

function overdueLine(f: FeeRow): string {
  const lateDays = -f.days_until;
  return `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)} — en retard de ${lateDays} jour${lateDays > 1 ? "s" : ""}*`;
}

function normalLine(f: FeeRow): string {
  return `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)}*`;
}

function buildEmbed(fees: FeeRow[], hasLogo: boolean) {
  const grouped: Record<BucketKey, FeeRow[]> = {
    overdue: [], today: [], j2: [], j7: [], upcoming: [],
  };
  for (const f of fees) grouped[bucketOf(f.days_until)].push(f);

  const total = fees.reduce((s, f) => s + f.amount, 0);
  const overdueTotal = grouped.overdue.reduce((s, f) => s + f.amount, 0);

  const titlePrefix = grouped.overdue.length > 0
    ? `⚠️ ${grouped.overdue.length} en retard  •  `
    : "";

  const embed = new EmbedBuilder()
    .setColor(grouped.overdue.length > 0 ? 0xE53935 : 0x9D4BFF) // rouge si retard, sinon violet
    .setAuthor({
      name: "LunaLive  •  Rappel frais d'agence",
      ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
      url: FSB_BOARD_URL,
    })
    .setTitle(`💰   Frais d'agence à payer — ${titlePrefix}${fees.length} échéance${fees.length > 1 ? "s" : ""}`)
    .setURL(FSB_BOARD_URL)
    .setDescription(
      (grouped.overdue.length > 0
        ? `🚨 **${grouped.overdue.length} frais en retard** pour un total de **${eur(overdueTotal)}** — à régler en priorité.\n\n`
        : `Voici les paiements à prévoir, regroupés par échéance.\n\n`) +
      `**Total cumulé impayé :** ${eur(total)}\n` +
      `​`
    );

  // Ordre fixe : retard → aujourd'hui → J-2 → J-7 → autres
  const orderedKeys: BucketKey[] = ["overdue", "today", "j2", "j7", "upcoming"];
  for (const key of orderedKeys) {
    const list = grouped[key];
    if (list.length === 0) continue;
    const renderLine = key === "overdue" ? overdueLine : normalLine;
    const lines = list.map(renderLine);
    const subTotal = list.reduce((s, f) => s + f.amount, 0);
    embed.addFields({
      name: `${BUCKET_META[key].label(list.length)}  •  ${eur(subTotal)}`,
      value: lines.join("\n\n"),
      inline: false,
    });
  }

  embed.setFooter({
    text: "LunaLive  •  Rappel automatique — retards + J-7 / J-2 / J-0",
    ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
  })
  .setTimestamp(new Date());

  if (hasLogo) embed.setThumbnail("attachment://logo.png");
  return embed;
}

function buildButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📊  Ouvrir le FSB Board").setURL(FSB_BOARD_URL),
  );
}

// ── Tick principal ───────────────────────────────────────────────────────────

async function tryClaimRun(todayParis: string, itemsCount: number): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO agency_fee_reminder_runs (run_date, items_count)
     VALUES ($1::date, $2)
     ON CONFLICT (run_date) DO NOTHING
     RETURNING run_date`,
    [todayParis, itemsCount]
  );
  return r.rowCount === 1;
}

async function tick(): Promise<void> {
  const { date: todayParis, hour } = parisNow();
  if (hour < SEND_HOUR_PARIS) return;

  // Court-circuit : si déjà envoyé aujourd'hui, sortir sans query inutile.
  const already = await pool.query(
    `SELECT 1 FROM agency_fee_reminder_runs WHERE run_date = $1::date LIMIT 1`,
    [todayParis]
  );
  if (already.rowCount && already.rowCount > 0) return;

  const fees = await loadAllUnpaidFees(todayParis);
  if (!shouldTrigger(fees)) {
    // Aucun trigger actionnable (pas de retard, pas de J-0/J-2/J-7).
    // On marque le run comme exécuté pour éviter de re-quoter chaque tick.
    await tryClaimRun(todayParis, 0);
    return;
  }

  const client = (global as any).discordClient as Client | null | undefined;
  if (!client) {
    console.warn(`${LOG} Discord client absent — pas d'envoi (on ne claim PAS le run, retry au prochain tick)`);
    return;
  }

  // Verrou : tente de poser le claim AVANT envoi pour éviter double-send si
  // plusieurs instances tournent en parallèle.
  const claimed = await tryClaimRun(todayParis, fees.length);
  if (!claimed) {
    console.log(`${LOG} run déjà claimé par une autre instance — skip`);
    return;
  }

  try {
    const logoBuf = getLogoBuffer();
    const files: AttachmentBuilder[] = [];
    if (logoBuf) files.push(new AttachmentBuilder(logoBuf, { name: "logo.png" }));

    const embed = buildEmbed(fees, !!logoBuf);
    const row = buildButtons();

    const channel = await client.channels.fetch(FEES_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`channel ${FEES_CHANNEL_ID} introuvable ou non textuel`);
    }

    const mentions = PING_USER_IDS.map(id => `<@${id}>`).join(" ");
    await (channel as any).send({
      content: mentions,
      embeds: [embed],
      components: [row],
      files,
      allowedMentions: { users: PING_USER_IDS },
    });

    console.log(`${LOG} ✅ rappel envoyé dans #${(channel as any).name || FEES_CHANNEL_ID} — ${fees.length} échéance(s) — ${todayParis}`);
  } catch (e: any) {
    // Si l'envoi échoue, on retire le claim pour réessayer au prochain tick.
    console.warn(`${LOG} envoi échoué — retire le claim pour retry: ${e?.message || e}`);
    await pool.query(`DELETE FROM agency_fee_reminder_runs WHERE run_date = $1::date`, [todayParis]).catch(() => {});
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export function startAgencyFeeReminder(): void {
  let running = false;
  const safeTick = async () => {
    if (running) return;
    running = true;
    try { await tick(); }
    catch (e: any) { console.error(`${LOG} tick error:`, e?.message || e); }
    finally { running = false; }
  };

  // Premier tick 30 s après le boot (laisse les migrations se terminer).
  setTimeout(() => { void safeTick(); }, 30_000);

  const id = setInterval(() => { void safeTick(); }, TICK_INTERVAL_MS);
  (id as any).unref?.();

  console.log(`${LOG} started — tick toutes les ${TICK_INTERVAL_MS / 60_000}min, envoi à partir de ${SEND_HOUR_PARIS}h Paris`);
}
