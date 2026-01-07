export async function mig018_casino_team_rating_decimal(pool) {
    await pool.query(`
    DO $$
    BEGIN
      -- si la colonne n'existe pas (au cas où)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='casino_listings'
          AND column_name='team_rating'
      ) THEN
        ALTER TABLE casino_listings
          ADD COLUMN team_rating double precision;
      ELSE
        -- si elle existe mais n'est pas déjà en double precision
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='casino_listings'
            AND column_name='team_rating'
            AND data_type='double precision'
        ) THEN
          BEGIN
            ALTER TABLE casino_listings
              ALTER COLUMN team_rating TYPE double precision
              USING team_rating::double precision;
          EXCEPTION WHEN others THEN
            -- fallback si le type est chelou / string : on cast via text
            ALTER TABLE casino_listings
              ALTER COLUMN team_rating TYPE double precision
              USING NULLIF(team_rating::text, '')::double precision;
          END;
        END IF;
      END IF;

      -- garde-fou 0..5 (optionnel mais propre)
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'casino_listings_team_rating_chk'
      ) THEN
        ALTER TABLE casino_listings
          ADD CONSTRAINT casino_listings_team_rating_chk
          CHECK (team_rating IS NULL OR (team_rating >= 0 AND team_rating <= 5));
      END IF;
    END $$;
  `);
}
