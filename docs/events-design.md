# LunaLive — Design des événements (v1, 8 juillet 2026)

Décisions prises avec Lucas en Q&A. Base de l'implémentation. Les CONCEPTS sont
figés ; les CHIFFRES exacts (barèmes, paliers, tables de lots, seuils) seront
proposés par event au moment du build et validés un par un.

## Principes transverses

- **Cadence** : 6 events, 1 semaine chacun, rotation ~6 semaines (1,5 mois). Le
  1er event lancé porte le **cadenas** : ne démarre qu'une fois X comptes ont
  réalisé une action (finir quêtes du jour / clic bouton) — spec à préciser au
  lancement, sur l'event choisi comme premier (candidat : Coffre communautaire).
- **Moteur générique config-driven** : chaque event déclare un MODE de scoring
  (viewer / streamer-team / collectif) + un MODE de récompense (top-N paliers /
  participation / collectif) + une nature (viewer seul OU streamer+commu). Le
  barème vit dans `event_type_configs` (à brancher — aujourd'hui mort).
- **Anti-farm** : un compte ne marque des points que sur **UN live à la fois**
  (pas de multi-live simultané).
- **Économie des lots** :
  - **Rubis d'event = POIDS 0 (non-cashables)** → coûtent 0 € réel. Se dépensent
    dans la plateforme (cosmétiques, subs, roue) mais ne se convertissent pas en €.
  - **Lot de participation** (tout actif ≥ seuil, hors top) = petit paquet rubis
    (poids 0) + 1 ticket roue.
  - **Abo viewer offert** : au cas par cas (souvent 7 j top-3).
  - **Cosmétiques/badges/titres exclusifs** "vainqueur <event> <mois>" : sur les
    events qui s'y prêtent, non rejouables (rareté = meilleur lot, coût nul).
- **Gate d'accès assoupli** (parcours onboarding, ordre en entonnoir) :
  1. Suivre un streamer (vérifiable DB)
  2. Rejoindre le Discord LunaLive (vérifiable SI compte Discord lié, flow /link)
  3. Suivre l'Insta @lunalive_tv (**bouton déclaratif "j'ai suivi", non vérifiable
     par API — on fait confiance**)
  4. Réclamer 1 bonus quotidien (vérifiable DB)
  5. Regarder 30 min de live (vérifiable DB)
- **Clôture générique** (n'existe pas aujourd'hui) : figer le classement dans
  `events.result` → distribuer via un **helper unique** (rubis poids 0 / abo /
  cosmétique / ticket sub).
- **PARENTHÈSE économie** : re-analyse complète de l'économie rubis à faire —
  chantier séparé, à planifier (Lucas l'a explicitement demandé).

## Les 6 events

### 1. Semaine du viewer
- **Score** : activité viewer. Barème **rééquilibré** : cap quotidien sur les
  points de watch (anti-AFK) + poids accru aux actions (chat / calls / prédictions).
  Barème chiffré à proposer + valider.
- **Team streamer** : les points d'un viewer comptent aussi pour le streamer qu'il
  a **le plus regardé de la semaine** → classement de streamers en plus du viewer.
- **Récompense** : top-N + participation.

### 2. Semaine de la roue
- **Roue modifiée pour l'event** : drop de lots à **équivalence en POINTS** (pas
  des rubis) → évite d'inonder le site de rubis.
- **Score** = total de points gagnés à la roue pendant la semaine.
- **Spins bonus** via **quêtes quotidiennes modifiées** (elles donnent des tickets
  roue pendant l'event) → raison de revenir chaque jour.
- **Récompense** : top-N + participation.

### 3. Course aux clips (streamer-centric — nourrit l'Insta)
- **Double classement** : (a) streamer qui cumule le plus, (b) meilleur clip
  individuel.
- **Métrique** = likes sur le SITE, avec **VOTES LIMITÉS** : des "coups de cœur"
  d'event distincts du like normal, rares (ex. 1/jour ou 3/semaine par compte) →
  tue les likes de solidarité, force à choisir les vrais bons clips.
- **Éligibilité** : tous les clips créés via !clip pendant l'event.
- **Récompense** : streamer gagnant (subs à distribuer + section "à la une" en haut
  + dépôt dans le coffre de sa commu) + top-3 clips (rubis croissants + abo top-1)
  + viewer créateur du clip gagnant + participation commu.

### 4. Coffre communautaire (collectif)
- **Barre commune alimentée par un MIX** : actions (free : claims + spins + calls
  + chat) **+** dépôts de rubis (sink + monétisation : incite au burn / achat de
  rubis / abo). L'accès free est préservé (on peut contribuer sans dépenser).
- **Palier(s) atteint(s) → TOUT LE MONDE gagne** (paliers = récompenses croissantes).

### 5. Boss à abattre (collectif + sink) — À CONCEVOIR EN DERNIER
- **Point ouvert clé (Lucas)** : le burn de rubis SEUL ne fera pas participer tout le
  monde. Il faut **plusieurs mécaniques de dégâts** pour que même les joueurs sans
  rubis tapent le boss : ex. temps de watch = dégâts, actions (chat/calls/quêtes) =
  dégâts, mini-jeux, coups critiques… Le burn de rubis reste UNE source (sink pur)
  mais pas la seule. À spécifier en détail quand on arrivera à cet event.
- Cadre déjà acté : **gain fonction de la participation** (part des dégâts) ; boss tué
  → lots (cosmétique "Boss Slayer" + abo/rubis top contributeurs) + participation pour
  tout contributeur.
- Pistes : boss à phases débloquant des perks commu temporaires ; barre de dégâts
  perso ; dernier coup = badge "Coup de grâce" ; cap burn/compte/jour anti-whale-solo.

### 6. Semaine en duo (duos de STREAMERS)
- **Appariement par AUDIENCE COMMUNE** : pour chaque streamer, on regarde ses viewers
  et qui d'autre ils regardent → on associe les streamers ayant le plus de viewers
  en commun (commus qui se recoupent déjà → maximise le mélange).
- **Mécanique** : proposition d'appariement → quelques jours pour accepter → **1 seul
  refresh** autorisé si refus (→ 2ᵉ streamer le plus commun) → figé.
- **Score** : actions combinées des deux commus. **Récompense** : duo gagnant +
  leurs deux commus.

## Plan d'implémentation

- **Phase 1 — Socle générique** : moteur scoring (viewer/streamer-team/collectif),
  clôture→classement figé→distribution (helper unique multi-lots), modes de reward,
  gate assoupli, anti-farm (1 live à la fois), fix bug mapping camelCase, rubis
  poids 0. Indépendant du détail de chaque event.
- **Phase 2 — UI admin events** : créer/forcer/clore, éditer barèmes & lots, valider
  le classement, rejouer une distribution.
- **Phase 3 — Front public attractif** : classement + cagnotte + "ce que tu gagnes"
  visibles sans compte ; countdown ; classement streamers.
- **Phase 4 — Les 6 events un par un** (ordre : Roue → Viewer → Course aux clips →
  Coffre → Boss → Duo), avec proposition chiffrée validée à chaque event.
