// api/src/routes/chest.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth, tryGetAuthUser } from "../auth.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";
import { weightBp } from "../economy.js";
import { emitSpecialCard, emitChatLine, emitChatAll } from "../socket_emit.js";

const MAX_OUT_WEIGHT_BP = 2000; // 0.20
const HEARTBEAT_TTL_SECONDS = 45;

// Front: 2 min + min watch 5
const DEFAULT_DURATION_SEC = 120;
const DEFAULT_MIN_WATCH_MIN = 5;

// fenêtre de watchtime (évite "à vie" + reste robuste aux relances)
const WATCH_WINDOW_HOURS = 6;

type AuthedReq = any;

function int(x: any, def = 0) {
  const n = Number.parseInt(String(x ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;

  const r = await pool.query(
    `SELECT id, slug, user_id AS "userId", is_live AS "isLive"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );

  return r.rows?.[0] || null;
}

async function ensureChest(client: any, streamerId: number) {
  await client.query(
    `INSERT INTO streamer_chests (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

async function touchChest(client: any, streamerId: number) {
  // best-effort
  try {
    await client.query(`UPDATE streamer_chests SET updated_at=NOW() WHERE streamer_id=$1`, [streamerId]);
  } catch {}
}

async function getChestBalance(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT COALESCE(SUM(amount_remaining),0)::int AS balance
     FROM streamer_chest_lots
     WHERE streamer_id=$1`,
    [streamerId]
  );
  return Number(r.rows?.[0]?.balance || 0);
}

async function getChestBreakdown(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT weight_bp, COALESCE(SUM(amount_remaining),0)::int AS amount
     FROM streamer_chest_lots
     WHERE streamer_id=$1
     GROUP BY weight_bp
     ORDER BY weight_bp DESC`,
    [streamerId]
  );
  const out: Record<string, number> = {};
  for (const row of r.rows || []) out[String(row.weight_bp)] = Number(row.amount || 0);
  return out;
}

async function getOpenOpening(client: any, streamerId: number) {
  const r = await client.query(
    `SELECT id, status, opens_at AS "opensAt", closes_at AS "closesAt", min_watch_minutes AS "minWatchMinutes"
     FROM streamer_chest_openings
     WHERE streamer_id=$1 AND status='open'
     ORDER BY id DESC
     LIMIT 1`,
    [streamerId]
  );
  return r.rows?.[0] || null;
}

async function getParticipantsCount(client: any, openingId: number) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM streamer_chest_participants
     WHERE opening_id=$1`,
    [openingId]
  );
  return Number(r.rows?.[0]?.n || 0);
}

async function hasJoined(client: any, openingId: number, userId: number) {
  const r = await client.query(
    `SELECT 1
     FROM streamer_chest_participants
     WHERE opening_id=$1 AND user_id=$2
     LIMIT 1`,
    [openingId, userId]
  );
  return !!r.rows?.[0];
}

/**
 * Présence récente : on se base sur viewer_sessions, mais en filtrant par streamer_id
 * (plus robuste que live_session_id).
 */
async function hasRecentHeartbeatByStreamer(client: any, streamerId: number, viewerKey: string) {
  const r = await client.query(
    `SELECT 1
     FROM viewer_sessions
     WHERE streamer_id=$1
       AND viewer_key=$2
       AND ended_at IS NULL
       AND last_heartbeat_at >= (NOW() - ($3::int * INTERVAL '1 second'))
     LIMIT 1`,
    [streamerId, viewerKey, HEARTBEAT_TTL_SECONDS]
  );
  return !!r.rows?.[0];
}

/**
 * Watchtime minutes : on compte les lignes minute-based dans une fenêtre récente.
 * Source de vérité cohérente avec chest_jobs.ts (qui utilise stream_viewer_minutes).
 */
async function getWatchedMinutesByStreamer(client: any, streamerId: number, viewerKey: string) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM stream_viewer_minutes
     WHERE streamer_id=$1
       AND viewer_key=$2
       AND bucket_ts >= (NOW() - ($3::int * INTERVAL '1 hour'))`,
    [streamerId, viewerKey, WATCH_WINDOW_HOURS]
  );
  return Number(r.rows?.[0]?.n || 0);
}

/* =========================
   PAYOUT — VERSION SÉCURISÉE
   ========================= */
async function closeOpeningAndPayout(openingId: number, closedBy: "streamer" | "auto") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const o = await client.query(
      `SELECT id, streamer_id AS "streamerId", status
       FROM streamer_chest_openings
       WHERE id=$1
       FOR UPDATE`,
      [openingId]
    );
    const opening = o.rows?.[0];
    if (!opening) throw new Error("opening_not_found");

    if (opening.status !== "open") {
      await client.query("COMMIT");
      return { alreadyClosed: true, payouts: [] };
    }

    const streamerId = Number(opening.streamerId);

    // lock lots
    const lotsRes = await client.query(
      `SELECT id, weight_bp AS "weightBp", amount_remaining AS "amountRemaining"
       FROM streamer_chest_lots
       WHERE streamer_id=$1 AND amount_remaining > 0
       ORDER BY weight_bp DESC, created_at ASC, id ASC
       FOR UPDATE`,
      [streamerId]
    );

    const lots = lotsRes.rows.map((l: any) => ({
      id: Number(l.id),
      weightBp: Number(l.weightBp),
      remaining: Number(l.amountRemaining),
    }));

    const total = lots.reduce((s, l) => s + l.remaining, 0);

    // participants
    const parts = await client.query(
      `SELECT user_id AS "userId"
       FROM streamer_chest_participants
       WHERE opening_id=$1
       ORDER BY joined_at ASC`,
      [openingId]
    );
    const users = parts.rows.map((r: any) => Number(r.userId));

    // 0 participant => on ferme l'opening (sinon boucle job), mais on garde le chest
    if (!users.length) {
      await client.query(
        `UPDATE streamer_chest_openings
         SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
         WHERE id=$1`,
        [openingId, JSON.stringify({ closedBy, reason: "no_participants" })]
      );
      await client.query("COMMIT");
      return { alreadyClosed: false, payouts: [] };
    }

    // si rien à distribuer => on ferme
    if (total <= 0) {
      await client.query(
        `UPDATE streamer_chest_openings
         SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
         WHERE id=$1`,
        [openingId, JSON.stringify({ closedBy, reason: "empty_chest" })]
      );
      await client.query("COMMIT");
      return { alreadyClosed: false, payouts: [] };
    }

    // =========================
    // ✅ PAYOUT PONDÉRÉ (premium + activité) avec cap 1.35
    // =========================
    const PREMIUM_MULT = 1.15;          // premium viewer => +15%
    const ACTIVITY_MAX_BONUS = 0.20;    // activité => +20% max
    const ACTIVITY_FULL_MIN = 30;       // 30 minutes (dans la fenêtre) => bonus max
    const SCORE_CAP = 1.35;

    // ---- premium flags (batch)
    const premRes = await client.query(
      `
      SELECT DISTINCT user_id::bigint AS user_id
      FROM user_subscriptions
      WHERE user_id = ANY($1::int[])
        AND plan_code = 'viewer'
        AND status IN ('active','trialing')
        AND (current_period_end IS NULL OR current_period_end > NOW())
      `,
      [users]
    );
    const premiumSet = new Set<number>((premRes.rows || []).map((r: any) => Number(r.user_id)));

    // ---- activité (watch minutes dans la fenêtre récente)
    // viewer_key attendu: "u:<id>" (si absent, activité = 1)
    const keys = users.map((id) => `u:${id}`);

    const actRes = await client.query(
      `
      SELECT viewer_key, COUNT(*)::int AS n
      FROM stream_viewer_minutes
      WHERE streamer_id = $1
        AND viewer_key = ANY($2::text[])
        AND bucket_ts >= (NOW() - ($3::int * INTERVAL '1 hour'))
      GROUP BY viewer_key
      `,
      [streamerId, keys, WATCH_WINDOW_HOURS]
    );

    const watchedByUser = new Map<number, number>();
    for (const row of actRes.rows || []) {
      const vk = String(row.viewer_key || "");
      const m = vk.match(/^u:(\d+)$/);
      if (!m) continue;
      const uid = Number(m[1]);
      watchedByUser.set(uid, Number(row.n || 0));
    }

    // ---- scores
    const scoreByUser = new Map<number, number>();
    let sumScore = 0;

    for (const userId of users) {
      const watchedMin = watchedByUser.get(userId) ?? 0;

      // activité: 1 -> 1.2 max
      const t = Math.max(0, Math.min(1, watchedMin / ACTIVITY_FULL_MIN));
      const activityMult = 1 + t * ACTIVITY_MAX_BONUS;

      const premMult = premiumSet.has(userId) ? PREMIUM_MULT : 1;
      let score = 1 * activityMult * premMult;

      if (score > SCORE_CAP) score = SCORE_CAP;
      if (score < 0) score = 0;

      scoreByUser.set(userId, score);
      sumScore += score;
    }

    // fallback si bug (évite division 0)
    if (!(sumScore > 0)) {
      sumScore = users.length;
      for (const userId of users) scoreByUser.set(userId, 1);
    }

    // ---- allocation proportionnelle + rest via "largest remainder"
    type Alloc = { userId: number; floor: number; frac: number };

    const allocs: Alloc[] = [];
    let used = 0;

    for (const userId of users) {
      const s = scoreByUser.get(userId) ?? 1;
      const raw = (total * s) / sumScore;
      const f = Math.floor(raw);
      const frac = raw - f;

      allocs.push({ userId, floor: f, frac });
      used += f;
    }

    let remaining = total - used;

    // distribue les restants aux plus grosses fractions (shuffle pour départager les égalités)
    allocs.sort((a, b) => (b.frac - a.frac) || (Math.random() - 0.5));

    for (let i = 0; i < allocs.length && remaining > 0; i++) {
      allocs[i].floor += 1;
      remaining -= 1;
    }

    // ---- payouts effectifs
    const payouts: Array<{ userId: number; amount: number }> = [];

    for (const a of allocs) {
      const gain = Number(a.floor || 0);
      if (gain <= 0) continue;

      await earnRubisTx(client, a.userId, "chest_streamer", gain, {
        weight_bp: MAX_OUT_WEIGHT_BP,
        streamerId,
        openingId,
        closedBy,
        premiumViewer: premiumSet.has(a.userId),
        watchedMinutes: watchedByUser.get(a.userId) ?? 0,
        score: scoreByUser.get(a.userId) ?? 1,
      });

      payouts.push({ userId: a.userId, amount: gain });
    }

    // le coffre est consommé entièrement
    await client.query(`DELETE FROM streamer_chest_lots WHERE streamer_id=$1`, [streamerId]);
    await touchChest(client, streamerId);

    await client.query(
      `UPDATE streamer_chest_openings
       SET status='closed', closed_at=NOW(), meta = meta || $2::jsonb
       WHERE id=$1`,
      [openingId, JSON.stringify({ closedBy })]
    );

    await client.query("COMMIT");
    return { alreadyClosed: false, payouts };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const chestRouter = Router();
export { closeOpeningAndPayout };

/* =========================
   GET chest state (public + optional auth)
   ========================= */
chestRouter.get("/streamers/:slug/chest", async (req: any, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const client = await pool.connect();
    try {
      await ensureChest(client, Number(streamer.id));

      const balance = await getChestBalance(client, Number(streamer.id));
      const breakdown = await getChestBreakdown(client, Number(streamer.id));
      const opening = await getOpenOpening(client, Number(streamer.id));

      let openingOut: any = null;

      if (opening) {
        const participantsCount = await getParticipantsCount(client, Number(opening.id));

        // joined (best effort)
        let joined = false;
        try {
          const au = tryGetAuthUser?.(req);
          if (au?.id) joined = await hasJoined(client, Number(opening.id), Number(au.id));
        } catch {}

        openingOut = {
          id: String(opening.id),
          status: "open",
          opensAt: opening.opensAt,
          closesAt: opening.closesAt,
          minWatchMinutes: Number(opening.minWatchMinutes || DEFAULT_MIN_WATCH_MIN),
          participantsCount,
          joined,
        };
      }

      return res.json({
        ok: true,
        streamerId: Number(streamer.id),
        capOutWeightBp: MAX_OUT_WEIGHT_BP,
        balance,
        breakdown,
        opening: openingOut,
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

chestRouter.post("/streamers/:slug/chest/open", requireAuth, async (req: any, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.user?.id || 0);
    if (!userId || userId !== Number(streamer.userId)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    if (!streamer.isLive) return res.status(400).json({ ok: false, error: "stream_offline" });

    const durationSec = clamp(int(req.body?.durationSec, DEFAULT_DURATION_SEC), 10, 600);
    const minWatchMinutes = clamp(int(req.body?.minWatchMinutes, DEFAULT_MIN_WATCH_MIN), 0, 60);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureChest(client, Number(streamer.id));

      const existing = await getOpenOpening(client, Number(streamer.id));
      if (existing) {
        await client.query("COMMIT");
        return res.json({
          ok: true,
          opening: {
            id: String(existing.id),
            opensAt: existing.opensAt,
            closesAt: existing.closesAt,
            minWatchMinutes: Number(existing.minWatchMinutes || DEFAULT_MIN_WATCH_MIN),
          },
        });
      }

      const opensAt = new Date();
      const closesAt = new Date(Date.now() + durationSec * 1000);

      const ins = await client.query(
        `INSERT INTO streamer_chest_openings(
          streamer_id,
          created_by_user_id,
          status,
          opens_at,
          closes_at,
          min_watch_minutes,
          meta
        )
        VALUES ($1,$2,'open',$3,$4,$5,$6::jsonb)
        RETURNING id`,
        [
          Number(streamer.id),
          userId,
          opensAt,
          closesAt,
          minWatchMinutes,
          JSON.stringify({ openedBy: userId }),
        ]
      );

      await client.query("COMMIT");

      // Carte v2 "coffre" dans le chat (auto-fermeture au décompte côté back).
      const openingId = String(ins.rows?.[0]?.id || "");
      emitSpecialCard(req.app?.locals?.io, streamer.slug, "chest", {
        round: openingId,
        durationSec,
        real: true,
      });

      return res.json({
        ok: true,
        opening: {
          id: openingId,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          minWatchMinutes,
        },
      });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

chestRouter.post("/streamers/:slug/chest/join", requireAuth, async (req: any, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    if (userId === Number(streamer.userId)) {
      return res.status(400).json({ ok: false, error: "owner_forbidden" });
    }

    const client = await pool.connect();
    try {
      const opening = await getOpenOpening(client, Number(streamer.id));
      if (!opening) return res.status(400).json({ ok: false, error: "no_opening" });

      const closesAtMs = opening.closesAt ? new Date(opening.closesAt).getTime() : 0;
      if (closesAtMs && Date.now() > closesAtMs) {
        return res.status(400).json({ ok: false, error: "opening_closed" });
      }

      const viewerKey = `u:${userId}`;

      // présence récente (TTL)
      const hb = await hasRecentHeartbeatByStreamer(client, Number(streamer.id), viewerKey);
      if (!hb) return res.status(400).json({ ok: false, error: "not_watching" });

      // watchtime minutes (fenêtre récente)
      const watchedMinutes = await getWatchedMinutesByStreamer(client, Number(streamer.id), viewerKey);
      const minWatchMinutes = Number(opening.minWatchMinutes || DEFAULT_MIN_WATCH_MIN);

      if (watchedMinutes < minWatchMinutes) {
        return res.status(400).json({
          ok: false,
          error: "need_watchtime",
          watchedMinutes,
          minWatchMinutes,
        });
      }

      await client.query(
        `INSERT INTO streamer_chest_participants(opening_id, user_id, joined_at)
        VALUES ($1,$2,NOW())
        ON CONFLICT (opening_id, user_id) DO NOTHING`,
        [Number(opening.id), userId]
      );

      // État partagé : compteur + message système diffusés à tous.
      try {
        const io = req.app?.locals?.io;
        const cntRes = await client.query(
          `SELECT COUNT(*)::int AS n FROM streamer_chest_participants WHERE opening_id=$1`,
          [Number(opening.id)]
        );
        const count = Number(cntRes.rows?.[0]?.n ?? 0);
        const uname = String(req.user?.username || "Quelqu'un");
        emitChatAll(io, streamer.slug, "act:chest", { round: String(opening.id), count });
        emitChatLine(io, streamer.slug, "sys", `📦 <b>${uname}</b> a rejoint le coffre`);
      } catch {}

      return res.json({ ok: true, openingId: String(opening.id) });
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

chestRouter.post("/streamers/:slug/chest/deposit", requireAuth, async (req: any, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.user?.id || 0);
    if (!userId || userId !== Number(streamer.userId)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const amount = int(req.body?.amount, 0);
    if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "bad_amount" });

    const note = req.body?.note != null ? String(req.body.note).slice(0, 140) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureChest(client, Number(streamer.id));

      /**
       * ✅ IMPORTANT: spendKind="sink" => consomme les lots au poids le plus bas en priorité
       * (exactement ce que tu veux pour un dépôt au coffre).
       */
      const spend = await spendRubisTx(client, {
        userId,
        amount,
        spendKind: "sink",
        spendType: "chest_deposit",
        streamerId: Number(streamer.id),
        meta: { streamerId: Number(streamer.id), note },
      });

      // origin -> weight -> lots chest
      const byWeight: Record<string, number> = {};
      for (const [origin, n] of Object.entries(spend.breakdown || {})) {
        const w = weightBp(origin); // bp
        const k = String(w);
        byWeight[k] = (byWeight[k] ?? 0) + Number(n || 0);
      }

      const lotMeta = { depositedBy: userId, note, spendType: "chest_deposit" };

      for (const [wStr, n] of Object.entries(byWeight)) {
        const w = int(wStr, 0);
        const nn = int(n, 0);
        if (nn <= 0) continue;

        await client.query(
          `INSERT INTO streamer_chest_lots(streamer_id, origin, weight_bp, amount_remaining, meta)
           VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [Number(streamer.id), "chest_deposit", w, nn, JSON.stringify(lotMeta)]
        );
      }

      await touchChest(client, Number(streamer.id));

      const balance = await getChestBalance(client, Number(streamer.id));
      await client.query("COMMIT");

      // UI attend txId string
      const txId = `chestdep_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

      return res.json({ ok: true, txId, balance });
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      const msg = String(e?.message || e);
      if (msg === "insufficient_rubis") return res.status(400).json({ ok: false, error: "insufficient_funds" });
      return res.status(400).json({ ok: false, error: msg });
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// optionnel : évite un 404 car api.ts a chestClose()
chestRouter.post("/streamers/:slug/chest/close", requireAuth, async (req: any, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.user?.id || 0);
    if (!userId || userId !== Number(streamer.userId)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const client = await pool.connect();
    try {
      const opening = await getOpenOpening(client, Number(streamer.id));
      if (!opening) return res.status(400).json({ ok: false, error: "no_opening" });

      const out = await closeOpeningAndPayout(Number(opening.id), "streamer");

      // Clôture + recap partagés.
      try {
        const io = req.app?.locals?.io;
        const n = Array.isArray(out.payouts) ? out.payouts.length : 0;
        emitChatAll(io, streamer.slug, "act:chest", { round: String(opening.id), resolved: true });
        emitChatLine(io, streamer.slug, "recap", `📦 Coffre distribué à <b>${n || 1}</b> participant(s) 🎁`);
      } catch {}

      return res.json({ ok: true, openingId: String(opening.id), payouts: out.payouts ?? [] });
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});
