// api/src/discord/casino_offers.ts
// Gestion des offres casino dynamiques — dashboard admin + DB ops

import { pool } from "../db.js";
import type { BotCtx } from "./utils.js";
import {
  FABIO_GUILD_ID,
  FABIO_CAT_MODO_ID,
  FABIO_ROLE_MOD_ID,
  FABIO_ROLE_CHEF_ID,
  CID_FABIO_OFFER_ADD,
  CID_FABIO_OFFER_EDIT,
  CID_FABIO_OFFER_TOGGLE,
  CID_FABIO_OFFER_EVENT,
  CID_FABIO_OFFER_ADD_MODAL,
  CID_FABIO_OFFER_EVENT_MODAL,
} from "./constants.js";
import type { Client } from "discord.js";
import { ChannelType } from "discord.js";

export type CasinoOffer = {
  id: string;
  guild_id: string;
  casino: string;
  label: string;
  description: string | null;
  min_deposit: number;
  reimburse_amt: number;
  reimburse_type: "casino" | "wallet";
  crypto: string | null;
  type: "permanent" | "event";
  event_end_at: Date | null;
  active: boolean;
  discord_role_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

// Couleurs par casino (hex → int)
const CASINO_COLORS: Record<string, number> = {
  "razed":         0xC0392B, // rouge sang
  "brutal-casino": 0x8E44AD, // violet
  "cresus":        0xF39C12, // or
  "winoui":        0x2980B9, // bleu
  "tortuga":       0x16A085, // vert sombre
};
function casinoColor(slug: string): number {
  return CASINO_COLORS[slug.toLowerCase()] ?? 0x2ECC71;
}

// ─── DB ops ───────────────────────────────────────────────────────────────────

export async function getActiveOffers(guildId: string): Promise<CasinoOffer[]> {
  const r = await pool.query<CasinoOffer>(
    `SELECT * FROM discord_casino_offers
     WHERE guild_id = $1 AND active = true
       AND (type = 'permanent' OR event_end_at > now())
     ORDER BY created_at ASC`,
    [guildId]
  );
  return r.rows;
}

export async function getAllOffers(guildId: string): Promise<CasinoOffer[]> {
  const r = await pool.query<CasinoOffer>(
    `SELECT * FROM discord_casino_offers WHERE guild_id = $1 ORDER BY active DESC, created_at ASC`,
    [guildId]
  );
  return r.rows;
}

export async function getOfferById(id: string): Promise<CasinoOffer | null> {
  const r = await pool.query<CasinoOffer>(
    `SELECT * FROM discord_casino_offers WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createOffer(
  data: {
    guild_id: string;
    casino: string;
    label: string;
    description?: string;
    min_deposit: number;
    reimburse_amt: number;
    reimburse_type: "casino" | "wallet";
    crypto?: string;
    type?: "permanent" | "event";
    event_end_at?: Date;
    created_by?: string;
  },
  client?: Client
): Promise<CasinoOffer> {
  // Créer le rôle Discord avant l'INSERT
  let discordRoleId: string | null = null;
  if (client) {
    try {
      const guild = await client.guilds.fetch(data.guild_id).catch(() => null);
      if (guild) {
        const roleName = data.casino.charAt(0).toUpperCase() + data.casino.slice(1);
        const role = await guild.roles.create({
          name: roleName,
          color: casinoColor(data.casino),
          hoist: false,        // ne s'affiche pas séparément
          mentionable: false,
          reason: `Offre casino créée : ${data.label}`,
        });
        discordRoleId = role.id;
      }
    } catch (e: any) {
      console.warn(`[casino_offers] role create failed: ${e?.message}`);
    }
  }

  const r = await pool.query<CasinoOffer>(
    `INSERT INTO discord_casino_offers
       (guild_id, casino, label, description, min_deposit, reimburse_amt,
        reimburse_type, crypto, type, event_end_at, created_by, discord_role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.guild_id, data.casino, data.label, data.description ?? null,
      data.min_deposit, data.reimburse_amt, data.reimburse_type,
      data.crypto ?? null, data.type ?? "permanent",
      data.event_end_at ?? null, data.created_by ?? null,
      discordRoleId,
    ]
  );
  return r.rows[0];
}

export async function updateOffer(id: string, data: Partial<{
  label: string;
  description: string;
  min_deposit: number;
  reimburse_amt: number;
  reimburse_type: "casino" | "wallet";
  crypto: string;
  active: boolean;
  type: "permanent" | "event";
  event_end_at: Date | null;
}>): Promise<CasinoOffer | null> {
  const fields = Object.keys(data);
  if (!fields.length) return null;
  const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const vals = fields.map((k) => (data as any)[k]);
  const r = await pool.query<CasinoOffer>(
    `UPDATE discord_casino_offers SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...vals]
  );
  return r.rows[0] ?? null;
}

// ─── Dashboard embed ──────────────────────────────────────────────────────────

let dashboardChannelId: string | null = null;
let dashboardMessageId: string | null = null;

export async function ensureOfferDashboard(client: Client, ctx: BotCtx) {
  if (String(FABIO_GUILD_ID) !== String(FABIO_GUILD_ID)) return; // safety

  const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
  if (!guild) return;

  // Créer ou trouver le channel 〈⚙〉｜gestion-offres
  const channels = await guild.channels.fetch().catch(() => null);
  let ch = channels?.find(
    (c) => c?.parentId === FABIO_CAT_MODO_ID && c?.name?.includes("gestion-offres")
  );

  if (!ch) {
    ch = await guild.channels.create({
      name: "〈⚙〉｜gestion-offres",
      type: ChannelType.GuildText,
      parent: FABIO_CAT_MODO_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
        { id: FABIO_ROLE_MOD_ID, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        { id: FABIO_ROLE_CHEF_ID, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      ],
    }).catch((e) => {
      ctx.log(`[casino_offers] create channel failed: ${e?.message}`);
      return null;
    });
  }

  if (!ch) return;
  dashboardChannelId = ch.id;

  await refreshDashboard(client, ctx);
}

export async function refreshDashboard(client: Client, ctx: BotCtx) {
  if (!dashboardChannelId) return;
  try {
    const ch = await client.channels.fetch(dashboardChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    // Si on n'a pas l'ID en mémoire, chercher le message existant dans le channel
    if (!dashboardMessageId) {
      const fetched = await (ch as any).messages.fetch({ limit: 20 }).catch(() => null);
      if (fetched) {
        const existing = fetched.find(
          (m: any) =>
            m.author?.id === client.user?.id &&
            m.embeds?.[0]?.title === "⚙️ Gestion des Offres Casino"
        );
        if (existing) {
          dashboardMessageId = existing.id;
        }
      }
    }

    const offers = await getAllOffers(FABIO_GUILD_ID);
    const payload = buildDashboardPayload(offers);

    if (dashboardMessageId) {
      await (ch as any).messages.fetch(dashboardMessageId).then((m: any) =>
        m.edit(payload)
      ).catch(() => { dashboardMessageId = null; });
    }

    if (!dashboardMessageId) {
      const m = await (ch as any).send(payload);
      dashboardMessageId = m.id;
    }
  } catch (e: any) {
    ctx.log(`[casino_offers] dashboard refresh error: ${e?.message}`);
  }
}

function buildDashboardPayload(offers: CasinoOffer[]) {
  const lines = offers.map((o) => {
    const status = o.active ? "✅" : "❌";
    const typeTag = o.type === "event"
      ? ` — événement jusqu'au ${o.event_end_at ? fmtDate(o.event_end_at) : "?"}`
      : " — permanent";
    const reimb = o.reimburse_type === "wallet"
      ? `wallet ${o.crypto ?? "crypto"}`
      : "crédit casino";
    return `${status} **${o.label}** \`${o.casino}\`${typeTag}\n` +
      `   Dépôt min: **${o.min_deposit}€** → Remboursement: **${o.reimburse_amt}€** via ${reimb}`;
  });

  const description = offers.length
    ? lines.join("\n\n")
    : "*Aucune offre configurée. Clique sur ＋ Nouvelle offre pour commencer.*";

  return {
    embeds: [{
      title: "⚙️ Gestion des Offres Casino",
      description,
      color: 0x2F3136,
      footer: { text: "Les offres actives apparaissent dans le menu ticket utilisateur." },
      timestamp: new Date().toISOString(),
    }],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: CID_FABIO_OFFER_ADD, label: "＋ Nouvelle offre" },
          { type: 2, style: 1, custom_id: CID_FABIO_OFFER_EDIT, label: "✏️ Modifier" },
          { type: 2, style: 4, custom_id: CID_FABIO_OFFER_TOGGLE, label: "🔄 Activer / Désactiver" },
        ],
      },
      {
        type: 1,
        components: [
          { type: 2, style: 1, custom_id: CID_FABIO_OFFER_EVENT, label: "🎉 Lancer un événement" },
        ],
      },
    ],
  };
}

