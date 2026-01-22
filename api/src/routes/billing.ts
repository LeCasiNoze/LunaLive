// api/src/routes/billing.ts
import express, { Router } from "express";
import Stripe from "stripe";
import { pool } from "../db.js";
import { requireAuth, type AuthUser } from "../auth.js";
import { a } from "../utils/async.js";

// ⚠️ RÈGLE RUBIS: crédit UNIQUEMENT via earnRubisTx (PoolClient)
import { earnRubisTx } from "../wallet_engine.js";

const FRONT_URL = process.env.FRONT_URL || "http://localhost:5173";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const PRICE_VIEWER = process.env.STRIPE_PRICE_VIEWER || "";
const PRICE_STREAMER = process.env.STRIPE_PRICE_STREAMER || "";

if (!STRIPE_SECRET_KEY) console.warn("[billing] STRIPE_SECRET_KEY missing");
if (!STRIPE_WEBHOOK_SECRET) console.warn("[billing] STRIPE_WEBHOOK_SECRET missing");
if (!PRICE_VIEWER) console.warn("[billing] STRIPE_PRICE_VIEWER missing");
if (!PRICE_STREAMER) console.warn("[billing] STRIPE_PRICE_STREAMER missing");

// note: tu peux mettre "2025-12-15.clover" si ton compte est sur cette version.
// Le SDK accepte une string.
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover" as any,
});

type PlanCode = "viewer" | "streamer";
function isPlan(x: any): x is PlanCode {
  return x === "viewer" || x === "streamer";
}
function isStreamerRole(role?: string) {
  const r = String(role || "").toLowerCase();
  return r === "streamer" || r.includes("streamer");
}
function priceIdFor(plan: PlanCode) {
  return plan === "viewer" ? PRICE_VIEWER : PRICE_STREAMER;
}

function getSubItemPeriod(sub: Stripe.Subscription) {
  const it = sub.items?.data?.[0] as any;
  const start = Number(it?.current_period_start || 0) || null;
  const end = Number(it?.current_period_end || 0) || null;
  return { start, end };
}

async function getOrCreateCustomerId(u: AuthUser): Promise<string> {
  const r = await pool.query(`SELECT stripe_customer_id FROM users WHERE id=$1`, [u.id]);
  const existing = (r.rows[0]?.stripe_customer_id as string | null) || null;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    metadata: { user_id: String(u.id) },
  });

  await pool.query(`UPDATE users SET stripe_customer_id=$1 WHERE id=$2`, [customer.id, u.id]);
  return customer.id;
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription, plan: PlanCode, userId: number) {
  const { start, end } = getSubItemPeriod(sub);

  await pool.query(
    `
    INSERT INTO user_subscriptions (
      user_id, plan_code, provider, provider_subscription_id,
      status, current_period_start, current_period_end, cancel_at_period_end,
      updated_at
    )
    VALUES (
      $1,$2,'stripe',$3,$4,
      CASE WHEN $5::bigint IS NULL THEN NULL ELSE to_timestamp($5::bigint) END,
      CASE WHEN $6::bigint IS NULL THEN NULL ELSE to_timestamp($6::bigint) END,
      $7,
      now()
    )
    ON CONFLICT (user_id, plan_code)
    DO UPDATE SET
      provider='stripe',
      provider_subscription_id=EXCLUDED.provider_subscription_id,
      status=EXCLUDED.status,
      current_period_start=EXCLUDED.current_period_start,
      current_period_end=EXCLUDED.current_period_end,
      cancel_at_period_end=EXCLUDED.cancel_at_period_end,
      updated_at=now()
    `,
    [
      userId,
      plan,
      sub.id,
      String(sub.status),
      start,
      end,
      Boolean(sub.cancel_at_period_end),
    ]
  );
}

async function addCouponTx(client: any, userId: number, code: string, delta: number) {
  await client.query(
    `
    INSERT INTO user_coupons (user_id, code, qty, updated_at)
    VALUES ($1,$2,$3, now())
    ON CONFLICT (user_id, code)
    DO UPDATE SET qty = GREATEST(0, user_coupons.qty + EXCLUDED.qty), updated_at=now()
    `,
    [userId, code, delta]
  );
}

