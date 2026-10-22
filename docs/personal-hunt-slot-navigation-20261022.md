# Navigation automatique du hunt personnel
Date : 22 octobre 2026 (Europe/Paris)
État : implémentation et tests locaux ; pas encore activé en production.

## Comportement
- Interrupteur « Slot suivante auto » dans le panneau Machine en cours, visible sans ouvrir les paramètres.
- OFF par défaut, après rechargement, changement de chaîne, fermeture du panneau ou passage en ouverture.
- Après un Pass confirmé par l’API ou la validation d’un bonus et de sa mise, relire la file puis demander la machine suivante.
- L’arrêt pendant la confirmation serveur invalide la demande. Les doubles clics ne consomment pas deux calls.
- Aucun changement sur un simple ajout de call, un rafraîchissement, une erreur API ou une file vide.
- Extension locale MV3 : reconnaissance Shuffle/Celsius, verrouillage de l’onglet choisi ; si plusieurs casinos sont ouverts, choix explicite via le popup.
- Recherche par libellé, résultat exact unique, pas de coordonnées. Résultats ambigus ou indisponibles : message et arrêt automatique.
- Aucun spin, achat, autoplay, mise, devise ou contrôle d’iframe. Aucun changement VPS/publisher/OBS.

## Validation exécutée
- 4 tests de domaines, noms, limites et choix d’onglet.
- 9 tests de worker : origine, iframe, consentement, sérialisation, annulation, déduplication, réveil MV3, annulation pendant activation.
- 6 tests DOM dans Chrome isolé sur pages entièrement simulées : Shuffle, Celsius, doublons, ambiguïté, annulation, recherche absente.
- 6 tests du vrai composant HuntTabs servi par Vite, API et extension simulées : OFF, Pass, Bonus confirmé, erreur serveur, OFF pendant requête.
- TypeScript du frontend vérifié.
- ZIP vérifié avec zipfile.testzip (CRC valides, 8 fichiers).
- Build Vite de production passé (4363 modules, avertissements habituels sur les gros bundles).
- Suite finale séquentielle : 25 tests réussis. Un premier lancement à froid simultané au build a dépassé le délai de démarrage de Vite ; la suite séquentielle après démarrage du serveur passe.

Les tests de fixture ne sont PAS une validation des DOM de production des casinos. Il reste à installer l’extension dans le navigateur personnel, recharger les deux onglets puis faire une validation de navigation sur chacun des deux casinos, sans jouer. Ne pas perturber un bonus ou le live en cours pour ce test.
La fusion/diffusion du frontend et l’installation réelle ne sont pas encore effectuées.

## Fichiers
extension/hunt-slot-switcher : extension et tests.
web/src/components/botmenu/useSlotNavigation.ts : protocole navigateur et état de l’interrupteur.
web/src/components/botmenu/HuntTabs.tsx : intégration aux deux actions existantes.
web/scripts/package-slot-switcher.mjs : archive générée au prebuild et proposée depuis le panneau.
web/test/hunt-slot-navigation.* : banc de test local ; il ne contacte aucune API réelle.

## Tests à reproduire
Démarrer le frontend en local sur 127.0.0.1:4397 puis :
node --test --test-concurrency=1 extension/hunt-slot-switcher/test/*.test.cjs
CHROME_PATH peut sélectionner le navigateur Chrome/Chromium de test.
