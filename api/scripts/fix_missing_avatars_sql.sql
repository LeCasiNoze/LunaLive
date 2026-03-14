-- Script SQL pour attribuer des avatars par défaut aux utilisateurs qui n'en ont pas
-- À exécuter directement dans PostgreSQL (psql, pgAdmin, etc.)

-- 1. Vérifier combien d'utilisateurs n'ont pas d'avatar
SELECT 
  COUNT(*) as total_users,
  COUNT(avatar_path) as users_with_avatar,
  COUNT(*) - COUNT(avatar_path) as missing_avatars
FROM users;

-- 2. Attribuer les avatars par défaut aux utilisateurs qui n'en ont pas
UPDATE users 
SET avatar_path = CASE 
  WHEN (id % 19) = 0 THEN '/Avatar/avatar_scient.png'
  WHEN (id % 19) = 1 THEN '/Avatar/avatar_alien.png'
  WHEN (id % 19) = 2 THEN '/Avatar/avatar_bleu.png'
  WHEN (id % 19) = 3 THEN '/Avatar/avatar_chat.png'
  WHEN (id % 19) = 4 THEN '/Avatar/avatar_chevalier.png'
  WHEN (id % 19) = 5 THEN '/Avatar/avatar_clown.png'
  WHEN (id % 19) = 6 THEN '/Avatar/avatar_demon.png'
  WHEN (id % 19) = 7 THEN '/Avatar/avatar_ghost.png'
  WHEN (id % 19) = 8 THEN '/Avatar/avatar_mage.png'
  WHEN (id % 19) = 9 THEN '/Avatar/avatar_ninja.png'
  WHEN (id % 19) = 10 THEN '/Avatar/avatar_orange.png'
  WHEN (id % 19) = 11 THEN '/Avatar/avatar_panda.png'
  WHEN (id % 19) = 12 THEN '/Avatar/avatar_phara.png'
  WHEN (id % 19) = 13 THEN '/Avatar/avatar_renard.png'
  WHEN (id % 19) = 14 THEN '/Avatar/avatar_robot.png'
  WHEN (id % 19) = 15 THEN '/Avatar/avatar_rose.png'
  WHEN (id % 19) = 16 THEN '/Avatar/avatar_sam.png'
  WHEN (id % 19) = 17 THEN '/Avatar/avatar_santa.png'
  WHEN (id % 19) = 18 THEN '/Avatar/avatar_scient.png'
END
WHERE avatar_path IS NULL OR avatar_path = '';

-- 3. Vérifier les streamers spécifiquement
SELECT 
  s.slug,
  s.display_name,
  u.avatar_path
FROM streamers s
JOIN users u ON u.id = s.user_id
WHERE u.avatar_path IS NULL OR u.avatar_path = '';

-- 4. Si des streamers n'ont toujours pas d'avatar, les mettre à jour manuellement
UPDATE users 
SET avatar_path = CASE 
  WHEN (id % 19) = 0 THEN '/Avatar/avatar_scient.png'
  WHEN (id % 19) = 1 THEN '/Avatar/avatar_alien.png'
  WHEN (id % 19) = 2 THEN '/Avatar/avatar_bleu.png'
  WHEN (id % 19) = 3 THEN '/Avatar/avatar_chat.png'
  WHEN (id % 19) = 4 THEN '/Avatar/avatar_chevalier.png'
  WHEN (id % 19) = 5 THEN '/Avatar/avatar_clown.png'
  WHEN (id % 19) = 6 THEN '/Avatar/avatar_demon.png'
  WHEN (id % 19) = 7 THEN '/Avatar/avatar_ghost.png'
  WHEN (id % 19) = 8 THEN '/Avatar/avatar_mage.png'
  WHEN (id % 19) = 9 THEN '/Avatar/avatar_ninja.png'
  WHEN (id % 19) = 10 THEN '/Avatar/avatar_orange.png'
  WHEN (id % 19) = 11 THEN '/Avatar/avatar_panda.png'
  WHEN (id % 19) = 12 THEN '/Avatar/avatar_phara.png'
  WHEN (id % 19) = 13 THEN '/Avatar/avatar_renard.png'
  WHEN (id % 19) = 14 THEN '/Avatar/avatar_robot.png'
  WHEN (id % 19) = 15 THEN '/Avatar/avatar_rose.png'
  WHEN (id % 19) = 16 THEN '/Avatar/avatar_sam.png'
  WHEN (id % 19) = 17 THEN '/Avatar/avatar_santa.png'
  WHEN (id % 19) = 18 THEN '/Avatar/avatar_scient.png'
END
WHERE id IN (
  SELECT u.id 
  FROM streamers s 
  JOIN users u ON u.id = s.user_id 
  WHERE u.avatar_path IS NULL OR u.avatar_path = ''
);

-- 5. Vérification finale
SELECT 
  COUNT(*) as total_users,
  COUNT(avatar_path) as users_with_avatar,
  COUNT(*) - COUNT(avatar_path) as still_missing
FROM users;

-- 6. Afficher quelques exemples d'avatars attribués
SELECT 
  id,
  username,
  avatar_path
FROM users 
WHERE avatar_path IS NOT NULL 
ORDER BY id DESC 
LIMIT 10;
