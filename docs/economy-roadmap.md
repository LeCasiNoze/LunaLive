# Roadmap Économie / Engagement — LunaLive

État au moment de la création : 100 comptes, économie sous-utilisée
(top earner = 14 rubis/jour, casual = <1/jour, 0 spend toutes catégories).

## Sprint 1 — Simplification des poids ✅ EN COURS

**Objectif** : 1 seule source de vérité pour les poids. Seuls les rubis
*achetés* (paid_topup) et les rubis d'*events spéciaux* sont cashables.
Tout le reste = "show value" (utilisable en cosmétique/sub mais 0 valeur
en cashout streamer).

- [ ] Consolider `api/src/economy.ts` comme single source
- [ ] Nouveaux poids : `paid_topup=10000`, `event_full_value=10000`,
      tout le reste = `0`
- [ ] Mettre à jour `sqlWeightBpExpr` en cohérence
- [ ] Marquer `economy/config.ts`, `economy/rewards_config.ts`,
      `economy/engine.ts` comme deprecated
- [ ] Vérifier aucune régression cashout / sub / cosmétique

Aucune migration de données nécessaire (origins gardent leur sens, la
nouvelle config remap au runtime).

## Sprint 2 — Quêtes Daily/Weekly/Monthly

**Objectif** : carotte d'engagement quotidienne, calibrée pour qu'un
casual fasse ~500 rubis/mois (= 1 sub) et qu'un hardcore fasse
~1500/mois (= 1 cosmétique premium / 2 mois).

### Catalogue final (ajustable côté admin)

#### Daily — pool 9, 3-4 actives/jour, rotation aléatoire

| Code | Cible | Reward |
|---|---|---|
| `daily_login` | Connexion | 2 |
| `daily_chat_5` | 5 messages | 2 |
| `daily_watch_30` | 30 min watchtime | 4 |
| `daily_call_1` | 1 call envoyé | 4 |
| `daily_call_3` *(advanced)* | 3 calls | 8 |
| `daily_visit_2` | 2 streamers visités | 3 |
| `daily_discord_claim` | `/claim` validé sur Discord | 2 |
| `daily_blackjack_1` | 1 blackjack joué | 3 |
| `daily_rain_catch` | Participer à 1 rain | 2 |

#### Weekly — 2-3 actives/semaine

| Code | Cible | Reward |
|---|---|---|
| `weekly_chat_50` | 50 messages | 30 |
| `weekly_calls_8` | 8 calls | 50 |
| `weekly_calls_15` *(advanced)* | 15 calls | 80 |
| `weekly_watch_180` | 3h watchtime | 40 |
| `weekly_chest_3` | 3 coffres ouverts | 30 |
| `weekly_predictions_3` | 3 bets predictions | 30 |
| `weekly_blackjack_5` | 5 blackjacks | 25 |
| `weekly_3_streamers` | 3 streamers visités | 25 |

#### Monthly — 1-2 actives/mois

| Code | Cible | Reward |
|---|---|---|
| `monthly_calls_30` | 30 calls | 250 |
| `monthly_marathon` | 20h watchtime | 200 |
| `monthly_loyal` | 25 daily bonus claims | 200 |
| `monthly_chest_5` | 5 coffres | 150 |
| `monthly_supporter` | 1 sub à un streamer | titre exclusif "Mécène" |
| `monthly_blackjack_20` | 20 blackjacks | 200 |

### Architecture

- `mig098` : tables `quests` (catalogue) + `quest_progress` (état par user)
- API : `/me/quests` (list+claim), `/admin/quests` (CRUD pour ajuster)
- Cron : seeder daily 00:00 Paris, weekly lundi, monthly 1er du mois
- Front : `QuestsModal` (desktop full + mobile sheet) + badge topbar
- Tracking : lit les tables existantes (chat_messages, wheel_spins, etc.)

## Sprint 3 — XP / Levels (Phase A ✅ livrée)

