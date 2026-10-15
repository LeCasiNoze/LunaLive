# Observatoire Rumble — dossier de déploiement

État : changements préparés, aucune fusion ni collecte permanente autorisée à ce stade. Le premier bilan démarre à la première découverte réussie du collecteur installé, pas à la date de ce document ni aux sondes de validation.

## Architecture et périmètre

- Le VPS ouvre un seul lecteur SSE public par vidéo, sous un service indépendant, un verrou PID atomique et flock. Aucune importation du moteur de commandes, de l’économie ou du bridge complet ; aucun lecteur/HLS/thumbnail.
- La découverte réutilise le cache et single-flight de rumble.ts. Son parseur pur est partagé. Le composant public rum-videos-grid utilise GET /service.php avec api=7, name=category.videos, category=gambling-slots, video_type=live, options=video.full, offset et limit=24. Ce chemin JSON, observé dans le client public le 15 octobre 2026 et testé sans cookie, précède le fallback historique HTML/Nivora. has_more=false est la preuve de fin ; la limite de cinq pages de l’ancien cache reste signalée partial si atteinte.
- Le worker lit /observatory/discovery toutes les 120 secondes, avec token serveur dédié. Le VPS ne duplique pas les requêtes de catégorie du moniteur existant. Les réponses 429 et les erreurs sont suivies d’un backoff ; pas de boucle sur 403.
- SQLite/WAL reste sur le VPS. Les textes et pseudonymes de chat sont traités en mémoire. Seuls des HMAC séparés pour comptes et messages, des timestamps, classifications et compteurs sont conservés. Les créateurs sont des identités publiques de chaînes, pas des participants privés.
- Le worker pousse un snapshot gzip toutes les cinq minutes. Render conserve une seule ligne JSONB, avec une mise à jour monotone sur captured_at ; aucun insert de message. Les anciens batchs ne remplacent pas le présent.
- La page Astro statique /observatoire-rumble/ charge un snapshot global par cinq minutes visibles, avec ETag, annulation en arrière-plan et timeout. Le détail d’une chaîne est chargé au clic. Pas de SSE par visiteur.

## Routes

| Route | Accès | Fonction |
|---|---|---|
| GET /observatory/snapshot | public | résumé, unions, historiques catégorie, coûts |
| GET /observatory/channels/:slug | public | courbes et bornes de présence échantillonnée |
| POST /observatory/ingest | Bearer dédié | agrégats strictement validés, 512 Kio décompressés maximum, 1 écriture / 240 s |
| GET /observatory/discovery | Bearer dédié | découverte partagée, corps borné et compté |
| GET /observatory/diagnostics/:slug | Bearer dédié | écarts descriptifs, seuils et limites, sans verdict de botting |
| GET /observatory/metrics | Bearer dédié | réponses, octets, 304, budget du processus API |

Le token dédié n’est jamais envoyé au navigateur. Il n’est pas une clé AutoMod ou admin générale. Les erreurs publiques ne contiennent ni détails de validation ni payloads de chat.

## Sens des métriques

Les points sont des tuples : timestamp UTC millisecondes, viewers déclarés, comptes actifs distincts 15 min, distincts 60 min, messages/minute hors services, conversations/minute hors commandes, couverture continue 15 min, chaînes visibles, actifs bruts 15 min avant exclusions.

Les unions sont calculées sur les comptes HMAC entre toutes les chaînes, et séparément sur les chaînes FR annotées. Elles ne s’obtiennent jamais en additionnant les uniques par chaîne. Une chaîne peut être absente de la catégorie sans être terminée ; ni cette absence ni un 403 ne créent un zéro ou une fin de session.

Les init SSE ne créent aucune activité. Après connexion ou reconnexion, les fenêtres demeurent inconnues jusqu’à une durée continue suffisante. Les auteurs non résolus rendent la mesure nette inconnue ; les commandes d’utilisateurs restent dans l’activité mais pas dans la conversation. Les bots de service et owners sont des exclusions explicites ; le mot bot dans un pseudo n’est pas une preuve.

