function normalizeTrigger(v) {
    const s = String(v || "").trim();
    if (!s)
        return "";
    const first = s.split(/\s+/)[0]; // 1er mot seulement
    return first.replace(/^[!/]+/g, "").toLowerCase();
}
export async function loadCommands(pool, streamerId) {
    const map = new Map();
    try {
        const r = await pool.query(`SELECT trigger, response, enabled, cooldown_sec
       FROM bot_commands
       WHERE streamer_id=$1`, [streamerId]);
        for (const row of r.rows) {
            const trigger = normalizeTrigger(row.trigger);
            if (!trigger)
                continue;
            map.set(trigger, {
                trigger,
                response: String(row.response || ""),
                enabled: Boolean(row.enabled),
                cooldownSec: Number(row.cooldown_sec || 3),
            });
        }
    }
    catch (e) {
        // table missing => ok au début
        if (String(e?.code || "") !== "42P01")
            throw e;
    }
    return map;
}
export async function loadAutoposts(pool, streamerId) {
    try {
        const r = await pool.query(`SELECT message, every_sec, enabled
       FROM bot_autoposts
       WHERE streamer_id=$1
       ORDER BY id ASC`, [streamerId]);
        return r.rows
            .map((row) => ({
            message: String(row.message || ""),
            everySec: Number(row.every_sec || 0),
            enabled: Boolean(row.enabled),
        }))
            .filter((a) => a.enabled && a.message.trim() && a.everySec > 0);
    }
    catch (e) {
        if (String(e?.code || "") !== "42P01")
            throw e;
        return [];
    }
}
