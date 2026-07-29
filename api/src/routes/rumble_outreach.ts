import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";
import { RUMBLE_OUTREACH_SEED } from "../data/rumble_outreach_seed.js";
import { renderLunaLiveEmail } from "../utils/lunalive_email.js";

export const rumbleOutreachRouter = Router();
rumbleOutreachRouter.use("/fsb/rumble-outreach", requireAuth, requireFsbAccess);

const STATUSES = [
  "new", "ready", "drafted", "contacted", "replied",
  "interested", "onboarded", "declined", "do_not_contact", "skipped",
] as const;
const CHANNELS = ["instagram", "telegram", "email", "discord", "twitter", "rumble"] as const;
type OutreachChannel = (typeof CHANNELS)[number];

const PRESENTATION_URL = "https://lunalive.win/devenir-streamer";
const BLOCKED_SLUGS = new Set(["cyberslots", "mistercasino"]);

function initialChannel(item: (typeof RUMBLE_OUTREACH_SEED)[number]): OutreachChannel {
  if (item.email) return "email";
  if (item.instagram) return "instagram";
  if (item.telegram) return "telegram";
  if (item.discord) return "discord";
  if (item.twitter) return "twitter";
  return "rumble";
}

function buildDraft(displayName: string, channel: OutreachChannel) {
  const name = String(displayName || "").trim() || "toi";
  const subject = "Une idée pour donner plus de portée à tes lives";

  if (channel === "rumble") {
    return {
      subject: null,
      message: `Salut ${name}, petite question hors live : je développe LunaLive, une plateforme française pensée pour réunir les streamers casino et leur communauté. Je pense que ton univers correspond vraiment au projet. Si tu veux regarder tranquillement après le live, tout est résumé ici : ${PRESENTATION_URL}`,
    };
  }

  const intro =
    channel === "email"
      ? `Salut ${name},\n\nJe suis tombé sur tes lives Rumble et je pense sincèrement que ton univers aurait sa place sur LunaLive.`
      : `Salut ${name},\n\nPetite question : est ce que ça t’intéresserait d’avoir un espace à ton nom qui rassemble ton live, ton chat et des animations pour ta communauté ?`;

  return {
    subject: channel === "email" ? subject : null,
    message: `${intro}\n\nJe m’appelle Lucas et je développe LunaLive, une plateforme française dédiée aux lives casino. L’idée n’est pas de changer ta façon de streamer. On te propose une page à ton image, un chat enrichi, des animations communautaires et davantage de visibilité auprès d’un public déjà intéressé par ce contenu.\n\nJ’ai préparé une page très courte qui présente le projet : ${PRESENTATION_URL}\n\nSi le concept te parle, je serais ravi d’échanger quelques minutes avec toi et de te montrer concrètement ce qu’on pourrait mettre en place pour ta chaîne.\n\nLucas`,
  };
}

let seedPromise: Promise<void> | null = null;

export async function ensureRumbleOutreachSeeded() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of RUMBLE_OUTREACH_SEED) {
        await client.query(
          `INSERT INTO rumble_outreach_contacts
             (slug, display_name, rumble_url, followers, instagram_handle, instagram_confidence,
              telegram_handle, telegram_url, email, twitter_handle, discord_url, website_url,
              about, source_data, investigated_at)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
           ON CONFLICT (slug) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             rumble_url = EXCLUDED.rumble_url,
             followers = EXCLUDED.followers,
             instagram_handle = COALESCE(rumble_outreach_contacts.instagram_handle, EXCLUDED.instagram_handle),
             instagram_confidence = COALESCE(rumble_outreach_contacts.instagram_confidence, EXCLUDED.instagram_confidence),
             telegram_handle = COALESCE(rumble_outreach_contacts.telegram_handle, EXCLUDED.telegram_handle),
             telegram_url = COALESCE(rumble_outreach_contacts.telegram_url, EXCLUDED.telegram_url),
             email = COALESCE(rumble_outreach_contacts.email, EXCLUDED.email),
             twitter_handle = COALESCE(rumble_outreach_contacts.twitter_handle, EXCLUDED.twitter_handle),
             discord_url = COALESCE(rumble_outreach_contacts.discord_url, EXCLUDED.discord_url),
             website_url = COALESCE(rumble_outreach_contacts.website_url, EXCLUDED.website_url),
             about = COALESCE(EXCLUDED.about, rumble_outreach_contacts.about),
             source_data = EXCLUDED.source_data,
             investigated_at = EXCLUDED.investigated_at,
             updated_at = NOW()`,
          [
            item.slug,
            item.displayName,
            item.rumbleUrl,
            item.followers,
            item.instagram,
            item.instagramConfidence,
            item.telegram,
            item.telegramUrl,
            item.email,
            item.twitter,
            item.discord,
            item.website,
            item.about,
            JSON.stringify(item.sources || []),
            item.investigatedAt || null,
          ]
        );

        if (!BLOCKED_SLUGS.has(item.slug.toLowerCase())) {
          const channel = initialChannel(item);
          const draft = buildDraft(item.displayName, channel);
          await client.query(
            `UPDATE rumble_outreach_contacts
             SET preferred_channel=COALESCE(preferred_channel, $2),
                 draft_subject=COALESCE(draft_subject, $3),
                 draft_message=COALESCE(draft_message, $4),
                 status=CASE WHEN status='new' AND draft_message IS NULL THEN 'drafted' ELSE status END,
                 updated_at=NOW()
             WHERE lower(slug)=lower($1)`,
            [item.slug, channel, draft.subject, draft.message]
          );
        }
      }
      await client.query(
        `UPDATE rumble_outreach_contacts
         SET status='do_not_contact',
             preferred_channel=NULL,
             draft_subject=NULL,
             draft_message=NULL,
             notes='Exclu de LunaLive. Ne pas contacter et ne pas onboarder.',
             updated_at=NOW()
         WHERE lower(slug)=ANY($1::text[])`,
        [Array.from(BLOCKED_SLUGS)]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      seedPromise = null;
      throw error;
    } finally {
      client.release();
    }
  })();
  return seedPromise;
}

