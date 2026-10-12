import type {Pool} from 'pg';
export async function mig146_community_benefits(pool:Pool){
 const client=await pool.connect();
 try{
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(8244146)');
 await client.query(`CREATE TABLE IF NOT EXISTS automod_account_benefits(
 streamer_id bigint NOT NULL REFERENCES streamers(id),rumble_user_id text NOT NULL,
 calls_tier integer NOT NULL DEFAULT 0 CHECK(calls_tier BETWEEN 0 AND 3),
 music_tier integer NOT NULL DEFAULT 0 CHECK(music_tier BETWEEN 0 AND 3),
 cnz_claimed_at timestamptz,cnz_active boolean NOT NULL DEFAULT FALSE,cnz_seen_at timestamptz NOT NULL DEFAULT '-infinity',PRIMARY KEY(streamer_id,rumble_user_id));
 ALTER TABLE automod_account_benefits ADD COLUMN IF NOT EXISTS cnz_active boolean NOT NULL DEFAULT FALSE;
 ALTER TABLE automod_account_benefits ADD COLUMN IF NOT EXISTS cnz_seen_at timestamptz NOT NULL DEFAULT '-infinity';
 ALTER TABLE bot_autoposts ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all' CHECK(scope IN ('all','automod','personal'));
 UPDATE bot_autoposts SET scope='automod' WHERE message='{{automod_session}}';
 CREATE TABLE IF NOT EXISTS automod_community_configured(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),configured_at timestamptz NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS automod_autopost_backups(streamer_id bigint NOT NULL,id bigint NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(streamer_id,id));
 INSERT INTO automod_autopost_backups(streamer_id,id,payload)
 SELECT p.streamer_id,p.id,to_jsonb(p) FROM bot_autoposts p JOIN streamers s ON s.id=p.streamer_id
 WHERE lower(s.slug)='lecasinoze' AND NOT EXISTS(SELECT 1 FROM automod_community_configured c WHERE c.streamer_id=s.id) ON CONFLICT DO NOTHING;
 UPDATE bot_autoposts p SET message=CASE p.message
 WHEN 'Un bug ou une idée ? !avis pour nous faire un retour. Merci !' THEN '💡 Un bug ou une idée ? !avis pour nous aider à améliorer les lives.'
 WHEN 'Rejoins la communauté : !discord. Tous nos liens : !site.' THEN '💜 On se retrouve aussi sur Discord : !discord. Le site et tous nos liens : !site.'
 ELSE '✨ Tes calls font progresser ton profil : !profil pour ton niveau et ta remise. !shop pour les bonus et améliorations. Rain annoncée ? !rain.' END,
 scope=CASE WHEN p.message LIKE '!shop : bonus et options.%' THEN 'automod' ELSE 'all' END
 FROM streamers s WHERE p.streamer_id=s.id AND lower(s.slug)='lecasinoze'
 AND NOT EXISTS(SELECT 1 FROM automod_community_configured c WHERE c.streamer_id=s.id)
 AND p.message IN ('Un bug ou une idée ? !avis pour nous faire un retour. Merci !','Rejoins la communauté : !discord. Tous nos liens : !site.','!shop : bonus et options. !points : ton solde. !profil : ta progression. Rain annoncée ? !rain pour participer.');
 INSERT INTO bot_autoposts(streamer_id,message,every_sec,enabled,scope,created_at,updated_at)
 SELECT s.id,'💜 Mets CNZ au début de ton pseudo Rumble : +2 000 points une seule fois par compte et +1 call en attente tant que tu gardes CNZ. Écris dans le chat pour le valider.',1200,TRUE,'all',NOW(),NOW()
 FROM streamers s WHERE lower(s.slug)='lecasinoze' AND NOT EXISTS(SELECT 1 FROM automod_community_configured c WHERE c.streamer_id=s.id);
 INSERT INTO automod_community_configured(streamer_id) SELECT id FROM streamers WHERE lower(slug)='lecasinoze' ON CONFLICT DO NOTHING;`);
 await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