Les bornes first/last sont une amplitude, pas une durée complète ni continue. minuteSamples compte des relevés distincts à cadence minute : les coupures ne sont pas ajoutées à ce nombre. started_at_source n’est pas présenté comme un début de live prouvé.

Les séries horaires résument les minutes réellement reçues. Les trous réduisent la couverture. Les moyennes journalières portent sur la partie observée et ont des buckets UTC ; toutes les heures affichées utilisent Europe/Paris. Le passage du 25 octobre conserve deux instants distincts pour les deux 02 h.

Les fenêtres de 2/3/4 h exigent chaque heure à ≥90 % de couverture, des comptes actifs connus et au moins une chaîne visible. Le classement exploratoire activité/(1+concurrence) sépare les deux composantes et n’existe qu’après 48 h effectives. Il ne prédit pas les jours non observés et ne mesure pas la demande latente d’une catégorie vide.

## Langue et personnel/AutoMod

config.example.json contient des annotations FR explicites, avec leur preuve dans languageEvidence. Les titres français permettent une annotation de la langue écrite ; la langue parlée n’a pas été vérifiée indépendamment. Les chaînes inconnues restent visibles sous Toutes les langues.

Aucun mode personnel/AutoMod n’est inféré à partir d’OBS, d’un souhait de publication, d’un nom de vidéo ou de l’absence de bot. Sans intervalle vérifié, le mode est unknown. Annoter une période réellement écoulée avec :

    node api/scripts/observatory/annotate-mode.mjs /etc/rumble-observatory/config.json personal START_ISO END_ISO "confirmation opérateur"

Le collecteur recharge le fichier dans la minute et réattribue les événements locaux concernés. Cela ne pilote aucun service. Les cohortes regroupent les premières apparitions dans les huit jours retenus, jamais les premières visites réelles. Les retours matin→soir/J+1/J+3 ne mûrissent qu’après la période cible et avec au moins deux heures consécutives couvertes dans un mode attribué. Un zéro décrit ces sessions observées, pas une journée sans observation.

## Bornes et conservation

| Ressource | Valeur initiale |
|---|---|
| Entrées SSE simultanées | 64, configurable jusqu’à 256 ; couverture partielle au-delà |
| Buffer SSE / page publique | 256 K caractères / 2 Mio |
| Événements en mémoire / dédup | 200 000 / 400 000, arrêt des lecteurs à la limite |
| Événements pseudonymisés | 8 jours |
| Minute / horaire / journalier local | 73 h / 31 jours / 366 jours |
| Détail public par chaîne | 72 h horaires + 30 jours journaliers |
| Historiques publics catégorie | 31 jours horaires + 30 jours journaliers |
| Session et métadonnées chaîne | 31 jours |
| SQLite + WAL | 256 Mio, pause protégée à la limite |
| Seuil Nivora partagé | 10 Mio/j ; l’observatoire cesse de solliciter le relais via son feed à ce seuil, sans arrêter les autres jobs |
| Budget applicatif VPS | 200 Mio/j UTC, pause jusqu’au renouvellement |
| Ingestion | ≤512 Kio brut et ≤64 Kio gzip, toutes les 5 min |
| Snapshot public / détail | ≤24 / 16 Kio gzip |
| Sortant API | 20 Mio/j UTC, configurable ; 429 au budget |
| Service VPS | CPUQuota=20 %, Nice=15, MemoryHigh=160M, MemoryMax=256M |

Les compteurs sont des octets applicatifs, parfois décompressés côté fetch, avec une marge de 512 octets pour les réponses API. Ce ne sont pas les compteurs de facturation Render. Les 304 sont comptés ; le budget est persisté au plus une fois par minute, donc un crash peut perdre jusqu’à une minute de compteur. Le contrôle suppose l’API actuelle en une instance ; passer à plusieurs instances exige un compteur atomique partagé. Les métriques privées distinguent API et découverte Nivora partagée, cette dernière n’étant pas imputable uniquement à l’observatoire.

