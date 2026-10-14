# NozeCoins V1 — 14 octobre 2026

## Périmètre

Monnaie de jeu gratuite pour LeCasiNoze. Aucun achat de points, transfert, conversion en Rubis, argent, dépôt casino ou lot ayant une valeur monétaire. Aucun crédit pour affiliation ou résultat de jeu casino. Les points Automod et Rubis existants ne sont ni migrés ni modifiés.

Commandes Discord : `/link`, `/claim`, `/solde`, `/profil`, `/slot`, `/shop`, `/ameliorer`, `/regles`. Les commandes Rubis historiques de **ce serveur uniquement** sont remplacées lors de l’activation. Les services LunaLive restent inchangés. `/shop` renvoie vers le site ; les anciens boutons ne débitent plus. Le site génère `!ameliorer branche palier`, accepté uniquement dans Jeux et commandes. `/ameliorer` offre une alternative slash. Le serveur vérifie identité, palier successif et solde, et indique le montant manquant.

Rumble : `!claim`, `!slot`, `!solde`, `!profil`, `!rain`. Le solde appartient à l’ID natif Rumble ; un compte Discord lié retrouve le même portefeuille. Une seule liaison active dans chaque sens. Un changement de liaison nécessite un traitement modéré ; aucun endpoint de reliaison automatique n’est ajouté.

## Barème provisoire

Claim : 100 points, délai 24 heures. Trois améliorations de montant : 125/150/175, prix 300/600/1200. Trois améliorations du délai : 23/22/20 heures, prix 400/800/1600. Le prochain claim est recalculé depuis la dernière récupération avec le niveau actuel.

Rain : 25 points, puis 30/35/40 ; prix 300/600/1200. Première rain après 30 minutes de session observée, puis toutes les 30 minutes. Fenêtre de 2 minutes. Participation exclusivement via Rumble, une récompense par ID et par rain. Attribution refusée si hors live, cible différente, données périmées ou Automod actif. L’identification personnelle dépend actuellement des signaux Automod `desired_enabled=false`, `publisherActive!=true` et du live Rumble frais ; à confirmer sur un vrai live personnel avant de considérer le scheduling validé.

Mini-jeu : mise fixe 20, puis 30/40/50 ; prix 300/600/1200. Cooldown 30 minutes. Pas d’amélioration du cooldown mini-jeu pour l’instant. Affichage `[XXX XXX]` à `[777 777]`, puis `[MAX WIN]`. Les améliorations de mise n’améliorent jamais les probabilités. Retours bruts :

| Résultat | Probabilité | Retour brut |
|---|---:|---:|
| XXXXXX | 55 % | 0× |
| 0XXXXX | 25 % | 1× |
| 00XXXX | 12 % | 2× |
| 000XXX | 5 % | 3× |
| 0000XX | 2 % | 5× |
| 00000X | 0,8 % | 10× |
| 000000 | 0,18 % | 25× |
| 777777 | 0,019 % | 100× |
| MAX WIN | 0,001 % | 250× |

Le retour théorique moyen est 0,8865 fois la mise ; ce n’est pas une promesse individuelle. Tirage `crypto.randomInt`, plages disjointes exhaustives. La mise est débitée et le retour crédité atomiquement. Pas de mise libre ni de relance automatique.

## Déploiement et sécurité

`NOZECOINS_ENABLED=true` doit être appliqué à l’API et au bot pour activer. Par défaut la fonctionnalité est désactivée, l’ancien comportement demeure. Arrêt prudent : désactiver le flag ; ne jamais supprimer les tables ou les soldes. Ne pas déplacer les crédits NozeCoins vers les autres monnaies.

Tables ajoutées : nozecoin_accounts, nozecoin_ledger, nozecoin_rains, nozecoin_rain_sessions. Création paresseuse sous verrou de migration. Les mutations verrouillent le compte et utilisent des reçus d’opération ; les retries ne rejouent pas le tirage et ne doublent pas le crédit. Solde non négatif, plafond 10^12.

Les noms Rumble sont observés par ID depuis les messages frais authentifiés. Les événements anciens ne remplacent pas les nouveaux. Le bot synchronise le surnom de serveur Discord par lots de 100 chaque minute, sous réserve de ManageNicknames et de la hiérarchie des rôles. Aucun changement du nom global Discord et aucune extension automatique de permissions.

## Vérifications

`cd api && node --import tsx --test test/nozecoin-db.test.ts test/nozecoin-rules.test.ts test/automod-profile.test.ts test/automod-shop-rules.test.ts`

Tests SQL sur PGlite (PostgreSQL embarqué en mémoire) : contraintes, rollback, cooldown, reçus, pluie, isolation des monnaies, noms. Ce n’est pas un test de concurrence multiprocessus sur PostgreSQL de production. Compiler séparément API et bot avec `tsc --noEmit`.

Avant annonce publique : vérifier commandes enregistrées, profil réel lié (sans crédit de test attribué à un viewer), message de cooldown, état du live personnel, et permissions surnoms. Aucune création de membre fictif, publication Rumble ou attribution de points de production pour QA sans autorisation dédiée.

## Non livré dans cette V1

Connexion persistante sur le site, soundboard OBS, quiz, saison et conversion cosmétique en Rubis. Le shop web sans connexion prépare les commandes ; aucun solde personnel n’y est présenté comme vérifié. La progression des quatre branches s’affiche par paliers sélectionnables.

## Soutien CNZ hebdomadaire

25 NozeCoins par semaine UTC (lundi à dimanche), compte lié, marque CNZ distincte dans le pseudo Rumble, observée dans un message frais cette semaine. Aucun historique de pseudo seul ne suffit. Crédit lors du premier contrôle après cette observation, contrôle toutes les dix minutes, reçu permanent `cnz:YYYY-MM-DD` attaché à l’ID natif. Pas de doublon lors d’une reliaison. Announcement différé dans News officielles, uniquement pour les bénéficiaires ; aucune mention everyone. Outbox persistante ; recherche des 100 derniers messages du bot pour récupérer un envoi dont l’accusé API a échoué. Une indisponibilité prolongée dépassant cet historique reste une limite de déduplication des annonces, pas des crédits. Activation explicite `NOZEBOT_CNZ_ENABLED=true`.

Rôle `Lié` sans permissions supplémentaires, synchronisé chaque minute via `NOZEBOT_LINKED_ROLE_ID`, uniquement sur les membres ayant une liaison vérifiée. Une révocation/modification manuelle de liaison reste à traiter par modération (pas d’outil de reliaison livré).

## Roadmap — Journal de progression (non activé)

Parcours : lier Rumble → consulter profil et les deux soldes → premier claim → premier mini-jeu → première rain en live → première amélioration → découvrir les commandes de chaîne. Puis étapes longues de présence/participation plafonnée. Blackjack NozeCoins, inscription au tournoi, quiz et saison : chapitres futurs, ne pas annoncer les commandes comme existantes. Séparer portefeuille dépensable permanent et scores d’événement/saison. Définir ultérieurement la durée de saison et les récompenses ; aucun reset implicite du portefeuille.
