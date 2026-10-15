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
| [XXX XXX] | 20 % | 0× |
| [OXX XXX] | 25 % | 0,25× |
| [OOX XXX] | 25 % | 0,5× |
| [OOO XXX] | 20 % | 1× |
| [OOO OXX] | 9 % | 4× |
| [OOO OOX] | 0,8 % | 10× |
| [OOO OOO] | 0,18 % | 25× |
| [777 777] | 0,019 % | 100× |
| [MAX WIN] | 0,001 % | 250× |

Le retour théorique moyen est 0,894 fois la mise avant arrondi ; ce n’est pas une promesse individuelle. Tirage `crypto.randomInt`, plages disjointes exhaustives. La mise est débitée et le retour crédité atomiquement. Pas de mise libre ni de relance automatique.

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

200 NozeCoins par semaine UTC (lundi à dimanche), compte lié, marque CNZ distincte dans le pseudo Rumble, observée dans un message frais cette semaine. Aucun historique de pseudo seul ne suffit. Crédit lors du premier contrôle après cette observation, contrôle toutes les dix minutes, reçu permanent `cnz:YYYY-MM-DD` attaché à l’ID natif. Pas de doublon lors d’une reliaison. Announcement différé dans News officielles, uniquement pour les bénéficiaires ; aucune mention everyone. Outbox persistante ; recherche des 100 derniers messages du bot pour récupérer un envoi dont l’accusé API a échoué. Une indisponibilité prolongée dépassant cet historique reste une limite de déduplication des annonces, pas des crédits. Activation explicite `NOZEBOT_CNZ_ENABLED=true`.

Rôle `Lié` sans permissions supplémentaires, synchronisé chaque minute via `NOZEBOT_LINKED_ROLE_ID`, uniquement sur les membres ayant une liaison vérifiée. Une révocation/modification manuelle de liaison reste à traiter par modération (pas d’outil de reliaison livré).

## Roadmap — Journal de progression (non activé)

Parcours : lier Rumble → consulter profil et les deux soldes → premier claim → premier mini-jeu → première rain en live → première amélioration → découvrir les commandes de chaîne. Puis étapes longues de présence/participation plafonnée. Blackjack NozeCoins, inscription au tournoi, quiz et saison : chapitres futurs, ne pas annoncer les commandes comme existantes. Séparer portefeuille dépensable permanent et scores d’événement/saison. Définir ultérieurement la durée de saison et les récompenses ; aucun reset implicite du portefeuille.


## Mise à jour : animation, relais et talents

Le mini-jeu utilise O (lettre) et rembourse exactement la mise à trois O. Les retours sont arrondis à l’entier inférieur. Discord révèle un résultat déjà enregistré, une seule réponse éditée, arrêt du suspense au premier X. Un retry conserve le résultat historique et son retour, même si le barème a changé.

Le soutien CNZ passe à 200 pour les prochaines attributions ; les reçus de semaine déjà payés restent inchangés. Les annonces lisent le montant réel du reçu.

`LECASINOZE_LUNA_CHAT_RELAY=true` active le relais des messages publics LunaLive acceptés vers le live Rumble frais de LeCasiNoze uniquement, sous le format pseudo: message. Commandes ! et /, bots connus et messages streamControl exclus. Anti-spam : un relais maximum par personne toutes les deux secondes. 200 caractères avec ellipse ; sender et queue résidentielle existants. La boucle retour ne peut pas réentrer dans chat:send. Validation de transport réel à faire avec un message utilisateur pendant un live ; aucun message de test n’est envoyé automatiquement.

Le shop web affiche quatre branches de talents, trois nœuds chacune, détails avant/après et préparation de commande. Niveaux enregistrés dans le portefeuille serveur ; aucune simulation de propriété dans le navigateur. Une connexion authentifiée reste nécessaire pour afficher un arbre personnalisé automatiquement. Automod intégré comme composant réutilisé sans modification de règles ou de commandes.

## Passe communauté — 15 octobre 2026

La synchronisation des surnoms vérifie aussi le rôle existant `1281868087330869260` (CNZ TEAM). Elle utilise uniquement le dernier pseudo Rumble observé par ID natif, exposé avec `usernameVerifiedAt` par l’API interne. Le rôle est ajouté/retiré selon la même marque CNZ distincte que la récompense hebdomadaire. Une date absente, invalide ou future ne provoque aucun changement. Un renommage non observé ne peut pas être deviné : le membre doit écrire sur Rumble. Le rôle doit rester sans permissions et inférieur au rôle du bot ; aucun élargissement de permissions n’est effectué.

`/profil` expose les quatre niveaux réels, le prochain claim, des raccourcis vers le shop et le guide, et un premier journal de cinq étapes dérivé des reçus existants : liaison, claim, mini-jeu, rain et amélioration. Ce journal ne distribue pas de nouvelles récompenses, ne réinitialise rien et n’annonce pas de blackjack/quiz/tournoi inexistant.

