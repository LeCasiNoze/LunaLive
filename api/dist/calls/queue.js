import { keyText, normText } from "./normalize.js";
import { normalizeProvider } from "./provider_aliases.js";
const TZ = "Europe/Paris";
// règle “0 infini / >10 infini”
export function effectiveLimit(n) {
    const x = Number(n);
    if (!Number.isFinite(x))
        return 2;
    if (x <= 0)
        return 0;
    if (x > 10)
        return 0;
    return Math.floor(x);
}
async function ensureCallsSchema(pool) {
    // ✅ calls_settings.sync_hunt
    await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.calls_settings') IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='calls_settings' AND column_name='sync_hunt'
        ) THEN
          ALTER TABLE calls_settings ADD COLUMN sync_hunt BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END IF;
    END $$;
  `);
    // ✅ calls_queue bet/pay/bounty/is_bonus
    await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.calls_queue') IS NOT NULL THEN

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='calls_queue' AND column_name='is_bonus'
        ) THEN
          ALTER TABLE calls_queue ADD COLUMN is_bonus BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='calls_queue' AND column_name='bet'
        ) THEN
          ALTER TABLE calls_queue ADD COLUMN bet NUMERIC NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='calls_queue' AND column_name='pay'
        ) THEN
          ALTER TABLE calls_queue ADD COLUMN pay NUMERIC NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='calls_queue' AND column_name='bounty'
        ) THEN
          ALTER TABLE calls_queue ADD COLUMN bounty BOOLEAN NULL;
        END IF;
      END IF;
    END $$;
  `);
    // ✅ NEW: calls_actions pour quêtes welcome (idempotent)
    // - on garde ce schéma très simple et compatible
    await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_actions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      streamer_id BIGINT NULL,
      action TEXT NOT NULL DEFAULT 'call_add',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS calls_actions_user_id_idx ON calls_actions(user_id);
    CREATE INDEX IF NOT EXISTS calls_actions_streamer_id_idx ON calls_actions(streamer_id);
    CREATE INDEX IF NOT EXISTS calls_actions_created_at_idx ON calls_actions(created_at);
  `);
}
export async function getCallsSettings(pool, streamerId) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`SELECT enabled, show_cmd_in_chat, show_accept_public, allow_listec, listec_max, per_user_limit, sync_hunt
     FROM calls_settings
     WHERE streamer_id=$1
     LIMIT 1`, [streamerId]);
    const row = r.rows?.[0];
    if (!row) {
        // auto-create default row (idempotent)
        await pool.query(`INSERT INTO calls_settings (streamer_id) VALUES ($1)
       ON CONFLICT (streamer_id) DO NOTHING`, [streamerId]);
        return {
            enabled: true,
            showCmdInChat: false,
            showAcceptPublic: true,
            allowListec: true,
            listecMax: 10,
            perUserLimit: 2,
            syncHunt: false,
        };
    }
    return {
        enabled: !!row.enabled,
        showCmdInChat: !!row.show_cmd_in_chat,
        showAcceptPublic: !!row.show_accept_public,
        allowListec: !!row.allow_listec,
        listecMax: Math.max(1, Math.min(50, Number(row.listec_max ?? 10))),
        perUserLimit: effectiveLimit(Number(row.per_user_limit ?? 2)),
        syncHunt: !!row.sync_hunt,
    };
}
/**
 * Nouveau système bans:
 *  - table calls_bans(streamer_id, kind, ban_key)
 *  - kind in ('user','slot','provider')
 *
 * IMPORTANT:
 * - ban user = ban_key = lower(username) (fallback: userId string)
 * - ban provider = ban_key = provider_norm (lower)
 * - ban slot = ban_key = slotKey (name_key)
 */
export async function isUserBannedFromCalls(pool, streamerId, userId, username) {
    const u = String(username || "").trim().toLowerCase();
    const idKey = String(userId || "").trim();
    if (u) {
        const r = await pool.query(`SELECT 1
       FROM calls_bans
       WHERE streamer_id=$1 AND kind='user' AND (ban_key=$2 OR ban_key=$3)
       LIMIT 1`, [streamerId, u, idKey]);
        return !!r.rows?.[0];
    }
    const r = await pool.query(`SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='user' AND ban_key=$2
     LIMIT 1`, [streamerId, idKey]);
    return !!r.rows?.[0];
}
export async function isSlotBanned(pool, streamerId, slotKey) {
    const k = String(slotKey || "").trim();
    if (!k)
        return false;
    const r = await pool.query(`SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='slot' AND ban_key=$2
     LIMIT 1`, [streamerId, k]);
    return !!r.rows?.[0];
}
export async function isProviderBanned(pool, streamerId, provider) {
    const raw = String(provider || "").trim();
    if (!raw)
        return false;
    const prov = normalizeProvider(raw);
    const k = String(prov || raw).trim().toLowerCase();
    if (!k)
        return false;
    const r = await pool.query(`SELECT 1
     FROM calls_bans
     WHERE streamer_id=$1 AND kind='provider' AND ban_key=$2
     LIMIT 1`, [streamerId, k]);
    return !!r.rows?.[0];
}
export async function countUserCalls(pool, streamerId, userId) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM calls_queue
    WHERE streamer_id=$1
      AND user_id=$2
      AND COALESCE(is_bonus,FALSE)=FALSE
      AND (bet IS NULL OR bet <= 0)
    `, [streamerId, userId]);
    return Number(r.rows?.[0]?.n ?? 0);
}
export async function countUserCallsByUsername(pool, streamerId, username) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM calls_queue
    WHERE streamer_id=$1
      AND LOWER(username)=LOWER($2)
      AND COALESCE(is_bonus,FALSE)=FALSE
      AND (bet IS NULL OR bet <= 0)
    `, [streamerId, username]);
    return Number(r.rows?.[0]?.n ?? 0);
}
async function ensureProviderPolicyRow(pool, streamerId) {
    await pool.query(`
    INSERT INTO calls_provider_policy (streamer_id, mode)
    VALUES ($1, 'allow_all')
    ON CONFLICT (streamer_id) DO NOTHING
    `, [streamerId]);
}
async function isProviderAllowedByPolicy(pool, streamerId, providerNormLower) {
    // si pas de provider => on laisse passer (tu peux rendre strict si tu veux)
    if (!providerNormLower)
        return true;
    await ensureProviderPolicyRow(pool, streamerId);
    const pr = await pool.query(`SELECT mode FROM calls_provider_policy WHERE streamer_id=$1 LIMIT 1`, [streamerId]);
    const mode = String(pr.rows?.[0]?.mode || "allow_all");
    if (mode !== "allow_only")
        return true;
    const ar = await pool.query(`SELECT 1
     FROM calls_allowed_providers
     WHERE streamer_id=$1 AND provider_norm=$2
     LIMIT 1`, [streamerId, providerNormLower]);
    return !!ar.rows?.[0];
}
export async function addCall(pool, streamerId, userId, username, slotNameRaw, provider, opts) {
    await ensureCallsSchema(pool);
    const slotName = normText(slotNameRaw);
    if (!slotName)
        return { ok: false, error: "bad_slot" };
    const slotKey = keyText(slotName);
    // provider -> provider_norm (stocké en lower)
    const providerRaw = provider ? normText(provider) : null;
    const providerNorm = providerRaw ? normalizeProvider(providerRaw) : null;
    const providerLower = providerNorm
        ? String(providerNorm).trim().toLowerCase()
        : providerRaw
            ? providerRaw.toLowerCase()
            : null;
    const settings = await getCallsSettings(pool, streamerId);
    if (!settings.enabled)
        return { ok: false, error: "calls_disabled" };
    // bans / policy / limits
    if (await isUserBannedFromCalls(pool, streamerId, userId, username))
        return { ok: false, error: "user_banned" };
    if (await isSlotBanned(pool, streamerId, slotKey))
        return { ok: false, error: "slot_banned" };
    if (providerLower && (await isProviderBanned(pool, streamerId, providerLower)))
        return { ok: false, error: "provider_banned" };
    if (!(await isProviderAllowedByPolicy(pool, streamerId, providerLower)))
        return { ok: false, error: "provider_not_allowed" };
    if (!opts?.bypassLimit) {
        const lim = typeof opts?.perUserLimit === "number" ? effectiveLimit(opts.perUserLimit) : settings.perUserLimit;
        if (lim > 0) {
            const n = await countUserCalls(pool, streamerId, userId);
            if (n >= lim)
                return { ok: false, error: "limit_reached" };
        }
    }
    // IMPORTANT: multi-queries cohérentes => on prend un client + transaction
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // lock par streamer pour pos + dédup
        await client.query(`SELECT pg_advisory_xact_lock($1)`, [Number(streamerId)]);
        // position par défaut = append
        let nextPos = 0;
        const maxPosRes = await client.query(`SELECT COALESCE(MAX(pos),0)::bigint AS m FROM calls_queue WHERE streamer_id=$1`, [streamerId]);
        const maxPos = Number(maxPosRes.rows?.[0]?.m ?? 0);
        if (opts?.insertAfterCurrent) {
            // ✅ pcall = toujours après le 1er item affiché (ORDER BY pos ASC)
            const firstRes = await client.query(`SELECT pos::bigint AS p
         FROM calls_queue
         WHERE streamer_id=$1
         ORDER BY pos ASC
         LIMIT 1`, [streamerId]);
            if (!firstRes.rows?.length) {
                // queue vide => on met en 1
                nextPos = 1;
            }
            else {
                const firstPos = Number(firstRes.rows[0].p || 1);
                // ✅ insert juste après le premier
                nextPos = firstPos + 1;
                // décale tous les éléments à partir de nextPos
                await client.query(`UPDATE calls_queue
           SET pos = pos + 1
           WHERE streamer_id=$1 AND pos >= $2`, [streamerId, nextPos]);
            }
        }
        else {
            nextPos = maxPos + 1;
        }
        const ins = await client.query(`
      INSERT INTO calls_queue (streamer_id, slot_name, slot_key, provider, user_id, username, pos, bet, pay, bounty, is_bonus)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL,FALSE)
      RETURNING id, created_at AS "createdAt"
      `, [streamerId, slotName, slotKey, providerLower, userId, username, nextPos]);
        // ✅ NEW: log pour les quêtes welcome (compte un call ajouté, peu importe la source)
        await client.query(`INSERT INTO calls_actions(user_id, streamer_id, action)
       VALUES ($1,$2,'call_add')`, [userId, streamerId]);
        await client.query("COMMIT");
        const row = ins.rows?.[0];
        const id = String(row.id);
        return {
            ok: true,
            position: nextPos,
            item: {
                id,
                slotName,
                provider: providerLower ?? null,
                userId,
                username,
                pos: nextPos,
                createdAt: new Date(row.createdAt).toISOString(),
                bet: null,
                pay: null,
                bounty: null,
            },
        };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        const msg = String(e?.message || "");
        if (msg.includes("calls_queue_unique_slot"))
            return { ok: false, error: "already_in_queue" };
        return { ok: false, error: "insert_failed" };
    }
    finally {
        client.release();
    }
}
export async function listCalls(pool, streamerId, limit, offset) {
    await ensureCallsSchema(pool);
    const lim = Math.max(1, Math.min(200, Math.floor(Number(limit || 50))));
    const off = Math.max(0, Math.floor(Number(offset || 0)));
    const r = await pool.query(`
    SELECT
      id::text AS id,
      slot_name AS "slotName",
      provider AS "provider",
      user_id::int AS "userId",
      username AS "username",
      pos::int AS "pos",
      created_at AS "createdAt",
      bet AS "bet",
      pay AS "pay",
      bounty AS "bounty"
    FROM calls_queue
    WHERE streamer_id=$1
    ORDER BY pos ASC
    LIMIT $2 OFFSET $3
    `, [streamerId, lim, off]);
    return (r.rows || []).map((x) => ({
        id: String(x.id),
        slotName: String(x.slotName),
        provider: x.provider ? String(x.provider) : null,
        userId: Number(x.userId),
        username: String(x.username),
        pos: Number(x.pos),
        createdAt: new Date(x.createdAt).toISOString(),
        bet: x.bet == null ? null : Number(x.bet),
        pay: x.pay == null ? null : Number(x.pay),
        bounty: typeof x.bounty === "boolean" ? x.bounty : (x.bounty ?? null),
    }));
}
export async function resetCalls(pool, streamerId) {
    await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1`, [streamerId]);
}
export async function deleteCallById(pool, streamerId, id) {
    const r = await pool.query(`DELETE FROM calls_queue WHERE streamer_id=$1 AND id=$2 RETURNING id`, [streamerId, id]);
    return !!r.rows?.[0];
}
export async function setCallBet(pool, streamerId, id, bet) {
    await ensureCallsSchema(pool);
    const b = Number(bet);
    if (!(b >= 0))
        return false;
    const r = await pool.query(`UPDATE calls_queue SET bet=$3 WHERE streamer_id=$1 AND id=$2 RETURNING id`, [
        streamerId,
        id,
        b,
    ]);
    return !!r.rows?.[0];
}
export async function setCallPay(pool, streamerId, id, pay) {
    await ensureCallsSchema(pool);
    const p = Number(pay);
    if (!(p >= 0))
        return false;
    const r = await pool.query(`UPDATE calls_queue SET pay=$3 WHERE streamer_id=$1 AND id=$2 RETURNING id`, [
        streamerId,
        id,
        p,
    ]);
    return !!r.rows?.[0];
}
export async function setCallBounty(pool, streamerId, id, bounty) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`UPDATE calls_queue SET bounty=$3 WHERE streamer_id=$1 AND id=$2 RETURNING id`, [
        streamerId,
        id,
        !!bounty,
    ]);
    return !!r.rows?.[0];
}
export async function reorderCalls(pool, streamerId, ids) {
    const clean = Array.isArray(ids) ? ids.map((x) => String(x)).filter(Boolean) : [];
    if (!clean.length)
        return;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT pg_advisory_xact_lock($1)`, [Number(streamerId)]);
        for (let i = 0; i < clean.length; i++) {
            await client.query(`UPDATE calls_queue SET pos=$3 WHERE streamer_id=$1 AND id=$2`, [streamerId, clean[i], i + 1]);
        }
        await client.query("COMMIT");
    }
    catch {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw new Error("reorder_failed");
    }
    finally {
        client.release();
    }
}
export async function findCurrentForBet(pool, streamerId) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`
    SELECT
      id::text AS id,
      slot_name AS "slotName",
      provider AS "provider",
      user_id::int AS "userId",
      username AS "username",
      pos::int AS "pos",
      created_at AS "createdAt",
      bet AS "bet",
      pay AS "pay",
      bounty AS "bounty"
    FROM calls_queue
    WHERE streamer_id=$1
      AND (bet IS NULL OR bet <= 0)
    ORDER BY pos ASC
    LIMIT 1
    `, [streamerId]);
    const x = r.rows?.[0];
    if (!x)
        return null;
    return {
        id: String(x.id),
        slotName: String(x.slotName),
        provider: x.provider ? String(x.provider) : null,
        userId: Number(x.userId),
        username: String(x.username),
        pos: Number(x.pos),
        createdAt: new Date(x.createdAt).toISOString(),
        bet: x.bet == null ? null : Number(x.bet),
        pay: x.pay == null ? null : Number(x.pay),
        bounty: typeof x.bounty === "boolean" ? x.bounty : (x.bounty ?? null),
    };
}
export async function findCurrentForPay(pool, streamerId) {
    await ensureCallsSchema(pool);
    const r = await pool.query(`
    SELECT
      id::text AS id,
      slot_name AS "slotName",
      provider AS "provider",
      user_id::int AS "userId",
      username AS "username",
      pos::int AS "pos",
      created_at AS "createdAt",
      bet AS "bet",
      pay AS "pay",
      bounty AS "bounty"
    FROM calls_queue
    WHERE streamer_id=$1
      AND (pay IS NULL)
    ORDER BY pos ASC
    LIMIT 1
    `, [streamerId]);
    const x = r.rows?.[0];
    if (!x)
        return null;
    return {
        id: String(x.id),
        slotName: String(x.slotName),
        provider: x.provider ? String(x.provider) : null,
        userId: Number(x.userId),
        username: String(x.username),
        pos: Number(x.pos),
        createdAt: new Date(x.createdAt).toISOString(),
        bet: x.bet == null ? null : Number(x.bet),
        pay: x.pay == null ? null : Number(x.pay),
        bounty: typeof x.bounty === "boolean" ? x.bounty : (x.bounty ?? null),
    };
}
