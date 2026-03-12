function normKey(v) {
    return String(v ?? "").trim().toLowerCase();
}
export async function tryHandleWheelCommand(args) {
    const body = String(args.msg?.body ?? "").trim();
    if (!body)
        return false;
    // accepte:
    // - prefix configurable: "!join", "?join", etc.
    // - ET aussi "!join" en dur (au cas où prefix ≠ "!")
    const p = String(args.prefix || "!");
    const isJoin = new RegExp(`^${escapeRegex(p)}join\\b`, "i").test(body) ||
        /^!join\b/i.test(body);
    const isWheel = new RegExp(`^${escapeRegex(p)}wheel\\b`, "i").test(body) ||
        /^!wheel\b/i.test(body);
    if (!isJoin && !isWheel)
        return false;
    // cfg
    await ensureCfg(args.pool, args.streamer.id);
    const cfgR = await args.pool.query(`SELECT enroll_open
     FROM bot_wheel_cfg
     WHERE streamer_id=$1
     LIMIT 1`, [args.streamer.id]);
    const open = Boolean(cfgR.rows?.[0]?.enroll_open);
    if (isWheel && !isJoin) {
        const countR = await args.pool.query(`SELECT COUNT(*)::int AS n
       FROM bot_wheel_entries
       WHERE streamer_id=$1`, [args.streamer.id]);
        const n = Number(countR.rows?.[0]?.n || 0);
        if (open) {
            await args.send(`🎡 Inscriptions OUVERTES — ${n} inscrit(s). Tape ${p}join pour participer.`);
        }
        else {
            await args.send(`🎡 Inscriptions FERMÉES — ${n} inscrit(s).`);
        }
        return true;
    }
    // JOIN
    if (!open) {
        await args.send(`🎡 Inscriptions fermées. (Le streamer doit les ouvrir)`);
        return true;
    }
    // TODO (futur):
    // - follow-only
    // - sub-only
    // - autres conditions (ancienneté, points, etc.)
    // => ça se plug ici avant l'insert.
    const userId = Number(args.msg?.userId || 0);
    const username = String(args.msg?.username || "").trim();
    const usernameLc = normKey(username);
    if (!userId || !username) {
        await args.send(`🎡 Impossible de t’inscrire (compte invalide).`);
        return true;
    }
    // on tente insert (user_id si colonne + index unique)
    // si ta migration n'est pas appliquée, ça va throw -> fallback sur username_lc
    let joined = false;
    try {
        const ins = await args.pool.query(`INSERT INTO bot_wheel_entries (streamer_id, user_id, username, username_lc)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (streamer_id, user_id) DO NOTHING
       RETURNING id`, [args.streamer.id, userId, username, usernameLc]);
        joined = !!ins.rows?.[0];
    }
    catch {
        // fallback MVP (sans user_id)
        const ins = await args.pool.query(`INSERT INTO bot_wheel_entries (streamer_id, username, username_lc)
       VALUES ($1,$2,$3)
       ON CONFLICT (streamer_id, username_lc) DO NOTHING
       RETURNING id`, [args.streamer.id, username, usernameLc]);
        joined = !!ins.rows?.[0];
    }
    if (joined) {
        await args.send(`🎡 ${username} est inscrit à la roue !`);
    }
    else {
        await args.send(`🎡 ${username} est déjà inscrit.`);
    }
    return true;
}
async function ensureCfg(pool, streamerId) {
    await pool.query(`INSERT INTO bot_wheel_cfg(streamer_id, enroll_open)
     VALUES ($1, FALSE)
     ON CONFLICT (streamer_id) DO NOTHING`, [streamerId]);
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
