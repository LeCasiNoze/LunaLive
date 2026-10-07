# Points et shop Automod

## État de livraison

API et site déployés le 2 octobre 2026. API : PR #8, commit main `38dc325eaca407546f50e6dd14dbadc5d0bec571` ; migration `mig142_automod_points`. Site : PR #1 du dépôt NozeBet, branche de déploiement `codex/lecasinoze-hub`, commit `b2b1916dc77cab33a30dd0b52312492a5c362ba1`. Shop : https://lecasinoze.onrender.com/automod-shop/ .

Worker VPS : version consolidée `points-20261002-intro-proof`, contrôlée par les quatorze empreintes de `worker-current-manifest.json`. Les correctifs incrémentaux et sauvegardes restent conservés. Le journal de recette détaillé est `automod-points-20261002/LIVRAISON-ET-VALIDATION.md` dans le dossier de travail LeCasiNoze. Le déploiement n'est pas une preuve de toutes les familles de machines : les limites de recette ci-dessous restent applicables.

## Identité et stockage

Le portefeuille appartient à `(streamer_id, rumble_user_id)`. L'identifiant Rumble numérique vient du message SSE et correspond à `users[].id` ; le pseudo n'est qu'un libellé actualisable. Un message sans cet identifiant ne peut ni gagner ni dépenser des points. L'identifiant du message ne doit jamais être utilisé comme identifiant du viewer.

Migration `mig142_automod_points` : comptes, grand livre, commandes, cache de bonus, événements et rains. Toutes les variations du solde et des réservations passent par `walletEntry`, sous transaction et verrou du compte. La clé métier unique protège la répétition d'un événement après perte de réponse. Les montants en euros sont stockés en centimes entiers ; zéro et montant inconnu sont distincts. Aucun mécanisme ne purge ces données métier.

Le journal JSONL VPS constitue la source des faits de jeu. L'outbox reprend les événements non acquittés après redémarrage. Sa date d'activation interdit de créditer accidentellement toute l'historique. Une dernière écriture interrompue est préservée dans un fichier de diagnostic avant réparation du journal ; une corruption intérieure est signalée.

## Commandes Rumble

Ces achats sont exclusivement disponibles quand Automod est activé pour LeCasiNoze. Le shop public ne possède aucun credential et ne dépense rien : il génère du texte à copier dans le chat.

| Commande | Fonction |
| --- | --- |
| `!points` | Solde total, réservé et disponible |
| `!shop` | Lien du market public |
| `!rain` | Participation unique au rain actif |
| `!call +1 Nom complet` | Mise ×3, 300 points |
| `!call +2 Nom complet` | Mise ×6, 750 points |
| `!call +3 Nom complet` | Mise ×10, 1750 points |
| `!duree 1 Nom complet` | Durée ×1,5, 250 points |
| `!duree 2 Nom complet` | Durée ×2, 700 points |
| `!duree 3 Nom complet` | Durée ×4, 1500 points |
| `!mise 1h` | Mise globale ×3 pendant une heure, 2500 points |
| `!achat Nom complet` | Call prioritaire avec découverte des bonus |
| `!achat B:identifiant Nom complet` | Variante connue, revérifiée sur la machine |
| `1`, `2`, `3` ou `!achat 2` | Choix du demandeur quand une proposition est active |

Le natif Rumble du demandeur doit correspondre à celui de la réservation. Les choix des autres viewers sont ignorés. Les réponses longues sont découpées en messages de 190 caractères maximum, en respectant le transport du bot. La commande classique `!call` et PCall restent leurs mécanismes existants.

## Récompenses

Premier spin payé terminé d'un call : 10 points. Bonus naturel déclenché : 25 points. Rain : 20 points par natif, toutes les 20 minutes lorsque le publisher est actif et le statut VPS récent ; fenêtre de participation de 2 minutes.

Pour un spin naturel ou le résultat final d'un bonus naturel, seul le plus haut palier est crédité : ×100 → 15 points, ×250 → 35, ×500 → 75, ×1000 → 250, ×5000 → 5000. Les spins internes d'un bonus, les bonus achetés et les bonus hérités ne reçoivent pas ces récompenses naturelles.

## Boosts

La référence est la mise et la durée de session avant boost. Le worker conserve cette référence lors d'une reprise : il ne multiplie pas à nouveau une configuration déjà augmentée. Mise choisie : palier disponible le plus haut inférieur ou égal à la cible. Golden reste appliqué si disponible ; le plafond de coût configuré par le propriétaire est augmenté proportionnellement au facteur autorisé et contrôlé avant jeu.

Le boost global attend la prochaine machine et démarre à son premier spin confirmé. L'échéance d'une heure est calculée par le serveur API. Le facteur maximum entre global et individuel est utilisé, jamais leur produit. Si le global couvre déjà le palier local, celui-ci est refusé sans réservation. Un seul global actif ou réservé. À expiration, la machine et son bonus finissent normalement ; retour à la base au prochain changement sûr.