async function markOnce(key: string): Promise<boolean> {
  // true = first time, false = already processed
  const r = await pool.query(
    `INSERT INTO billing_idempotency (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
    [key]
  );
  return (r.rowCount || 0) > 0;
}

async function grantCycleBenefits(userId: number, plan: PlanCode) {
  // ⚠️ On ne branche PAS encore les boosts gameplay.
  // Ici: rubis + tickets "sub offert" par cycle.

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (plan === "viewer") {
      // 500 rubis fixes / cycle
      await earnRubisTx(client, userId, "sub_viewer_cycle", 500, {
        plan,
        reason: "subscription_cycle",
      });

      await addCouponTx(client, userId, "sub_ticket", 1);
    }

    if (plan === "streamer") {
      await addCouponTx(client, userId, "sub_ticket", 10);
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const billingRouter = Router();

// ✅ Checkout (redirige Stripe Checkout) — besoin JSON car /billing est monté AVANT app.use(express.json())
billingRouter.post(
  "/checkout-session",
  express.json({ limit: "64kb" }),
  requireAuth,
  a(async (req: any, res) => {
    const u = req.user as AuthUser;
    const plan = req.body?.plan;

    if (!isPlan(plan)) return res.status(400).json({ ok: false, error: "invalid_plan" });
    if (plan === "streamer" && !isStreamerRole((u as any).role)) {
      return res.status(403).json({ ok: false, error: "streamer_only" });
    }

    const priceId = priceIdFor(plan);
    if (!priceId) return res.status(500).json({ ok: false, error: "price_not_configured" });

    const customerId = await getOrCreateCustomerId(u);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONT_URL}/shop?sub=success&plan=${plan}`,
      cancel_url: `${FRONT_URL}/shop?sub=cancel&plan=${plan}`,
      subscription_data: {
        metadata: { user_id: String(u.id), plan },
      },
      metadata: { user_id: String(u.id), plan },
      allow_promotion_codes: true,
    });

    return res.json({ ok: true, url: session.url });
  })
);

// ✅ Customer Portal (annuler / update carte)
billingRouter.post(
  "/customer-portal",
  express.json({ limit: "64kb" }),
  requireAuth,
  a(async (req: any, res) => {
    const u = req.user as AuthUser;
    const customerId = await getOrCreateCustomerId(u);

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONT_URL}/shop?tab=subs`,
    });

    return res.json({ ok: true, url: portal.url });
  })
);

// ✅ Webhook Stripe (raw body obligatoire)
billingRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  a(async (req: any, res) => {
    const sig = String(req.headers["stripe-signature"] || "");
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err?.message || "invalid_signature"}`);
    }

    try {
      // --- checkout completed (création)
      if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : (s.subscription as any)?.id || "";
        if (!subId) return res.json({ received: true });

        const sub = await stripe.subscriptions.retrieve(subId);
        const plan = (sub.metadata?.plan || s.metadata?.plan || "") as PlanCode;
        const userId = Number(sub.metadata?.user_id || s.metadata?.user_id || 0);

        if (userId && (plan === "viewer" || plan === "streamer")) {
          await upsertSubscriptionFromStripe(sub, plan, userId);
        }

        return res.json({ received: true });
      }

      // --- invoice paid = paiement validé (initial + renew)
      if (event.type === "invoice.paid") {
        const inv = event.data.object as Stripe.Invoice;

        // Stripe a déplacé le lien subscription dans inv.parent.subscription_details.subscription
        const subId =
          String((inv as any)?.subscription || "") ||
          String((inv as any)?.parent?.subscription_details?.subscription || "") ||
          String((inv as any)?.lines?.data?.[0]?.subscription || "") ||
          "";

        if (!subId) return res.json({ received: true });

        const once = await markOnce(`invoice.paid:${inv.id}`);
        if (!once) return res.json({ received: true });

        const sub = await stripe.subscriptions.retrieve(subId);
        const plan = (sub.metadata?.plan || "") as PlanCode;
        const userId = Number(sub.metadata?.user_id || 0);

        if (userId && (plan === "viewer" || plan === "streamer")) {
          await upsertSubscriptionFromStripe(sub, plan, userId);
          await grantCycleBenefits(userId, plan);
        }

        return res.json({ received: true });
      }

      // --- subscription updated (annulation fin de période, etc.)
      if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const plan = (sub.metadata?.plan || "") as PlanCode;
        const userId = Number(sub.metadata?.user_id || 0);

        if (userId && (plan === "viewer" || plan === "streamer")) {
          await upsertSubscriptionFromStripe(sub, plan, userId);
        }

        return res.json({ received: true });
      }

      // --- subscription deleted
      if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const plan = (sub.metadata?.plan || "") as PlanCode;
        const userId = Number(sub.metadata?.user_id || 0);

        if (userId && (plan === "viewer" || plan === "streamer")) {
          await upsertSubscriptionFromStripe(sub, plan, userId);
        }

        return res.json({ received: true });
      }

      return res.json({ received: true });
    } catch (e: any) {
      console.error("[billing:webhook] error", e);
      return res.status(500).json({ received: true });
    }
  })
);
