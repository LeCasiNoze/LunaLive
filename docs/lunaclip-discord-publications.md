# LunaClip → Discord LeCasiNoze

Demandé le 18 octobre 2026. Serveur `1188913226990235800`, salon annonce
`1544429390723682396`. Aucun nouveau salon, bot, webhook ni droit Discord.

## Flux et périmètre

LunaClip reste le seul publisher. Après confirmation officielle, il insère dans
PostgreSQL une notification indépendante. Le client NozeBot déjà connecté dans
Render `LunaLive-bot` consomme cette outbox. `NOZEBOT_DISCORD_TOKEN` reste dans
le mécanisme de secrets Render ; il n'est pas transféré au VPS.

- Instagram : `publish_jobs.status=done`, compte `lecasinoze`, média identifié,
  puis vérification officielle de `username`, `media_product_type=REELS`, date
  et permalink. Une confirmation de conteneur sans média reste à rapprocher.
- YouTube : le publisher de rediffusions et son inspection existante fournissent
  le vrai statut public, la durée ISO API, le titre et la miniature. Un Short,
  un format inconnu, une durée absente ou ≤180 s, une autre chaîne, un upload
  privé/non répertorié/programmé sont exclus. Les rediffusions personnelles sont
  déjà filtrées à >1 h et hors Automod dans le publisher existant.
- Pas de scrapeur parallèle, pas de nouvel upload pour réessayer Discord.
- Les métadonnées proviennent de l'API, pas du nom local du fichier.

## Migration et activation

La migration UP explicite est la constante `PUBLICATION_SCHEMA` de
`bot/src/nozebot/publication-outbox.ts`. Elle est également fournie dans
`scripts/lunaclip-discord-notifications/migration-up.sql`.
Elle crée seulement `lunaclip_discord_config`, `lunaclip_discord_outbox` et leur
index. Le bot la rejoue sans effet sur les données existantes. L'initialisation
VPS utilise exactement cette même constante.

`activated_at` est fixé une seule fois par l'horloge PostgreSQL. Il n'est pas
repoussé au redémarrage : les événements créés pendant une panne restent
éligibles. Un média publié avant l'activation ne peut pas être inséré. Aucun
rattrapage de l'historique n'est activé.

Déploiement :

1. Compiler et tester le bot ; appliquer l'UP via l'initialiseur sur le VPS.
2. Installer les modules VPS `publication-outbox.ts`, `publication-discord.ts`,
   `caption-currency.ts` sous `/opt/lunaclip/server` et `youtube-outbox.mts` à la
   racine. Garder les propriétaires `lunaclip` et les permissions privées.
3. Brancher `tickPublicationDiscord` séparément de l'état de publication dans
   `review-publisher.ts`. Le collecteur ne sélectionne que les confirmations
   postérieures à l'activation et n'envoie aucun message Discord lui-même.
4. Le publisher YouTube conserve sa réception durable et sa reprise d'upload ;
   `notify_discord` ajoute uniquement une insertion d'outbox après inspection
   publique. Une panne d'outbox ne change jamais le statut du média.
5. Intégrer les fichiers NozeBot ciblés à main ; laisser le service Render
   existant se déployer. Le bot vérifie les droits déjà disponibles : voir,
   envoyer, intégrer des liens, lire l'historique. Il ne les modifie pas.
6. Redémarrer uniquement `lunaclip-vps` sans montage utilisateur ni publication
   en cours. Le retraitement de l'agenda, isolé dans son unité, peut continuer.
7. Vérifier le log `[nozebot][publications] ready`, la date d'activation, les
   files et services. Cela ne constitue pas encore un test réel de notification.

## Durabilité, erreurs et réconciliation

Unicité `(platform, media_id, channel_id)` en base. Verrou consultatif de session
pour sérialiser deux instances lors d'un déploiement. États documentés :
`queued → sending → sent`; une réponse ambiguë devient `uncertain`, un refus
définitif `blocked`. Tentative durable avant le POST et identifiant du message
conservé après sa réussite.

Le nonce est déterministe et `enforceNonce` est activé. Au-delà de la courte
fenêtre de déduplication Discord, une reprise parcourt les messages du bot vers
le début de la tentative et rapproche le lien canonique ou la référence média
du footer. Historique incomplet, 403 ou erreur réseau de réconciliation : **pas
de renvoi automatique**. Une absence confirmée dans l'historique complet permet
de réessayer. Les 429 respectent le délai connu et une temporisation croissante.

Les erreurs journalisées sont des codes opérationnels, jamais des réponses API
brutes ou des credentials. Les covers Instagram sont recopiées sous une URL R2
publique stable ; aucun lien CDN signé n'entre dans le message. Une couverture
absente donne un embed sans image. Texte limité et nettoyé, bouton lien réel,
`allowedMentions.parse: []` ; aucun faux compteur, ping de personne, `@here`
ou `@everyone`. Depuis la demande explicite du 19 octobre, une nouvelle annonce
peut mentionner uniquement le rôle de notification opt-in de sa plateforme.

### Rôles de notification

