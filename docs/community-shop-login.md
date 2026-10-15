# Shop communautaire : connexion et sons

## Parcours V1

Connexion Discord via le client OAuth existant, scope `identify` seulement. Pas de nouveau mot de passe, d'email collecté ni de compte LunaLive créé par ce parcours. Le callback existant reste compatible avec les connexions LunaLive habituelles.

L'identité Discord vérifiée retrouve `automod_discord_links`. Si le lien Rumble existe, le portefeuille natif reste inchangé. Sinon, le site propose immédiatement la commande `!lier CODE` à poster une fois sur Rumble. Aucune liaison ne s'écrase silencieusement.

Le retour OAuth utilise un code aléatoire à usage unique (60 secondes), lié au navigateur par challenge S256. Le fragment est supprimé avant échange. Le serveur ne stocke que les empreintes des codes et des sessions opaques ; session 30 jours, révocable par déconnexion. Le navigateur conserve cette session dans son stockage local. Ne jamais l'exposer dans une capture, un journal ou une URL. Elle n'est pas un JWT LunaLive : seuls les endpoints `/community/me` l'acceptent. Effacer les données du site ou se déconnecter impose une nouvelle connexion.

`GET /community/me` retourne le profil lié ; `POST /community/me/link` demande le code Rumble. `POST /community/me/upgrade` et `/sound` utilisent des reçus UUID, un tarif attendu et la vérification serveur. Une requête incertaine garde son reçu côté navigateur pour ne pas être débitée deux fois. Les mutations ne prennent jamais l'identité Discord ou Rumble dans le corps client.

La variante email/mot de passe n'est pas livrée par cette V1. Elle ne doit pas afficher un formulaire factice. Si retenue, réutiliser la vérification et la récupération existantes, avec preuve de liaison Discord visible dès l'inscription.

## Sons fournis

Sept liens MyInstants fournis par le propriétaire le 15/10/2026 ; chemins MP3 réels et durées ffprobe dans `api/src/nozecoins/sound-catalogue.ts`. Tarif initial uniforme : 50 NozeCoins. Volume initial 0,45, pas une normalisation loudness mesurée. Here comes the money dure 9091 ms : limite lecteur portée à 12 secondes, lease inchangée à 30 secondes.

Le catalogue et ses préécoutes sont publics même quand les achats sont désactivés. `/sons son:identifiant` prépare une confirmation Discord sans débit. La présence d'un son sur MyInstants ne constitue pas une preuve de droits de diffusion.

`NOZECOINS_SOUNDBOARD_ENABLED` reste désactivé avant test réel OBS. Aucun changement de ce flag n'est nécessaire pour voir et écouter le catalogue sur le site. Ni les tests SQL ni les tests simulés du lecteur ne prouvent la restitution audible en sortie OBS. Le contrôle propriétaire et l'état de diffusion OBS restent obligatoires pour l'admission d'un achat de son.
