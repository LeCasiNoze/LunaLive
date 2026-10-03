# AutoMod et Auto Hunt : annonces Discord

Serveur LeCasiNoze `1188913226990235800`. Salon d'annonces `〈🤖〉┃𝗔𝗨𝗧𝗢𝗠𝗢𝗗`, ID `1556031809999999016`, dans Communauté. Le guide existant n'est pas déplacé. Rôle AutoMod `1556031808603291689`, sans permissions privilégiées ; mentionnable pour permettre le ping du webhook. NozeBot inclut ce rôle dans sa liste autorisée du menu `nozebot:notifications` dans Choix des rôles.

Noms harmonisés : `〈💻〉┃𝗩𝗣𝗡-𝗚𝗥𝗔𝗧𝗨𝗜𝗧` et `〈💸〉┃𝗥𝗘𝗧𝗥𝗔𝗜𝗧-𝗖𝗥𝗬𝗣𝗧𝗢`.

## Exécution et règles

Le service systemd `automod-discord-news.service` observe uniquement `http://127.0.0.1:4317/api/status`, toutes les 20 secondes. Aucun clic, aucune navigation, aucune commande de spin ou de publisher. Il ne publie que lorsque le runner est en cours et le publisher actif. Aucun PC nécessaire. Il est distinct du service d'alertes live existant de NozeBot.

La configuration privée est `/etc/automod/discord-news.json`, mode 0600. Elle contient le webhook limité au nouveau salon, les IDs rôle/salon et les liens publics. Ne jamais afficher ni committer l'URL du webhook. NozeBot reste sur Render pour les choix de rôles et ses fonctions existantes ; son token global n'est pas installé pour cet observateur.

Les messages contiennent un embed violet, la preview LunaLive, l'objectif, la mise de base, Golden et vitesse, des boutons Rumble/LunaLive et uniquement le ping du rôle AutoMod. Pas de `@everyone`.

- Automod classique : annonce de lancement.
- Hunt au nombre de bonus : lancement, moitié atteinte, deux bonus restants, puis ouverture réelle. Pour 20 : paliers 10 et 18.
- Hunt au solde : afficher le seuil d'ouverture exact. Mi-parcours à 50 % du budget consommable entre solde initial et seuil, ouverture imminente à 10 % restant. Ne pas confondre seuil de solde et budget initial.
- Hunt par vote : annoncer la règle du vote puis le vote lorsqu'il est présent dans l'état.
- Nouveau cycle Hunt : nouvelle annonce de recherche. Les anciennes entrées déjà ouvertes ne sont pas comptées dans la collection actuelle.

## Anti-spam et reprise

État persistant `/var/lib/automod-discord-news/state.json`, privé, remplacement atomique et fsync. Déduplication par cycle et événement. Plusieurs seuils franchis entre deux observations : seul le dernier est envoyé ; les précédents sont marqués dépassés. Une livraison réseau ambiguë est marquée `delivery-unconfirmed`, sans répéter aveuglément un ping que Discord a peut-être déjà reçu. Le journal conserve l'ID d'un message confirmé, jamais le secret. Un HTTP 429 permet une nouvelle tentative. Une panne du lecteur de statut n'arrête pas l'Automod.

Commandes : `systemctl status automod-discord-news`, `journalctl -u automod-discord-news`, `systemctl restart automod-discord-news`. Pour rejouer exceptionnellement une annonce incertaine, inspecter le salon avant de retirer uniquement cet événement de l'état privé, service arrêté. Ne pas effacer tout l'état au redémarrage.

Tests : `python3 -m unittest -v test_automod_discord_news` dans le dossier scripts. Ils couvrent seuils, changement de cycle, restart sans doublon, ouverture réelle, budget solde, rôles et absence de publication hors live. Les tests ne publient aucun faux message dans Discord.

Premier message réel du hunt du 3 octobre : `1556033307035173089`. Le stream en cours n'a pas été interrompu pour ces changements.
