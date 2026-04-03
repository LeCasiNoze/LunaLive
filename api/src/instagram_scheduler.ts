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

const LOG = "[INSTAGRAM SCHEDULER]";
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
  const res = await fetch(`https://graph.facebook.com/v19.0${path}`, {
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
  const url = new URL(`https://graph.facebook.com/v19.0${path}`);
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
  const containerData = await metaPost(`/${userId}/media`, {
    video_url: job.output_url,
    media_type: "REELS",
    caption: job.description ?? job.title ?? "",
    share_to_feed: "true",
    access_token: accessToken,
  });

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

  const mediaId = String(publishData.id);
  console.log(`${LOG} [job #${job.id}] published — media_id=${mediaId}`);

  // STEP 5 — Récupérer le permalink
  const permalinkData = await metaGet(`/${mediaId}`, {
    fields: "permalink",
    access_token: accessToken,
  });

  const permalink = String(permalinkData.permalink ?? "");
  console.log(`${LOG} [job #${job.id}] permalink=${permalink}`);

  // STEP 6 — Marquer done dans la DB
  await pool.query(
    `UPDATE publish_jobs
     SET status = 'done', finished_at = NOW(), platform_url = $2, platform_id = $3
     WHERE id = $1`,
    [job.id, permalink, mediaId]
  );

  await pool.query(
    `UPDATE clip_inbox
     SET instagram_status = 'instagram_posted', updated_at = NOW()
     WHERE clip_id = $1`,
    [job.clip_id]
  );

  console.log(`${LOG} [job #${job.id}] done ✓ — ${permalink}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick principal — interroge la DB et traite les jobs en attente
// ─────────────────────────────────────────────────────────────────────────────

async function tick(accessToken: string, userId: string): Promise<void> {
  const { rows } = await pool.query<PublishJob>(`
    SELECT pj.id, pj.clip_id, pj.edit_job_id, pj.title, pj.description, pj.scheduled_at,
           ej.output_url
    FROM   publish_jobs pj
    JOIN   edit_jobs ej ON ej.id = pj.edit_job_id
    WHERE  pj.platform      = 'instagram'
      AND  pj.status        = 'scheduled'
      AND  pj.scheduled_at <= NOW()
    ORDER BY pj.scheduled_at ASC
  `);

  console.log(`${LOG} tick — ${rows.length} job(s) found (scheduled & due)`);

  if (rows.length === 0) return;

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
