// api/src/routes/admin_subscriptions.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";

export const adminSubscriptionsRouter = Router();
adminSubscriptionsRouter.use(requireAdminKey);

type PlanCode = "viewer" | "streamer";

function normPlan(x: any): PlanCode | null {
  const p = String(x || "").toLowerCase().trim();
  if (p === "viewer" || p === "streamer") return p;
  return null;
}

function toInt(v: any, def: number) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : def;
}

/**
 * GET /admin/subscriptions?status=active|all&q=&limit=&offset=
 * - status=active => uniquement actifs (status active/trialing + period_end > now OR null)
 * - q => filtre username ILIKE / id
 */
adminSubscriptionsRouter.get("/", async (req: any, res: any) => {
  try {
    const status = String(req.query?.status || "active").toLowerCase();
    const qRaw = String(req.query?.q || "").trim();
    const limit = Math.min(300, Math.max(1, toInt(req.query?.limit, 120)));
    const offset = Math.max(0, toInt(req.query?.offset, 0));

    const qIsId = /^\d+$/.test(qRaw);
    const qUserId = qIsId ? Number(qRaw) : 0;
    const qLike = qRaw ? `%${qRaw}%` : null;

    const onlyActive = status !== "all";

    const where: string[] = [];
    const params: any[] = [];

    if (onlyActive) {
      where.push(`(s.status IN ('active','trialing'))`);
      where.push(`(s.current_period_end IS NULL OR s.current_period_end > NOW())`);
    }

    if (qRaw) {
      if (qIsId) {
        params.push(qUserId);
        where.push(`s.user_id = $${params.length}`);
      } else {
        params.push(qLike);
        where.push(`u.username ILIKE $${params.length}`);
      }
    }

    params.push(limit);
    const pLimit = `$${params.length}`;
    params.push(offset);
    const pOffset = `$${params.length}`;

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await pool.query(
      `
      SELECT
        s.id,
        s.user_id AS "userId",
        u.username AS "username",
        s.plan_code AS "planCode",
        s.provider,
        s.provider_subscription_id AS "providerSubscriptionId",
        s.status,
        s.current_period_start AS "currentPeriodStart",
        s.current_period_end AS "currentPeriodEnd",
        s.cancel_at_period_end AS "cancelAtPeriodEnd",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        COUNT(*) OVER()::int AS "total"
      FROM user_subscriptions s
      JOIN users u ON u.id = s.user_id
      ${whereSql}
      ORDER BY
        (CASE WHEN s.status IN ('active','trialing') THEN 0 ELSE 1 END),
        s.current_period_end DESC NULLS LAST,
        s.created_at DESC
      LIMIT ${pLimit} OFFSET ${pOffset}
      `,
      params
    );

    const items = r.rows || [];
    const total = items?.[0]?.total ?? 0;

    return res.json({ ok: true, total, items });
  } catch (e: any) {
    console.error("[admin/subscriptions] list error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /admin/subscriptions/grant
 * body: { userId, planCode, days? }
 * => upsert (provider=manual) + set active + period start/end
 */
adminSubscriptionsRouter.post("/grant", async (req: any, res: any) => {
  try {
    const userId = toInt(req.body?.userId, 0);
    const planCode = normPlan(req.body?.planCode);
    const days = Math.min(3650, Math.max(1, toInt(req.body?.days, 30)));

    if (!userId || !planCode) return res.status(400).json({ ok: false, error: "bad_request" });

    // check user exists
    const u = await pool.query(`SELECT id FROM users WHERE id=$1 LIMIT 1`, [userId]);
    if (!u.rows?.[0]) return res.status(404).json({ ok: false, error: "user_not_found" });

    const now = new Date();
    const end = new Date(Date.now() + days * 24 * 3600 * 1000);

    const provider = "manual";
    const providerSubscriptionId = `manual:${userId}:${planCode}`;

    const r = await pool.query(
      `
      INSERT INTO user_subscriptions (
        user_id, plan_code, provider, provider_subscription_id,
        status, current_period_start, current_period_end, cancel_at_period_end,
        created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,'active',$5,$6,false,NOW(),NOW())
      ON CONFLICT (user_id, plan_code) DO UPDATE
        SET provider=EXCLUDED.provider,
            provider_subscription_id=EXCLUDED.provider_subscription_id,
            status='active',
            current_period_start=EXCLUDED.current_period_start,
            current_period_end=EXCLUDED.current_period_end,
            cancel_at_period_end=false,
            updated_at=NOW()
      RETURNING
        id,
        user_id AS "userId",
        plan_code AS "planCode",
        provider,
        provider_subscription_id AS "providerSubscriptionId",
        status,
        current_period_start AS "currentPeriodStart",
        current_period_end AS "currentPeriodEnd",
        cancel_at_period_end AS "cancelAtPeriodEnd",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      `,
      [userId, planCode, provider, providerSubscriptionId, now.toISOString(), end.toISOString()]
    );

    return res.json({ ok: true, sub: r.rows?.[0] ?? null });
  } catch (e: any) {
    console.error("[admin/subscriptions] grant error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * POST /admin/subscriptions/cancel
 * body: { userId, planCode }
 * => status=canceled + end=now
 */
adminSubscriptionsRouter.post("/cancel", async (req: any, res: any) => {
  try {
    const userId = toInt(req.body?.userId, 0);
    const planCode = normPlan(req.body?.planCode);

    if (!userId || !planCode) return res.status(400).json({ ok: false, error: "bad_request" });

    const r = await pool.query(
      `
      UPDATE user_subscriptions
      SET status='canceled',
          cancel_at_period_end=false,
          current_period_end=NOW(),
          updated_at=NOW()
      WHERE user_id=$1 AND plan_code=$2
      RETURNING id
      `,
      [userId, planCode]
    );

    return res.json({ ok: true, updated: (r.rowCount || 0) });
  } catch (e: any) {
    console.error("[admin/subscriptions] cancel error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