NozeBot résout les noms YouTube/Instagram (y compris les lettres Unicode
décoratives) parmi les rôles déjà présents dans son sélecteur de préférences.
Le message ne mentionne que le rôle de la plateforme et `allowedMentions.roles`
contient seulement son ID. Le texte du média ne peut fournir aucun rôle.
Un nom ambigu, un rôle disparu ou un rôle non mentionnable sans permission
existante donne une annonce sans ping et un avertissement opérationnel ; le bot
ne crée aucun rôle et n'élargit aucun droit. Le log `notification_roles` affiche
la correspondance résolue et les rôles existants pour vérification.

Les annonces déjà envoyées restent `sent` et ne sont jamais renvoyées pour
tester un ping. Modifier un ancien message ne prouve pas qu'une notification
Discord a été délivrée. Vérifier les pings sur la prochaine vraie publication,
séparément des tests simulés et des reçus historiques sans ping.

Les métadonnées d'un média archivé ou supprimé bénéficient d'une temporisation
persistante privée (`data/discord-metadata-retries.json`). Cinq anciens médias
indisponibles ne peuvent pas bloquer les annonces suivantes. Une réconciliation
Discord inaccessible garde l'état `uncertain` avec une temporisation croissante ;
le délai 429 imbriqué dans la réponse officielle est également respecté.

Inspection SQL :

```sql
SELECT platform, media_id, state, attempts, next_attempt_at, message_id, error_code
FROM lunaclip_discord_outbox ORDER BY id DESC LIMIT 30;
```

Ne jamais remettre `sent` à `queued`. Pour une issue ambiguë, rapprocher le
message avant toute action. Aucun rattrapage historique sans accord de Lucas.

## Retour arrière

Arrêter le consommateur en retirant son appel NozeBot, et restaurer les petits
hooks VPS depuis `data/discord-publications-20261018/*.before`. Conserver les
tables et la date d'activation : supprimer les reçus pourrait créer des doublons.
La migration DOWN, **uniquement si aucun envoi ni événement n'a jamais existé**,
est dans `migration-down-empty-only.sql` et refuse un historique non vide.

## Validation

- 18 tests simulés Node : compte, 180/181, Shorts, privé/programmé, canonique,
  miniature/fallback, mentions, nonce, doublon, panne et réponse perdue/reprise.
- 5 tests de description ; 22 tests Python du publisher/inspection/outbox.
- 5 tests R2 simulés (dont le type MIME des images), 2 tests d'intégration Node
  avec transports simulés : panne Discord après succès Instagram, et métadonnées
  indisponibles ne bloquant pas les événements suivants. Total : 52 tests.
- Migration réelle testée dans un schéma PostgreSQL isolé puis ROLLBACK :
  unicité, idempotence, exclusion de l'historique, aucun envoi public.
- Métadonnées d'un Reel existant vérifiées en lecture seule via l'API officielle.
- Pas d'annonce publique de test, pas de reprise d'anciennes publications.

Une vérification de bout en bout ne pourra être déclarée qu'après le premier
nouvel événement admissible et la conservation de son message Discord réel.

## Sources du raccordement VPS

Les nouveaux modules sont dans `scripts/lunaclip-discord-notifications/vps/` ;
les tests ciblés sont dans `tests/`. Copier les deux modules serveur dans
`/opt/lunaclip/server`, et les CLI `.mts` à la racine `/opt/lunaclip`.
`publication-outbox.ts` est partagé avec le bot : copier la version de
`bot/src/nozebot/` sans créer de second schéma ou consommateur.

`vps-integration.patch` contient uniquement les points d'intégration dans les
cinq fichiers existants. Vérifier la compatibilité avec `git apply --check`
depuis `/opt/lunaclip` avant de l'appliquer ; après installation, le contrôle
inverse `git apply --reverse --check` doit réussir. Si la base a évolué, adapter
les petits hunks après lecture ; ne pas remplacer le projet complet.

Les tests Node `.test.ts` sont exécutés dans le répertoire serveur du VPS ; le
test de migration `.mts` à sa racine ; le test Python dans la copie de staging
des rediffusions. Ils utilisent des transports simulés et ne créent aucune
annonce publique. Le Dockerfile du bot continue de compiler son propre code.

## Agenda et conversion ARS

Les 17 publications futures existantes (14 LunaLive, 3 LeCasiNoze) ont conservé
leurs dates du 19 au 27 octobre. Douze variantes ont été générées, deux variantes
déjà validées réutilisées. Le bandeau inférieur est flouté sans recadrage ; les
compteurs centraux, caméras, bannières, sous-titres et chronologies sont conservés.
Contrôle des 12 nouveaux fichiers : paquets audio identiques, mêmes débuts et
durées des pistes vidéo/audio, décodage complet réussi, contrôle visuel réalisé.

Les descriptions personnelles précisent ARS et un repère indicatif daté BCRA.
Le cache officiel est actualisé quotidiennement ; un taux absent ou vieux de
plus de 14 jours n'est jamais inventé. Le repère est recalculé avant préparation
de publication. La prévention reste présente, sans « Contenu casino », et les
hashtags restent en fin de description sans doublon. Ces changements ne sont
pas une preuve de causalité sur les restrictions Instagram.
