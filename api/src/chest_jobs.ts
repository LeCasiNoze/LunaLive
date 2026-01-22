// api/src/chest_jobs.ts
import type { Server as IOServer } from "socket.io";
import { pool } from "./db.js";

const OUT_WEIGHT_BP = 2000; // 0.20
const BUCKET_MINUTES = 5;

const PREMIUM_VIEWERS_FACTOR = 0.20;  // +20% par premium
const PREMIUM_VIEWERS_CAP_PCT = 0.30; // cap +30% du total viewers sur la fenêtre

// ✅ NEW: boost passive chest si streamer sub (sans impacter le bonus premium viewers)
const STREAMER_SUB_MULT = 1.5; // +50% (ex: 1.25 pour +25%)

/**
 * Règle de génération par tranche de spectateurs
 * Toutes les 5 minutes, selon le nombre moyen de viewers actifs
 */
function viewersToRubis(viewers: number): number {
  if (viewers <= 0) return 0;
  if (viewers <= 10) return 2;
  if (viewers <= 20) return 3;
  if (viewers <= 30) return 4;
  if (viewers <= 40) return 5;
  if (viewers <= 50) return 6;
  return 6 + Math.floor((viewers - 50) / 10); // +1 par tranche de 10
}

async function ensureChest(client: any, streamerId: number) {
  await client.query(
    `INSERT INTO streamer_chests (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

function roundDown(n: number) {
  const x = Math.floor(Number(n || 0));
  return Number.isFinite(x) ? x : 0;
}

async function autoMintTick() {
  // borne supérieure : minute pleine précédente
  const toTsRes = await pool.query(
    `SELECT (date_trunc('minute', NOW()) - INTERVAL '1 minute') AS t`
  );
  const toTs = toTsRes.rows?.[0]?.t ? new Date(toTsRes.rows[0].t).toISOString() : null;
  if (!toTs) return;

  // ✅ on récupère aussi user_id pour savoir si le streamer est abonné "streamer"
  const live = await pool.query(
    `SELECT id, user_id AS "userId"
     FROM streamers
     WHERE is_live=TRUE`
  );

  for (const row of live.rows || []) {
    const streamerId = Number(row.id);
    const streamerUserId = Number(row.userId || 0);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await ensureChest(client, streamerId);

      const st = await client.query(
        `SELECT last_bucket_ts AS "lastBucketTs"
         FROM streamer_chest_auto_state
         WHERE streamer_id=$1
         FOR UPDATE`,
        [streamerId]
      );

      // init state
      if (!st.rows?.[0]) {
        await client.query(
          `INSERT INTO streamer_chest_auto_state (streamer_id, last_bucket_ts, carry_minutes)
           VALUES ($1, $2::timestamptz, 0)
           ON CONFLICT (streamer_id) DO NOTHING`,
          [streamerId, toTs]
        );
        await client.query("COMMIT");
        continue;
      }

      const lastBucketTs = st.rows[0].lastBucketTs
        ? new Date(st.rows[0].lastBucketTs).toISOString()
        : null;

      // rien de nouveau
      if (lastBucketTs && new Date(toTs).getTime() <= new Date(lastBucketTs).getTime()) {
        await client.query("COMMIT");
        continue;
      }

      /**
       * On compte le nombre de viewers distincts
       * ayant été présents AU MOINS une minute
       * dans la fenêtre [lastBucketTs ; toTs]
       */
      const viewersRes = await client.query(
        `SELECT COUNT(DISTINCT viewer_key)::int AS n
         FROM stream_viewer_minutes
         WHERE streamer_id=$1
           AND bucket_ts > COALESCE($2::timestamptz, '1970-01-01'::timestamptz)
           AND bucket_ts <= $3::timestamptz`,
        [streamerId, lastBucketTs, toTs]
      );

      const viewers = Number(viewersRes.rows?.[0]?.n || 0);

      // ✅ Premium viewers présents dans la fenêtre (uniquement viewer_key "u:<id>")
      const premiumRes = await client.query(
        `
        WITH u AS (
          SELECT DISTINCT substring(viewer_key from 3)::bigint AS user_id
          FROM stream_viewer_minutes
          WHERE streamer_id=$1
            AND viewer_key LIKE 'u:%'
            AND bucket_ts > COALESCE($2::timestamptz, '1970-01-01'::timestamptz)
            AND bucket_ts <= $3::timestamptz
        )
        SELECT COUNT(*)::int AS n
        FROM u
        JOIN user_subscriptions us ON us.user_id = u.user_id
        WHERE us.plan_code = 'viewer'
          AND us.status IN ('active','trialing')
          AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
        `,
        [streamerId, lastBucketTs, toTs]
      );

      const premiumViewers = Number(premiumRes.rows?.[0]?.n || 0);

      // ✅ boost safe (cap)
      const extra = Math.min(premiumViewers * PREMIUM_VIEWERS_FACTOR, viewers * PREMIUM_VIEWERS_CAP_PCT);
      const effectiveViewers = Math.floor(viewers + extra);

      // ✅ NEW: streamer sub actif ?
      let streamerSubActive = false;
      if (streamerUserId > 0) {
        const ss = await client.query(
          `
          SELECT 1
          FROM user_subscriptions us
          WHERE us.user_id=$1
            AND us.plan_code='streamer'
            AND us.status IN ('active','trialing')
            AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
          LIMIT 1
          `,
          [streamerUserId]
        );
        streamerSubActive = !!ss.rows?.[0];
      }

      /**
       * ✅ Règle demandée:
       * - base = viewersToRubis(viewers)
       * - premium delta = viewersToRubis(effectiveViewers) - base
       * - streamerSub boost = +50% sur la BASE uniquement
       * => total = floor(base * mult) + premiumDelta
       */
      const baseMinted = viewersToRubis(viewers);
      const mintedWithPremium = viewersToRubis(effectiveViewers);
      const premiumDelta = Math.max(0, mintedWithPremium - baseMinted);

      const boostedBase = streamerSubActive ? roundDown(baseMinted * STREAMER_SUB_MULT) : baseMinted;
      const minted = Math.max(0, boostedBase + premiumDelta);

      await client.query(
        `UPDATE streamer_chest_auto_state
         SET last_bucket_ts=$2::timestamptz,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamerId, toTs]
      );

      if (minted > 0) {
        await client.query(
          `INSERT INTO streamer_chest_lots (streamer_id, origin, weight_bp, amount_remaining, meta)
           VALUES ($1, 'chest_auto', $2, $3, $4::jsonb)`,
          [
            streamerId,
            OUT_WEIGHT_BP,
            minted,
            JSON.stringify({
              rule: "viewers_per_5min",
              bucketMinutes: BUCKET_MINUTES,
              toTs,

              viewers,
              premiumViewers,
              effectiveViewers,
              premiumFactor: PREMIUM_VIEWERS_FACTOR,
              premiumCapPct: PREMIUM_VIEWERS_CAP_PCT,

              streamerSubActive,
              streamerSubMult: STREAMER_SUB_MULT,

              baseMinted,
              premiumDelta,
              boostedBase,
              minted,
            }),
          ]
        );

        await client.query(
          `UPDATE streamer_chests SET updated_at=NOW() WHERE streamer_id=$1`,
          [streamerId]
        );
      }

      await client.query("COMMIT");
    } catch {
      try {
        await client.query("ROLLBACK");
      } catch {}
    } finally {
      client.release();
    }
  }
}

