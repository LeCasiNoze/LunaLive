// api/src/instagram_scheduler.ts
//
// Scheduler Instagram — publie automatiquement des Reels planifiés sur Instagram
// via Meta Graph API v19.0.
//
// Source des jobs : table publish_jobs (partagée avec lunaclip-local)
// Interval de polling : 60 secondes
// Concurrence : un seul job à la fois (running guard)
//
// Variables d'environnement requises :
//   INSTAGRAM_ACCESS_TOKEN  — token long-lived (60 jours)
//   INSTAGRAM_USER_ID       — ID numérique du compte Instagram Business

import { pool } from "./db.js";
import type { Pool } from "pg";
import { FABIO_STREAMER_SLUG, FABIO_NOTIF_CHANNEL_ID, FABIO_ROLE_NOTIF_INSTA } from "./discord/constants.js";

const LOG = "[INSTAGRAM SCHEDULER]";

// ─────────────────────────────────────────────────────────────────────────────

async function checkCollaborationTimeout(
  pool: Pool,
  jobId: number
): Promise<boolean> {
  const result = await pool.query(`
    SELECT collaboration_started_at, collaboration_timeout_sec
    FROM publish_jobs 
    WHERE id = $1 AND collaboration_status = 'pending'
  `, [jobId]);

  if (result.rows.length === 0) return false;

  const startedAt = new Date(result.rows[0].collaboration_started_at);
  const timeoutSec = result.rows[0].collaboration_timeout_sec || 1200;
  const timeoutMs = timeoutSec * 1000;

  return (Date.now() - startedAt.getTime()) > timeoutMs;
}

