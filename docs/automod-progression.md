# Profils, XP et parrainage Automod

## Commandes

- `!profil` (alias `!profile`, `!xp`) : niveau, XP, calls joués, bonus naturels, meilleur multiplicateur naturel confirmé, points disponibles, points événement du mois et réduction shop.
- `!parrainer` : code personnel réutilisable ; le filleul tape `!parrain CODE` sur Rumble.
- `!points` conserve son fonctionnement.

Ces identités sont les IDs numériques natifs du chat Rumble, jamais un rapprochement de pseudonymes. Les commandes sont routées uniquement sur LeCasiNoze. La fiche est consultable à l'arrêt ; le parrainage s'enregistre pendant l'Automod.

## Progression et prix

Le profil est une projection du journal durable existant : les participations historiques sont conservées, sans recréditer de points. Un call réellement joué apporte 20 XP ; un bonus naturel, 40 ; un rain, 5 ; un gain récompensé, autant d'XP que de points, limité à 100 par gain. Une future participation événementielle journalisée apporte 25 XP. Cadeaux administrateur, remboursement, parrainage et paris ne produisent pas d'XP.

Niveau 1 à 0 XP. Le palier suivant nécessite `500 × palier²` XP : 500, 2 000, 4 500, etc. Réduction de 1 % par palier, plafonnée à 10 % à 50 000 XP. Ce rythme est un réglage initial à calibrer sur l'activité réelle, pas une garantie de progression en trois mois.

La réduction est enregistrée sur la commande et conservée lors de la découverte du menu et du choix du bonus. Arrondi du prix vers le haut. La pénalité de non-réponse est la moitié du prix réduit du plus petit bonus confirmé. Les remboursements et récompenses utilisent les points effectivement payés. Les anciennes commandes conservent une réduction de 0 %.

## Parrainage

Le filleul doit être connu depuis moins de sept jours et avoir moins de deux calls joués à l'association. Deux calls joués au total valident la participation. Les deux follows doivent avoir été reconfirmés par l'API Rumble dans les deux dernières minutes. Le rapprochement initial du follow par nom n'est effectué qu'à partir d'un message Rumble authentifié ; l'ID natif est ensuite conservé.

L'API utilisée expose les followers récents, pas une preuve exhaustive pour tous les anciens followers. Si l'un des deux n'est plus visible dans cette réponse ou si elle est indisponible, le parrainage reste en attente : aucun follow n'est inventé. Le prochain message du parrain ou du filleul et le prochain call rejouent la vérification. Aucun ancien follower du premier inventaire ne reçoit rétroactivement une prime de bienvenue.

Crédit transactionnel de 500 points chacun, une seule fois. Cinq filleuls récompensés par parrain et mois civil Paris. Le sixième est marqué `limit-reached`, sans report implicite au mois suivant. Auto-parrainage et cycles refusés. Les premières dates de présence sont conservées dans une table durable, initialisée depuis les messages archivés disponibles. Un journal ancien déjà supprimé ne peut pas être reconstitué.

## Livraison et vérification

Migration idempotente `mig144_automod_progression` après mig143. Nouveau champ `discount_percent`, index de projection par identité, premières présences, codes/associations de parrainage, scores événement séparés et mois archivés. Aucun point événement n'est distribué tant que l'événement correspondant n'est pas branché.

Tests PostgreSQL : base jetable sur 127.0.0.1:55432, assertion du répertoire `/tmp/automod-points-pg-data`, aucune écriture Render. Seize scénarios passent : réservations concurrentes, identité renommée, reprise, intentions uniques, prix modifiés, remboursement, découverte, XP historiques, réduction figée, parrainage réciproque refusé, double réception, follow manquant/périmé, plafond mensuel et liaison des followers historiques sans prime rétroactive. Deux tests purs couvrent niveaux et arrondis.

Les nouveaux modes Session achat, Défi providers, le shop événementiel et le nouvel overlay constituent une livraison distincte. Cette modification ne les active pas et ne démarre aucun stream.
