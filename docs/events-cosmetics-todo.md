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

## 🎁 Coffre communautaire (global_chest) — à créer
- **Badge participation** — `cos_chest_*` (déjà `chest_YYYYMM` en code) · donné à tous si palier atteint.
- **Cosmétique permanent** — si on veut un palier prestige collectif.
- (Event collectif : pas de classement top-3 ni #1 → pas de cadre/titre exclusif nécessaire, sauf si on ajoute un top-contributeurs.)

## 🔥 Boss à abattre (burn_boss) — à créer
- **Badge slayer** — `boss_slayer_YYYYMM` (déjà en code) · à tous les contributeurs si boss tué.
- **Cosmétique permanent** — pour le top-dégâts.
- **Cadre animé exclusif (top-3 dégâts)** — `frame_boss_*` · idée : bordure "flammes" animée.
- **Titre "Coup de grâce"** — au joueur qui porte le dernier coup (mécanique à ajouter).

## 🤝 Semaine en duo (duo_week) — à créer
- **Badge commun** — `cos_duo_*` · aux 2 commus du duo gagnant.
- **Cadre animé exclusif** — `frame_duo_*` · idée : cadre à 2 couleurs (les 2 streamers).
- **Titre duo champion** — `duo_champ_YYYYMM` (déjà en code) · aux 2 streamers.

---

## Système de cadres de message animés (à construire côté produit)
Lucas veut des **cadres animés autour des messages de chat** (contexte : chat live). Le
premier concret : roulette noir/rouge + roue GIF en bas à droite. Ça implique un système
générique "message frame" (cosmétique équipable, rendu dans le chat autour du message).
À spécifier quand on attaque les cosmétiques.