Le nouveau shop présente un catalogue de talents avec panneau avant/après et onglets NozeCoins, Automod intégré et soundboard en préparation. Il ne constitue toujours pas une session authentifiée. La connexion persistante, l’achat directement depuis le site et les sons joués dans OBS restent à réaliser. Le catalogue MyInstants du propriétaire est requis avant activation des sons ; un hébergement MyInstants ne prouve pas à lui seul les droits de diffusion.

La réorganisation Discord est préparée dans un script séparé avec sauvegarde des parents et des permissions, vérification après déplacement et mise à jour idempotente des guides. Son application est soumise au contrôle de sécurité ; ne pas confondre le code préparé et un changement effectivement appliqué.

## Soundboard — moteur préparé, activation conditionnelle

Les routes, le moteur SQL, `/sons` et un lecteur OBS dédié sont maintenant implémentés. Aucun catalogue de production n’est inventé : le propriétaire doit fournir ses liens et valider l’usage des fichiers. `NOZECOINS_SOUNDBOARD_ENABLED=true` et `NOZECOINS_ENABLED=true` sont nécessaires côté API ; sans ces deux flags, aucun son ne peut être acheté. `NOZECOINS_SOUND_CATALOGUE` est un tableau JSON explicite, vide par défaut. Chaque entrée contient `id`, `label`, `audioUrl`, `cost`, `durationMs`, `volume`. Les durées doivent être mesurées avant activation : maximum 8 s ; volume entre 0 et 0,7 ; coût entier positif. Hôtes média autorisés : MyInstants (chemin `/media/sounds/*.mp3`) ou le dossier `/soundboard/` du site officiel. Ni URL ni prix soumis par un viewer ne font autorité.

Discord : `/sons` ouvre un menu privé ; choisir un son ne débite rien. L’aperçu est gratuit. Un deuxième bouton affiche et confirme le prix ; la requête comporte l’ID d’interaction comme reçu et le prix attendu. Un menu copié par un autre membre ne peut pas acheter. Un changement de prix force à rouvrir le menu.

Conditions d’admission : live Rumble personnel frais, Automod désactivé, activation par le propriétaire pour l’ID du live courant, lecteur OBS avec heartbeat de moins de 15 s. Une personne peut envoyer une demande par minute, cinq demandes maximum dans la file. Le débit, l’ajout à la file et le reçu sont atomiques. Les points Automod et les Rubis ne sont jamais touchés. Une relance du même reçu ne rachète pas le son.

Lecture : un seul consommateur actif, une seule demande en vol. Le fichier est lu par `web/public/overlay/obs/nozecoins-sounds.html` et `.js`. Le jeton LunaLive existant du propriétaire est transmis uniquement en fragment puis gardé en mémoire ; jamais dans une query, un stockage navigateur ou un message public. Les endpoints vérifient le propriétaire en base et refusent l’accès aux viewers. Le mode `?control=1` est un panneau de commande distinct : il ne lit rien et ne prend pas la place d’OBS. Ne pas installer cette source ou copier un jeton réel dans une capture publique sans vérification dédiée.

Un échec audio, une demande expirée, une rupture de session, une désactivation ou un lease dépassé entraîne un remboursement unique. Un lease expiré n’est jamais rejoué automatiquement. Une maintenance toutes les 10 s rembourse même lorsque le lecteur est absent ou que le flag vient d’être désactivé. Si l’accusé final est perdu après une lecture effectivement entendue, un remboursement peut avoir lieu : priorité au remboursement plutôt qu’à une double lecture ou un second débit. Un contrôle du flux audio réellement entendu reste nécessaire avant activation publique.

Vérifications locales : SQL PGlite (admission, débits, reçus, queue, délais, remboursements, changements de session, Automod), tests des interactions Discord et tests isolés du lecteur (jeton absent, panneau sans consommation, accusé uniquement en fin de fichier, échec audio). Ces tests n’établissent ni la qualité des vrais sons, ni le mixage OBS, ni une validation multi-processus sur PostgreSQL de production. Pas de test de débit/crédit sur un membre réel.

Le lecteur vérifie aussi `obsstudio.getStatus().streaming` via le callback de l’API navigateur OBS : un simple aperçu OBS, un navigateur ordinaire ou l’absence d’autorisation de lecture OBS ne rendent pas le lecteur disponible. Les événements d’arrêt du streaming coupent la lecture et désactivent/remboursent la file. Aucun appel ne démarre ni n’arrête la diffusion elle-même. À l’installation, seule l’autorisation OBS `READ_OBS` est nécessaire ; elle doit être vérifiée par le propriétaire, sans élargissement automatique. Référence : [API officielle obs-browser](https://github.com/obsproject/obs-browser#control-obs).
