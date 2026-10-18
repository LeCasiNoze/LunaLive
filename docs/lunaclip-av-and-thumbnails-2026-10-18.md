# Correctif A/V, descriptions et miniatures — 18 octobre 2026

## Origine et portée

Avant : le MP4 de capture Rumble utilisait une recherche HLS suivie d'une copie
de paquets. Les pistes pouvaient annoncer presque le même début tout en
contenant des instants différents de la VOD. Le floutage en copie audio
préservait ce défaut ; son contrôle de hash ne prouvait pas la synchronisation.

Après : décodage de la fenêtre HLS finie, coupe après ouverture de l'entrée,
30 FPS et resampling audio sur une horloge commune. Les autres VOD conservent
la recherche précise à l'entrée. Encodage limité à deux threads, mutex FFmpeg
existant conservé. Contrôle de durée vidéo avant tout upload. La résolution
des masters et la récupération des archives Rumble de main sont préservées.

Les sources 346/347 ont été reconstruites depuis la VOD 4404, puis les références
`bot_clips.mp4_key` et `clip_inbox.clip_url` ont été changées vers des objets R2
versionnés. La précédente réparation ne changeait que la référence interne
LunaClip : LunaLive servait encore le mauvais ancien fichier. Originaux conservés.
Cela ne certifie pas rétroactivement tous les anciens montages.

## Preuves

- Compilation TypeScript de l'API actuelle : sans erreur.
- Cinq tests API exécutés avec vrais fichiers sur le VPS : tous réussis, aucun
  ignoré. Capture HLS/FFmpeg réelle sur serveur HTTP loopback ; DB et R2 simulés.
  Vérification de contenu à 5, 25 et 50 secondes : voix dans la fenêtre source
  attendue et comparaison des images ; rejet d'un MP4 réellement tronqué.
- Comparatif voix/caméra du même extrait : nouveau chemin à environ 21 ms
  sur trois points. L'ancien chemin présente des écarts de plusieurs secondes.
  Les séquences visuellement répétitives rendent certains pics anciens ambigus ;
  ils ne doivent pas être présentés comme une mesure précise du retard.
- Sources 346/347 : six corrélations audio contre VOD, écart maximal 42 ms.
- Six tests de description neutre, idempotence et prévention conservée : réussis.
- Dix-neuf tests simulés du worker YouTube et de la reprise d'upload : réussis.
- Appel réel `thumbnails.set` réussi pour OXTd50KrpTk à 17:04:09 UTC,
  miniature rouge/or, SHA JPEG `cc108fe31dc153646a1cfce0d7394a2db639d6deb6d1a0a4403cff3006cf4c0c`.
- Gabarit autonome exécuté sur la VOD réelle : 1 min 39 s, plafond CPU 150 %,
  pic cgroup 3 Go (inclut cache fichiers). Modèles libérés avant Chrome ensuite.
  Aucun nouveau film public de test et aucune annonce Discord de test.

Rapports locaux : `exports/lunaclip-av-thumbnail-2026-10-18/` ; preuves privées VPS :
`/opt/lunaclip/data/av-thumbnail-20261018/`. Aucun credential dans ces preuves.

## Descriptions

17 publications Instagram encore modifiables ont été mises à jour sans changer
leurs dates. La règle `applyCaptionPolicy`, également appelée juste avant la
création du conteneur Instagram, retire le nom, les liens et le hashtag LunaLive,
puis ajoute une fois « Plateforme de stream en bio ». La prévention et l'indication
ARS des clips personnels restent présentes. Les publications déjà publiques
n'ont pas été éditées par cette opération. Aucun résultat ne prouve que cette
modification empêche un signalement Instagram.

## Rediffusions autonomes

Le publisher existant `scripts/lunaclip-replays` reçoit une étape miniature.
Le timer reste toutes les deux minutes ; seules la dernière VOD personnelle
du 18 octobre puis les nouvelles, terminées, hors Automod, de plus d'une heure,
sont concernées. Attente de stabilisation de l'archive : dix minutes.
Publication dès préparation, upload et traitement YouTube disponibles ; ce
n'est pas une garantie de publication à la seconde où OBS est coupé.

- `assign-number.mjs` attribue un numéro une seule fois dans le champ existant
  `rumble_vods.yt_stream_number`, avec verrou PostgreSQL. VOD 4404 = numéro 1.
- `replay_thumbnail.py` sélectionne des captures réelles du gameplay et de la
  caméra via les modèles Stage4/Stage5 existants. Il conserve leurs timecodes
  et empreintes. Ce classement de qualité visuelle ne prétend pas reconnaître
  le gain maximal ni interpréter une émotion.
- `thumbnail-render.mjs` compose le gabarit HTML/CSS, le numéro et la date avec
  Chrome headless. Pas de montant inventé ni d'API IA payante dans ce chemin.
  Les propositions créatives rouge/or et cyan/violet ont, elles, été générées
  avec imagegen à partir de vraies captures et du visage du créateur.
- Le cover est construit avant d'initialiser l'upload vidéo, puis envoyé par
  `thumbnails.set` dès réception de l'identifiant. Même vidéo/empreinte réutilisée
  après un échec de miniature : aucun second upload. L'API YouTube n'offre pas
  une transaction atomique vidéo publique + miniature ; une panne de cette
  dernière peut laisser brièvement la couverture automatique avant la reprise.
- Les credentials actuels `youtube.upload` + `youtube.readonly` suffisent pour
  ce fonctionnement. Ils ne permettent pas une bascule privé→public via
  `videos.update` ; cette garantie plus stricte nécessiterait un droit distinct.
- Discord reste déclenché par l'outbox existante, uniquement sur vidéo confirmée
  publique et traitée. Un changement de miniature ne crée pas une nouvelle annonce.

## Configuration et retour arrière

Copier les scripts replay sous `/opt/lunaclip/replays`, propriétaire lunaclip,
sans écraser `data/youtube-lecasinoze-credentials.json` (0600). Les modules Python
Google API/auth, requests, NumPy, OpenCV et Ultralytics sont ceux déjà présents.
Installer `playwright-core@1.55.0` dans le `node_modules` de LunaClip et conserver
Google Chrome système. Aucun accès au moteur Automod n'est requis : le module
Playwright a été copié depuis son installation existante, sans la modifier.

Remplacer les scripts sous le verrou `data/youtube-replays/worker.lock`, jamais
pendant un upload. Les sauvegardes avant changement sont sous
`data/av-thumbnail-20261018/replay-backup`. Ne supprimer aucun reçu d'upload pour
« réessayer » : les reçus empêchent les doublons. Le timer existant, les exclusions
Automod et la validation du channel UCbBVUwBBf4Mu3yZxe-Xrmyw restent obligatoires.

Ne jamais inclure les fichiers de credentials, URI d'upload ou .env dans un
commit, un rapport public ou les logs.
