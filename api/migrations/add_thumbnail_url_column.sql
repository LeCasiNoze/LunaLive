-- api/migrations/add_thumbnail_url_column.sql
-- Migration pour ajouter thumbnail_url persistée aux clips

-- Ajouter la colonne thumbnail_url à la table bot_clips
ALTER TABLE bot_clips 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Créer un index pour les recherches rapides (optionnel)
CREATE INDEX IF NOT EXISTS idx_bot_clips_thumbnail_url 
ON bot_clips(thumbnail_url) 
WHERE thumbnail_url IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON COLUMN bot_clips.thumbnail_url IS 'URL persistée de la thumbnail du clip (générée à la création, stockée dans R2)';

-- La colonne est NULL par défaut pour backward compatibility
-- Les nouveaux clips auront thumbnail_url remplie via le processus de création
-- Les anciens clips utiliseront le fallback FFMPEG jusqu'à régénération