Une hausse d'un palier encore pending ne réserve que la différence de points. Dès que le worker le réclame, il n'est plus modifiable. Le débit d'un boost attend une preuve de mise appliquée et un spin terminé.

## Achats de bonus

Prix : 35 points par euro, arrondi supérieur. Exemple : 20 € → 700 points ; 100 € → 3500 points.

Un achat crée un vrai call dans la file, prioritaire après la visite et le bonus actuels. Les achats prioritaires sont FIFO. Un achat pending maximum par viewer ; cooldown personnel 15 minutes après la fin ; intervalle global 10 minutes entre débuts d'achat.

Variante connue : sélectionner dans le shop, arriver sur la slot, vérifier mise normale/prix/identifiant, acheter sans spins d'attente. Variante inconnue : inspecter et fermer le menu, enregistrer les variantes en cache, lancer les spins ordinaires et annoncer au demandeur les choix numérotés. Le choix valide interrompt l'autoplay, attend le round ou bonus en cours, puis achète. Après le bonus acheté, reprise des spins sur la durée restante du call.

Le cache est séparé par slot et mise de base ; il facilite la sélection mais ne constitue jamais une autorisation de paiement. Le prix et la variante sont relus sur le jeu avant l'intent puis à chaque étape native. Les menus doivent être fermés et le réglage Golden restauré après inspection.

L'API persiste `purchase-sent` AVANT le clic irréversible. Seule une progression de bonus réellement observée permet de confirmer et débiter. Une perte de réponse ou panne après intent donne `uncertain` : aucun deuxième achat automatique et aucun remboursement automatique sans réconciliation. Une panne avant intent libère les réservations.

Sans choix à la fin du chrono : frais = moitié des points du plus petit achat réellement découvert, uniquement si la machine a joué et sans incident technique. Un skip manuel, une machine inaccessible ou une absence de vrai jeu ne déclenche pas ces frais.

Récompense d'un achat, sur gain/prix d'achat : ≥×1 rembourse 25 % des points, ≥×2 60 %, ≥×3 110 %, ≥×5 150 %, ≥×10 200 %. Un seul palier et une seule écriture métier par achat.

## Contrôles avant déploiement

1. Compiler API/worker/site/overlay et inspecter les fichiers modifiés sans toucher les changements indépendants du checkout principal.
2. Tests PostgreSQL réels en base temporaire : vérifier son `data_directory` avant toute fixture. Concurrence, idempotence, refus de devis changé, choix natif et remboursements.
3. Tests worker : reprise de configuration, premier spin, expiration, attente de bonus, perte de réponse, jamais deux achats.
4. QA du shop desktop et mobile : recherche, choix connu/inconnu, génération et copie, état désactivé ; vérifier les cartes générées dynamiquement.
5. Sauvegarder le moteur/configuration VPS et conserver les commits précédents API/site. Publisher et Automod arrêtés pendant transition.
6. Déployer migration/API puis worker/overlay/site coordonnés. Vérifier les routes avec le credential service existant, sans publier le secret.
7. Créditer le propriétaire Rumble `284177710` avec la route de crédit de test réservée à ce propriétaire, clé idempotente ; vérifier 20 000 points une seule fois.
8. Tests fictifs privés bornés Hacksaw/Pragmatic : commande → réserve → devis → intent → vrai bonus → débit → gain final → récompense → solde. Ne pas consommer les calls des viewers. Aucun gamble, aucun lancement public dans ce chantier.
9. Vérifier sauvegarde du grand livre PostgreSQL et conservation des journaux. Documenter l'état des tests et les familles réellement couvertes ; ne pas annoncer toutes les slots validées.

## Diagnostic et limites

Les providers partagent des familles de composants ; une famille validée n'est pas la preuve de toutes les machines. Pour Pragmatic V2, `purchaseCosts * CoinManager.GetSmallestBet()` est le prix natif en euros. `fsPurchased` peut rester vrai après un bonus terminé : il n'est pas une preuve de bonus actuellement actif. Les bloqueurs et options réellement activées restent contrôlés. Les familles legacy demandent leur propre validation.

Ne pas forcer une option disabled, le menu de gamble ou un achat après intent ambigu. Les fichiers de diagnostic ne doivent pas afficher les cookies, tokens, URLs sensibles ou adresses IP. Le profil Chrome et Norway doivent être préservés. Le pipeline FPS et le chat statique ne sont pas modifiés par le shop.

Hunt, cagnotte/full-buy et giveaway futurs sont hors implémentation de cette livraison.

## Preuves de recette privée

