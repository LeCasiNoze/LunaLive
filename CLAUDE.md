# CLAUDE.md — LunaLive

## Stack visuelle V3 (EditorFSN V3 — modeles M10+) — OBLIGATOIRE

Pour **chaque nouveau modele V3** (M10+, landings affiliees / mini-jeux),
exploiter au MAXIMUM les outils installes. Ne jamais livrer un modele
"plat" qui n'utilise qu'une partie du stack — l'objectif est un rendu
toujours premium et original.

### Librairies disponibles (deja installees, web/package.json)
- **framer-motion** : animations, transitions, useScroll/useTransform,
  useSpring, useInView, AnimatePresence, layout animations, gestures,
  magnetic effects, scroll-driven parallax. C'est la base de toute
  animation React — l'utiliser au lieu de simples transitions CSS.
- **lenis** : smooth scroll. ATTENTION : a desactiver dans l'iframe
  preview de l'editeur (intercepte la molette). OK pour la page
  publiee /r/<slug>. Si utilise, conditionner sur
  prefers-reduced-motion + detecter le contexte preview.

### Patterns visuels a appliquer systematiquement
A choisir selon le concept du modele (varier d'un modele a l'autre, ne
pas tous les empiler dans un seul) :

- **Mesh gradient anime** (radial-gradients multi-couches + animation
  CSS) au lieu de fond plat
- **Aurora beams** (gradients lineaires flous animes diagonalement)
- **Spotlight curseur** (radial-gradient suivant la souris via
  useMotionValue + useSpring)
- **Parallax scroll** (useScroll + useTransform sur translateY)
- **Conic-gradient anime** avec `@property --angle` pour bordures
  rotatives premium
- **Glassmorphism** (backdrop-filter:blur + bg rgba transparent +
  border subtile)
- **Magnetic CTA** (bouton qui suit le curseur via useMotionValue +
  useSpring, deplacement subtil 18-22%)
- **Tilt 3D** (rotateX/rotateY en fonction de la position curseur)
- **Compteurs animes** (count-up sur useInView, easing cubic-out)
- **Marquee / infinite scroll** (CSS keyframes translateY/X infinis)
- **Shimmer / shine** sur texte (gradient mask traveling)
- **Reveal on scroll** (useInView + opacity/translateY transition)
- **Grain texture** (SVG turbulence noise en overlay, mix-blend-mode
  overlay)
- **Breathing button** (box-shadow keyframes alternees)
- **Border gradient anime** avec `@property --a` + mask composite

### Polices
Toujours exploiter les polices Google Fonts deja chargees dans
`index.html` (Lovable fonts) :
- "Bagel Fat One" (display cursive playful)
- "Space Grotesk" (sans display)
- "Chakra Petch" (sci-fi)
- "Syne" (alt display)
- "DM Sans" (sans body)
- "Playfair Display" (serif editorial)
- "Bebas Neue" / "Anton" (condensed display)
- Poppins / Inter / Montserrat (sans base)
Varier les polices entre les modeles pour identite visuelle distincte.

### Regles d'or pour chaque nouveau modele V3
1. **Concept fort et distinct** des modeles existants (visuellement +
   format). Pas de copie cosmetique d'un modele voisin.
2. **Au moins 4-5 patterns visuels du catalogue ci-dessus** combines
   de facon coherente avec le concept.
3. **Theme-aware obligatoire** : accent / accentLight / accentGlow /
   bgPage / bgCard recus via prop `theme` et appliques partout. Les
   8 M1Theme (or, rubis, emeraude, saphir, amethyst, obsidian, rose,
   jade, cyclope) doivent rendre de facon premium sans casse.
4. **pseudoStyle respecte** via helpers `pseudoTextStyle()` /
   `pseudoPillStyle()` de `v3_pseudo_style.ts`.
5. **prefers-reduced-motion** desactive toutes les animations
   continues (spin, breath, marquee, shimmer).
6. **Test sur les 8 themes** mentalement : si une couleur fonce le
   texte devient illisible → ajuster avec text-shadow ou couleur
   safe.

## Regles conversion / leads (V3 landings affiliees)

Les landings V3 (M10+) sont en bio Instagram/TikTok/Twitch ou
description video. **L'objectif absolu est le taux de conversion +
maximiser le montant depose.** Chaque nouveau modele doit integrer :

### Leviers conversion obligatoires (choisir 3+ par modele)
- **Urgence temporelle** : countdown HH:MM:SS visible (banner top
  sticky idealement)
- **Rarete** : "places restantes" / "stock limite" qui decremente
- **Preuve sociale live** : feed activity temps reel (faux mais
  credible, prenoms+montants random toutes les X secondes via
  setInterval)
