# Récompenses du Défi Provider

Barème version 1, activé pour les nouveaux défis. Les défis déjà créés conservent leurs règles : leurs anciens choix de camp n'ont pas d'horodatage fiable.

Sans mise obligatoire, à la fin d'un défi terminé : 1 000 points au gagnant choisi au début, 250 au perdant, 500 en cas d'égalité. Le temps restant au choix du camp réduit ces montants proportionnellement sur deux heures.

Un camp déjà en tête réduit aussi la prime de victoire : facteur `1 - 0,75 × avance / (|score du camp| + |score adverse| + 50)`. Ce facteur et celui du temps sont enregistrés au choix du camp, qui reste verrouillé. Un retardataire ne peut pas récupérer le barème du début en répétant sa commande.

Bonus de contribution : 5 points par point positif de score obtenu sur ses propres calls, maximum 500 par personne et par défi. Un passage négatif ne donne pas ce bonus. Seuls les passages terminés et confirmés comptent. Les calls automatiques ne sont attribués à personne. L'identité Rumble est enregistrée au démarrage du passage, avant le retrait du call de la file.

Les réservations et règlements des paris optionnels restent distincts. Une annulation ne donne aucune récompense de fin. Toutes les écritures sont transactionnelles et possèdent une clé unique par défi et identité Rumble.

Exemple : à une heure de jeu, rejoindre Hacksaw avec 128,2 contre 27,4 donne 316 points de victoire, plus le bonus de ses calls. À scores égaux au même instant, la prime vaut 500 points.

Validation : tests purs du barème, tests PostgreSQL dans le cluster temporaire vérifié (aucune fixture en production), règlement concurrent, répétition des reçus et du choix de camp, identité conservée après suppression du call, annulation et compatibilité des défis antérieurs.
