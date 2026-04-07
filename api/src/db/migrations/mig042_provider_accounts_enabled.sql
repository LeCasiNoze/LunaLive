-- Ajouter un champ 'enabled' pour gérer l'activation/désactivation des connexions DLive
ALTER TABLE provider_accounts 
ADD COLUMN enabled BOOLEAN DEFAULT true;

-- Mettre à jour les connexions existantes pour qu'elles soient activées par défaut
UPDATE provider_accounts SET enabled = true WHERE enabled IS NULL;