function mapRow(row: any) {
  return {
    id: Number(row.id),
    slug: row.slug,
    displayName: row.display_name,
    rumbleUrl: row.rumble_url,
    followers: Number(row.followers || 0),
    instagram: row.instagram_handle,
    instagramConfidence: row.instagram_confidence,
    telegram: row.telegram_handle,
    telegramUrl: row.telegram_url,
    email: row.email,
    twitter: row.twitter_handle,
    discord: row.discord_url,
    website: row.website_url,
    about: row.about,
    sources: Array.isArray(row.source_data) ? row.source_data : [],
    investigatedAt: row.investigated_at ? new Date(row.investigated_at).toISOString() : null,
    status: row.status,
    preferredChannel: row.preferred_channel,
    draftSubject: row.draft_subject,
    draftMessage: row.draft_message,
    notes: row.notes,
    contactedAt: row.contacted_at ? new Date(row.contacted_at).toISOString() : null,
    nextFollowUpAt: row.next_follow_up_at ? new Date(row.next_follow_up_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

rumbleOutreachRouter.get(
  "/fsb/rumble-outreach",
  a(async (_req, res) => {
    await ensureRumbleOutreachSeeded();
    const result = await pool.query(
      `SELECT *
       FROM rumble_outreach_contacts
       ORDER BY
         CASE status
           WHEN 'interested' THEN 0
           WHEN 'replied' THEN 1
           WHEN 'ready' THEN 2
           WHEN 'new' THEN 3
           WHEN 'drafted' THEN 4
           ELSE 5
         END,
         followers DESC,
         slug ASC`
    );
    const contacts = result.rows.map(mapRow);
    res.json({
      ok: true,
      contacts,
      stats: {
        total: contacts.length,
        instagram: contacts.filter((x) => !!x.instagram).length,
        telegram: contacts.filter((x) => !!x.telegram).length,
        email: contacts.filter((x) => !!x.email).length,
        ready: contacts.filter((x) => ["ready", "drafted"].includes(x.status)).length,
        contacted: contacts.filter((x) => !!x.contactedAt || ["contacted", "replied", "interested", "onboarded"].includes(x.status)).length,
      },
    });
  })
);

rumbleOutreachRouter.get(
  "/fsb/rumble-outreach/:id/email-preview",
  a(async (req, res) => {
    await ensureRumbleOutreachSeeded();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "invalid_id" });
    const result = await pool.query(
      `SELECT display_name, draft_subject, draft_message, status
       FROM rumble_outreach_contacts
       WHERE id=$1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    if (row.status === "do_not_contact") return res.status(409).json({ ok: false, error: "contact_blocked" });

    const message = String(row.draft_message || "").trim();
    const paragraphs = message
      ? message.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
      : ["Le brouillon est encore vide."];
    const html = renderLunaLiveEmail({
      preheader: String(row.draft_subject || "Une invitation à découvrir LunaLive"),
      eyebrow: "INVITATION STREAMER",
      title: String(row.draft_subject || "Une idée pour ta communauté"),
      paragraphs,
      action: { label: "Découvrir LunaLive", url: PRESENTATION_URL },
      footer: "Ce message est une prise de contact personnelle de l’équipe LunaLive.",
    });
    res.json({ ok: true, html });
  })
);

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  instagram: z.string().trim().max(120).nullable().optional(),
  instagramConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  telegram: z.string().trim().max(120).nullable().optional(),
  telegramUrl: z.string().trim().max(500).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  twitter: z.string().trim().max(120).nullable().optional(),
  discord: z.string().trim().max(500).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  preferredChannel: z.enum(CHANNELS).nullable().optional(),
  draftSubject: z.string().max(240).nullable().optional(),
  draftMessage: z.string().max(10_000).nullable().optional(),
  notes: z.string().max(5_000).nullable().optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

rumbleOutreachRouter.patch(
  "/fsb/rumble-outreach/:id",
  a(async (req, res) => {
    await ensureRumbleOutreachSeeded();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "invalid_id" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_payload", detail: parsed.error.flatten() });
    }

    const before = await pool.query(`SELECT status, slug FROM rumble_outreach_contacts WHERE id=$1`, [id]);
    if (!before.rowCount) return res.status(404).json({ ok: false, error: "not_found" });

    const data = parsed.data;
    if (BLOCKED_SLUGS.has(String(before.rows[0].slug).toLowerCase()) && data.status !== "do_not_contact") {
      return res.status(409).json({ ok: false, error: "contact_blocked" });
    }
    const fields: string[] = [];
    const values: any[] = [];
    const add = (column: string, value: any) => {
      values.push(value);
      fields.push(`${column}=$${values.length}`);
    };
    if ("displayName" in data) add("display_name", data.displayName);
    if ("instagram" in data) add("instagram_handle", data.instagram || null);
    if ("instagramConfidence" in data) add("instagram_confidence", data.instagramConfidence || null);
    if ("telegram" in data) add("telegram_handle", data.telegram || null);
    if ("telegramUrl" in data) add("telegram_url", data.telegramUrl || null);
    if ("email" in data) add("email", data.email || null);
    if ("twitter" in data) add("twitter_handle", data.twitter || null);
    if ("discord" in data) add("discord_url", data.discord || null);
    if ("website" in data) add("website_url", data.website || null);
    if ("status" in data) add("status", data.status);
    if ("preferredChannel" in data) add("preferred_channel", data.preferredChannel || null);
    if ("draftSubject" in data) add("draft_subject", data.draftSubject || null);
    if ("draftMessage" in data) add("draft_message", data.draftMessage || null);
    if ("notes" in data) add("notes", data.notes || null);
    if ("contactedAt" in data) add("contacted_at", data.contactedAt ? new Date(data.contactedAt) : null);
    if ("nextFollowUpAt" in data) add("next_follow_up_at", data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null);
    if (!fields.length) return res.status(400).json({ ok: false, error: "empty_patch" });
    values.push(id);
    const updated = await pool.query(
      `UPDATE rumble_outreach_contacts
       SET ${fields.join(", ")}, updated_at=NOW()
       WHERE id=$${values.length}
       RETURNING *`,
      values
    );

    if (data.status && data.status !== before.rows[0].status) {
      await pool.query(
        `INSERT INTO rumble_outreach_activity(contact_id, kind, channel, detail, created_by)
         VALUES ($1, 'status_changed', $2, $3, $4)`,
        [
          id,
          data.preferredChannel || null,
          `${before.rows[0].status} -> ${data.status}`,
          Number((req as any).user?.id || 0) || null,
        ]
      );
    }
    res.json({ ok: true, contact: mapRow(updated.rows[0]) });
  })
);

const activitySchema = z.object({
  kind: z.enum(["note", "opened", "copied", "contacted", "reply", "follow_up"]),
  channel: z.enum(CHANNELS).nullable().optional(),
  detail: z.string().trim().max(2_000).nullable().optional(),
});

rumbleOutreachRouter.post(
  "/fsb/rumble-outreach/:id/activity",
  a(async (req, res) => {
    await ensureRumbleOutreachSeeded();
    const id = Number(req.params.id);
    const parsed = activitySchema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    const out = await pool.query(
      `INSERT INTO rumble_outreach_activity(contact_id, kind, channel, detail, created_by)
       SELECT $1,$2,$3,$4,$5
       WHERE EXISTS (SELECT 1 FROM rumble_outreach_contacts WHERE id=$1)
       RETURNING id, created_at`,
      [
        id,
        parsed.data.kind,
        parsed.data.channel || null,
        parsed.data.detail || null,
        Number((req as any).user?.id || 0) || null,
      ]
    );
    if (!out.rowCount) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, id: Number(out.rows[0].id), createdAt: new Date(out.rows[0].created_at).toISOString() });
  })
);
