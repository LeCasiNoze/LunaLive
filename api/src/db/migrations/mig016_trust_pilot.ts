// api/src/db/migrations/mig016_trust_pilot.ts
import type { Pool } from "pg";

export async function mig016_trust_pilot(pool: Pool) {

    await pool.query(`
    CREATE TABLE IF NOT EXISTS casino_listings (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        logo_url TEXT,
        status TEXT NOT NULL DEFAULT 'published', -- published|hidden|disabled
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        featured_rank INT,
        bonus_headline TEXT,
        description TEXT,
        pros JSONB NOT NULL DEFAULT '[]',
        cons JSONB NOT NULL DEFAULT '[]',
        team_rating NUMERIC(3,2),
        team_review TEXT,
        watch_level TEXT NOT NULL DEFAULT 'none', -- none|watch|avoid
        watch_reason TEXT,
        watch_updated_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_casinos_status_featured
        ON casino_listings(status, featured_rank);

    CREATE INDEX IF NOT EXISTS idx_casinos_created_at
        ON casino_listings(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_casinos_watch_level
        ON casino_listings(watch_level);

    CREATE TABLE IF NOT EXISTS casino_user_ratings (
        casino_id BIGINT NOT NULL REFERENCES casino_listings(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (casino_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS casino_comments (
        id BIGSERIAL PRIMARY KEY,
        casino_id BIGINT NOT NULL REFERENCES casino_listings(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'published', -- published|pending|rejected|deleted
        has_images BOOLEAN NOT NULL DEFAULT FALSE,
        moderated_by INT REFERENCES users(id),
        moderated_at TIMESTAMPTZ,
        moderation_note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_casino_comments_feed
        ON casino_comments(casino_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_casino_comments_pending
        ON casino_comments(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS casino_comment_images (
        id BIGSERIAL PRIMARY KEY,
        comment_id BIGINT NOT NULL REFERENCES casino_comments(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        w INT,
        h INT,
        size_bytes INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS casino_comment_reactions (
        comment_id BIGINT NOT NULL REFERENCES casino_comments(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('up','down')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS casino_affiliate_links (
        id BIGSERIAL PRIMARY KEY,
        casino_id BIGINT NOT NULL REFERENCES casino_listings(id) ON DELETE CASCADE,
        owner_user_id INT REFERENCES users(id), -- NULL = lien "platform" (bonus)
        label TEXT,
        target_url TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        pinned_rank INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_casino_links_order
        ON casino_affiliate_links(casino_id, enabled, pinned_rank);

    CREATE TABLE IF NOT EXISTS casino_affiliate_clicks (
        id BIGSERIAL PRIMARY KEY,
        casino_id BIGINT NOT NULL REFERENCES casino_listings(id) ON DELETE CASCADE,
        link_id BIGINT NOT NULL REFERENCES casino_affiliate_links(id) ON DELETE CASCADE,
        visitor_user_id INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ref TEXT
    );

    INSERT INTO casino_listings
    (slug, name, status, featured_rank, bonus_headline, description, pros, cons, team_rating, team_review, watch_level, watch_reason)
        VALUES
        ('brutalcasino','BrutalCasino','published', 1, '200% jusqu’à 300€', 'Casino mis en avant LunaLive.', '["Bonus intéressant","Jeux variés"]'::jsonb, '["Conditions bonus à lire"]'::jsonb, 4.2, 'Bon choix global.', 'none', NULL),
        ('hypebet','HypeBet','published', 2, '100% jusqu’à 500€', 'Casino / sportsbook populaire.', '["UX solide","Support réactif"]'::jsonb, '["Limites selon pays"]'::jsonb, 4.0, 'Solide mais attention aux limites.', 'watch', 'Quelques retours mitigés sur certains retraits.')
        ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        featured_rank = EXCLUDED.featured_rank,
        bonus_headline = EXCLUDED.bonus_headline,
        description = EXCLUDED.description,
        pros = EXCLUDED.pros,
        cons = EXCLUDED.cons,
        team_rating = EXCLUDED.team_rating,
        team_review = EXCLUDED.team_review,
        watch_level = EXCLUDED.watch_level,
        watch_reason = EXCLUDED.watch_reason;

        -- lien "bonus" (plateforme) : owner_user_id NULL
        INSERT INTO casino_affiliate_links (casino_id, owner_user_id, label, target_url, enabled, pinned_rank)
        SELECT id, NULL, 'Bonus LunaLive', 'https://example.com/bonus', TRUE, 1
        FROM casino_listings
        WHERE slug IN ('brutalcasino','hypebet')
        ON CONFLICT DO NOTHING;

    ALTER TABLE streamers
    ADD COLUMN IF NOT EXISTS dlive_use_linked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dlive_link_displayname TEXT,
    ADD COLUMN IF NOT EXISTS dlive_link_username TEXT,
    ADD COLUMN IF NOT EXISTS dlive_linked_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS streamer_dlive_link_requests (
    id SERIAL PRIMARY KEY,
    streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
    requested_displayname TEXT NOT NULL,
    requested_username TEXT,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|verified|expired
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uniq_sdlr_pending
    ON streamer_dlive_link_requests(streamer_id)
    WHERE status='pending';

    `);
    
}