async function handleCollaborationTimeout(
  pool: Pool,
  job: PublishJob
): Promise<void> {
  console.log(`${LOG} [job #${job.id}] collaboration timeout, falling back to mention`);

  // Marquer la collaboration comme timeout
  await pool.query(`
    UPDATE publish_jobs 
    SET collaboration_status = 'timeout', 
        collaboration_error_msg = 'Collaboration timeout after 20 minutes'
    WHERE id = $1
  `, [job.id]);

  // Enregistrer dans la table des collaborations
  await pool.query(`
    UPDATE instagram_collaborations 
    SET status = 'timeout', 
        completed_at = NOW(),
        error_msg = 'Collaboration timeout after 20 minutes'
    WHERE publish_job_id = $1 AND status = 'pending'
  `, [job.id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Discord — envoyée après publication réussie d'un Reel
// ─────────────────────────────────────────────────────────────────────────────

const DISCORD_CHANNEL_ID   = process.env.DISCORD_INSTAGRAM_CHANNEL_ID  || "1467142269122383883";
const DISCORD_GLOBAL_ROLE  = process.env.DISCORD_GLOBAL_ROLE_ID         || "1468982992910155908";
const DISCORD_INSTA_ROLE   = process.env.DISCORD_INSTAGRAM_ROLE_ID      || "1468983120664723507";

async function sendReelPublishedNotification(opts: {
  permalink:    string;
  caption:      string;
  streamerSlug: string;
  thumbnailUrl: string | null;
  jobId:        number;
}): Promise<void> {
  const discordClient = (global as any).discordClient;
  if (!discordClient) {
    console.log(`${LOG} [job #${opts.jobId}] Discord client absent — notif skippée`);
    return;
  }

  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
    if (!channel || !(channel as any).isTextBased?.()) {
      console.log(`${LOG} [job #${opts.jobId}] Discord channel introuvable — notif skippée`);
      return;
    }

    const webBase = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.fr").replace(/\/$/, "");
    const streamerUrl = `${webBase}/s/${encodeURIComponent(opts.streamerSlug)}`;

    // Titre = première ligne de la caption, sans hashtags, max 100 chars
    const firstLine = opts.caption.split("\n")[0]
      .replace(/#\S+/g, "")
      .replace(/@\S+/g, "")
      .trim()
      .slice(0, 100) || "Nouveau Reel LunaLive";

    const embed: Record<string, any> = {
      author: {
        name: "LunaLive • Nouveau Reel Instagram",
        icon_url: `${webBase}/favicon.ico`,
      },
      title: firstLine,
      url: opts.permalink,
      description: `📺 **Streamer** : [${opts.streamerSlug}](${streamerUrl})`,
      color: 0xE4405F, // rose Instagram
      timestamp: new Date().toISOString(),
      footer: { text: "LunaLive", icon_url: `${webBase}/favicon.ico` },
    };

    if (opts.thumbnailUrl) {
      embed.image = { url: opts.thumbnailUrl };
    }

    const payload: Record<string, any> = {
      content: `<@&${DISCORD_GLOBAL_ROLE}> <@&${DISCORD_INSTA_ROLE}>`,
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "📸 Voir le Reel",    url: opts.permalink },
            { type: 2, style: 5, label: "📺 Voir le streamer", url: streamerUrl },
          ],
        },
      ],
    };

    await (channel as any).send(payload);
    console.log(`${LOG} [job #${opts.jobId}] ✅ Discord notif LunaLive envoyée — ${opts.permalink}`);

    // ─── Notif Fabiozsis si c'est son clip ────────────────────────────────────
    if (opts.streamerSlug.toLowerCase() === FABIO_STREAMER_SLUG) {
      try {
        const fabioChannel = await discordClient.channels.fetch(FABIO_NOTIF_CHANNEL_ID).catch(() => null);
        if (fabioChannel?.isTextBased?.()) {
          await (fabioChannel as any).send({
            content: `<@&${FABIO_ROLE_NOTIF_INSTA}>`,
            embeds: [{
              author: {
                name: "Fabiozsis • Nouveau Reel Instagram",
                icon_url: `${webBase}/favicon.ico`,
              },
              title: firstLine,
              url: opts.permalink,
              description: `Un nouveau clip vient d'être posté sur Instagram ! 📸`,
              color: 0xE4405F,
              ...(opts.thumbnailUrl ? { image: { url: opts.thumbnailUrl } } : {}),
              timestamp: new Date().toISOString(),
              footer: { text: "Instagram • Fabiozsis" },
            }],
            components: [{
              type: 1,
              components: [
                { type: 2, style: 5, label: "📸 Voir le Reel", url: opts.permalink },
                { type: 2, style: 5, label: "📺 LunaLive", url: streamerUrl },
              ],
            }],
            allowedMentions: { parse: ["roles"] },
          });
          console.log(`${LOG} [job #${opts.jobId}] ✅ Discord notif Fabiozsis envoyée`);
        }
      } catch (e2: any) {
        console.warn(`${LOG} [job #${opts.jobId}] Fabiozsis Discord notif failed: ${e2?.message}`);
      }
    }
  } catch (e: any) {
    console.error(`${LOG} [job #${opts.jobId}] ❌ Discord notif échouée: ${e?.message ?? e}`);
  }
}
const POLL_INTERVAL_MS = 60_000;

// Polling du container Meta — max 20 tentatives × 5s = 100s
const CONTAINER_POLL_MAX = 20;
const CONTAINER_POLL_DELAY_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers HTTP (Meta Graph API v19.0)
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function metaPost(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://graph.instagram.com/v19.0${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(
      `Meta API error [${data.error.code}]: ${data.error.message}`
    );
  }
  return data;
}

async function metaGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.instagram.com/v19.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(
      `Meta API error [${data.error.code}]: ${data.error.message}`
    );
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attente que le container Meta soit FINISHED
// ─────────────────────────────────────────────────────────────────────────────