**Objectif** : progression long-terme calibrée pour casu = 3 ans / Nico
type = 1 an / ultra hardcore = 8 mois pour atteindre le level max (100).

Référence: Nico Carrasso = Lvl 71 sur Nozebet (326 840 XP, plusieurs années).

- Courbe `xp(n) = 4 × n^1.4`, cumul L100 = ~145 000 XP
- 10 paliers de 10 levels: Nouveau-Né → Légende LunaLive
- Le titre du palier (ex 'Farm Hunter III') évolue automatiquement
  avec le level — pas de title_auto séparé à débloquer
- Perks gating shop (grade 0→5), bonus daily/claim/cooldown blackjack
- Cosmétiques exclusifs aux levels 50/75/100

### Phase B (à venir)
- Hooks `awardXp` dans daily_bonus, achievement unlock, chat (cap 50/j),
  watchtime (cap 100/j), calls (cap 50/j), sub send
- Application effective des perks: daily bonus +%, /claim +%,
  weekly tickets bonus

### Phase C (à venir)
- Page profil section "Progression" avec barre + perks débloqués/à venir
- Section "Personnalisation" rework: 3 sources de titres, l'user
  choisit lequel afficher
- Level-up toast animation
- Admin endpoints `/admin/xp/*`

### Phase D (à venir)
- Commande Discord `/blackjack_max` (débloquée au lvl 80, mises x10)

## Sprint 3.5 — Système de titres unifié

L'user a 3 sources de titres potentielles:
1. **Titres shop** (LunaKing, etc.) — achetés
2. **Titres succès** (Vrai Viewer, Ratus, etc.) — 1 par succès débloqué
3. **Titre niveau** (palier auto-évolutif: Farm Hunter III → IV...)

Section "Personnalisation" doit permettre:
- Voir tous les titres possédés (groupés par source)
- Choisir lequel afficher publiquement
- Présentation stylée codifiée (couleur/icône/effet par tier)

Préset visuel proposé:
- Titres shop: gradient violet/bleu (premium)
- Titres succès: gradient bronze/silver/gold/master selon palier
- Titres niveau: gradient palier (early=cyan, mid=violet, top=gold)

## Sprint 3.6 — Commandes globales (chat lunalive + Discord)

Sur le chat de tout streamer LunaLive:
- `!solde` → tes rubis actuels
- `!succes` → 4 pills [bronze X/Y] [silver X/Y] [gold X/Y] [master X/Y]
- `!watch` → temps cumulé sur ce streamer + temps depuis follow
- `!profil` → carte stats (rubis, level, succès, watch, depuis follow)
  inspirée du `/profil` Nozebot Discord

Sur Discord (LunaLive bot):
- `/solde` ou `!solde`
- `/profil` (fiche stats détaillée)
- `/succes` (vue détaillée par palier)

## Sprint 4 — Achievements rework

- Fix les 2 méta cassés (`master_polyvalent`, `master_collection_par_categorie`)
- Persistence DB (`user_achievements` jamais écrite) + trigger event
- Mapper rewards manquants (47/58 sans reward actuellement)
- Nouveaux achievements liés à XP/levels et quêtes
- Tier "Légendaire" pour ultra-rare

## Sprint 5 — Events cycliques

- Événements 1-2 fois par mois avec rewards exclusifs
- Quêtes spéciales temporaires
- Cosmétiques événementiels limited
- `event_full_value` weight pour rubis bonus event-cashables
- Compétitions (top X chatter / caller / etc.)

## Audit éco — fixes side-quest (entre sprints)

- [ ] Implémenter `CAP_DAILY_FREE` réellement dans `earnRubisTx`
- [ ] Page admin `/admin/economy` : audit log changements admin,
      top earners/spenders, freeze user
- [ ] Notifications gain de rubis (toast) côté front
- [ ] Historique transactions dans le profil user
- [ ] Whitelist des origins valides (rejeter typos au lieu de silent fallback)
