# LunaLive — TikTok Discoverer (extension Chrome)

Extension Chrome / Edge / Brave qui permet à la section **Démarchage TikTok**
du FSB Board de scraper TikTok depuis ton navigateur (et donc avec ton IP
résidentielle + ta session TikTok active), au lieu du serveur LunaLive
qui se fait bloquer par TikTok.

## Comment ça marche

1. Tu cliques sur **🚀 Lancer la récolte** dans le FSB Board.
2. La page LunaLive envoie les hashtags à l'extension via `window.postMessage`.
3. L'extension ouvre dans des onglets en arrière-plan :
   - `tiktok.com/tag/<hashtag>`
   - `tiktok.com/search/user?q=<query>` (si fallback)
4. Sur chaque page, le content script attend que la SPA rende, scroll un peu
   pour déclencher le lazy-load, puis extrait les `uniqueId` des créateurs.
5. Les onglets se ferment automatiquement après extraction.
6. La liste de handles revient à LunaLive qui les envoie au backend pour
   scan profil + filtrage par critères (followers / pays / email).

## Installation (mode développeur)

1. Ouvre `chrome://extensions` (ou `edge://extensions`)
2. Active **Mode développeur** (toggle en haut à droite)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier `extension/tiktok-discoverer/`
5. L'extension apparaît dans la liste — épingle-la si tu veux

Va sur https://lunalive.win/FSB_Board?section=tiktok — un badge vert
**"🟢 Extension active"** doit apparaître dans le panel "Récolte automatique".

## Conseils d'usage

- **Connecte-toi à TikTok** dans le même navigateur : tu auras moins de
  blocages anti-bot et plus de contenu rendu.
- **Lance des runs modérés** : 3-5 hashtags par run, max 30 profils. Si tu
  spam trop, TikTok peut te shadowban temporairement.
- **Ne ferme pas le navigateur pendant le run** : les onglets de capture
  travaillent en arrière-plan, mais ils ont besoin que le navigateur tourne.

## Mise à jour

Tire les changements du repo, puis dans `chrome://extensions` → bouton
**Recharger** sur l'extension LunaLive.

## Sécurité

- L'extension n'a aucune permission au-delà de `tabs`, `storage`,
  `scripting` et `host_permissions` sur tiktok.com + lunalive.win.
- Aucune donnée n'est envoyée ailleurs que vers `lunalive.win` (via la
  page LunaLive qui appelle l'API LunaLive avec ta session habituelle).
- Le code source est dans `extension/tiktok-discoverer/`. Tu peux tout
  inspecter.
