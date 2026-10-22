# LunaLive — Slots suivantes
Extension Manifest V3 pour Chrome/Brave/Edge sur ordinateur. Aucun service VPS, aucune clé LunaLive, aucun cookie exporté.

## Utilisation
1. Décompresser le ZIP téléchargé à côté du bouton « Slot suivante auto ».
2. Ouvrir la page Extensions du navigateur, activer le mode développeur puis « Charger l’extension non empaquetée » ; choisir ce dossier.
3. Recharger LunaLive et le casino. Si plusieurs casinos sont ouverts, ouvrir l’extension sur l’onglet voulu et cliquer « Utiliser cet onglet ».
4. Dans le hunt, activer « Slot suivante auto ». Après un Pass confirmé ou la validation du bonus et de sa mise, le call suivant est recherché.
5. Cliquer le même interrupteur pour arrêter immédiatement. L’option revient sur OFF au rechargement, à la fermeture du panneau, au changement de chaîne ou à l’ouverture du hunt.

L’onglet est verrouillé lors de l’activation : changer de casino nécessite OFF puis ON. Un casino non pris en charge, une recherche introuvable ou ambiguë coupe l’option et affiche un message. Aucun résultat approximatif n’est choisi.
La sélection ouvre seulement la fiche/slot. Cette extension ne lance aucun spin, achat ou autoplay, ne règle pas la mise et n’interagit pas avec les iframes de jeu.
Les contrôles ne sont disponibles qu’aux opérateurs autorisés par LunaLive, et seulement pendant le farm. Aucun déplacement à la réception d’un call ou au chargement initial.
La détection correspond aux domaines Shuffle et Celsius, y compris celsiuscasino.co. LunaLive et le casino doivent être ouverts dans le même profil de navigateur.

## Validation et limites
Tests : node --test --test-concurrency=1 extension/hunt-slot-switcher/test/*.test.cjs
Les tests utilisent des fixtures locales, sans casino connecté ni mise. Une validation sur les DOM réels avec l’extension installée est nécessaire avant de revendiquer la compatibilité de chaque version des deux casinos. Ne pas installer pendant une action de jeu importante.
Les autorisations couvrent uniquement les sites nommés dans manifest.json. Aucune collecte, publicité, télémétrie, réseau supplémentaire ni polling Render.
