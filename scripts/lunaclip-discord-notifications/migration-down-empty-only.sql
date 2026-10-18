BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM lunaclip_discord_outbox) THEN RAISE EXCEPTION 'refuse_to_delete_publication_history'; END IF; END $$;
DROP TABLE lunaclip_discord_outbox;
DROP TABLE lunaclip_discord_config;
COMMIT;
