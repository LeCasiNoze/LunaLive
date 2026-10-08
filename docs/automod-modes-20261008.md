# Automod : modes et progression

Le worker annonce ses capacités dans le heartbeat. L'API n'offre au vote et au shop que les modes/fonctions annoncés : ne jamais activer une capacité simplement parce que son écran existe.

- Session achat : trois bonus par machine, devis réellement observé, Golden désactivée pour acheter. Budget cible 100 fois la mise session, plafond125 fois ; priorité Bounty sur Hacksaw à demi-mise, avec minimum fournisseur vérifié. Un upgrade remplace un achat, sans quatrième achat.
- Défi providers : camps persistants par ID Rumble, files distinctes, trois machines par provider ; clôture après deux heures ET un cycle équilibré terminé. Score : 2points/€ net (Golden incluse), +5/bonus naturel, spectacle calculé sur la mise de base. Paris à pot partagé, jamais de création de points lors du règlement. Un passage dont le résultat reste incertain ne doit jamais disparaître silencieusement.
- Meilleur Achat : mardi/vendredi, jour Paris, un achat offert par follower confirmé ; file et intentions survivent à minuit et aux redémarrages. Points de classement séparés du wallet. Aucun versement monétaire automatique.
- Vote de mode : cinq minutes toutes les deux heures, différé jusqu'à une frontière sûre ; hunt/série/bonus terminés avant changement.

Les achats persistent une intention avant le clic. Une réponse réseau perdue ne permet pas de rejouer le clic ; un gain enregistré est réutilisé sans double débit ni récompense. Un échec prouvé avant intention peut récupérer le quota. Les tests SQL jetables couvrent réservations concurrentes, reprise, limites, parrainage, classements et migrations rejouées.

## Profils, Discord et parrainage

Le solde/XP/profil est attaché à l'identifiant natif Rumble, jamais au pseudonyme seul. !profil et !points fonctionnent dans Rumble. Discord utilise /automodlink puis !lier CODE dans Rumble (code privé dix minutes, usage unique) ; ensuite !profil ou /automodprofil. Aucun compte LunaLive obligatoire pour ce parcours.

!parrainer crée le code du parrain ; !parrain CODE lie un nouveau participant. Récompense500pts chacun après deux calls joués et preuve récente des deux follows, une fois, cinq filleuls récompensés/mois maximum. Pas d'auto-parrainage ni de cycles.

## Messages et follows

Autoposts LeCasiNoze : une nouvelle activité humaine récente requise, au moins vingt minutes entre rappels, bots exclus. Le texte exact {{automod_session}} est rendu selon le mode courant ; installer le bot avant de remplacer les textes en base. Accueil une fois par ID et jour Paris.

Le timestamp des follows Rumble peut être quatre heures dans le futur. Le conserver comme clé historique ; utiliser seen_at/last_confirmed_at pour la fraîcheur. Annonce et mise en file Rumble atomiques ; crédit100 une fois après liaison avec un vrai message natif. Ne jamais annoncer la première photographie des followers historiques.

## Limites à ne pas masquer

Le Live API Rumble examiné fournit la lecture du live/follows, pas une écriture documentée des titres. Le générateur de métadonnées et sa vérification après écriture ne constituent pas un transport authentifié. Ne pas annoncer les titres automatiques opérationnels sans ce transport.

Les validations navigateur et preuves de déploiement sont consignées dans le dossier maintenance du projet Automod. Un test unitaire réussi ne vaut pas validation d'un achat natif, ni garantie sur toutes les slots.
