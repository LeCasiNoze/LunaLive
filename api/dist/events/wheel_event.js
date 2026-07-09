import { pool } from "../db.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";
import { grantEntitlement } from "../services/dailyBonus.js";
import { awardXpTx } from "../economy/xp.js";
import { eventRewardEligibilitySql } from "./eligibility.js";
const TZ = "Europe/Paris";
const MAX_TICKETS = 50;
const FLAT_SPIN_XP = 15;
// classid pour pg_advisory_xact_lock(classid, objid) sur les achats boutique
// (objid=userId). Forme 2-arg => espace de verrous distinct des locks 1-arg
// (eventId/streamerId) utilisés ailleurs, donc pas de collision.
const WHEEL_SHOP_LOCK_CLASS = 0x57534b; // "WSK"
// Source XP dédiée (⚠️ ne PAS réutiliser XP_SOURCES.wheel_spin — c'est la
// roue QUOTIDIENNE, cf routes/wheel.ts, plafonnée à 10/jour : partager la
// source capperait silencieusement l'XP de cet event sur un budget qui n'a
// rien à voir). Absente de XP_DAILY_CAPS => pas de cap (l'anti-farm est déjà
// assuré par le coût en tickets du spin).
const XP_SOURCE_WHEEL_EVENT = "event_wheel_spin";
// Boost XP palier 4000 / achat boutique : +20% XP pendant 7 jours. Portée
// volontairement limitée aux XP accordées PAR CET EVENT (spin + lots + palier
// "100 XP") — pas de branchement dans economy/xp.ts (moteur XP partagé par
// toute la plateforme) pour rester un changement additif et réversible.
export const XP_BOOST_MULTIPLIER_BP = 12000;
export const XP_BOOST_DAYS = 7;
const XP_BOOST_PALIER_INDEX = 4; // palier 4000 pts (cf PALIERS ci-dessous)
export const WHEEL_SEGMENTS = [
    { index: 0, weightBp: 3000, points: 100, lot: { type: "none" }, lotLabel: "—" },
    { index: 1, weightBp: 1500, points: 200, lot: { type: "none" }, lotLabel: "—" },
    { index: 2, weightBp: 267, points: 300, lot: { type: "none" }, lotLabel: "—" },
    { index: 3, weightBp: 267, points: 300, lot: { type: "none" }, lotLabel: "—" },
    { index: 4, weightBp: 266, points: 300, lot: { type: "none" }, lotLabel: "—" },
    { index: 5, weightBp: 2000, points: 100, lot: { type: "rubis", amount: 20 }, lotLabel: "20 rubis" },
    { index: 6, weightBp: 1200, points: 100, lot: { type: "xp", amount: 55 }, lotLabel: "+55 XP" },
    { index: 7, weightBp: 1000, points: 100, lot: { type: "ticket", amount: 1 }, lotLabel: "+1 ticket" },
    {
        index: 8,
        weightBp: 400,
        points: 100,
        lot: { type: "cosmetic", code: "cos_wheel_spinner" },
        lotLabel: "Cosmétique commun",
    },
    { index: 9, weightBp: 80, points: 100, lot: { type: "sub_ticket" }, lotLabel: "Ticket de sub" },
    {
        index: 10,
        weightBp: 20,
        points: 100,
        lot: { type: "jackpot", rubis: 300, cosmeticCode: "cos_wheel_highroller" },
        lotLabel: "JACKPOT : 300 rubis + cosmétique rare",
    },
];
function pickWeightedSegment() {
    const total = WHEEL_SEGMENTS.reduce((s, x) => s + x.weightBp, 0);
    let r = Math.random() * total;
    for (const seg of WHEEL_SEGMENTS) {
        r -= seg.weightBp;
        if (r <= 0)
            return seg;
    }
    return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];
}
export const PALIERS = [
    {
        index: 0,
        threshold: 250,
        reward: { cosmeticCode: "cos_wheel_spinner", rubis: 30 },
        rewardLabel: "Badge Spinner + 30 rubis",
    },
    { index: 1, threshold: 600, reward: { tickets: 2 }, rewardLabel: "2 tickets de roue" },
    {
        index: 2,
        threshold: 1300,
        reward: { rubis: 60, cosmeticCode: "cos_wheel_spinner" },
        rewardLabel: "60 rubis + cosmétique commun",
    },
    { index: 3, threshold: 2400, reward: { subTicket: true, xp: 100 }, rewardLabel: "Ticket de sub + 100 XP" },
    { index: 4, threshold: 4000, reward: { rubis: 120, xpBoost: true }, rewardLabel: "120 rubis + boost XP 7 jours" },
    {
        index: 5,
        threshold: 7500,
        reward: { cosmeticCode: "cos_wheel_highroller" },
        rewardLabel: "Cosmétique permanent High Roller",
    },
];
export const SHOP_ITEMS = [
    { code: "ticket", label: "Ticket de roue", capMode: "day", capPerPeriod: 6, priceFor: (bought) => 50 + 10 * bought },
    { code: "reroll", label: "Re-roll (relance un spin)", capMode: "day", capPerPeriod: 3, priceFor: () => 75 },
    { code: "xp_boost", label: "Boost XP 7 jours", capMode: "event", capPerPeriod: 1, priceFor: () => 250 },
    { code: "sub_ticket", label: "Ticket de sub", capMode: "event", capPerPeriod: 2, priceFor: () => 400 },
];
export const QUESTS = {
    daily: [
        { key: "spin_1", period: "daily", label: "Faire 1 spin", tickets: 1, goal: 1 },
        { key: "watch_20", period: "daily", label: "Regarder 20 minutes de live", tickets: 1, goal: 20 },
        { key: "chat_5", period: "daily", label: "Envoyer 5 messages", tickets: 1, goal: 5 },
    ],
    weekly: [
        { key: "spin_20", period: "weekly", label: "Faire 20 spins", tickets: 3, goal: 20 },
        { key: "watch_2h", period: "weekly", label: "Regarder 2h de live", tickets: 3, goal: 120 },
        { key: "points_3000", period: "weekly", label: "Atteindre 3000 points", tickets: 3, goal: 3000 },
        { key: "days_3", period: "weekly", label: "Être actif 3 jours différents", tickets: 3, goal: 3 },
        { key: "palier_3", period: "weekly", label: "Réclamer 3 paliers", tickets: 3, goal: 3 },
    ],
};
function questStorageKey(quest, todayDate) {
    return quest.period === "daily" ? `${quest.key}:${todayDate}` : quest.key;
}
/* ────────────────────────────────────────────────────────────────────────
   Helpers communs
   ──────────────────────────────────────────────────────────────────────── */