async function waitForContainerFinished(
  creationId: string,
  accessToken: string,
  jobId: number
): Promise<void> {
  for (let attempt = 1; attempt <= CONTAINER_POLL_MAX; attempt++) {
    await sleep(CONTAINER_POLL_DELAY_MS);

    const data = await metaGet(`/${creationId}`, {
      fields: "status_code",
      access_token: accessToken,
    });

    const code = String(data.status_code ?? "");
    console.log(
      `${LOG} [job #${jobId}] container=${creationId} status=${code} (${attempt}/${CONTAINER_POLL_MAX})`
    );

    if (code === "FINISHED") return;
    if (code === "ERROR") throw new Error("Container processing failed (status=ERROR)");
    if (code === "EXPIRED") throw new Error("Container expired before publishing");
    // IN_PROGRESS → continue
  }

  throw new Error(
    `Container still IN_PROGRESS after ${(CONTAINER_POLL_MAX * CONTAINER_POLL_DELAY_MS) / 1000}s`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Traitement d'un job
// ─────────────────────────────────────────────────────────────────────────────

type PublishJob = {
  id: number;
  clip_id: number;
  edit_job_id: number;
  title: string | null;
  description: string | null;
  scheduled_at: Date;
  output_url: string;
  collaboration_username: string | null;
};

async function processJob(job: PublishJob, accessToken: string, userId: string): Promise<void> {
  console.log(
    `${LOG} [job #${job.id}] start — clip=${job.clip_id} scheduled_at=${job.scheduled_at.toISOString()} url=${job.output_url}`
  );

  // STEP 1 — Marquer le job en cours
  await pool.query(
    `UPDATE publish_jobs SET status = 'uploading', started_at = NOW() WHERE id = $1`,
    [job.id]
  );

  // STEP 2 — Créer le container Reel
  console.log(`${LOG} [job #${job.id}] creating container...`);

  // Récupérer le slug du clip et l'éventuel pseudo Instagram du streamer
  const slugForCaption = await pool.query(
    `SELECT ci.streamer_slug, sic.instagram_username
     FROM clip_inbox ci
     LEFT JOIN streamer_ig_config sic
       ON LOWER(sic.streamer_slug) = LOWER(ci.streamer_slug) AND sic.active = true
     WHERE ci.clip_id = $1
     LIMIT 1`,
    [job.clip_id]
  );
  const streamerSlugRaw     = String(slugForCaption.rows[0]?.streamer_slug ?? "");
  // Source canonique : snapshot figé par lunaclip-local à la création du job.
  // Fallback legacy : streamer_ig_config (jobs créés avant mig collaboration_username).
  const snapshotUsername    = String(job.collaboration_username ?? "").trim();
  const legacyUsername      = String(slugForCaption.rows[0]?.instagram_username ?? "").trim();
  const instagramUsername   = snapshotUsername || legacyUsername;
  if (snapshotUsername) {
    console.log(`${LOG} [job #${job.id}] collab_username source=snapshot @${snapshotUsername}`);
  } else if (legacyUsername) {
    console.log(`${LOG} [job #${job.id}] collab_username source=legacy_config @${legacyUsername}`);
  }

  // Logique de collaboration Instagram
  let caption = job.description ?? job.title ?? "";
  // ── Collaboration Instagram ──────────────────────────────────────────────────
  // Graph API v19 accepte des usernames bruts dans `collaborators` — pas besoin
  // de resolve. On tente l'invite directement ; si Meta refuse (handle invalide,
  // compte privé, non éligible), on retry sans collab + fallback @mention.
  // ─────────────────────────────────────────────────────────────────────────────

  const slugRegex = new RegExp(streamerSlugRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let collabSucceeded = false;

  if (instagramUsername && streamerSlugRaw) {
    await pool.query(`
      UPDATE publish_jobs
      SET collaboration_attempted = TRUE,
          collaboration_username = $2,
          collaboration_started_at = NOW(),
          collaboration_status = 'pending'
      WHERE id = $1
    `, [job.id, instagramUsername]);

    await pool.query(`
      INSERT INTO instagram_collaborations (publish_job_id, streamer_slug, instagram_username, status)
      VALUES ($1, $2, $3, 'pending')
      ON CONFLICT (publish_job_id) DO UPDATE SET status = 'pending', started_at = NOW()
    `, [job.id, streamerSlugRaw, instagramUsername]);
  }

  // ── Création du container ─────────────────────────────────────────────────
  let containerData: any;

  if (instagramUsername && streamerSlugRaw) {
    try {
      containerData = await metaPost(`/${userId}/media`, {
        video_url: job.output_url,
        media_type: "REELS",
        caption,
        share_to_feed: "true",
        collaborators: JSON.stringify([instagramUsername]),
        access_token: accessToken,
      });
      collabSucceeded = true;
      console.log(`${LOG} [job #${job.id}] container created WITH collab @${instagramUsername}`);
    } catch (e: any) {
      console.warn(`${LOG} [job #${job.id}] collab @${instagramUsername} rejected: ${e?.message} — retry without collab + @mention`);
      caption = caption.replace(slugRegex, `@${instagramUsername}`);

      await pool.query(`
        UPDATE publish_jobs SET collaboration_status = 'failed', collaboration_error_msg = $2 WHERE id = $1
      `, [job.id, e?.message ?? "collab container rejected"]);
      await pool.query(`
        UPDATE instagram_collaborations SET status = 'failed', error_msg = $2, completed_at = NOW() WHERE publish_job_id = $1
      `, [job.id, e?.message ?? "collab container rejected"]);
    }
  }

  if (!containerData) {
    containerData = await metaPost(`/${userId}/media`, {
      video_url: job.output_url,
      media_type: "REELS",
      caption,
      share_to_feed: "true",
      access_token: accessToken,
    });
    if (instagramUsername) {
      console.log(`${LOG} [job #${job.id}] container created with @mention fallback`);
    } else {
      console.log(`${LOG} [job #${job.id}] container created without collab (no username)`);
    }
  }

  const creationId = String(containerData.id);
  console.log(`${LOG} [job #${job.id}] container created — creation_id=${creationId}`);

  // STEP 3 — Attendre que le container soit FINISHED
  console.log(
    `${LOG} [job #${job.id}] waiting for container (max ${(CONTAINER_POLL_MAX * CONTAINER_POLL_DELAY_MS) / 1000}s)...`
  );
  await waitForContainerFinished(creationId, accessToken, job.id);
  console.log(`${LOG} [job #${job.id}] container FINISHED`);

  // STEP 4 — Publier
  console.log(`${LOG} [job #${job.id}] publishing...`);
  const publishData = await metaPost(`/${userId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken,
  });

  const containerId = String(publishData.id);
  console.log(`${LOG} [job #${job.id}] published — container_id=${containerId}`);

  // STEP 4b — Récupérer le vrai media_id du post publié
  // publishData.id est le container_id, pas le media_id final
  const mediaListData = await metaGet(`/${userId}/media`, {
    fields: "id,timestamp",
    limit: "1",
    access_token: accessToken,
  });
  const mediaId = String(mediaListData?.data?.[0]?.id ?? containerId);
  console.log(`${LOG} [job #${job.id}] real media_id=${mediaId}`);

  // STEP 5 — Récupérer le permalink + thumbnail
  const permalinkData = await metaGet(`/${mediaId}`, {
    fields: "permalink,thumbnail_url",
    access_token: accessToken,
  });

  const permalink    = String(permalinkData.permalink     ?? "");
  const thumbnailUrl = String(permalinkData.thumbnail_url ?? "") || null;
  console.log(`${LOG} [job #${job.id}] permalink=${permalink}`);

  // STEP 6 — Marquer done dans la DB
  await pool.query(
    `UPDATE publish_jobs
     SET status = 'done', finished_at = NOW(), platform_url = $2, platform_id = $3
     WHERE id = $1`,
    [job.id, permalink, mediaId]
  );

  // Mettre à jour le statut de collaboration si invitation envoyée
  if (collabSucceeded) {
    // L'invitation a été envoyée avec le container — statut "invited" (en attente d'acceptation)
    await pool.query(`
      UPDATE publish_jobs SET collaboration_status = 'invited', collaboration_media_id = $2 WHERE id = $1
    `, [job.id, mediaId]);
    await pool.query(`
      UPDATE instagram_collaborations SET status = 'invited', media_id = $2, permalink = $3 WHERE publish_job_id = $1
    `, [job.id, mediaId, permalink]);
    console.log(`${LOG} [job #${job.id}] collab invitation sent to @${instagramUsername} — awaiting acceptance in IG app`);
  }

  await pool.query(
    `UPDATE clip_inbox
     SET instagram_status = 'instagram_posted', updated_at = NOW()
     WHERE clip_id = $1`,
    [job.clip_id]
  );

  // STEP 6b — Enregistrer le post pour monitoring des commentaires (72h)
  const slugRow = await pool.query(
    `SELECT streamer_slug FROM clip_inbox WHERE clip_id = $1 LIMIT 1`,
    [job.clip_id]
  );
  const streamerSlug = String(slugRow.rows[0]?.streamer_slug ?? "");

  if (streamerSlug) {
    await pool.query(
      `INSERT INTO ig_comment_tracking (publish_job_id, clip_id, streamer_slug, media_id, track_until)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '72 hours')
       ON CONFLICT DO NOTHING`,
      [job.id, job.clip_id, streamerSlug, mediaId]
    );
    console.log(`${LOG} [job #${job.id}] comment tracking registered — slug=${streamerSlug} media=${mediaId}`);
  }

  // STEP 7 — Notification Discord
  await sendReelPublishedNotification({
    permalink,
    caption,
    streamerSlug: streamerSlug || streamerSlugRaw,
    thumbnailUrl,
    jobId: job.id,
  });

  console.log(`${LOG} [job #${job.id}] done ✓ — ${permalink}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick principal — interroge la DB et traite les jobs en attente
// ─────────────────────────────────────────────────────────────────────────────

async function tick(accessToken: string, userId: string): Promise<void> {
  // 1. Vérifier les timeouts de collaboration en attente
  const timeoutJobs = await pool.query(`
    SELECT pj.id, pj.clip_id, pj.edit_job_id, pj.title, pj.description, pj.scheduled_at,
           ej.output_url,
           pj.collaboration_username
    FROM   publish_jobs pj
    JOIN   edit_jobs ej ON ej.id = pj.edit_job_id
    WHERE  pj.platform = 'instagram'
      AND  pj.collaboration_status = 'pending'
      AND  pj.collaboration_started_at IS NOT NULL
      AND  pj.collaboration_started_at < NOW() - COALESCE(pj.collaboration_timeout_sec, 1200) * INTERVAL '1 second'
  `);

  for (const job of timeoutJobs.rows) {
    try {
      await handleCollaborationTimeout(pool, job as PublishJob);
    } catch (e: any) {
      console.error(`${LOG} [job #${job.id}] timeout handling failed:`, e?.message ?? e);
    }
  }

  // 2. Traiter les jobs scheduled normaux
  const { rows } = await pool.query<PublishJob>(`
    SELECT pj.id, pj.clip_id, pj.edit_job_id, pj.title, pj.description, pj.scheduled_at,
           ej.output_url,
           pj.collaboration_username
    FROM   publish_jobs pj
    JOIN   edit_jobs ej ON ej.id = pj.edit_job_id
    WHERE  pj.platform      = 'instagram'
      AND  pj.status        = 'scheduled'
      AND  pj.scheduled_at <= NOW()
    ORDER BY pj.scheduled_at ASC
  `);

  if (rows.length === 0) return;

  console.log(`${LOG} tick — ${rows.length} job(s) à traiter`);

  // Traitement séquentiel — un seul job à la fois
  for (const job of rows) {
    try {
      await processJob(job, accessToken, userId);
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      console.error(`${LOG} [job #${job.id}] FAILED — ${msg}`);

      try {
        await pool.query(
          `UPDATE publish_jobs
           SET status = 'error', error_msg = $2, finished_at = NOW()
           WHERE id = $1`,
          [job.id, msg]
        );
      } catch (dbErr: any) {
        console.error(
          `${LOG} [job #${job.id}] could not write error to DB:`,
          dbErr?.message ?? dbErr
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée — démarre le poller
// ─────────────────────────────────────────────────────────────────────────────

export function startInstagramScheduler(): void {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const userId = process.env.INSTAGRAM_USER_ID ?? "";

  if (!accessToken || !userId) {
    console.log(
      `${LOG} skipped — INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set`
    );
    return;
  }

  let running = false;

  const safeTick = async () => {
    if (running) return; // Évite tout chevauchement d'exécution
    running = true;
    try {
      await tick(accessToken, userId);
    } catch (e: any) {
      console.error(`${LOG} tick error: ${e?.message ?? e}`);
    } finally {
      running = false;
    }
  };

  // Délai avant le premier tick — laisse le temps aux migrations de se terminer
  setTimeout(
    () => safeTick().catch((e) => console.error(`${LOG} first tick failed:`, e)),
    10_000
  );

  const id = setInterval(
    () => safeTick().catch((e) => console.error(`${LOG} tick failed:`, e)),
    POLL_INTERVAL_MS
  );
  (id as any).unref?.(); // Ne pas bloquer l'arrêt du process

  console.log(`${LOG} started — polling every ${POLL_INTERVAL_MS / 1000}s`);
}