// ─── Modal builders ──────────────────────────────────────────────────────────

export function buildAddOfferModal() {
  return {
    title: "Nouvelle offre casino",
    custom_id: CID_FABIO_OFFER_ADD_MODAL,
    components: [
      { type: 1, components: [{ type: 4, custom_id: "casino", label: "Casino (ex: razed)", style: 1, required: true, max_length: 50 }] },
      { type: 1, components: [{ type: 4, custom_id: "label", label: "Nom affiché (ex: Offre Razed — Dépôt 50€)", style: 1, required: true, max_length: 100 }] },
      { type: 1, components: [{ type: 4, custom_id: "amounts", label: "Dépôt min / Remboursement (ex: 50/25)", style: 1, required: true, placeholder: "50/25", max_length: 20 }] },
      { type: 1, components: [{ type: 4, custom_id: "reimburse", label: "Remboursement: 'casino' ou 'wallet USDT'", style: 1, required: true, placeholder: "wallet USDT", max_length: 30 }] },
      { type: 1, components: [{ type: 4, custom_id: "description", label: "Description (optionnel)", style: 2, required: false, max_length: 500 }] },
    ],
  };
}

export function buildEventModal(offerId: string) {
  return {
    title: "Lancer un événement",
    custom_id: `${CID_FABIO_OFFER_EVENT_MODAL}${offerId}`,
    components: [
      { type: 1, components: [{ type: 4, custom_id: "duration_days", label: "Durée en jours (ex: 3)", style: 1, required: true, max_length: 3 }] },
      { type: 1, components: [{ type: 4, custom_id: "new_reimburse", label: "Nouveau remboursement (€, laisser vide = inchangé)", style: 1, required: false, max_length: 10 }] },
      { type: 1, components: [{ type: 4, custom_id: "announce_text", label: "Texte d'annonce (optionnel)", style: 2, required: false, max_length: 500 }] },
    ],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function parseAddOfferModal(fields: Record<string, string>): {
  casino: string; label: string; min_deposit: number; reimburse_amt: number;
  reimburse_type: "casino" | "wallet"; crypto: string | undefined; description: string | undefined;
} | { error: string } {
  const casino = fields.casino?.trim().toLowerCase().replace(/\s+/g, "-");
  const label = fields.label?.trim();
  const amountStr = fields.amounts?.trim();
  const reimburseStr = fields.reimburse?.trim().toLowerCase();
  const description = fields.description?.trim() || undefined;

  if (!casino || !label) return { error: "Casino et nom requis." };

  const parts = amountStr.split("/");
  const min_deposit = parseInt(parts[0]);
  const reimburse_amt = parseInt(parts[1]);
  if (isNaN(min_deposit) || isNaN(reimburse_amt)) return { error: "Format montants invalide. Ex: 50/25" };

  let reimburse_type: "casino" | "wallet" = "wallet";
  let crypto: string | undefined;
  if (reimburseStr === "casino") {
    reimburse_type = "casino";
  } else if (reimburseStr.startsWith("wallet")) {
    reimburse_type = "wallet";
    crypto = reimburseStr.split(" ")[1]?.toUpperCase() || "USDT";
  } else {
    return { error: "Format remboursement invalide. Ex: 'casino' ou 'wallet USDT'" };
  }

  return { casino, label, min_deposit, reimburse_amt, reimburse_type, crypto, description };
}
