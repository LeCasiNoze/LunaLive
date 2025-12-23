import { pool } from "./db.js";
import type { Server as IOServer } from "socket.io";

const OUT_WEIGHT_BP = 2000; // 0.20
const RULE_MINUTES = 5;
const RULE_RUBIS = 3;

async function ensureChest(client: any, streamerId: number) {
  await client.query(
    `INSERT INTO streamer_chests (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

async function autoMintTick() {
  // on crédite uniquement des minutes "finies" => up to (now rounded) - 1 minute
  const toTsRes = await pool.query(`SELECT (date_trunc('minute', NOW()) - INTERVAL '1 minute') AS t`);
  const toTs = toTsRes.rows?.[0]?.t ? new Date(toTsRes.rows[0].t).toISOString() : null;
  if (!toTs) return;

  const live = await pool.query(
    `SELECT id
     FROM streamers
     WHERE is_live=TRUE`
  );

  for (const row of live.rows || []) {
    const streamerId = Number(row.id);
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

      const lastBucketTs = st.rows?.[0]?.lastBucketTs ? new Date(st.rows[0].lastBucketTs).toISOString() : null;
      const carry = Number(st.rows?.[0]?.carryMinutes || 0);

      // init state if missing
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

      // nothing new
      if (lastBucketTs && new Date(toTs).getTime() <= new Date(lastBucketTs).getTime()) {
        await client.query("COMMIT");
        continue;
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM stream_viewer_minutes
         WHERE streamer_id=$1
           AND bucket_ts > COALESCE($2::timestamptz, '1970-01-01'::timestamptz)
           AND bucket_ts <= $3::timestamptz`,
        [streamerId, lastBucketTs, toTs]
      );

      const newMinutes = Number(countRes.rows?.[0]?.n || 0);
      const totalMinutes = carry + newMinutes;

      const minted = Math.floor(totalMinutes / RULE_MINUTES) * RULE_RUBIS;
      const newCarry = totalMinutes % RULE_MINUTES;

      await client.query(
        `UPDATE streamer_chest_auto_state
         SET last_bucket_ts=$2::timestamptz,
             carry_minutes=$3,
             updated_at=NOW()
         WHERE streamer_id=$1`,
        [streamerId, toTs, newCarry]
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
              rule: { minutes: RULE_MINUTES, rubis: RULE_RUBIS },
              fromToBucket: { toTs },
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
  // prend une liste d'openings expirés (petites batch)
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

  // import dynamique pour éviter circular deps
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
  // auto-close rapide
  setInterval(() => closeExpiredOpenings(io).catch(() => {}), 5_000);

  // auto-mint par minute
  autoMintTick().catch(() => {});
  setInterval(() => autoMintTick().catch(() => {}), 60_000);
}