Une limite rend les données anciennes/inconnues, ne crée jamais de zéros. Une réponse CDN et les assets du site peuvent être facturés : aucun edge-cache JSON n’est supposé. Référence : https://render.com/docs/outbound-bandwidth et https://render.com/docs/web-service-caching, consultées le 15 octobre 2026.

## Validation avant déploiement

Voir rumble-observatory-evidence.md et les JSON associés. La validation réelle est segmentée : découverte/chat/SQLite sur le VPS, ingestion/API sur tests HTTP locaux et migration Postgres PGlite. Aucun POST de validation n’est envoyé à Render ni à un chat Rumble. Les captures synthétiques sont explicitement étiquetées et ne justifient aucun créneau réel.

    node_modules/.bin/tsc -p tsconfig.json
    node --import tsx --test test/observatory.test.ts test/observatory-http.test.ts test/observatory-migration.test.ts
    node --test test/observatory-collector.test.mjs
    node scripts/observatory/prepare-bundle.mjs
    npm ci --omit=dev --ignore-scripts --prefix .runtime/observatory-bundle

Le paquet VPS contient seulement les quatre modules purs compilés, les scripts et Zod verrouillé depuis package-lock.json. Il ne transporte pas le bot, FFmpeg, les clés ni le moteur AutoMod. SHA256.json permet de vérifier les fichiers préparés.

## Ordre après accord explicite

1. Relire les deux PR, actualiser leurs bases et contrôler les conflits ; ne pas pousser sur les branches déployées sans accord.
2. Installer le token dédié sur l’API et le VPS par un canal privé. Générer une clé HMAC distincte sur le VPS. Ne jamais les inclure dans une commande journalisée, capture ou PR.
3. Fusionner l’API dans main : Render autodeploy fait l’unique déploiement. Vérifier healthz, migration, snapshot en attente, et découverte JSON depuis Render. Cette dernière vérification d’hôte reste une porte de validation post-déploiement : la preuve pré-déploiement vient du VPS.
4. Installer le paquet approuvé dans /opt/rumble-observatory, la configuration dans /etc/rumble-observatory/config.json et les secrets en 0600 dans secrets.env. Variables : OBSERVATORY_INGEST_TOKEN, OBSERVATORY_HMAC_KEY, OBSERVATORY_API_URL ; limites facultatives documentées dans collector.mjs. Le fichier service dédié est préparé ; ne modifier aucune unité AutoMod/OBS/VPN.
5. Après systemd-analyze verify, activer uniquement rumble-observatory.service. Vérifier que le second démarrage est refusé, que les compteurs avancent et que l’ingestion est acquittée. Observer charge/mémoire/egress pendant le rodage. Arrêt manuel : systemctl stop rumble-observatory.service.
6. Fusionner le site dans codex/lecasinoze-hub ; laisser son autodeploy unique s’effectuer. Vérifier la page publique, 304, cache, visibilité, détails au clic et absence de vidéo/HLS.
7. Noter startedAt effectif. Produire le bilan entre +48 et +72 h avec les seules périodes couvertes. Si la couverture est insuffisante, livrer ce constat et les périodes connues, sans inventer un optimum quotidien.

Retour arrière : arrêter seulement le service observatoire, conserver SQLite privé, revenir sur les deux commits dédiés via les procédures habituelles. Ne pas supprimer des données ni modifier les services de streaming pour ce retour arrière.

Les événements de la nouvelle collecte portent leur video_id public réel : les uniques, messages et conversations par diffusion sont calculés exactement sur les huit jours retenus, hors services confirmés. Après expiration ou sans couverture suffisante, le détail retourne inconnu. Les anciennes archives sans video_id ne sont pas réattribuées par supposition. L’union glissante de catégorie porte sur les lives actuellement visibles, pas sur tous les participants de la journée.

Le premier bilan firstReport est enregistré une seule fois par le VPS lors du premier batch après +48 h (cadence 5 min), même si le PC et Codex sont éteints. En cas de couverture insuffisante, ce bilan le dit au lieu de créer deux choix fictifs. Le suivi horaire de ce chat attend le startedAt réel et reste silencieux avant déploiement ; il est mis en pause après livraison du bilan humain.
