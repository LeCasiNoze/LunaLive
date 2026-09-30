# Remontée et interventions Automod — 30 septembre 2026

Le bridge permanent du VPS utilisait uniquement GET control / démarrer / arrêter. Le dashboard lisait runtime_status, mais personne ne le renseignait avec le credential de service : « VPS sans nouvelles » et boutons inactifs.

Les routes service ajoutent une portée automod:runtime:write au prochain renouvellement de JWT (15 minutes). Le VPS poste un état filtré toutes les 5 secondes, récupère les commandes fraîches de son seul streamer et confirme l’exécution après observation. Aucun JWT personnel ni nonce local n’est transmis au dashboard. Les URL et secrets des logs sont masqués. Une panne DB renvoie 503.

Le worker /opt/automod/scripts/automod-fsb-control.py persistait déjà l’état de démarrage ; il persiste maintenant aussi les commandes avant exécution. Un timeout ambigu ne provoque pas un second passage de call. Le bouton Relancer Chrome finit d’abord le round/bonus, ferme réellement la session Chrome puis reprend le call. Passer le call attend également le bonus. Les commandes âgées de plus de 5 minutes ne sont pas prises. Confirmation bornée à 15 minutes.

Les paramètres restent appliqués à l’arrêt / au prochain démarrage : updateConfig refuse les changements pendant une session. Ne pas promettre une application à la prochaine machine tant que cette fonctionnalité n’existe pas. Nolimit reste bloqué par défaut dans le bridge ; AUTOMOD_NOLIMIT_VALIDATED=1 ne doit être défini qu’après validation des jeux concernés.

Chrono : recoveryPausedAt est persisté, envoyé au dashboard et utilisé comme horloge figée pendant un incident. L’échéance est décalée une seule fois à la reprise. Un bonus ne suspend pas le chrono : après échéance, affichage « En attente du bonus ». Une slot expirée ne se rouvre pas pour relancer un lot.

Validation API : npx tsc -p api/tsconfig.json puis node api/test/automod-runtime.test.mjs (5 tests HTTP, DB simulée ; aucun credential réel). Validation web : tsc -p web/tsconfig.app.json. Tests VPS supplémentaires et campagne réelle : voir le bilan dans les documents LeCasiNoze. Le publisher et les fichiers d’encodage ne changent pas.