- **Trust badges** : licence, SSL, retrait 24h, +X joueurs
- **Anchoring montant** : afficher le bonus en HUGE (>3rem), depot
  requis en plus petit
- **Anti-friction** : "inscription en 30s", "sans CB requise",
  "credit instantane"
- **Upsell deposit** : paliers, multiplicateur bonus visible, badge
  "recommande" sur palier moyen-haut

### Capture VIP email (OBLIGATOIRE)
Chaque modele V3 doit integrer une **capture email VIP inline** dans
la landing (pas seulement le popup V3OfferPopup). Cible : gros
joueurs (500€+/mois) → leur attribuer un host VIP pour recontact.

- Composant pret a l'emploi : `<V3InlineVipForm />` de
  `web/src/components/V3InlineVipForm.tsx`
- Le POST va vers le meme endpoint que le VIP banner du popup :
  `/api/public/affi-vip-leads` (slug + email + referrer)
- postMessage `v3-vip-lead` pour l'editor preview
- Placer dans une section dediee bas de page, **toujours visible**
  meme si l'user n'a pas clique le CTA principal
- Customiser titre/subtitle/ctaLabel selon le concept du modele

### Double CTA recommande (segmentation)
Quand pertinent, prevoir 2 CTA distincts :
- CTA principal → V3OfferPopup (joueurs standards)
- CTA secondaire "Devenir VIP" → scroll vers V3InlineVipForm (gros
  joueurs)

## Contexte produit
LunaLive est une plateforme française autour du streaming casino, des pages casinos, des profils streamers, des événements et d’une communauté.  
Le site est actuellement une SPA React/Vite avec une couche SEO hybride (HTML statique + scripts de build + seo-update.js + génération de routes statiques).

## Objectif principal actuel
Améliorer fortement l’indexabilité Google et la visibilité SEO des pages publiques importantes, sans migration complète de framework et sans casser les fonctionnalités existantes.

## Priorité business
1. Être mieux indexé par Google sur les pages publiques stratégiques
2. Améliorer la confiance / E-E-A-T / signaux YMYL-adjacent
3. Renforcer le HTML visible sans JS
4. Corriger les points techniques bloquants ou trompeurs
5. Préparer une architecture SEO scalable à court terme sans refonte totale

## Stratégie choisie
Nous ne faisons PAS une migration complète vers Next.js / Remix / SSR global dans cette phase.

Nous faisons une **architecture SEO option 1** :
- garder l’application React/Vite actuelle
- conserver la SPA pour l’expérience utilisateur
- renforcer la couche HTML statique / pré-rendue pour les pages publiques importantes
- faire en sorte que Google reçoive un vrai HTML utile sur les routes SEO critiques
- améliorer les scripts de build, les routes statiques, le sitemap, les métadonnées et le schema

## Définition concrète de l’option 1
Construire une façade SEO statique intelligente sur les pages publiques importantes :
- title unique
- meta description unique
- canonical cohérent
- H1 réel
- bloc `<main>` HTML utile et crawlable
- contenu textuel public visible sans JS
- schema top-level propre
- liens internes utiles
- bon sitemap
- bon comportement des URLs publiques

## Routes SEO prioritaires
Traiter en priorité :
- /
- /browse
- /casinos
- /casinos/:slug
- /a-propos
- /contact
- /mentions-legales
- /politique-de-confidentialite
- /cgu
- /event
- principales pages streamer publiques si elles sont réellement indexables et propres

## Ce qui compte le plus
- HTML utile visible avant exécution JS
- cohérence des routes statiques générées
- qualité des métadonnées des pages publiques
- absence de signaux SEO trompeurs
- stabilité du build
- zéro régression produit visible

## Contraintes obligatoires
- Ne pas faire de migration framework complète dans cette phase
- Ne pas casser l’auth, le dashboard, le chat, le wallet, le player, les flows admin
- Ne pas toucher au backend sauf nécessité absolue pour un bloc SEO clair
- Ne pas faire de refactor cosmétique hors sujet
- Ne pas réécrire l’application entière
- Favoriser les changements incrémentaux, testables, réversibles
- Si un changement est risqué, proposer une alternative plus sûre
- Toujours préférer le code réel à l’audit théorique s’ils se contredisent

## Règle de travail
Pour tout chantier important :
1. auditer le code réel concerné
2. proposer un plan court ordonné par impact / risque
3. implémenter par blocs cohérents
4. vérifier build / typecheck / comportement
5. corriger les erreurs immédiatement
6. résumer précisément ce qui est fait / non fait

