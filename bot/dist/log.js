export async function logEvent(pool, streamerId, level, message, meta) {
    const prefix = streamerId ? `[bot][s:${streamerId}]` : "[bot]";
    const line = `${prefix} ${level.toUpperCase()} ${message}`;
    if (level === "error")
        console.error(line, meta ?? "");
    else if (level === "warn")
        console.warn(line, meta ?? "");
    else
        console.log(line, meta ?? "");
    // Optionnel: persister en DB si table existe
    try {
        await pool.query(`INSERT INTO bot_events(streamer_id, level, message, meta)
       VALUES ($1, $2, $3, $4::jsonb)`, [streamerId, level, message, meta ? JSON.stringify(meta) : "{}"]);
    }
    catch (e) {
        // si table n'existe pas encore -> on ignore
        const code = String(e?.code || "");
        if (code !== "42P01") {
            console.warn("[bot] bot_events insert failed:", e?.message || e);
        }
    }
}
