-- Migration manuelle pour créer la table ig_comment_replies
-- Exécuter ce SQL directement dans votre base de données

-- Création de la table
CREATE TABLE IF NOT EXISTS ig_comment_replies (
  id SERIAL PRIMARY KEY,
  comment_id VARCHAR(100) NOT NULL UNIQUE,
  media_id VARCHAR(50) NOT NULL,
  username VARCHAR(100) NOT NULL,
  comment_text TEXT,
  dm_sent BOOLEAN DEFAULT FALSE,
  dm_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimisation
CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_comment_id ON ig_comment_replies(comment_id);
CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_media_id ON ig_comment_replies(media_id);
CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_created_at ON ig_comment_replies(created_at);

-- Vérification
SELECT 'Table ig_comment_replies créée avec succès' as status;