## Ce qu’il faut préserver
- comportements métier existants
- design global et navigation existante
- génération sitemap/build déjà fonctionnelle
- pages et scripts SEO déjà améliorés dans les sprints précédents
- suppression des faux signaux schema déjà réalisée
- pages trust déjà créées

## Points SEO déjà améliorés
Déjà en place :
- pages légales/trust
- footer global trust
- page 404
- suppression de faux rating schema
- defer sur seo-update.js
- H1 /casinos corrigé
- build vert
- génération statique existante confirmée

Ne pas casser ces acquis.

## Problèmes prioritaires encore ouverts
- contenu public encore trop dépendant du JS
- seo-update.js écrase une partie du schema statique
- meta descriptions incorrectes dans les pages HTML pré-rendues
- pages trust absentes du sitemap ou mal prises en compte
- noscript/home trop faible
- headers HTTP de sécurité absents
- image OG inadéquate
- Organization schema sans sameAs
- perf toujours limitée par gros bundle / Render cold start
- architecture SEO encore hybride et fragile

## Règles schema
- ne jamais injecter de données trompeuses
- pas de note/rating hardcodé
- éviter les types inadaptés
- privilégier des blocs top-level propres
- conserver WebSite + SearchAction quand pertinent
- utiliser sameAs quand les profils réels existent

## Règles contenu
- pas de keyword stuffing
- pas de blabla vide
- contenu utile, simple, crédible, spécifique à la page
- chaque page publique importante doit avoir un rôle clair
- les pages YMYL-adjacent doivent inspirer confiance
- les mentions légales / confidentialité / contact doivent rester prudentes et réalistes

## Règles de sécurité
- pas de suppression massive
- pas de commande destructive non nécessaire
- pas de modification silencieuse hors périmètre
- si un changement présente un risque de régression, s’arrêter et proposer une alternative

## Définition de “terminé” pour un sprint
Un sprint est terminé si :
- build front OK
- aucune nouvelle erreur TypeScript
- les routes concernées fonctionnent
- le HTML source des pages ciblées est amélioré
- les métadonnées ciblées sont cohérentes
- le schema ciblé est propre
- le sitemap ciblé est correct
- aucun acquis précédent n’est cassé
- un résumé final précis est fourni

## Format de sortie attendu
À la fin de chaque intervention importante, fournir :
1. fichiers modifiés
2. commandes exécutées
3. erreurs rencontrées et corrigées
4. ce qui est prêt
5. ce qui reste à faire
6. niveau de confiance honnête

## Économie de tokens
- Ne pas répéter l'état de l'existant si déjà analysé dans la session
- Préférer les diffs/blocs de code courts aux rewrites complets
- Aller droit au but : pas de preamble, pas de reformulation de la demande
- Lire uniquement les fichiers nécessaires, pas l'arborescence entière
- Une seule lecture par fichier sauf si modification depuis

## Priorité absolue : flux HLS Rumble
DLive ferme → migration vers Rumble en cours. La priorité n°1 est de récupérer le flux HLS Rumble de façon fiable et stable pour n'importe quel compte, sans dépendre du scraping HTML (bloqué par Cloudflare).

Pistes par ordre de priorité :
1. API Rumble `/get-data?key=...` → retourne-t-elle le videoId ou l'URL HLS directement ?
2. `stream_key` en DB → construire l'URL HLS depuis le stream key (pattern CDN Rumble stable)
3. `embedJS/u3/?v={videoId}` → fonctionne si on a le videoId sans scraping
4. Worker avec browser automation (Puppeteer) → dernier recours

Le HLS proxy (`hls_proxy.ts`) doit être étendu pour autoriser les CDN Rumble.
Les infos stables (stream_key) ne changent jamais → à préférer aux infos dynamiques (videoId).

