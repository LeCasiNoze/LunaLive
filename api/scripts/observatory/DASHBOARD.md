# Données des fiches de chaînes

La découverte partagée transmet désormais le titre public (160 caractères maximum) et le nombre de followers uniquement lorsque la source fournit un nombre valide. Aucun appel Rumble supplémentaire. Les champs ajoutés au snapshot version 1 sont optionnels : un ancien collecteur reste compatible.

Le collecteur conserve le dernier titre observé par vidéo. Il ne reconstitue pas les anciens changements de titre. Le titre apparaît dans le détail des sessions ; les snapshots publics globaux omettent toujours les sessions et historiques individuels.

Les followers sont relevés une fois par heure observée, avec leur vrai timestamp de réception, et conservés 31 jours en SQLite. Les différences portent sur deux relevés datés disponibles, pas sur un historique supposé complet. `growth` nécessite au moins 24 heures entre ces relevés, dans les sept derniers jours ; sa différence est signée. Les profils sans relevé restent inconnus.

`metrics.day/week/month` contient des unions SQL `COUNT(DISTINCT account)` sur les événements locaux, entre `since` et `until`. Les comptes sont déjà pseudonymisés ; services identifiés, auteurs non résolus et commandes sont traités comme dans les séries existantes. Les commandes humaines restent des messages/participants ; `conversation` les distingue. Un auteur non résolu rend les compteurs propres inconnus. Une absence d'événements sans couverture n'est pas zéro.

La rétention des événements reste de huit jours : `since` tient compte du démarrage et de cette limite, et `retentionLimited` indique une véritable coupure par la rétention. Les comptes uniques sur trente jours ne sont donc pas inventés en additionnant les sessions. Il s'agit de participants observés, pas de tous les spectateurs. Aucune identité ni aucun texte n'est envoyé à Render.

`recent` contient au maximum 36 relevés sélectionnés à cinq minutes d'intervalle dans les trois dernières heures. Ce sont les points collectés, pas des moyennes horaires. Ils sont omis du snapshot global et chargés seulement dans le détail demandé. Ils peuvent être omis de l'ingestion si leur ajout franchit les plafonds existants de 512 Kio JSON ou 64 Kio gzip ; les plafonds ne sont pas augmentés. Les heures/jours et la couverture gardent leur sémantique existante.

L'API conserve ses plafonds de réponse (24 Kio gzip global, 16 Kio détail), ETag, cache et budget quotidien. Aucun nouveau poller navigateur ou lecteur vidéo. Les métriques de croissance ne certifient pas le trafic ; les diagnostics ne sont pas des verdicts de botting.

## Livraison

### Attribution personnel / AutoMod

Sur LeCasiNoze, un titre contenant `automod` sans distinction de casse (y compris `AutoMode`) classe les nouveaux relevés en AutoMod ; un autre titre non vide les classe en personnel. Sans titre, le mode reste inconnu. Les annotations horaires explicites restent prioritaires.

Les modes sont conservés par minute pendant huit jours, sans texte de chat. Les cohortes exigent toujours deux heures consécutives avec couverture du chat ≥90 % et au moins 54 minutes attribuées par heure. Une modification de titre en cours de diffusion affecte les prochains relevés, pas les anciens messages. Les anciennes fiches de sessions inconnues utilisent leur dernier titre enregistré pour leur libellé ; cela ne réattribue pas rétroactivement les messages ou les cohortes.

1. Déployer l'API compatible avec les champs optionnels.
2. Déployer le site, qui reste compatible avec les anciens agrégats et marque les nouveautés indisponibles.
3. Après accord, construire le bundle minimal avec `prepare-bundle.mjs`, sauvegarder la base SQLite puis remplacer uniquement les fichiers du collecteur dédié et le redémarrer. Conserver la base, `startedAt`, les secrets, les pseudonymes et les annotations.
4. Vérifier un nouvel agrégat acquitté et les budgets. Les titres/followers commencent avec leurs observations ; aucun faux historique n'est rétrodaté.

Un retour à l'ancien bundle peut laisser la colonne `sessions.title` et la table `followers` inutilisées. Il ne nécessite aucune destruction de données. Les services AutoMod, OBS et VPN ne sont pas concernés.
