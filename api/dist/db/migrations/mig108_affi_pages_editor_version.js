export async function mig108_affi_pages_editor_version(pool) {
    // Editor V2 : on ajoute une colonne editor_version pour distinguer les
    // pages V1 (config flat) des pages V2 (arbre de blocs structuré dans
    // config JSONB). Default 1 → toutes les anciennes pages restent V1
    // intactes. Les nouvelles pages créées via /editorFSNV2 auront 2.
    await pool.query(`
    ALTER TABLE affi_landing_pages
      ADD COLUMN IF NOT EXISTS editor_version SMALLINT NOT NULL DEFAULT 1;
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_landing_pages_editor_version
      ON affi_landing_pages(editor_version);
  `);
}