## Intégration Rumble — état actuel
- `rumble_accounts` table : `username`, `api_key`, `stream_key`, `rtmp_url`, `assigned_to_streamer_id`
- `streamer_rumble_info` table : cache live info (hls_url, video_url, etc.)
- `rumble_poller.ts` : poll toutes les 30s, appelle `fetchLeCasiNozeRumbleInfo()`
- `rumble.ts` : scrape page statique → extrait videoId → appelle embedJS → HLS
- Problème : scraping bloqué par Cloudflare côté serveur
- `hls_proxy.ts` : CORS proxy, actuellement limité aux hosts DLive uniquement
- Seul LeCasiNoze a un compte Rumble lié pour l'instant
## Rumble VODs - infos confirmees a ne pas redecouvrir
- Les pages publiques utiles pour les VODs sont cote `https://rumble.com/user/{username}`.
- Sur les comptes testes, `https://rumble.com/c/{username}` et `https://rumble.com/c/{username}/videos` renvoient `404`.
- `https://rumble.com/user/{username}/videos` n'est PAS une source fiable de "liste complete". Sur les comptes testes, cette page contenait souvent moins d'items SSR que la page profil `/user/{username}`.
- Aucun `?page=2` n'a ete trouve sur les pages publiques testees, et `?page=2` renvoyait `404`. Ne pas supposer une pagination serveur simple.
- Pattern HTML public d'un item VOD:
  - conteneur: `div.videostream.thumbnail__grid--item[role="listitem"][data-video-id]`
  - lien principal: `a.videostream__link`
  - titre: `h3.thumbnail__title`
  - thumb: `img.thumbnail__image`
- Le `data-video-id` numerique de la carte publique est utile.
- `https://rumble.com/service.php?name=media.share&video_id={numericId}` permet de retrouver l'URL canonique publique `https://rumble.com/vXXXXXX-....html`.
- Exemples confirmes:
  - `433420236` -> `https://rumble.com/v788d78-omg-premier-5-scatter-bonushunt-slot-casino-scatterslots-bigwin-jeuresponsa.html`
  - `434098152` -> `https://rumble.com/v78mwa8-on-accumule-les-bonus-et-a-explose-.html`
  - `434267048` -> `https://rumble.com/v78qils-on-pensait-tout-perdre-bonus-hunt-live.html`

## Rumble VODs - limites confirmees
- `/-livestream-api/get-data?key=...` a ete teste avec de vraies `api_key` du projet. La reponse observait `livestreams`, mais aucun `videos[]` ni `recent_streams[]`.
- Les slugs VOD publics testes avec `embedJS/u3/?ifr=0&dref=&request=video&ver=2&v={slug}&ad_wt=0` renvoyaient `false` dans l'environnement de test.
- Donc l'idee "poller embedJS pour obtenir le MP4/HLS final de la VOD" reste la bonne, mais elle n'est pas prouvee de bout en bout sur les slugs VOD publics testes ici.

## Rumble VODs - direction technique recommandee
- Ne PAS essayer de reutiliser telle quelle la pipeline live pour les VODs.
- La bonne approche est une pipeline VOD separee:
  1. garder le `videoId` du live une fois detecte
  2. lancer un job de polling post-live
  3. appeler `resolveRumbleVodFromVid(videoIdWithV)`
  4. attendre l'apparition d'un `u.mp4.url` ou d'un `hls-vod`
  5. stocker `vod_mp4_url` / `vod_hls_url`
- `api/src/rumble.ts` contient deja cette intention via `resolveFromEmbedJs(...)` et `resolveRumbleVodFromVid(...)`.
- Le code note que la VOD devient en general prete `2-5 min` apres la fin du live.

## Rumble player - implication frontend
- `web/src/components/RumbleStreamPlayer.tsx` est un player live-only.
- Il sort si `!isLive || !hlsUrl` et force ensuite du seek live-edge, du resync live, etc.
- Pour une VOD Rumble, prevoir:
  - soit un player VOD separe
  - soit un mode `live | vod` explicite

## Rumble auth / creator
- Sans session, `https://rumble.com/account/content` et `https://rumble.com/account/videos` redirigent vers login/auth.
- Avec la session bot stockee en DB, `rumble.com/account/*` est accessible.
- `https://studio.rumble.com/` a redirige vers `auth.rumble.com` avec la session testee.
- Le compte de la session testee etait `LunaLive_Bot`, mais `account/content` affichait `No videos found matching that criteria.`
- Conclusion: aucune API creator de listing video n'a pu etre capturee sur un compte ayant reellement des VODs, faute de session sur un compte non vide.
- La session utilise des cookies de type `u_s`, `u_c`, `a_s`, `RNSC`, `cf_clearance`, `__cf_bm`. Documenter seulement les noms, jamais les valeurs.

## Rumble priorites pratiques
- Pour un MVP catalogue VOD:
  - scraper les cartes publiques sur `/user/{username}`
  - utiliser `media.share&video_id=...` pour obtenir l'URL canonique
  - ouvrir la page Rumble si on n'a pas encore de flux media direct fiable
- Pour une vraie lecture in-app des VODs:
  - brancher une pipeline VOD post-live
  - ne pas supposer qu'un slug public VOD repondra toujours a `embedJS request=video`
  - tester d'abord avec un compte du projet qui termine un vrai live Rumble puis repoll `resolveRumbleVodFromVid(...)`
