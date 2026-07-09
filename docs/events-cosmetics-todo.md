# Cosmétiques d'events — liste de courses (à créer)

Chaque event a besoin de cosmétiques dédiés. Règle : les **communs** sont accessibles
tôt (palier bas) et débloquables UNIQUEMENT via l'event ; les **prestige permanents** et
les **exclusifs de classement** ne se VENDENT jamais en boutique (mérite uniquement).
Statut : à créer par Lucas (assets), les `code` sont les identifiants côté DB (user_entitlements).

Format par event : Badge commun · Cosmétique permanent (palier final) · Cadre animé exclusif (top-3) · Titre (#1).

---

## 🎡 Semaine de la roue (wheel_week) — SPÉCIFIÉ
- **Badge commun** — code `cos_wheel_spinner` · kind `skin`/badge · "Spinner" · débloqué au palier 1 (250 pts) OU achetable 200 rubis en boutique. Visuel : jeton/roulette stylisé. Accessible à ~tous les participants.
- **Cosmétique PERMANENT (palier 7500)** — code `cos_wheel_highroller` · rare (whales/stackers only). Visuel à définir (idée : jeton doré "High Roller" animé, ou avatar frame roulette dorée). PERMANENT une fois obtenu.
- **Cadre de message animé EXCLUSIF (top-3 classement)** — code `frame_wheel_roulette` · **cadran noir & rouge facon roulette, avec une roue qui tourne en GIF en bas à droite du cadran** (demandé par Lucas). S'affiche autour des messages de chat du joueur.
- **Titre (#1 classement)** — code `title_wheel_king` · "Roi de la Roue" · remis en jeu à chaque retour de l'event.
- (Rappel : le #1 gagne aussi l'ABO viewer 7j — pas un cosmétique, mais le lot phare.)

---

## 👑 Semaine du viewer (viewer_week) — à créer
- **Badge commun** — `cos_viewer_regular` · "Habitué" · palier bas.
- **Cosmétique PERMANENT (palier final)** — `cos_viewer_prestige` · visuel à définir.
- **Cadre animé exclusif (top-3)** — `frame_viewer_*` · thème à définir (idée : cadre "spotlight"/projecteur).
- **Titre (#1)** — `title_viewer_champion` · "Champion de la semaine".

## 🎬 Course aux clips (clip_race) — à créer
- **Badge commun** — `cos_clip_creator` · "Clippeur".
- **Cosmétique permanent** — `cos_clip_prestige`.
- **Cadre animé exclusif** — `frame_clip_*` · idée : bordure "pellicule de film" animée.
- **Titre streamer gagnant** — `title_clip_race_streamer` (déjà référencé dans le code) · "Roi du clip".

## 🎁 Coffre communautaire (global_chest) — SPÉCIFIÉ
Décision Lucas : on ajoute un **classement des contributeurs** → le top-3 est récompensé
(cosmétique réservé aux tops, pas de cosmétique « à tout le monde »). Le lot collectif
« tout le monde » = les **paliers escaladants** (rubis + tickets, réclamés en direct).
- **Cadre de message EXCLUSIF (top-3 contributeurs)** — code `frame_chest_vault` · kind `skin` · thème coffre-fort / trésor (idée : bordure or + serrure/pièces animées). **Permanent** une fois obtenu (comme `frame_wheel_roulette`), s'accumule (plusieurs porteurs). Référencé dans `EVENT_REWARD_CONFIGS.global_chest.collective.topSkinCode`.
- **Titre (#1 contributeur)** — code `title_chest_baron` · « Baron du Coffre » · unique, **remis en jeu** à chaque retour de l'event (cf `revokePreviousTitle`). Référencé dans `topTitleCode`.
- (Note : l'ancien badge `chest_YYYYMM` « à tous » a été retiré — remplacé par les paliers.)
- (Rappel « 6 semaines » : les skins n'ont PAS d'expiration en base — permanent, comme la roue. Le « 6 semaines » ressenti = le cycle entre deux passages de l'event. Une vraie expiration nécessiterait une colonne `expires_at` sur `user_entitlements` + un nettoyage — chantier séparé si voulu.)

## 🔥 Boss à abattre (burn_boss) — SPÉCIFIÉ
Si le boss tombe : à TOUT contributeur (≥ 50 dégâts) badge + XP + tour de roue + 3j de
premium promo (perks dont !pcall, SANS ticket sub) + rubis par tranche de rang. Top-3 =
cadre exclusif + #1 titre. Boss survit = rien (HP calibrée bas pour que ce soit rare).
- **Badge slayer** — `boss_slayer_YYYYMM` (kind `title`, déjà en code) · à tous les contributeurs si boss tué.
- **Cadre de message EXCLUSIF (top-3 dégâts)** — code `frame_boss_flames` · kind `skin` · bordure « flammes » animée (idée : braises + halo rouge/violet, cohérent avec la jauge boss). **Permanent** (comme `frame_wheel_roulette` / `frame_chest_vault`). Référencé dans `EVENT_REWARD_CONFIGS.burn_boss.boss.topSkinCode`.
- **Titre (#1 dégâts)** — code `title_boss_bourreau` · « Bourreau » · unique, **remis en jeu** à chaque retour de l'event (cf `revokePreviousTitle`). Référencé dans `topTitleCode`.
- (Idée future : titre « Coup de grâce » au joueur qui porte le dernier coup — nécessite de tracer le dernier hit, mécanique à ajouter.)

## 🤝 Semaine en duo (duo_week) — CONCEPT CONFIRMÉ : duos de STREAMERS
Deux streamers à audience commune sont appariés (greedy) ; leurs 2 communautés cumulent
leur activité. Le viewer contribue en regardant son streamer. Récompenses actuellement
câblées : titre `duo_champ_YYYYMM` aux 2 streamers du duo #1 + 40 rubis aux membres actifs
des 2 commus (max 200). Pas de cadre/premium pour l'instant (rewards volontairement lean).
- **Titre duo champion** — `duo_champ_YYYYMM` (déjà en code) · aux 2 streamers du duo #1.
- (Idées futures, non câblées) **Cadre animé exclusif** `frame_duo_*` (cadre bicolore, les 2 streamers) · **Badge commun** `cos_duo_*` aux 2 commus.

---

## Système de cadres de message animés (à construire côté produit)
Lucas veut des **cadres animés autour des messages de chat** (contexte : chat live). Le
premier concret : roulette noir/rouge + roue GIF en bas à droite. Ça implique un système
générique "message frame" (cosmétique équipable, rendu dans le chat autour du message).
À spécifier quand on attaque les cosmétiques.
