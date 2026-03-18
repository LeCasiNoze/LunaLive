# LunaLive – règles de travail Claude Code

Objectif principal:
- améliorer fortement l’indexabilité Google du site public LunaLive
- ne pas casser l’application existante
- privilégier les correctifs à fort impact / faible risque
- éviter toute refonte totale dans cette session

Contraintes obligatoires:
- ne touche pas aux features métier sans nécessité SEO/perf/trust claire
- ne supprime aucune logique produit existante
- ne modifie pas les flows auth, wallet, chat, stream, dashboard admin sauf nécessité absolue
- ne fais pas de migration framework complète
- privilégie des changements incrémentaux, réversibles, testables
- avant chaque bloc de modifications, fais un mini audit ciblé du code concerné
- après chaque bloc, lance les vérifications adaptées
- en cas de doute, choisis la solution la moins risquée

Priorités:
1. indexabilité Google
2. conformité minimale légale / trust
3. performance critique
4. structured data propre
5. qualité meta / H1 / 404 / sitemap

Définition de terminé:
- build front OK
- aucune erreur TypeScript nouvelle
- aucune régression manifeste sur les routes publiques existantes
- pages trust/légales présentes et liées
- vraie 404
- faux schema/rating supprimé
- H1 publics corrigés
- script SEO non bloquant
- plan SEO suivant laissé en note finale