// api/src/chest_jobs.ts
import type { Server as IOServer } from "socket.io";
import { pool } from "./db.js";

const OUT_WEIGHT_BP = 2000; // 0.20
const BUCKET_MINUTES = 5;

const PREMIUM_VIEWERS_FACTOR = 0.20; // +20% par premium
const PREMIUM_VIEWERS_CAP_PCT = 0.30; // cap +30% du total viewers sur la fenêtre

// boost passive chest si streamer sub (sans impacter le bonus premium viewers)
const STREAMER_SUB_MULT = 1.5; // +50% (ex: 1.25 pour +25%)

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
  const toTsRes = await pool.query(`SELECT (date_trunc('minute', NOW()) - INTERVAL '1 minute') AS t`);
  const toTsRaw = toTsRes.rows?.[0]?.t ? new Date(toTsRes.rows[0].t) : null;
  if (!toTsRaw) return;

  const toTsIso = toTsRaw.toISOString();

  // streamers live + user_id (pour sub streamer)
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
        `SELECT last_bucket_ts AS "lastBucketTs", carry_minutes AS "carryMinutes"
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
          [streamerId, toTsIso]
        );
        await client.query("COMMIT");
        continue;
      }

      const lastBucketTsIso = st.rows[0].lastBucketTs ? new Date(st.rows[0].lastBucketTs).toISOString() : null;
      const carryMinutes = Number(st.rows[0].carryMinutes || 0);

      // rien de nouveau
      if (lastBucketTsIso && new Date(toTsIso).getTime() <= new Date(lastBucketTsIso).getTime()) {
        await client.query("COMMIT");
        continue;
      }

      // minutes écoulées depuis le dernier bucket (borné pour éviter gros gap / explosion)
      const lastMs = lastBucketTsIso ? new Date(lastBucketTsIso).getTime() : 0;
      const toMs = new Date(toTsIso).getTime();
      const diffMinRaw = lastMs > 0 ? Math.floor((toMs - lastMs) / 60_000) : 0;
      const diffMin = Math.max(0, Math.min(60, diffMinRaw)); // cap 60 min par tick (sécurité)

      if (diffMin <= 0) {
        await client.query(
          `UPDATE streamer_chest_auto_state
           SET last_bucket_ts=$2::timestamptz, updated_at=NOW()
           WHERE streamer_id=$1`,
          [streamerId, toTsIso]
        );
        await client.query("COMMIT");
        continue;
      }

      // cumule
      const totalCarry = carryMinutes + diffMin;

      // on ne mint que par paquets de 5 minutes
      const bucketsToMint = Math.floor(totalCarry / BUCKET_MINUTES);
      const remainingCarry = totalCarry - bucketsToMint * BUCKET_MINUTES;

      // pas encore 5 minutes -> juste avancer l'état
      if (bucketsToMint <= 0) {
        await client.query(
          `UPDATE streamer_chest_auto_state
           SET last_bucket_ts=$2::timestamptz,
               carry_minutes=$3,
               updated_at=NOW()
           WHERE streamer_id=$1`,
          [streamerId, toTsIso, remainingCarry]
        );
        await client.query("COMMIT");
        continue;
      }

      // fenêtre de calcul = [windowFrom ; windowTo] = BUCKET_MINUTES * bucketsToMint
      const windowMinutes = bucketsToMint * BUCKET_MINUTES;
      const windowToIso = toTsIso;
      const windowFromIso = new Date(toMs - windowMinutes * 60_000).toISOString();

      /**
       * Viewers distinct ayant été présents AU MOINS une minute dans la fenêtre.
       * (Option A = on conserve ta logique actuelle, mais on corrige la cadence)
       */
      const viewersRes = await client.query(
        `SELECT COUNT(DISTINCT viewer_key)::int AS n
         FROM stream_viewer_minutes
         WHERE streamer_id=$1
           AND bucket_ts > $2::timestamptz
           AND bucket_ts <= $3::timestamptz`,
        [streamerId, windowFromIso, windowToIso]
      );
      const viewers = Number(viewersRes.rows?.[0]?.n || 0);

      // Premium viewers présents dans la fenêtre (uniquement viewer_key "u:<id>")
      const premiumRes = await client.query(
        `
        WITH u AS (
          SELECT DISTINCT substring(viewer_key from 3)::bigint AS user_id
          FROM stream_viewer_minutes
          WHERE streamer_id=$1
            AND viewer_key LIKE 'u:%'
            AND bucket_ts > $2::timestamptz
            AND bucket_ts <= $3::timestamptz
        )
        SELECT COUNT(*)::int AS n
        FROM u
        JOIN user_subscriptions us ON us.user_id = u.user_id
        WHERE us.plan_code = 'viewer'
          AND us.status IN ('active','trialing')
          AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
        `,
        [streamerId, windowFromIso, windowToIso]
      );
      const premiumViewers = Number(premiumRes.rows?.[0]?.n || 0);

      // boost safe (cap)
      const extra = Math.min(premiumViewers * PREMIUM_VIEWERS_FACTOR, viewers * PREMIUM_VIEWERS_CAP_PCT);
      const effectiveViewers = Math.floor(viewers + extra);

      // streamer sub actif ?
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
       * Règle:
       * - base = viewersToRubis(viewers)
       * - premium delta = viewersToRubis(effectiveViewers) - base
       * - streamerSub boost = +50% sur la BASE uniquement
       * => mintedPerBucket = floor(base * mult) + premiumDelta
       * => mintedTotal = mintedPerBucket * bucketsToMint
       */
      const baseMinted = viewersToRubis(viewers);
      const mintedWithPremium = viewersToRubis(effectiveViewers);
      const premiumDelta = Math.max(0, mintedWithPremium - baseMinted);

      const boostedBase = streamerSubActive ? roundDown(baseMinted * STREAMER_SUB_MULT) : baseMinted;
      const mintedPerBucket = Math.max(0, boostedBase + premiumDelta);
      const minted = Math.max(0, mintedPerBucket * bucketsToMint);

      // update state : on avance à toTs (borne minute), et on conserve le reste
      await client.query(
        `UPDATE streamer_chest_auto_state
         SET last_bucket_ts=$2::timestamptz,
             carry_minutes=$3,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamerId, toTsIso, remainingCarry]
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

              // fenêtre réellement utilisée
              windowFrom: windowFromIso,
              windowTo: windowToIso,
              bucketsToMint,
              windowMinutes,
              toTs: toTsIso,

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
              mintedPerBucket,
              minted,
            }),
          ]
        );

        await client.query(`UPDATE streamer_chests SET updated_at=NOW() WHERE streamer_id=$1`, [streamerId]);
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
  const closeFn = (mod as any).closeOpeningAndPayout as (openingId: number, closedBy: "auto") => Promise<any>;
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

  // tick chaque minute, mais mint uniquement par paquets de BUCKET_MINUTES
  autoMintTick().catch(() => {});
  setInterval(() => autoMintTick().catch(() => {}), 60_000);
}
