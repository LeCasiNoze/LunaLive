export async function mig032_emotes_gifs(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS emotes (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('emoji','gif')),
      scope TEXT NOT NULL CHECK (scope IN ('native','global','channel')),
      streamer_id BIGINT NULL, -- scope=channel => streamer_id obligatoire
      name TEXT NOT NULL,
      label TEXT NULL,
      asset_key TEXT NULL, -- clé R2 / stockage
      url TEXT NULL,       -- public url (ou path)
      mime TEXT NULL,
      size_bytes INT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','banned','deleted')),
      created_by BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- unicité par périmètre
    CREATE UNIQUE INDEX IF NOT EXISTS emotes_uq_scope_kind_name_channel
      ON emotes(scope, kind, streamer_id, name)
      WHERE scope='channel' AND status <> 'deleted';

    CREATE UNIQUE INDEX IF NOT EXISTS emotes_uq_scope_kind_name_global
      ON emotes(scope, kind, name)
      WHERE scope IN ('native','global') AND status <> 'deleted';

    CREATE INDEX IF NOT EXISTS emotes_idx_channel
      ON emotes(streamer_id, kind)
      WHERE scope='channel' AND status='active';

    CREATE INDEX IF NOT EXISTS emotes_idx_global
      ON emotes(kind)
      WHERE scope IN ('native','global') AND status='active';

    CREATE TABLE IF NOT EXISTS emote_favorites (
      user_id BIGINT NOT NULL,
      emote_id BIGINT NOT NULL REFERENCES emotes(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, emote_id)
    );
  `);
}
