# CLAUDE.md — LunaLive

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