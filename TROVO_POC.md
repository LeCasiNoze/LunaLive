# TROVO POC - PHASE B & PHASE A FALLBACK

## A. ÉTAT ACTUEL

### Ce qui a été validé
- **Backend Trovo** : Requête `space_SpaceReadService_GetRoomInfo` fonctionnelle
- **Parsing jsData** : Extraction correcte des métadonnées
- **Qualités** : Remontée correcte de `programInfo.streamInfo`
- **URLs** : `bestPlayUrl` (FLV) et `bestTimeShiftUrl` (HLS) disponibles
- **Live status** : `isLive` correctement détecté
- **Route debug** : `/debug/trovo` accessible et fonctionnelle

### Ce qui marche
- **API Backend** : `GET /api/debug/trovo/{spaceName}` retourne les données
- **Frontend Debug** : Page affiche métadonnées, qualités, URLs
- **Player vidéo** : Composant `TrovoPlayer` avec lecture réelle
- **Support FLV** : `flv.js` intégré et fonctionnel
- **Support HLS** : `hls.js` + fallback natif Safari/iOS
- **Interface** : Contrôles Play/Pause/Stop/Reload + sélection source

### Ce qui ne marche pas encore
- **Test en production** : Nécessite validation sur `https://lunalive.onrender.com/debug/trovo`
- **Stabilité FLV** : À évaluer avec des streams réels
- **Latence réelle** : À mesurer en conditions d'utilisation

---

## B. PHASE B - LECTURE FLV PRINCIPALE

### Comment fonctionne le POC lecture FLV
1. **Priorité absolue** : Auto-sélection du flux FLV principal (`bestPlayUrl`)
2. **Player flv.js** : Création d'une instance `flv.js` optimisée pour live
3. **Configuration live** : `isLive: true`, `cors: true`, buffering adapté
4. **Auto-play** : Tentative de lecture automatique après chargement
5. **Gestion erreurs** : Affichage détaillé des erreurs FLV dans l'UI

### Fichiers modifiés/créés
- **`web/src/components/TrovoPlayer.tsx`** : Player vidéo avec priorité FLV
- **`web/package.json`** : Ajout de `flv.js` comme dépendance
- **`api/src/trovo.ts`** : Backend GraphQL + parsing jsData
- **`api/src/routes/trovo_debug.ts`** : Route debug `/api/debug/trovo/:spaceName`
- **`web/src/pages/debug/TrovoDebugPage.tsx`** : Page debug avec player intégré

### Comment tester localement
```bash
# Backend
cd "c:\Users\Lucas\LunaLive\api"
npm run dev

# Frontend  
cd "c:\Users\Lucas\LunaLive\web"
npm run dev

# Test
# Ouvrir http://localhost:5173/debug/trovo
# Saisir un spaceName Trovo live (ex: "AgentGoda")
# Observer la priorité FLV automatique
```

### Comment interpréter les résultats
- **"Main FLV (PRIMAIRE)"** vert : Flux FLV principal sélectionné et actif
- **"Lecture en cours"** : FLV joue correctement
- **"Erreur FLV"** : Problème avec le flux FLV principal
- **Bouton "Timeshift HLS (FALLBACK)" orange** : Alternative disponible

### Risques identifiés
1. **Compatibilité navigateur** : `flv.js` fonctionne sur Chrome/Firefox/Edge mais pas sur Safari
2. **Stabilité stream** : Les flux FLV peuvent être moins stables que HLS
3. **Latence** : FLV peut avoir une latence différente de HLS
4. **Performance** : `flv.js` peut être plus gourmand en CPU

---

## C. PHASE A FALLBACK - HLS TIMESHIFT

### Pourquoi ce fallback existe
Le fallback HLS timeshift est nécessaire si :
- Le navigateur ne supporte pas `flv.js` (Safari principalement)
- Le flux FLV principal est indisponible ou instable
- Des erreurs de lecture FLV surviennent
- L'utilisateur préfère la compatibilité maximale

