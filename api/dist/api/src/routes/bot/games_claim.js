function pad2(n) {
    return String(n).padStart(2, "0");
}
// Month key en Europe/Paris : "YYYY-MM"
export function monthKeyParis(d = new Date()) {
    const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
    }).formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    return `${year}-${month}`;
}
export function fmtRemaining(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0)
        return `${hh}h ${pad2(mm)}m`;
    if (mm > 0)
        return `${mm}m ${pad2(ss)}s`;
    return `${ss}s`;
}
function bonusForCount(n) {
    if (n === 10)
        return 10;
    if (n === 20)
        return 20;
    if (n === 30)
        return 30;
    return 0;
}
/**
 * ⚠️ Cette fonction DOIT être appelée dans une transaction déjà ouverte (BEGIN ... COMMIT/ROLLBACK).
 * Elle ne fait ni BEGIN, ni COMMIT.
 */
export async function discordDailyClaimTxClient(client, discordUserId) {
    try {
        const now = new Date();
        const mk = monthKeyParis(now);
        const r = await client.query(`
      SELECT discord_user_id, month_key, claim_count, last_claim_at
      FROM discord_daily_claims
      WHERE discord_user_id = $1
      FOR UPDATE
      `, [discordUserId]);
        const row = r.rows?.[0] ?? null;
        if (row?.last_claim_at) {
            const last = new Date(row.last_claim_at);
            const nextAt = new Date(last.getTime() + 24 * 3600_000);
            if (now.getTime() < nextAt.getTime()) {
                return {
                    ok: false,
                    error: "cooldown",
                    remainingMs: nextAt.getTime() - now.getTime(),
                    nextAt,
                    monthKey: mk,
                };
            }
        }
        let count = 0;
        if (!row) {
            count = 1;
            await client.query(`
        INSERT INTO discord_daily_claims (discord_user_id, month_key, claim_count, last_claim_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        `, [discordUserId, mk, count]);
        }
        else {
            if (String(row.month_key) !== mk)
                count = 1;
            else
                count = Number(row.claim_count || 0) + 1;
            await client.query(`
        UPDATE discord_daily_claims
        SET month_key=$2, claim_count=$3, last_claim_at=NOW(), updated_at=NOW()
        WHERE discord_user_id=$1
        `, [discordUserId, mk, count]);
        }
        const base = 5;
        const bonus = bonusForCount(count);
        const amount = base + bonus;
        const nextAt = new Date(now.getTime() + 24 * 3600_000);
        return { ok: true, amount, countThisMonth: count, bonus, nextAt, monthKey: mk };
    }
    catch {
        return { ok: false, error: "db" };
    }
}
