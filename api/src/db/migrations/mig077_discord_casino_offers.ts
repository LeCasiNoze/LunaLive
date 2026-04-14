import type { Pool } from "pg";

export async function mig077_discord_casino_offers(pool: Pool) {
  await pool.query(`
    -- Offres configurées par les modérateurs
    CREATE TABLE IF NOT EXISTS discord_casino_offers (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id      TEXT NOT NULL,
      casino        TEXT NOT NULL,                        -- 'razed', 'brutal-casino', etc.
      label         TEXT NOT NULL,                        -- affiché dans le select menu
      description   TEXT,                                 -- affiché dans la notif événement
      min_deposit   INTEGER NOT NULL DEFAULT 50,          -- montant minimum en euros
      reimburse_amt INTEGER NOT NULL DEFAULT 25,          -- montant remboursé en euros
      reimburse_type TEXT NOT NULL DEFAULT 'wallet',      -- 'casino' | 'wallet'
      crypto        TEXT,                                 -- 'USDT', 'BTC', etc. si wallet
      type          TEXT NOT NULL DEFAULT 'permanent',    -- 'permanent' | 'event'
      event_end_at  TIMESTAMPTZ,                          -- null si permanent
      active        BOOLEAN NOT NULL DEFAULT true,
      created_by    TEXT,                                 -- Discord user ID du mod
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Tickets offre casino soumis par les utilisateurs
    CREATE TABLE IF NOT EXISTS discord_casino_tickets (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id             TEXT NOT NULL,
      channel_id           TEXT NOT NULL UNIQUE,
      offer_id             UUID REFERENCES discord_casino_offers(id),
      casino               TEXT NOT NULL,

      -- Utilisateur Discord
      discord_user_id      TEXT NOT NULL,
      discord_username     TEXT NOT NULL,

      -- Compte casino
      casino_email         TEXT NOT NULL,
      casino_pseudo        TEXT NOT NULL,
      deposit_amount       INTEGER NOT NULL,
      deposit_screenshot_url TEXT,

      -- Remboursement (choisi par le mod au moment de la validation)
      reimburse_type       TEXT,                         -- 'casino' | 'wallet'
      reimburse_address    TEXT,                         -- adresse wallet si wallet
      reimburse_amount     INTEGER,

      -- État du flux (machine à états)
      -- pending_screenshot | pending_decision | pending_wallet | pending_casino_url
      -- pending_casino_screenshot | pending_virement | refused | appeal_pending | closed
      state                TEXT NOT NULL DEFAULT 'pending_screenshot',
      status               TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
      reject_reason        TEXT,
      moderator_id         TEXT,
      moderator_username   TEXT,

      -- Message dans vérif-tickets (pour édition)
      verif_msg_id         TEXT,
      -- Méthode de remboursement choisie par le mod
      reimburse_method     TEXT,       -- 'wallet' | 'casino'
      casino_wallet_url    TEXT,
      casino_wallet_crypto TEXT,       -- ETH, USDC, SOL...
      casino_wallet_network TEXT,      -- ERC-20, TRC-20... (optionnel)

      -- Anti-fraude
      dup_email            BOOLEAN NOT NULL DEFAULT false,
      dup_wallet           BOOLEAN NOT NULL DEFAULT false,
      dup_discord          BOOLEAN NOT NULL DEFAULT false,

      -- Timestamps
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at           TIMESTAMPTZ,
      close_at             TIMESTAMPTZ,                  -- fermeture auto programmée
      closed_at            TIMESTAMPTZ
    );

    -- Index anti-fraude
    CREATE INDEX IF NOT EXISTS idx_dct_email   ON discord_casino_tickets(casino, casino_email);
    CREATE INDEX IF NOT EXISTS idx_dct_wallet  ON discord_casino_tickets(reimburse_address) WHERE reimburse_address IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_dct_discord ON discord_casino_tickets(discord_user_id, casino);
    CREATE INDEX IF NOT EXISTS idx_dct_status  ON discord_casino_tickets(guild_id, status);
  `);
}