### Comment il fonctionne
1. **Détection automatique** : Si FLV échoue, suggestion du fallback
2. **Bouton manuel** : "Timeshift HLS (FALLBACK)" pour basculer
3. **Support natif** : Safari/iOS utilisent le HLS natif
4. **HLS.js fallback** : Chrome/Firefox utilisent `hls.js`
5. **Configuration live** : Buffering adapté pour streams live

### Comment l'activer/tester
1. **Échec FLV** : Laisser le FLV échouer, cliquer sur "Timeshift HLS (FALLBACK)"
2. **Manuel** : Cliquer directement sur "Timeshift HLS (FALLBACK)"
3. **Vérification** : Observer le badge "(FALLBACK)" orange

### Concessions du fallback
- **Latence accrue** : Le timeshift peut avoir 30-60s de décalage
- **Qualité variable** : Le timeshift peut utiliser une qualité inférieure
- **Disponibilité** : Le timeshift n'est pas toujours disponible
- **Compatibilité** : Support navigateur quasi-universel

### Quand utiliser le fallback
- **Safari/iOS** : Nécessaire car `flv.js` non supporté
- **FLV instable** : Si le flux FLV bug ou se fige
- **Test compatibilité** : Pour vérifier que HLS fonctionne
- **Urgence** : Si FLV complètement indisponible

---

## D. ÉTAPES SUIVANTES

### Si la phase B (FLV) fonctionne
1. **Tests étendus** : Valider avec plusieurs streamers Trovo
2. **Mesures performance** : CPU, mémoire, latence
3. **Optimisations** : Buffering, retry logic, error recovery
4. **Documentation utilisateur** : Guide d'utilisation du player
5. **Monitoring** : Ajout de métriques de performance

### Si la phase B échoue et qu'on doit partir sur la phase A
1. **Priorité HLS** : Rendre HLS timeshift la sélection par défaut
2. **Optimisation HLS** : Réduire latence, améliorer qualité
3. **Compatibilité** : S'assurer du support sur tous navigateurs
4. **Fallback FLV** : Garder FLV comme option avancée
5. **Communication** : Expliquer les limitations du choix HLS

### Dans tous les cas
1. **Test production** : Valider sur `https://lunalive.onrender.com/debug/trovo`
2. **Feedback utilisateur** : Recueillir les retours d'utilisation
3. **Documentation finale** : Mettre à jour avec les résultats réels
4. **Décision produit** : Choisir la stratégie finale basée sur les tests

---

## COMMANDES DE TEST

### Développement local
```bash
# Backend (port 3001)
cd "c:\Users\Lucas\LunaLive\api"
npm run dev

# Frontend (port 5173)
cd "c:\Users\Lucas\LunaLive\web"
npm run dev

# Test
# http://localhost:5173/debug/trovo
```

### Production
```bash
# Test en production
# https://lunalive.onrender.com/debug/trovo
```

### SpaceNames de test
- `AgentGoda` : Streamer actif régulier
- `d1ckpik0vaya_dama` : Test précédent
- Chercher des streamers live sur https://trovo.live/

---

## VÉRIFICATION DE FIN

### Critères de succès Phase B
- [ ] FLV principal se charge automatiquement
- [ ] Lecture FLV stable et fluide
- [ ] Latence acceptable (< 10s)
- [ ] Compatible Chrome/Firefox/Edge
- [ ] Fallback HLS disponible si besoin

### Critères de succès Phase A
- [ ] HLS timeshift fonctionne en fallback
- [ ] Support Safari/iOS natif
- [ ] Latence timeshift acceptable
- [ ] Qualité vidéo correcte

### Verdict final
- `FLV playable in LunaLive debug` : Si FLV principal fonctionne
- `Only HLS fallback playable` : Si seul le fallback HLS fonctionne
- `Neither fully playable yet` : Si les deux ont des problèmes

---

*Document créé le 7 avril 2026 - POC Trovo Phase B*
