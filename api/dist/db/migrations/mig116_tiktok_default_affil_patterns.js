export async function mig116_tiktok_default_affil_patterns(pool) {
    // Seed les patterns d'affiliation par défaut.
    // Tous nos liens d'affil passent par taap.it → c'est LE pattern principal
    // qui marque une vidéo comme "video promo" pour le scoring.
    // lunalive.win/r/ garde sa place comme pattern pour les liens internes.
    const defaults = [
        { pattern: "taap.it/", label: "taap.it (affil universal LunaLive)" },
        { pattern: "lunalive.win/r/", label: "lunalive.win redirect" },
    ];
    for (const d of defaults) {
        await pool.query(`INSERT INTO tiktok_affil_patterns (pattern, label)
       VALUES ($1, $2)
       ON CONFLICT (LOWER(pattern)) DO NOTHING`, [d.pattern, d.label]);
    }
}
