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
`allowedMentions: {parse: []}` ; aucun ping ou faux compteur.

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
- 4 tests de description ; 22 tests Python du publisher/inspection/outbox.
- Migration réelle testée dans un schéma PostgreSQL isolé puis ROLLBACK :
  unicité, idempotence, exclusion de l'historique, aucun envoi public.
- Métadonnées d'un Reel existant vérifiées en lecture seule via l'API officielle.
- Pas d'annonce publique de test, pas de reprise d'anciennes publications.

Une vérification de bout en bout ne pourra être déclarée qu'après le premier
nouvel événement admissible et la conservation de son message Discord réel.