- PostgreSQL temporaire réel : 14 tests réussis, aucun échec ni skip ; trois croisent le worker installé et les transitions SQL. Les actions provider de ces trois tests sont des fixtures, distinctes des achats réels ci-dessous.
- Worker Linux : 497 tests, 492 réussis, 5 ignorés ; régression ciblée Pragmatic/capture : 27 réussis, aucun échec ni skip.
- Le Bandit, unité53 : vraie commande Rumble, réserve175, menu10€/25€, choix du propriétaire, achat10€ débité350points après bonus naturel, résultat8,73€, reprise des spins payants/Golden. Ordre `1e060e39-1360-4b53-8239-63c8dfa5815e`. Journal `/opt/automod/.runtime/points-fullchain-1790964554409/validation.jsonl`.
- Gates1000, unité57 : reprise réelle du récap16,16€, CONTINUE sans scroll parasite, disparition confirmée puis base20c. Journal `/opt/automod/.runtime/shop-purchase-validation/gates-return-1790966088204.jsonl`. Aucun nouvel achat dans cette reprise.
- Boosts/rain, unité58 : commandes natives créant un seul call1029, débit300+250, durée90000ms à partir du premier spin, bonus naturel attendu au-delà du deadline puis gain15,46€ collecté. Rain+20 une fois, deuxième participation refusée. Solde natif final19200, réserve0. L'assertion de mise du harness attendait30c exactement, alors que le provider a choisi20c pour cible30c ; cette unité n'est donc pas un test vert. La grille réelle doit être contrôlée indépendamment pour prouver l'arrondi inférieur.

Le crédit de test initial20000 a été attribué une seule fois à l'ID propriétaire284177710 ; les dépenses/récompenses expliquent le solde actuel. Ne jamais recréditer aveuglément après un test ou une perte de réponse.

Les essais utilisent uniquement un publisher privé borné et un vrai live non répertorié. Le superviseur FSB est arrêté pendant l'activation temporaire du mode. Après essai : désir Automodfalse, publisher privé arrêté, modèlePUBLICrestauré avec confirmation, Chrome manuel/superviseur rétablis, publisher public inactif. Ne pas lancer un live public pour terminer cette recette.

### Résolution de l'assertion de mise

Diagnostic natif unité62, sans spin ni achat : le palier immédiatement supérieur à20c est40c. La cible30c est donc correctement arrondie à20c, avec Golden60c. Journal /opt/automod/.runtime/points-stake-grid-1790967886961/grid.json. Le vérificateur indépendant verify-native-boosts.mts, exécuté sur ce journal et celui de l'unité58, confirme les deux ordresdone, durée90s, spins terminés, bonus attendu/collecté et fileviewer intacte. L'unité58 initiale conserve son erreur historique d'assertion ; sa preuve métier est maintenant validée indépendamment. Aucune nouvelle dépense pour cette vérification.

## Achat connu et récompense positive — unité63

Même live privé v7gakqm/446974600 repris et confirmé EN DIRECT/non répertorié. Commande native !achat B:fs_consume Le Bandit : réserve350 immédiate sur solde19200, call1030, ordreba77eecd-374e-4ed0-a6d8-5dff801e6a01. Menu réel revalidé identifiantfs_consume/prix10€/base10c ; achat avant tout round payé, sans second choix du viewer.
Bonus réellement terminé gain2257c ; débit350, rebate210 (60% pour gain>=2×prix), aucune récompense naturelle sur le bonus acheté. Spins payants repris Golden30c/base10c, first-spin+10. Solde annoncé19070, réserve0 =19200-350+210+10.
Unité63 terminalcode0 19:17:24UTC, journal /opt/automod/.runtime/points-fullchain-1790968274329/validation.jsonl. Deux vérificateurs indépendants en lecture seule réussissent : intentunique, achatconnuavantspins, résultat/rebate, roundsaprèsachat, filetierspréservée. Fin de timer autoplay coupé puis dernierround réglé avant sortie.
Manifeste actuel13sources contrôlé allMatchtrue. Nettoyage APIshopfalse, Chrome/web/superviseuractifs, publicpublisherfailed/inactif, privéstoppé ; modèlePUBLICsauvegardé et toastconfirmé. Screenshots native-known-buy-chat-proof.png et rumble-public-restored-after-known-buy.png. Aucun achat100€/gamble ni livepublic.
Le parcours connu/cache et la récompensepositive sont maintenant prouvés en natif. Hot Fiesta legacy est désormais validé (achat25€, récupération73, 10→0, gain1,68€, retour base25c). Livraison versionnée dans la PR9, périmètre prêt pour les tests utilisateur.


### Transition legacy Hot Fiesta validée
L'achat déclenche une phase de piñatas avant l'introduction des free spins. Le compteur serveur peut déjà valoir 10 pendant cette phase, tandis que les UILabel FSStart sont encore inactifs. Une capture HUD `clear` ne prouve donc pas le lancement du bonus. Le worker acquitte `bonusStartAdvanced` seulement après une progression réelle, puis reconnaît l'introduction profonde `FSStartWindow_BuyFS` sous `FSStartWindow_HOFI` (ancêtre le plus proche, profondeur12). Les labels actifs, titres complets, handler natif et gardes anti-gamble restent obligatoires. La récupération73 a confirmé 10→0, gain168c, fermeture du récap et retour base25c sans nouvel achat. 50 tests ciblés et compilation stricte passent. Backup : `.runtime/backups/points-20261002/before-intro-proof-<fichier>` ; manifeste version `points-20261002-intro-proof`.