export async function getLiveWheelEvent(db) {
    const r = await db.query(`
    SELECT *
    FROM events
    WHERE type='wheel_week'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    return r.rows?.[0] ?? null;
}
async function todayParisDate(db) {
    const r = await db.query(`SELECT (NOW() AT TIME ZONE '${TZ}')::date::text AS d`);
    return String(r.rows?.[0]?.d || "");
}
async function getTicketAmount(db, userId) {
    const r = await db.query(`SELECT amount FROM user_event_tickets WHERE user_id=$1`, [userId]);
    return Number(r.rows?.[0]?.amount ?? 0);
}
async function getPointsAmount(db, eventId, userId) {
    const r = await db.query(`SELECT points FROM event_scores WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    return Number(r.rows?.[0]?.points ?? 0);
}
async function addEventTickets(client, userId, amount) {
    if (amount <= 0)
        return;
    await client.query(`
    INSERT INTO user_event_tickets (user_id, amount)
    VALUES ($1, LEAST($2, ${MAX_TICKETS}))
    ON CONFLICT (user_id) DO UPDATE
      SET amount = LEAST(user_event_tickets.amount + $2, ${MAX_TICKETS})
    `, [userId, amount]);
}
// "Ticket de sub" = coupon user_coupons (code 'sub_ticket'), consommé par
// routes/subscriptions.ts (consumeCouponTx) — même mécanisme que
// billing.ts grantCycleBenefits, PAS user_tokens.
async function grantSubTicket(client, userId) {
    await client.query(`
    INSERT INTO user_coupons (user_id, code, qty, updated_at)
    VALUES ($1, 'sub_ticket', 1, NOW())
    ON CONFLICT (user_id, code) DO UPDATE SET qty = user_coupons.qty + 1, updated_at = NOW()
    `, [userId]);
}
async function getXpBoostMultiplierBp(db, userId) {
    // GREATEST() ignore les NULL (sauf si TOUS les arguments sont NULL, cf doc
    // Postgres) — pas besoin de COALESCE sur une valeur sentinelle : last_grant
    // est NULL si le user n'a jamais eu de boost.
    const r = await db.query(`
    SELECT GREATEST(
      (SELECT MAX(created_at) FROM event_shop_purchases WHERE user_id=$1 AND item_code='xp_boost'),
      (SELECT MAX(created_at) FROM event_palier_claims WHERE user_id=$1 AND palier_index=$2)
    ) AS last_grant
    `, [userId, XP_BOOST_PALIER_INDEX]);
    const last = r.rows?.[0]?.last_grant;
    if (!last)
        return 10000;
    const active = new Date(last).getTime() + XP_BOOST_DAYS * 24 * 3600_000 > Date.now();
    return active ? XP_BOOST_MULTIPLIER_BP : 10000;
}
async function applySegmentLot(client, eventId, userId, lot, xpMultiplierBp) {
    switch (lot.type) {
        case "none":
            return;
        case "rubis":
            await earnRubisTx(client, userId, "event_platform", lot.amount, { purpose: "wheel_spin_lot", eventId });
            return;
        case "xp": {
            const amount = Math.ceil((lot.amount * xpMultiplierBp) / 10000);
            await awardXpTx(client, userId, amount, XP_SOURCE_WHEEL_EVENT, "wheel_spin_lot", { eventId });
            return;
        }
        case "ticket":
            await addEventTickets(client, userId, lot.amount);
            return;
        case "cosmetic":
            await grantEntitlement(client, userId, "skin", lot.code);
            return;
        case "sub_ticket":
            await grantSubTicket(client, userId);
            return;
        case "jackpot":
            await earnRubisTx(client, userId, "event_platform", lot.rubis, { purpose: "wheel_jackpot", eventId });
            await grantEntitlement(client, userId, "skin", lot.cosmeticCode);
            return;
    }
}
async function applyPalierReward(client, eventId, userId, reward) {
    if (reward.rubis) {
        await earnRubisTx(client, userId, "event_platform", reward.rubis, { purpose: "wheel_palier", eventId });
    }
    if (reward.tickets) {
        await addEventTickets(client, userId, reward.tickets);
    }
    if (reward.xp) {
        const multBp = await getXpBoostMultiplierBp(client, userId);
        const amount = Math.ceil((reward.xp * multBp) / 10000);
        await awardXpTx(client, userId, amount, XP_SOURCE_WHEEL_EVENT, "palier", { eventId });
    }
    if (reward.subTicket) {
        await grantSubTicket(client, userId);
    }
    if (reward.cosmeticCode) {
        await grantEntitlement(client, userId, "skin", reward.cosmeticCode);
    }
    // reward.xpBoost n'a pas d'écriture dédiée : getXpBoostMultiplierBp relit
    // directement event_palier_claims (palier_index=XP_BOOST_PALIER_INDEX) —
    // l'INSERT du claim (cf claimPaliersTx) fait foi de l'activation.
}
async function claimPaliersTx(client, eventId, userId) {
    const points = await getPointsAmount(client, eventId, userId);
    const already = await client.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    const claimedSet = new Set((already.rows || []).map((r) => Number(r.palier_index)));
    const newlyClaimed = [];
    for (const palier of PALIERS) {
        if (points < palier.threshold)
            continue;
        if (claimedSet.has(palier.index))
            continue;
        const ins = await client.query(`INSERT INTO event_palier_claims (event_id, user_id, palier_index) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING palier_index`, [eventId, userId, palier.index]);
        if ((ins.rowCount ?? 0) === 0)
            continue;
        await applyPalierReward(client, eventId, userId, palier.reward);
        newlyClaimed.push(palier);
    }
    return newlyClaimed;
}
/** Version transactionnelle autonome (BEGIN/COMMIT propres) — réutilisable
 * hors du flux spin (ex. admin / rattrapage). */
export async function claimPaliers(eventId, userId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const claimed = await claimPaliersTx(client, eventId, userId);
        await client.query("COMMIT");
        return claimed;
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
// Coeur du spin, partagé entre spinWheel (ticket) et le "re-roll" boutique
// (rubis) — accumule les points (JAMAIS de recompute, cf mig125), applique
// le lot, log le spin, puis auto-claim les paliers nouvellement atteints.
async function performSpin(client, eventId, userId, source) {
    const seg = pickWeightedSegment();
    await client.query(`
    INSERT INTO event_scores (event_id, user_id, points, detail, updated_at)
    VALUES ($1,$2,$3, jsonb_build_object('spins',1), NOW())
    ON CONFLICT (event_id, user_id) DO UPDATE
      SET points = event_scores.points + EXCLUDED.points,
          detail = jsonb_set(
            COALESCE(event_scores.detail, '{}'::jsonb),
            '{spins}'::text[],
            to_jsonb(COALESCE((event_scores.detail->>'spins')::int, 0) + 1)
          ),
          updated_at = NOW()
    `, [eventId, userId, seg.points]);
    const multBp = await getXpBoostMultiplierBp(client, userId);
    const xp = Math.ceil((FLAT_SPIN_XP * multBp) / 10000);
    await awardXpTx(client, userId, xp, XP_SOURCE_WHEEL_EVENT, source, { eventId, segmentIndex: seg.index });
    await applySegmentLot(client, eventId, userId, seg.lot, multBp);
    await client.query(`INSERT INTO event_wheel_spins (event_id, user_id, segment_index, points) VALUES ($1,$2,$3,$4)`, [eventId, userId, seg.index, seg.points]);
    // Paliers NON auto-réclamés : le joueur les récupère manuellement (bouton
    // "Récupérer" sur l'onglet Roue → POST /events/wheel/palier/claim), pour un
    // moment de récompense explicite plutôt qu'un crédit invisible au spin.
    return { segment: seg, xp };
}
export async function spinWheel(userId) {
    const event = await getLiveWheelEvent(pool);
    if (!event)
        return { ok: false, error: "no_event" };
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Spin gratuit quotidien : 1/jour (reset minuit Paris), ne consomme pas de
        // ticket. Marqué dans event_quest_claims sous une clé datée dédiée.
        const todayDate = await todayParisDate(client);
        const freeClaim = await client.query(`INSERT INTO event_quest_claims (event_id, user_id, quest_key) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING RETURNING 1`, [Number(event.id), userId, `__free_spin:${todayDate}`]);
        const isFree = (freeClaim.rowCount ?? 0) > 0;
        if (!isFree) {
            const consumed = await client.query(`UPDATE user_event_tickets SET amount = amount - 1 WHERE user_id=$1 AND amount >= 1 RETURNING amount`, [userId]);
            if ((consumed.rowCount ?? 0) === 0) {
                await client.query("ROLLBACK");
                return { ok: false, error: "no_ticket" };
            }
        }
        const { segment, xp } = await performSpin(client, Number(event.id), userId, "spin");
        const tickets = await getTicketAmount(client, userId);
        const points = await getPointsAmount(client, Number(event.id), userId);
        await client.query("COMMIT");
        return {
            ok: true,
            segment: { index: segment.index, points: segment.points, xp, lot: segment.lot, lotLabel: segment.lotLabel },
            tickets,
            points,
        };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
async function getQuestProgress(db, eventId, userId, quest, todayDate, event) {
    switch (quest.key) {
        case "spin_1": {
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM event_wheel_spins WHERE event_id=$1 AND user_id=$2 AND (created_at AT TIME ZONE '${TZ}')::date = $3::date`, [eventId, userId, todayDate]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "watch_20": {
            const r = await db.query(`SELECT COUNT(DISTINCT svm.bucket_ts)::int AS n FROM stream_viewer_minutes svm WHERE svm.user_id=$1 AND (svm.bucket_ts AT TIME ZONE '${TZ}')::date = $2::date`, [userId, todayDate]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "chat_5": {
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM chat_messages cm WHERE cm.user_id=$1 AND cm.deleted_at IS NULL AND (cm.created_at AT TIME ZONE '${TZ}')::date = $2::date`, [userId, todayDate]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "spin_20": {
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM event_wheel_spins WHERE event_id=$1 AND user_id=$2`, [
                eventId,
                userId,
            ]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "watch_2h": {
            const r = await db.query(`SELECT COUNT(DISTINCT svm.bucket_ts)::int AS n FROM stream_viewer_minutes svm WHERE svm.user_id=$1 AND svm.bucket_ts >= $2::timestamptz AND svm.bucket_ts < $3::timestamptz`, [userId, event.start_at, event.end_at]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "points_3000": {
            const r = await db.query(`SELECT COALESCE(points,0)::int AS n FROM event_scores WHERE event_id=$1 AND user_id=$2`, [
                eventId,
                userId,
            ]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "days_3": {
            const r = await db.query(`SELECT COUNT(DISTINCT (created_at AT TIME ZONE '${TZ}')::date)::int AS n FROM event_wheel_spins WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        case "palier_3": {
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [
                eventId,
                userId,
            ]);
            return Number(r.rows?.[0]?.n ?? 0);
        }
        default:
            return 0;
    }
}
export async function claimQuest(eventId, userId, questKey) {
    const quest = [...QUESTS.daily, ...QUESTS.weekly].find((q) => q.key === questKey);
    if (!quest)
        return { ok: false, error: "unknown_quest" };
    const eventRes = await pool.query(`SELECT * FROM events WHERE id=$1 AND type='wheel_week' AND state='live'`, [eventId]);
    const event = eventRes.rows?.[0];
    if (!event)
        return { ok: false, error: "no_event" };
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const todayDate = await todayParisDate(client);
        const storageKey = questStorageKey(quest, todayDate);
        const already = await client.query(`SELECT 1 FROM event_quest_claims WHERE event_id=$1 AND user_id=$2 AND quest_key=$3`, [eventId, userId, storageKey]);
        if ((already.rowCount ?? 0) > 0) {
            await client.query("ROLLBACK");
            return { ok: false, error: "already_claimed" };
        }
        const progress = await getQuestProgress(client, eventId, userId, quest, todayDate, event);
        if (progress < quest.goal) {
            await client.query("ROLLBACK");
            return { ok: false, error: "not_done" };
        }
        const ins = await client.query(`INSERT INTO event_quest_claims (event_id, user_id, quest_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [eventId, userId, storageKey]);
        // rowCount=0 => une requête concurrente a déjà réclamé (PK conflict) :
        // ne PAS créditer une 2e fois (le SELECT `already` seul est TOCTOU).
        if ((ins.rowCount ?? 0) === 0) {
            await client.query("ROLLBACK");
            return { ok: false, error: "already_claimed" };
        }
        await addEventTickets(client, userId, quest.tickets);
        const tickets = await getTicketAmount(client, userId);
        await client.query("COMMIT");
        return { ok: true, ticketsAwarded: quest.tickets, tickets };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
async function getBoughtCount(db, eventId, userId, item, todayDate) {
    if (item.capMode === "day") {
        const r = await db.query(`SELECT COUNT(*)::int AS n FROM event_shop_purchases WHERE event_id=$1 AND user_id=$2 AND item_code=$3 AND day_date=$4::date`, [eventId, userId, item.code, todayDate]);
        return Number(r.rows?.[0]?.n ?? 0);
    }
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM event_shop_purchases WHERE event_id=$1 AND user_id=$2 AND item_code=$3`, [eventId, userId, item.code]);
    return Number(r.rows?.[0]?.n ?? 0);
}
async function applyShopItemEffect(client, eventId, userId, item) {
    switch (item.code) {
        case "ticket":
            await addEventTickets(client, userId, 1);
            return { ticket: 1 };
        case "reroll": {
            // "relance le dernier spin" : interprété comme un spin PAYANT immédiat
            // (même pipeline que spinWheel, en rubis plutôt qu'en ticket) — pas un
            // "undo" du dernier tirage : annuler des lots déjà distribués (rubis
            // potentiellement déjà dépensés, palier déjà réclamé) n'est pas sûr à
            // rejouer.
            const { segment, xp } = await performSpin(client, eventId, userId, "reroll");
            return { segment: { index: segment.index, points: segment.points, xp, lotLabel: segment.lotLabel } };
        }
        case "xp_boost":
            // Rien à écrire de plus : getXpBoostMultiplierBp relit
            // event_shop_purchases (item_code='xp_boost') — l'INSERT fait par
            // buyShopItem juste après ce switch fait foi de l'activation.
            return { xpBoostDays: XP_BOOST_DAYS };
        case "sub_ticket":
            await grantSubTicket(client, userId);
            return { subTicket: 1 };
        default:
            return {};
    }
}
export async function buyShopItem(eventId, userId, itemCode) {
    const item = SHOP_ITEMS.find((i) => i.code === itemCode);
    if (!item)
        return { ok: false, error: "unknown_item" };
    const eventRes = await pool.query(`SELECT * FROM events WHERE id=$1 AND type='wheel_week' AND state='live'`, [eventId]);
    if (!eventRes.rows?.[0])
        return { ok: false, error: "no_event" };
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Sérialise les achats concurrents DU MÊME USER : sans ça, getBoughtCount
        // (COUNT non verrouillé) est un TOCTOU — N requêtes simultanées lisent le
        // même compte, contournant le cap ET le prix escalier (tickets/sub/reroll).
        // Forme 2-arg = espace de verrous distinct des locks eventId (1-arg) ailleurs.
        await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [WHEEL_SHOP_LOCK_CLASS, userId]);
        const todayDate = await todayParisDate(client);
        const boughtCount = await getBoughtCount(client, eventId, userId, item, todayDate);
        if (boughtCount >= item.capPerPeriod) {
            await client.query("ROLLBACK");
            return { ok: false, error: "cap_reached" };
        }
        // Le ticket de roue est plafonné à MAX_TICKETS (addEventTickets sature
        // silencieusement) : refuser AVANT de débiter des rubis pour rien.
        if (item.code === "ticket" && (await getTicketAmount(client, userId)) >= MAX_TICKETS) {
            await client.query("ROLLBACK");
            return { ok: false, error: "ticket_cap" };
        }
        const price = item.priceFor(boughtCount);
        let spend;
        try {
            spend = await spendRubisTx(client, {
                userId,
                amount: price,
                spendKind: "sink",
                spendType: "event_wheel_shop",
                meta: { eventId, itemCode: item.code },
            });
        }
        catch (e) {
            await client.query("ROLLBACK");
            if (String(e?.message) === "insufficient_rubis")
                return { ok: false, error: "not_enough_rubis" };
            throw e;
        }
        const granted = await applyShopItemEffect(client, eventId, userId, item);
        await client.query(`INSERT INTO event_shop_purchases (event_id, user_id, item_code, day_date) VALUES ($1,$2,$3,$4::date)`, [eventId, userId, item.code, todayDate]);
        const boughtAfter = boughtCount + 1;
        const nextPrice = boughtAfter < item.capPerPeriod ? item.priceFor(boughtAfter) : null;
        const rubisRow = await client.query(`SELECT rubis FROM users WHERE id=$1`, [userId]);
        const rubis = Number(rubisRow.rows?.[0]?.rubis ?? 0);
        await client.query("COMMIT");
        return { ok: true, spentRubis: spend.spent, rubis, granted, boughtToday: boughtAfter, nextPrice };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
export async function getWheelState(db, eventId, userId) {
    const eventRes = await db.query(`SELECT * FROM events WHERE id=$1`, [eventId]);
    const event = eventRes.rows?.[0] ?? null;
    if (!event)
        return { event: null };
    const wheel = WHEEL_SEGMENTS.map((s) => ({ proba: s.weightBp / 100, points: s.points, lotLabel: s.lotLabel }));
    const paliersOut = PALIERS.map((p) => ({ index: p.index, threshold: p.threshold, rewardLabel: p.rewardLabel }));
    const leaderboardRes = await db.query(`
    SELECT s.user_id, u.username, s.points,
           ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
    FROM event_scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id = $1
      AND ${eventRewardEligibilitySql("s.user_id")}
    ORDER BY s.points DESC, s.updated_at ASC
    LIMIT 10
    `, [eventId]);
    const leaderboard = (leaderboardRes.rows || []).map((r) => ({
        rank: Number(r.rank),
        userId: Number(r.user_id),
        username: String(r.username ?? ""),
        points: Number(r.points ?? 0),
    }));
    const todayDate = await todayParisDate(db);
    let me = null;
    if (userId) {
        const points = await getPointsAmount(db, eventId, userId);
        const tickets = await getTicketAmount(db, userId);
        const rankRes = await db.query(`
      WITH ranked AS (
        SELECT s.user_id, ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
        FROM event_scores s
        WHERE s.event_id = $1
          AND ${eventRewardEligibilitySql("s.user_id")}
      )
      SELECT rank FROM ranked WHERE user_id = $2
      `, [eventId, userId]);
        const rank = rankRes.rows?.[0]?.rank != null ? Number(rankRes.rows[0].rank) : null;
        const claimsRes = await db.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [
            eventId,
            userId,
        ]);
        const paliersClaimed = (claimsRes.rows || []).map((r) => Number(r.palier_index));
        const nextPalierDef = PALIERS.find((p) => !paliersClaimed.includes(p.index) && p.threshold > points) ??
            PALIERS.find((p) => !paliersClaimed.includes(p.index)) ??
            null;
        const nextPalier = nextPalierDef
            ? { index: nextPalierDef.index, threshold: nextPalierDef.threshold, remaining: Math.max(0, nextPalierDef.threshold - points) }
            : null;
        const freeRes = await db.query(`SELECT 1 FROM event_quest_claims WHERE event_id=$1 AND user_id=$2 AND quest_key=$3`, [eventId, userId, `__free_spin:${todayDate}`]);
        const freeSpinAvailable = (freeRes.rowCount ?? 0) === 0;
        me = { tickets, points, rank, paliersClaimed, nextPalier, freeSpinAvailable };
    }
    const shop = [];
    for (const item of SHOP_ITEMS) {
        const boughtToday = userId ? await getBoughtCount(db, eventId, userId, item, todayDate) : 0;
        shop.push({
            code: item.code,
            label: item.label,
            nextPrice: boughtToday < item.capPerPeriod ? item.priceFor(boughtToday) : null,
            capPerDay: item.capPerPeriod,
            boughtToday,
            soldOut: boughtToday >= item.capPerPeriod,
        });
    }
    const questsOut = { daily: [], weekly: [] };
    for (const period of ["daily", "weekly"]) {
        for (const quest of QUESTS[period]) {
            let progress = 0;
            let claimed = false;
            if (userId) {
                progress = await getQuestProgress(db, eventId, userId, quest, todayDate, event);
                const storageKey = questStorageKey(quest, todayDate);
                const claimedRes = await db.query(`SELECT 1 FROM event_quest_claims WHERE event_id=$1 AND user_id=$2 AND quest_key=$3`, [eventId, userId, storageKey]);
                claimed = (claimedRes.rowCount ?? 0) > 0;
            }
            questsOut[period].push({
                key: quest.key,
                label: quest.label,
                goal: quest.goal,
                progress: Math.min(progress, quest.goal),
                done: progress >= quest.goal,
                claimed,
            });
        }
    }
    return { event, wheel, paliers: paliersOut, me, leaderboard, shop, quests: questsOut };
}
