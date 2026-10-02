# Audit de livraison points Automod — 2 octobre 2026

Cet audit distingue code déployé, tests simulés et comportements observés sur un jeu. Le périmètre points/shop demandé est livré et vérifié ; les limites de validation provider et de restauration des sauvegardes sont précisées ci-dessous.

| Exigence | Preuve actuelle | État |
| --- | --- | --- |
| Identité Rumble stable, indépendante du pseudo | SSE user_id/users.id, stockage DB ; tests SQL renommage/clé du portefeuille | Validé |
| Solde persistant, réservation et journal idempotents | mig142 déployée ; 14 tests PostgreSQL réels ; réponses natives !points | Validé, restauration de backup non testée |
| Consultation du solde | !points natif avant/après achats et rain, points réservés séparés | Validé |
| Récompenses naturelles et exclusion des achats/hérités | Tests SQL et outbox ; call+10/bonus naturel+25 observés unités53/58 | Validé ; paliers extrêmes testés en SQL, pas provoqués en jeu |
| Rain | Annonce native unité58, +20 puis second !rain refusé ; expiration/idempotence SQL | Validé |
| Shop sans compte sur LeCasiNoze, recherche/copie | Site déployé /automod-shop/, QA desktop/mobile et génération commandes | Validé |
| Commandes uniquement Automod | Tests SQL refus hors mode ; API disabled confirmée après essais | Validé |
| Boosts call mise/durée, même call | Unité58 deux ordresdone, timer réel90s, débit300+250 ; grille native unité62 :20→40c, Golden60c ; vérificateur indépendant réussi | Validé, harness58 initial non vert car attente30c erronée |
| Boost global une heure, non-cumul, expiration | SQL/worker réel coordonné avec provider fixture | Validé au niveau transaction/configuration, pas déclenché pour une heure en jeu |
| Découverte/cache/choix propriétaire | Le Bandit unité53 : menu réel, choix1 natif, cache public ; mauvais propriétaire SQL refusé | Validé |
| Choix connu issu du cache | Unité63 commande native !achat B:fs_consume Le Bandit ; même devis10€, achat avant spins ordinaires, résultatdone | Validé |
| Achat Hacksaw complet | Unité53 vraie commande/intention unique/8FS/gain8,73€/débit350/reprise spins Golden | Validé |
| Achat Pragmatic | V2 Sweet2500 Standard20€ gain14,28€ ; GRM Gates20€ gain16,16€/retour base unité57 | Validé : Hot Fiesta legacy achat25€, récupération unité73, 10→0, gain1,68€, retour base25c |
| Récompense achat positive | Unité63 : achat10€350pts, résultat22,57€ (+210pts palier60%), réponses natives, intention unique et ordredone ; SQL idempotence | Validé |
| Cooldowns personnel/global et priorité FIFO | Tests SQL/concurrence/worker ; refus natif après achat à vérifier si nécessaire | Preuve automatisée |
| Non-réponse demi-minimum, panne/skip sans frais | SQL+worker sur vraie DB, actions provider fixtures | Preuve automatisée |
| Intent durable avant action, jamais double achat ambigu | Tests SQL purchase-sent/uncertain, unité53 une seule intention | Validé |
| Reprise après panne et journaux persistants | Tests outbox et transactions idempotentes ; source/install contrôlées | Validé au niveau tests, pas de panne forcée au clic irréversible |
| Crédit Lucas | Crédit initial20000 unique ; solde natif final19070 | Validé |
| FPS/Chrome/VPN/queue viewers préservés | Pipeline stable inchangé, manifeste14hashes ; vérificateur natif unité58 confirme baseline de file intacte et seul call1029 retiré | Validé |
| Documentation/version/rollback | Guide repo actualisé ; journal de recette, manifestes, backups, archives sans secret | Versionné et poussé : PR9, archive sources14, manifestes et vérificateurs |





Contrôle final en production : Render SQL confirme balance19070/réservé0, crédit initial20000 unique ; quatre ordresdone et deuxrefunded, aucun autre statut pour le propriétaire. API shop répondHTTP200 avec les règles et le cache LeBandit. Worker14/overlay5empreintes concordantes, sauvegardes vérifiées, phaseidle, desired_enabled=false, publisherActive=false ; services web/navigateur manuel/FSB actifs. Vérificateur verify-final-delivery.py exécuté avec succès. Documentation/source versionnées dans https://github.com/LeCasiNoze/LunaLive/pull/9 ; API/site et worker sont déjà déployés indépendamment de la fusion documentaire.

Les preuves automatisées établissent les transitions de cooldown, non-réponse, panne et boost global ; elles ne doivent pas être décrites comme des scénarios supplémentaires joués en production. Le périmètre est prêt pour les tests utilisateur. Aucune promesse de toutes les slots validées, de stockage éternel indépendant de l'hébergeur, de24FPS réels ni de stabilité24/24. Le stockage métier n'a pas de purge programmée ; une restauration Render n'a pas été essayée.
