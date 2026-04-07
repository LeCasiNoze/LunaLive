-- Migration pour ajouter les champs platform et rumbleEmbedUrl (temporaire LeCasiNoze)
-- Ajoute les champs nécessaires pour l'intégration Rumble embed

ALTER TABLE streamers 
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'dlive' CHECK (platform IN ('dlive', 'rumble')),
ADD COLUMN IF NOT EXISTS rumble_embed_url TEXT;

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_streamers_platform ON streamers(platform);
CREATE INDEX IF NOT EXISTS idx_streamers_rumble_embed_url ON streamers(rumble_embed_url) WHERE rumble_embed_url IS NOT NULL;

-- Mettre à jour LeCasiNoze avec les valeurs par défaut
UPDATE streamers 
SET platform = 'rumble', 
    rumble_embed_url = 'https://rumble.com/embed/v760bpk/?pub=4p6wxa'
WHERE LOWER(slug) = 'lecasinoze';
