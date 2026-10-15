# Preuves de préparation — 15 octobre 2026

## Mesures réelles, sondes arrêtées

- VPS Ubuntu, Node 22.22.1 ; ressources vérifiées en lecture seule. Aucune unité AutoMod/OBS/VPN modifiée. L’unité rumble-observatory n’est pas encore installée.
- Première requête HTML de catégorie : HTTP 403, conservée dans vps-public-probe.json. Le cache historique côté API signalait aussi des erreurs de son relais. Ces échecs n’ont pas été présentés comme une catégorie vide.
- Le composant public Rumble a permis d’identifier son GET JSON de catégorie. Source du module réseau : https://static.rumble.com/rum-ui/r/ui/chunks/vendor-af814e67/d382e7b2.m.js?c=v9-261014_01-54-4181 . Test sans cookie, sans lecteur : HTTP 200, champ has_more explicite.
- Sonde automatique de 30,824 s : 5 vidéos découvertes, catégorie complète, 1 GET de catégorie, 4 SSE ouverts ; 11 402 octets de catégorie et 60 694 octets SSE. De nouveaux messages ont été reçus sur deux chats. Les init (50/50/50/15 messages) ont été ignorés. Voir observatory-evidence/vps-automatic-probe.json.
- Paquet final isolé dans /tmp, collecteur réel pendant 65,536 s : catégorie complète, 6 chaînes, 10 nouveaux messages pseudonymisés stockés, aucun texte ; 13 249 octets de catégorie, 80 299 octets SSE ; SQLite fermé 73 728 octets ; RSS 94,1 Mio ; CPU total 765,7 ms. Les actifs 15/60 min sont restés null pendant le bootstrap, pas zéro. Voir observatory-evidence/vps-collector-final-smoke.json.
- L’ingestion du smoke test est interceptée localement : aucun POST à Render ou à Rumble. Le chiffre Render de ce test n’est pas une mesure de facturation. Les routes Express sont vérifiées séparément sur HTTP local avec gzip réel.
- systemd-analyze verify a accepté l’unité préparée. Des avertissements CPUAccounting provenaient des unités XFS déjà installées, sans modification de celles-ci.

## Coûts : ce qui est mesuré et ce qui est borné

Le snapshot initial des six chaînes représente 3 893 octets bruts et 753 octets gzip, sans historique accumulé. À cette taille seulement, 288 réponses pleines de 753 octets + marge 512 octets représentent environ 0,35 Mio par client visible 24 h. Cela ne prédit pas la taille après plusieurs jours.

Le plafond public de 24 Kio gzip correspondrait à environ 6,89 Mio/client/jour avec cette même marge, hors assets et protocole. Les 304 sont comptés mais le contenu nouveau toutes les cinq minutes peut produire une réponse pleine. Le budget observatoire API de 20 Mio/j est un garde applicatif ; il ne représente ni le quota du workspace ni une garantie sur la facture.

Le collecteur VPS a un plafond initial de 200 Mio/j, mémoire 256 Mio et CPU 20 % ; les métriques réelles ci-dessus sont un échantillon court, pas une extrapolation de trafic permanent. Nivora est compté séparément et le seuil de sollicitation du feed est 10 Mio/j pour ce trafic partagé. Aucun coût d’abonnement ni nouveau service payant n’est engagé.

Le paquet VPS compressé préparé mesure 647291 octets, avec Zod seul. Il n’embarque pas le bot ni FFmpeg.

## Validation de code

Tests de déduplication, vrais zéro/inconnus, bootstrap/reconnexion, commandes humaines/services, couverture, UTF-8/CRLF/multiligne, source JSON/pagination, auteurs non résolus, Retry-After/204, annulation SSE, heure Paris/DST, rapport différé 48 h, HTTP/gzip/ETag/304/quotas, migration Postgres idempotente et cycle SQLite/singleton. Les checks finaux après rebase sont enregistrés dans le dossier de livraison local.

Les preuves visuelles du site utilisent d’une part l’état réel d’attente et d’autre part une fixture explicitement marquée TEST VISUEL — DONNÉES SYNTHÉTIQUES. Elles testent le rendu, pas une audience réelle ni un optimum. Le cadre mobile de 390 px ne présente aucun débordement horizontal global. La page temporaire est retirée avant la dernière build.

## Portes de validation après accord

Confirmer le nouveau GET JSON depuis l’instance Render, puis l’ingestion du vrai service VPS avec son token privé, la fraîcheur publique et les compteurs de sortie. Ne fusionner et ne démarrer qu’après l’accord demandé. Le bilan durable est produit par le VPS après 48 h effectives, même si le PC est éteint ; si les observations sont insuffisantes, il l’indique.

### Résultat final après rebase

Base API main 575b28a1 et base site codex/lecasinoze-hub 2536ad2 intégrées sans conflit. Build API complet (bot puis TypeScript) réussi ; 18 tests mesures/HTTP/Postgres + 2 tests collecteur + 5 tests Rumble existants passent. Site : 57 tests passent, check sans erreur et build statique de 10 routes réussi. Les trois hints Astro du shop existaient sur la base. npm ci du bot signale deux alertes de dépendances de son verrou existant, sans ajout de dépendance à ce bot ; le runtime VPS Zod seul a été installé et audité sans alerte. Les contrôles de déploiement depuis Render restent décrits comme une étape après accord.
