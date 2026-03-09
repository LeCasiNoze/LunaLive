const DEFAULT_AVATARS = [
    "/Avatar/avatar_alien.png",
    "/Avatar/avatar_bleu.png",
    "/Avatar/avatar_chat.png",
    "/Avatar/avatar_chevalier.png",
    "/Avatar/avatar_clown.png",
    "/Avatar/avatar_demon.png",
    "/Avatar/avatar_ghost.png",
    "/Avatar/avatar_mage.png",
    "/Avatar/avatar_ninja.png",
    "/Avatar/avatar_orange.png",
    "/Avatar/avatar_panda.png",
    "/Avatar/avatar_phara.png",
    "/Avatar/avatar_renard.png",
    "/Avatar/avatar_robot.png",
    "/Avatar/avatar_rose.png",
    "/Avatar/avatar_sam.png",
    "/Avatar/avatar_santa.png",
    "/Avatar/avatar_scient.png",
];
export async function mig042_default_user_avatar_path(pool) {
    await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_path TEXT NULL;
  `);
    // ⚠️ On encode la liste en ARRAY SQL (indexé à partir de 1 en Postgres)
    const arrSql = DEFAULT_AVATARS.map((s) => `'${s.replaceAll("'", "''")}'`).join(",");
    await pool.query(`
    UPDATE users u
    SET avatar_path = (ARRAY[${arrSql}])[ (u.id % ${DEFAULT_AVATARS.length}) + 1 ]
    WHERE u.avatar_path IS NULL
      AND NOT EXISTS (SELECT 1 FROM user_avatars ua WHERE ua.user_id = u.id);
  `);
}
