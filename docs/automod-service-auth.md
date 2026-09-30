# Identité de service LunaLive pour l’Automod

## Portée et comportement

L’identité dédiée est provisionnée uniquement pour le propriétaire du streamer `LeCasiNoze`. Elle ne représente pas un utilisateur et ne peut agir que sur ce streamer. Ses accès API sont limités à la lecture de la file et de la configuration calls, à la synchronisation/acquittement des calls et à l’écriture des statistiques de session. Chaque JWT d’accès expire après 15 minutes; le VPS en demande un nouveau automatiquement avant l’expiration et retente une requête une fois sur un 401. Les statistiques locales sont synchronisées au démarrage, après les changements de session, puis au moins une fois par minute.

Le secret durable est haché côté LunaLive et gardé dans `/opt/automod/.runtime/lunalive-service-credential` côté VPS avec permissions `0600` dans un répertoire `0700`. Il n’est jamais écrit dans les logs. Les anciens JWT utilisateur continuent d’être acceptés par les routes existantes pendant la transition; le service Automod priorise le nouveau fichier service dès qu’il est configuré.

La révocation désactive l’identité immédiatement. La rotation du secret durable incrémente sa version et invalide immédiatement les JWT déjà délivrés. Après une rotation administrative du secret durable, il faut installer le nouveau secret une fois dans le panneau Automod. Le renouvellement régulier des JWT d’accès, lui, est automatique et ne demande aucune intervention.

## Configuration et déploiement

1. Dans l’environnement de déploiement de l’API LunaLive, ajouter `AUTOMOD_SERVICE_JWT_SECRET`, une valeur aléatoire d’au moins 32 caractères, et la conserver stable dans le gestionnaire de secrets. Ne pas la mettre dans Git ni dans une variable publique web.
2. Dans Render, ajouter à l’API la variable secrète `AUTOMOD_SERVICE_JWT_SECRET` avec une valeur générée par le gestionnaire de secrets de Render (au moins 32 caractères). La conserver stable entre redéploiements. Ne pas la mettre dans Git, dans une variable `VITE_*`, ni dans les logs.
3. Déployer l’API mise à jour. La migration `mig140_automod_service` s’exécute après `mig139_rumble_call_undo`; elle crée les tables des credentials, des appels idempotents et de synchronisation des sessions. Vérifier dans les logs de démarrage que les migrations ont abouti sans afficher leurs variables d’environnement.
4. Depuis un client HTTPS confidentiel, connecté au compte propriétaire de `LeCasiNoze`, appeler `POST /api/automod-service/credentials/LeCasiNoze`. L’authentification personnelle ne sert qu’à autoriser cette création ponctuelle; elle n’est jamais installée ni utilisée par l’Automod. La réponse contient une seule fois `serviceId` et `secret` (`Cache-Control: no-store`). Désactiver l’enregistrement des corps de requête/réponse dans le client et sauvegarder directement le résultat dans un gestionnaire de secrets; ne le coller ni dans une conversation ni dans un terminal journalisé.
5. Dans le panneau Automod du VPS, ouvrir la configuration LunaLive et coller le JSON contenant `serviceId` et `secret` dans « Accès de service LunaLive », puis valider. Le panneau vérifie la lecture de la file et des réglages avant d’écrire atomiquement `/opt/automod/.runtime/lunalive-service-credential` en mode `0600` (répertoire `0700`). Après validation, il efface également le fichier JWT local et la variable du processus.
6. Vérifier que le statut LunaLive est connecté et que la file `LeCasiNoze` est lisible dans le panneau. Laisser une synchronisation de statistiques se produire, puis vérifier côté API que la session est mise à jour. Redémarrer `automod-web.service` et refaire le contrôle : le service doit retrouver la file et renouveler son JWT d’accès sans JWT utilisateur.
7. Une fois ces contrôles confirmés, retirer `LUNALIVE_TOKEN` de `/etc/automod/automod.env` (utilisé par `automod-web.service`), puis exécuter `sudo systemctl daemon-reload && sudo systemctl restart automod-web.service`. Vérifier ensuite `systemctl show automod-web.service -p ActiveState` et le panneau Automod. Ne pas afficher le contenu de l’EnvironmentFile. Le credential service reste uniquement dans son fichier privé; le sauvegarder dans un gestionnaire de secrets.

## Rotation et révocation

- Pour tourner le secret, appeler `POST /api/automod-service/credentials/<serviceId>/rotate` en étant connecté comme propriétaire. Remplacer le JSON du panneau VPS avec la nouvelle réponse avant de reprendre le service; les anciens JWT deviennent tout de suite invalides.
- Pour révoquer, appeler `DELETE /api/automod-service/credentials/<serviceId>`. Les requêtes service suivantes sont refusées, même si un JWT d’accès n’a pas encore atteint son échéance.
- Pour un test de rotation sans toucher le secret durable, laisser expirer le JWT 15 minutes ou envoyer une requête avec un ancien JWT d’accès : le client doit échanger à nouveau le secret durable, reprendre la lecture des calls puis la synchronisation de session sans action opérateur.

## Validation automatique

`scripts/automod-vps-stage/test/lunalive-service-auth.test.ts` teste les deux chemins : renouvellement avant la limite d’expiration (31 s simulées puis renouvellement après le seuil de sécurité) et récupération d’un 401 avec un nouvel accès. Le test valide que la même identité service durable récupère un JWT d’accès différent, que la requête est rejouée, et que lecture des calls et synchronisation de session reprennent sans remplacement manuel du JWT d’accès. La compilation API/VPS est requise avant déploiement; le test d’intégration sur l’API déployée requiert ensuite le credential provisionné et une vérification de la file/session de `LeCasiNoze`.
