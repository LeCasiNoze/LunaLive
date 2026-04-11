// api/src/db/migrations/mig063_instagram_collab_unique.ts
// Ajoute la contrainte UNIQUE manquante sur instagram_collaborations.publish_job_id
// Sans elle, le ON CONFLICT (publish_job_id) dans instagram_scheduler.ts échoue.
export async function mig063_instagram_collab_unique(pool) {
    await pool.query(`
    ALTER TABLE instagram_collaborations
      ADD CONSTRAINT IF NOT EXISTS instagram_collaborations_publish_job_id_unique
      UNIQUE (publish_job_id)
  `).catch(async () => {
        // Syntax "ADD CONSTRAINT IF NOT EXISTS" n'est pas supportée sur PG < 15 — fallback
        await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'instagram_collaborations_publish_job_id_unique'
        ) THEN
          ALTER TABLE instagram_collaborations
            ADD CONSTRAINT instagram_collaborations_publish_job_id_unique
            UNIQUE (publish_job_id);
        END IF;
      END $$;
    `);
    });
    console.log("[migration] instagram_collaborations.publish_job_id UNIQUE constraint ensured");
}