async function closeExpiredOpenings(io?: IOServer) {
  const r = await pool.query(
    `SELECT o.id, s.slug
     FROM streamer_chest_openings o
     JOIN streamers s ON s.id=o.streamer_id
     WHERE o.status='open'
       AND o.closes_at <= NOW()
     ORDER BY o.closes_at ASC
     LIMIT 10`
  );

  if (!(r.rows || []).length) return;

  const mod = await import("./routes/chest.js");
  const closeFn = (mod as any).closeOpeningAndPayout as (
    openingId: number,
    closedBy: "auto"
  ) => Promise<any>;
  if (typeof closeFn !== "function") return;

  for (const row of r.rows || []) {
    const openingId = Number(row.id);
    const slug = String(row.slug);

    try {
      const result = await closeFn(openingId, "auto");
      io?.emit?.("chest:close", {
        slug,
        openingId: String(openingId),
        payoutsCount: (result?.payouts || []).length,
        auto: true,
      });
    } catch {}
  }
}

export function startChestJobs(io?: IOServer) {
  // fermeture auto
  setInterval(() => closeExpiredOpenings(io).catch(() => {}), 5_000);

  // génération coffre toutes les minutes
  autoMintTick().catch(() => {});
  setInterval(() => autoMintTick().catch(() => {}), 60_000);
}
