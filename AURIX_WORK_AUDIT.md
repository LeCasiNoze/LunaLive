# AURIX_WORK_AUDIT.md

> Audit factuel du travail réalisé par Lucas (identité Git : `LeCasiNoze <kasinoze@gmail.com>`)
> pour l'agence d'affiliation **Aurix**, à des fins de CV / portfolio / entretien.
>
> **Principes de cet audit :**
> - Rien n'est inventé ni flatté. Chaque affirmation est tracée vers un fichier, une table ou un commit.
> - La seule présence d'une technologie ≠ maîtrise personnelle. Lucas travaille fortement avec des agents IA (voir `CLAUDE.md`, imports « Lovable », style des commits). On décrit donc **ce qui a été livré et piloté**, pas un niveau d'expertise.
> - Aucune donnée personnelle (affilié, joueur, influenceur), aucun secret, aucune valeur de token/ID/URL privée n'est reproduite.
> - Quand l'attribution ou l'usage n'est pas prouvable par le code, c'est marqué **« À confirmer par Lucas »**.

---

## ⚠️ Note d'attribution majeure (à lire avant tout)

Le dépôt audité (`LunaLive`) contient **un seul auteur Git sur la totalité des ~1468 commits** : `LeCasiNoze <kasinoze@gmail.com>` (= Lucas). Il n'existe **aucune trace d'un second développeur** dans l'historique de ce workspace.

Conséquences pour l'audit :

1. **LunaLive n'est pas « du travail Aurix ».** LunaLive est une plateforme de streaming casino (dashboards streamers, player HLS, clips, chat Rumble/DLive…) démarrée en **décembre 2025**, antérieure au travail d'agence. Les **outils Aurix ont été greffés dessus** entre **avril et juin 2026**. Cet audit ne retient QUE la couche affiliation / agence.
2. **Le « projet historique d'Aurix développé par une autre personne » n'est pas présent dans ce dépôt.** Deux lectures possibles, **à confirmer par Lucas** :
   - soit ce dashboard historique vit dans un **autre dépôt** non fourni ici ;
   - soit la notion de « reprise » désigne le fait que Lucas s'est branché sur des **systèmes tiers qu'il n'a pas construits** (voir §3.3) et a bâti son outillage par-dessus.
3. **Ce sur quoi Lucas s'est réellement appuyé sans l'avoir construit** (donc « repris / intégré », pas « créé ») :
   - **Celsius (`celsius.games`)** : plateforme casino/affiliation externe. C'est le programme d'affiliation cible. Lucas n'en a écrit aucune ligne ; il a construit tout l'outillage de validation/reporting autour.
   - **taap.it** : raccourcisseur de liens d'affiliation utilisé par les influenceurs.
   - **Lovable** : générateur de sites IA — le modèle « Cyclope » (M15) a été **importé** de Lovable (`landaurax/src/lovable-imports/`, commits `5735cced`, `469a5351`).
   - **Google Sheets, Brevo (email), Cloudflare R2 / Browser Rendering, Render, Telegram Bot API, Discord** : services externes intégrés.

---

# ÉTAPE 1 — Cartographie des dépôts / dossiers

Un seul dépôt Git (`github.com/LeCasiNoze/LunaLive`), plusieurs sous-projets. Tableau des dossiers pertinents pour Aurix :

| Dossier | Rôle | Appartenance | Ce qui relève d'Aurix | Preuves |
|---|---|---|---|---|
| `web/` | SPA React/Vite principale (plateforme LunaLive) | **LunaLive** (base) + **Aurix** (couche greffée) | Éditeur de landings affiliées (`pages/AffiEditorPage`, `EditorV2Page`, `EditorV3Page`), **FSB Board** = dashboard agence (`FsbBoardPage`, `fsb/FsbAgencySection`, `fsb/FsbTikTokOutreachSection`), stats affil | `web/src/pages/*`, `web/src/lib/api_agency.ts`, `api_affi_pages.ts`, `api_tiktok_outreach.ts`, `api_expenses.ts` |
| `api/` | Backend Express + Postgres | **LunaLive** (base) + **Aurix** (routes greffées) | Bot Aurix (`api/src/aurix/*`), routes `agency.ts`, `tiktok_outreach.ts`, `affi_pages.ts`, `expenses.ts`, `fsb_dashboard.ts`, `fsb_todos.ts`, algo `lib/agency_bonus.ts`, `landings_verif.ts` | `api/src/app.ts:201-222`, `api/src/index.ts:200-214` |
| `landaurax/` | Site **de publication seule** des landings affiliées, déployé séparément | **Aurix** | App Vite/React render-only, sert `landaurax.com/<slug>`, prefetch API, fallback R2 | `landaurax/package.json`, `landaurax/src/App.tsx`, `render.yaml` (service `landaurax`) |
| `extension/tiktok-discoverer/` | Extension Chrome de prospection TikTok (v1.7.13) | **Aurix** | Récolte d'influenceurs via navigateur connecté, bypass anti-bot par `chrome.debugger` | `manifest.json`, `background.js`, `content_tiktok.js`, `content_lunalive.js` |
| `cloudflare/tiktok-discovery/` | Cloudflare Worker (Puppeteer) — scraper serveur de secours | **Aurix** | Fallback de scraping TikTok quand le `fetch` serveur est bloqué | `src/index.ts` (`@cloudflare/puppeteer`), `wrangler.toml` |
| `cloudflare/hls-worker/` | Proxy HLS streaming | **LunaLive** (hors Aurix) | — | mémoire projet `reference_hls_worker` |
| `bot/` | Bot LunaLive (clips, notifications, transport) | **LunaLive** (hors Aurix) | — | `bot/dist/modules/*` |
| `Affi_template/`, `slots-*.ts`, `emoji/`, `email-templates/` | Divers assets/templates | Mixte | Templates de landings, emails | — |

**Attribution** : tous les commits sont de Lucas (identité Git unique confirmée), donc l'auteur Git ne permet **pas** de distinguer « créé » de « repris ». La distinction repose sur : (a) les systèmes externes cités en §note d'attribution, (b) l'antériorité de la base LunaLive, (c) le contenu des messages de commit.

**Chronologie Aurix (commits, dates réelles) :**
- **2026-04-11/12** : premières tables agence (`mig066_expenses`, `mig067_agency`).
- **2026-04-17 → 05-01** : naissance et itérations de l'**éditeur de landings** (`affi-editor`, modèles M2→M10).
- **2026-04-22 → 05-10** : **prospection TikTok** (outreach email puis refonte « peer-discovery » réseau + extension v1.7.x + scoring).
- **2026-05-10** : **refonte agence v2** snapshot-based + algo bonus + recrutement depuis TikTok.
- **2026-05-14 → 05-21** : modèles de landing **V3** (mini-jeux M3–M13), capture VIP, popups.
- **2026-05-15 → 06-08** : **bot Discord/Telegram Aurix** (Celsius, refills, watcher, tickets, setup) + **Landing Verif** + site **landaurax**.

---

# ÉTAPE 2/3 — Réalisations Aurix

---

## 1. Éditeur de landing pages affiliées (EditorFSN V1 → V2 → V3)

**Problème métier**
L'agence doit produire, pour chaque influenceur, une page d'atterrissage (« landing ») premium, personnalisée à son pseudo/audience, qui pousse un lien d'affiliation casino et maximise le dépôt. Le faire à la main pour chaque créateur ne passe pas à l'échelle.

**Situation avant l'intervention**
Non documentée dans le code — **À confirmer par Lucas** (probablement des pages faites à la main ou inexistantes ; la première génération d'éditeur date du 17/04/2026).

**Solution livrée**
Un éditeur web à 3 générations coexistantes (`web/src/pages/AffiEditorPage.tsx` V1 legacy, `EditorV2Page.tsx` éditeur en arbre de blocs, `EditorV3Page.tsx` assistant « quick builder »). L'éditeur V3 propose ~16 modèles (`modelKind` M1–M16), majoritairement des **mini-jeux casino** (roue, scratch, slot, coffre, plinko, penalty, « chicken cross », etc.) se terminant sur une révélation de bonus + CTA d'affiliation. Composants : `web/src/components/M3Wheel…M16TikTok`, `V3OfferPopup`, `V3SocialProof`, `V3MagneticButton`, etc.
- **Personnalisation par influenceur** : pseudo, photo de profil, montants dépôt/bonus, polices/couleurs/tailles par ligne, thème couleur, logo casino ; auto-remplissage des followers via un scraper TikTok/Instagram (`POST /fsb/social-profile`, `affi_pages.ts`).
- **Publication** : persistance Postgres (`affi_landing_pages`, mig074/108/121), slug compact `<brand>-M<N>`, page publique servie en `/r/:slug` (`ReferralLandingPage.tsx`) ; à chaque save, snapshot JSON poussé sur **Cloudflare R2** avec cache CDN, et cible de publication commutable `lunalive | landaurax` (`publishDomain`).
- **Système de thèmes** : 8+ thèmes (`m1_themes.ts` : or, rubis, émeraude, saphir, améthyste, obsidienne, rose, jade, cyclope).

**Rôle de Lucas**
- Compréhension du besoin : forte (leviers conversion détaillés dans `CLAUDE.md`).
- Conception : oui — architecture éditeur → modèle → publication → page publique.
- Orchestration d'agents IA : très probable (volume, style des commits, import Lovable pour M15).
- Reprise de code existant : import du modèle Cyclope depuis Lovable.
- Tests / débogage / intégration / déploiement / maintenance : nombreux commits `fix(affi-editor)` (layout mobile iPhone SE, FAQ, boutons, TS errors) → pilotage réel du cycle de vie.

**Utilisation actuelle**
**Production.** Pipeline complet et défensif (DB + R2 + cache + événements). Les fichiers `web/dist/*` compilés et déployés le confirment.

**Impact métier**
- Production de landings personnalisées **en série** au lieu de sur-mesure manuel.
- Publication en un clic vers CDN (bande passante Render ≈ 0).
- Base de A/B testing (multi-variants, comparaison de modèles — voir §3).

**Technologies présentes** (inventaire, sans jugement de maîtrise)
React 19, Vite, TypeScript, framer-motion, Lenis, Cloudflare R2, Postgres, Express.

**Éléments intéressants pour un recruteur**
- A conçu un **studio de landing pages piloté par modèles** de bout en bout (édition → CDN → page publique).
- Personnalisation automatisée par créateur (scraping followers TikTok/IG).
- Système de thèmes réutilisable (8+ palettes) theme-aware.
- Séparation publication/édition (2 domaines de publication).

**Points à confirmer avec Lucas**
- Combien de landings réellement en ligne / volume de trafic ?
- Part de l'IA vs. code écrit main dans les composants de modèles ?
- La situation « avant » (comment l'agence produisait ses landings auparavant).

---

## 2. Dashboard agence « FSB Board » (deals, commissions, marges, dépenses)

**Problème métier**
Piloter l'agence : suivre les streamers sous contrat, les **deals** (CPA + revenue share), calculer la **marge de l'agence** et le **bonus** reversé au streamer, suivre les **frais** (giveaways, offres, abonnements…).

**Situation avant l'intervention**
**À confirmer par Lucas** — probablement des tableurs. (Indices : la « Landing Verif » et d'autres flux consomment des Google Sheets ; le dashboard `agency_v2` de mai remplace une v1 d'avril.)

**Solution livrée**
- Backend `api/src/routes/agency.ts` monté sous `/api/fsb/agency` (auth + `requireFsbAccess`), tables `agency_casinos`, `agency_deals`, `agency_streamers`, `agency_streamer_assignments`, `agency_streamer_assignment_stats`, `agency_stat_snapshots` (mig067/068/118).
- **Algorithme de calcul** dédié `api/src/lib/agency_bonus.ts` : `computeBonusSplit`, `applyBonusToDelta`, `aggregateSnapshotsForPeriod` — modélise CPA/FTD (First Time Deposit), revenue share, part agence (`ersAgencyPercent`), split bonus proportionnel entre agence et streamer sur une période snapshot-based.
- Front `web/src/pages/fsb/FsbAgencySection.tsx`, `AgencySection.tsx`, `AgencyPortalPage.tsx` : création de deal + assignation directement depuis le modal de recrutement.
- **Frais / dépenses** : route `expenses.ts` (`/api/expenses`), table `expenses` (mig066), catégories (giveaway/offres/parrainage/abonnement/personnalisé), + **board Discord `#frais-agence`** auto-actualisé (`agency_fees_board.ts`, lancé au boot `index.js:201`).
- **To-dos** agence (`fsb_todos.ts`, `FsbTodoWidget`), **dashboard Instagram** (`fsb_dashboard.ts`).

**Rôle de Lucas**
Conception du modèle métier (deals/bonus/marge), écriture de l'algo de répartition, intégration front+back+Discord. Reprise probable d'une v1 antérieure (refonte « v2 snapshot-based », commit `f507b3b9`).

**Utilisation actuelle**
**Production** (board frais démarré au boot ; routes gardées par droits d'accès ; algo réel). Le partage marge/streamer est exposé côté streamer (`906d4137`).

**Impact métier**
- Centralise deals, marges et frais dans un seul outil au lieu de tableurs.
- Automatise le calcul de la part streamer vs. agence.
- Rappels de frais automatisés côté Discord.

**Technologies présentes**
Express, Postgres, Zod (validation), React, discord.js.

**Éléments intéressants pour un recruteur**
- A modélisé un **calcul d'affiliation réel** (CPA + revenue share + FTD + split de marge).
- Reporting snapshot-based par période.
- A relié acquisition (recrutement TikTok) → contractualisation (deal) → reporting.

**Points à confirmer avec Lucas**
- Qui utilise le FSB Board au quotidien (lui seul ? l'équipe ?) ?
- Existait-il un dashboard agence antérieur (repris) et par qui ?
- Les chiffres de marge/volume ne doivent pas être communiqués (sensibles).

---

## 3. Statistiques & analytics des landings (suivi conversion, comparaison de modèles)

**Problème métier**
Savoir quelles landings / quels modèles convertissent, comparer les performances, mesurer clics CTA vs. vues, tracer la source (UTM).

**Situation avant l'intervention**
Pas de tracking avant l'ajout (les commits `feat(analytics)` datent de fin avril 2026).

**Solution livrée**
- Tracking public : `ReferralLandingPage.tsx` → `POST /public/affi-events` (`view` / `click_cta`) avec UTM (source/medium/campaign) + referrer ; dédup via **hash IP salé SHA-256** (pas de PII brute) — table `affi_landing_events` (mig117).
- Dashboard stats dans `EditorV3Page.tsx` : endpoints `/fsb/affi-pages/:id/stats`, `/daily-stats`, `/hourly-stats`, `/stats-summary` ; **courbes multi-séries** (une couleur par page/modèle), drill-down horaire, groupement par `brandName`, classement triable, filtre V1/V2/V3.

**Rôle de Lucas**
Conception du schéma d'événements, endpoints d'agrégation, visualisation (SVG multi-courbes maison), corrections de justesse (`fix(analytics): isCta strict` — évitait des CTR > 100 %).

**Utilisation actuelle**
**Production** (pipeline complet, corrections de bugs métier observées → signe d'usage réel).

**Impact métier**
- Visibilité temps quasi-réel sur vues/clics par landing.
- **Comparaison de modèles** → aide à choisir le format le plus rentable.
- Attribution UTM de la source de trafic.

**Technologies présentes**
Postgres, Express, React, SVG (charts maison), crypto (hash IP).

**Éléments intéressants pour un recruteur**
- A construit un **mini-analytics produit** respectueux de la vie privée (IP hashée/salée).
- Outil réel de **comparaison de performance** entre variantes.
- A débogué des faux positifs de conversion (rigueur métier).

**Points à confirmer avec Lucas**
- Volume d'événements réellement traité.
- Décisions prises grâce à ces stats (optimisations concrètes).

---

## 4. Capture de leads VIP « gros joueurs »

**Problème métier**
Identifier et recontacter les **gros joueurs (500 €+/mois)** pour leur attribuer un host VIP → maximiser la valeur.

**Situation avant l'intervention**
Non applicable (fonctionnalité nouvelle).

**Solution livrée**
`V3InlineVipForm.tsx` + `V3VipPopup`/`V3OfferPopup` → `POST /public/affi-vip-leads` (table `affi_vip_leads`, mig120) → `notifyVipLeadAsync` (email de bienvenue automatique + webhook Discord `#gestion`). Objectif « Club VIP — Gros joueurs » explicite dans le code.

**Rôle de Lucas**
Conception du funnel de capture + notification automatique, intégration éditeur + page publique + backend.

**Utilisation actuelle**
**Production** (endpoint + notifications câblés ; imposé comme obligatoire dans `CLAUDE.md`).

**Impact métier**
- Capture d'emails de joueurs à forte valeur directement dans la landing.
- Recontact automatisé (mail + alerte Discord équipe).

**Technologies présentes**
React, Express, Postgres, Brevo (email), webhooks Discord.

**Éléments intéressants pour un recruteur**
- A relié un formulaire public à une **automatisation de lead-gen** (mail + notif équipe).

**Points à confirmer avec Lucas**
- Nombre de leads VIP captés / convertis.

---

## 5. Site de publication des landings — `landaurax`

**Problème métier**
Servir les landings publiques sur un **domaine dédié**, rapide, indépendant de l'app principale, sans exposer l'éditeur.

**Situation avant l'intervention**
Auparavant les landings étaient servies uniquement par l'app principale en `/r/:slug`.

**Solution livrée**
App Vite/React **render-only** (`landaurax/`), déployée comme service **statique Render distinct** (`render.yaml`, service `landaurax`). Sert `landaurax.com/<slug>`. Perf : **prefetch de l'API + template dans `<head>` avant boot React**, preconnect, fallback 3 niveaux (prefetch → API 2.5 s timeout → snapshot R2 → cache localStorage 30 j). Fallback SPA (`404.html`, rewrite `/*`). `noindex`. Réutilise le même set de composants de modèles que l'éditeur.

**Rôle de Lucas**
Conception de la séparation édition/publication, travail de perf (cold-cache), config de déploiement Render + Cloudflare R2.

**Utilisation actuelle**
**Production** (service Render décrit, toggle `publishDomain` câblé, `dist/` construit).

**Impact métier**
- Domaine de diffusion dédié, chargement rapide, bande passante déportée sur CDN.

**Technologies présentes**
Vite 7, React 19, Render (static), Cloudflare R2.

**Éléments intéressants pour un recruteur**
- A optimisé un **temps de chargement critique** (prefetch pré-React, fallbacks en cascade).
- Architecture publication/édition découplée.

**Points à confirmer avec Lucas**
- Domaine réellement en ligne et volume servi.

---

## 6. « Landing Verif » — surveillance automatique des liens d'affiliation

**Problème métier**
Les liens d'affiliation (taap.it) placés en bio/vidéo TikTok-Insta des influenceurs peuvent casser ou pointer vers la mauvaise page/le mauvais lien casino → **perte de commissions invisible**.

**Situation avant l'intervention**
Vérification manuelle probable — **À confirmer par Lucas**.

**Solution livrée**
`api/src/aurix/landings_verif.ts` (~60 KB) :
- Source de vérité = **Google Sheet publié (CSV)** synchronisé vers `aurix_landing_verif_refs`.
- Pipeline `verifyOneRefV2` : résolution du redirect taap.it (suivi + parsing interstitiel `finalLink`), contrôle de domaine (allowlist lunalive/landaurax), correspondance slug↔page DB, **détection SPA-404** (4xx HTML servi par Render traité correctement), comparaison du lien casino attendu vs. réel.
- Statuts : `ok, sheet_missing, page_unreachable, taap_unreachable, taap_off_domain, taap_mismatch, landing_missing, celsius_changed`.
- **Cron 2 h**, tableau sticky Discord (salon staff) avec bouton refresh (restreint), ping `@here` uniquement sur **nouvelle** anomalie (diff vs. baseline KV).

**Rôle de Lucas**
Conception du système de vérification + diffing d'anomalies, intégration Discord + Google Sheet + cron. Débogage fin (parsing taap.it, faux 404 SPA).

**Utilisation actuelle**
**Production** (câblé au démarrage du bot Discord LunaLive, `discord/bot.ts`; trigger manuel `/verify-landings`). NB : un doublon historique côté bot Aurix a été **migré/désactivé** vers le bot LunaLive (commentaires `setup.ts`/`bot.ts`).

**Impact métier**
- Détecte automatiquement les liens cassés/détournés → protège les commissions.
- Alertes ciblées (pas de spam : seulement les nouveaux problèmes).

**Technologies présentes**
Node/TS, Postgres, Google Sheets (CSV), discord.js, cron (`setInterval`).

**Éléments intéressants pour un recruteur**
- A automatisé un **contrôle qualité récurrent** sur des liens tiers instables.
- Gestion d'état (baseline/diff) pour des alertes utiles.
- Robustesse face aux redirections et aux 404 « faux positifs » d'une SPA.

**Points à confirmer avec Lucas**
- Nombre de refs surveillées, fréquence réelle d'anomalies détectées.

---

## 7. Bot Discord/Telegram Aurix (Celsius, refills, watcher, tickets, setup)

**Problème métier**
Opérer l'agence sur Discord : accueillir streamers et viewers, collecter les inscriptions au casino **Celsius**, valider les affiliations, gérer les **refills** (recharges casino) payés par un manager, et le support par tickets.

**Situation avant l'intervention**
Non applicable en interne — bâti de zéro (premier commit bot `8f93024a`, 15/05/2026). S'appuie sur **Celsius (externe)**.

**Solution livrée**
`api/src/aurix/*` — bot **intégré au même process API** (`startAurixBot()`, gate `RUN_AURIX_BOT=1`), Postgres partagé (tables `aurix_*`), discord.js v14, Telegram via REST natif. Capacités :
- **Flux Celsius** (`celsius.ts`, `celsius_dm.ts`) : `/celsius` (modal pseudo Celsius + email + dépôt mensuel), upsert `aurix_celsius_submissions`, statut pending/verified/rejected, DM de confirmation/validation/refus, **DM VIP** au-delà de **750 €/mois**, blast d'invitations VIP.
- **Refills** (`refill.ts`) : `/refill` dans le ticket du user, montant/wager par utilisateur, **cutoff** toutes les 30 s qui verrouille le batch, injecte les auto-refills récurrents, poste la liste au staff et **l'envoie au manager via Telegram**, `/done` marque le batch envoyé. `/refill-config` (admin).
- **The Watcher** (`watcher.ts`) : board d'administration des inscriptions Celsius — liste triable, stats, **flag des doublons multi-serveurs**, file de traitement une-par-une (Accept/Pass/Reject), panneau d'auto-validation par streamer.
- **Tickets** (`tickets.ts`) : double parcours « j'ai un deal » / « je postule », channels privés auto, `/link-partner` (binômes partageant un refill).
- **Setup** (`setup.ts`) : construction idempotente de tout le serveur Discord de l'agence (rôles Direction/Modérateur/Streamer, catégories INFO/SUPPORT/TICKETS/INFLUENCEURS/STAFF, salons, panneaux règlement/bienvenue/tickets).

**Rôle de Lucas**
Conception de l'ensemble du workflow agence-sur-Discord, du modèle de données `aurix_*`, intégration Telegram (batch manager), débogage (snowflakes en string, wording, versions de setup). Reprise = uniquement le système Celsius externe.

**Utilisation actuelle**
**Production** (gate d'env, setup versionné auto-exécuté, tables réelles, dist compilé). Quelques éléments legacy signalés (landing-verif côté Aurix migré ; ID de salon hardcodé en fallback).

**Impact métier**
- Supprime un traitement manuel lourd : collecte + validation des affiliés, batch de refills, support.
- Centralise la gestion des viewers/affiliés et le paiement des recharges.
- Détecte les doublons/fraudes (multi-comptes multi-serveurs).

**Technologies présentes**
discord.js v14, Telegram Bot API (REST), Postgres, Zod, Node/TS.

**Éléments intéressants pour un recruteur**
- A livré un **bot opérationnel multi-canal** (Discord + Telegram) qui pilote un vrai flux argent (refills) et un flux de validation d'affiliés.
- Modélisation de données propre (tables `aurix_*`, migrations dédiées).
- Setup infra-as-code d'un serveur Discord complet, idempotent et versionné.
- Détection de doublons/fraude intégrée.

**Points à confirmer avec Lucas**
- Volume réel (nb de streamers/viewers/refills traités).
- Qui joue le rôle de « manager » Telegram et « Watcher » ?
- Montants (sensibles) — à ne pas divulguer.

---

## 8. Prospection TikTok (extension + worker + graphe réseau + scoring + recrutement)

**Problème métier**
Trouver de nouveaux créateurs TikTok à recruter comme affiliés, sans se faire bloquer par l'anti-bot TikTok, et prioriser les meilleurs profils.

**Situation avant l'intervention**
Non applicable (bâti de zéro à partir d'avril 2026).

**Solution livrée**
- **Découverte réseau** (`api/src/routes/tiktok_outreach.ts`, `/api/fsb/tiktok`) : à partir de comptes « seeds », scrape vidéos → commentateurs, `@mentions`, liste `/following` → construit un **graphe de créateurs** (`tiktok_network_links`, `tiktok_seed_follows`, `tiktok_candidate_follows`).
- **Extension Chrome** (`extension/tiktok-discoverer`, v1.7.13) : scrape depuis le **navigateur connecté de l'opérateur** (IP résidentielle + session) ; ouvre la modale Following via **`chrome.debugger` (CDP)** en dispatchant de vrais events « trusted » ; bridge vers le dashboard (`content_lunalive.js` ↔ `postMessage`).
- **Cloudflare Worker Puppeteer** (`cloudflare/tiktok-discovery`) : scraper serveur de **secours** (Browser Rendering), activé si variables d'env présentes.
- **Scoring en SQL** : cutoff dur `< 5 000 followers`, overlap de follows ×60, mutualité (anti-célébrité), scoring de niche par bio (whitelist casino/slot/streamer ; `taap.it` en bio = affilié actif +200 ; blacklist), tiers, décroissance temporelle, verdicts (peer_confirmed/likely/celebrity/off_niche/fan), enrichissement par batches.
- **Recrutement** : bouton « Recruter » (`FsbTikTokOutreachSection.tsx`) → `POST /fsb/agency/streamers/from-tiktok` → crée `agency_streamers` + deal + assignation. Détection de liens d'affiliation (taap.it, lunalive.win/r/…). Funnel d'**outreach email** secondaire (Brevo, webhook de réponse `replies+tk…`).

**Rôle de Lucas**
Conception de la stratégie de découverte (graphe + scoring), de l'extension (bypass par session réelle), du worker de secours, et du pont prospection→contractualisation. Très fortement itéré (40+ commits de tuning, v1.7.1→1.7.13).

**Utilisation actuelle**
**Production / activement itéré** pour l'extension + scoring + recrutement. Le worker Puppeteer et le `fetch` serveur sont des **fallbacks/expérimentaux** (bloqués par TikTok — raison d'être de l'extension).

**Impact métier**
- Automatise la **prospection d'affiliés** (sourcing + priorisation).
- Contourne le blocage anti-bot sans infra coûteuse (navigateur de l'opérateur).
- Relie directement un profil découvert à un deal agence (acquisition → contrat).

**Technologies présentes**
Chrome Extension MV3 (`tabs/storage/scripting/debugger`), Cloudflare Workers + `@cloudflare/puppeteer` (Browser Rendering), Postgres, Express, Brevo.

**Éléments intéressants pour un recruteur**
- A conçu un **pipeline de prospection complet** : scraping → graphe → scoring → recrutement.
- Solution pragmatique et originale au blocage anti-bot (`chrome.debugger` + session réelle).
- Scoring métier riche (mutualité, niche, affiliation détectée, anti-célébrité).
- 13 tables dédiées, système versionné et longuement affiné.

**Points à confirmer avec Lucas**
- Nombre de créateurs découverts / recrutés grâce à l'outil.
- L'extension est-elle utilisée par plusieurs opérateurs ?
- Part du scoring pensée par lui vs. générée par IA.

---

# ÉTAPE 4 — Synthèse de l'expérience

## Synthèse globale du travail réalisé pour Aurix

Sur ~2,5 mois (avril → juin 2026), Lucas a greffé sur sa plateforme de streaming existante (LunaLive) un **outillage interne complet pour une agence d'affiliation casino (Aurix)**, couvrant toute la chaîne : **acquisition → conversion → contractualisation → reporting → opérations**. Côté acquisition, il a bâti une **prospection TikTok** (extension navigateur + worker de secours + graphe de créateurs + scoring métier) reliée au recrutement d'affiliés. Côté conversion, un **éditeur de landing pages** à base de modèles (mini-jeux casino), avec personnalisation par influenceur, publication CDN, **analytics** de comparaison de modèles et **capture de leads VIP**. Côté opérations, un **bot Discord/Telegram** qui gère l'inscription et la validation des affiliés au programme externe **Celsius**, les **refills** payés via un manager, le support par tickets, et un **dashboard agence** (deals CPA/revenue-share, marges, frais). Il a aussi automatisé un **contrôle qualité des liens d'affiliation** (Landing Verif). Il a travaillé **en s'appuyant sur des systèmes tiers qu'il n'a pas construits** (Celsius, taap.it, Lovable, Google Sheets) et **fortement avec des agents IA**. Son rôle est **transversal et orienté produit/ops** : il comprend le besoin business, conçoit la solution, orchestre l'implémentation (largement assistée par IA), intègre, débogue et déploie. **Attribution à confirmer** : aucun co-développeur n'apparaît dans le dépôt ; l'éventuel « dashboard historique d'Aurix développé par une autre personne » n'y est pas présent.

---

## Version CV — courte

**Titre :** Concepteur & intégrateur d'outils internes — Agence d'affiliation (Aurix)

**Intro :** Conception et livraison de bout en bout de l'outillage d'une agence d'affiliation casino, de l'acquisition d'affiliés jusqu'au reporting, en pilotant une implémentation largement assistée par IA.

- **Prospection d'affiliés impossible à scaler manuellement** → pipeline de découverte TikTok (extension navigateur contournant l'anti-bot + scoring de profils + graphe de créateurs) relié au recrutement → **sourcing d'affiliés automatisé et priorisé**.
- **Production de landing pages trop lente** → éditeur à modèles avec personnalisation par influenceur, publication CDN et analytics de comparaison → **landings premium en série + décisions data**.
- **Opérations d'agence dispersées** → bot Discord/Telegram (inscription/validation des affiliés au programme Celsius, refills via manager, tickets) + dashboard deals/marges/frais → **centralisation et suppression de tâches manuelles**.
- **Liens d'affiliation cassés = commissions perdues** → surveillance automatique (cron + alertes Discord ciblées) des liens taap.it → **protection continue du revenu d'affiliation**.

---

## Version CV — développée

**Titre :** Builder produit / ops — Outils internes d'une agence d'affiliation (streaming casino)

**Contexte :** Aurix est une agence d'affiliation qui recrute des créateurs (TikTok, streamers) et les affilie à des programmes casino (ex. Celsius). Lucas, déjà à l'origine de la plateforme de streaming LunaLive, y a greffé en ~2,5 mois l'outillage interne de l'agence, en concevant les solutions et en orchestrant une implémentation fortement assistée par IA. (Aucun co-développeur n'apparaît dans le dépôt ; travail bâti sur des services tiers non conçus par lui.)

**Réalisations (preuves) :**
1. **Pipeline de prospection TikTok** — extension Chrome (v1.7.13, bypass anti-bot via session réelle + `chrome.debugger`), graphe de créateurs et scoring métier, recrutement→deal. *Preuve : `extension/tiktok-discoverer`, `api/src/routes/tiktok_outreach.ts`, 13 tables `tiktok_*`, 40+ commits de tuning.*
2. **Éditeur de landing pages à modèles** (V1→V3, ~16 modèles) avec personnalisation, publication CDN (R2) et page publique `/r/:slug`. *Preuve : `web/src/pages/EditorV3Page.tsx`, `api/src/routes/affi_pages.ts`, table `affi_landing_pages`.*
3. **Analytics de conversion** (vues/clics/UTM, hash IP salé) et **comparaison multi-modèles**. *Preuve : `POST /public/affi-events`, endpoints `/fsb/affi-pages/*/stats`, table `affi_landing_events`.*
4. **Bot Discord/Telegram d'agence** : flux Celsius (validation d'affiliés, DM VIP ≥750 €), refills batchés vers un manager, tickets, setup serveur idempotent. *Preuve : `api/src/aurix/*`, tables `aurix_*`, `startAurixBot()`.*
5. **Dashboard agence** : deals CPA/revenue-share, split de bonus et marge, frais avec board Discord auto. *Preuve : `api/src/routes/agency.ts`, `lib/agency_bonus.ts`, `expenses.ts`.*
6. **Surveillance des liens d'affiliation** (Landing Verif) : cron 2 h, sync Google Sheet, résolution taap.it, alertes Discord ciblées. *Preuve : `api/src/aurix/landings_verif.ts`.*

**Preuves d'usage :** services démarrés au boot (`RUN_AURIX_BOT`, board frais, refresh snapshots), builds `dist/` déployés (Render), migrations Postgres appliquées, corrections de bugs métier réels (CTR, faux 404 SPA).

---

## Version entretien — 60 secondes (oral naturel)

« Aurix, c'est une agence d'affiliation : elle recrute des créateurs TikTok et des streamers, les branche sur des programmes casino comme Celsius, et se rémunère sur la marge. Je l'ai rejointe parce que j'avais déjà construit ma propre plateforme de streaming, LunaLive, et qu'il y avait tout un outillage à créer pour faire tourner l'agence. En pratique, j'ai bâti la chaîne complète : un outil de prospection TikTok — une extension navigateur qui contourne l'anti-bot et un système de scoring pour repérer les bons profils — relié au recrutement. Ensuite un éditeur de landing pages à modèles, personnalisées par influenceur, avec des stats pour comparer ce qui convertit. Et côté opérations, un bot Discord et Telegram qui gère l'inscription des affiliés, leur validation, les recharges payées par un manager, et un dashboard des deals et des marges. Je n'ai pas tout écrit à la main : je travaille beaucoup avec des agents IA — mon rôle, c'est de comprendre le besoin métier, concevoir la solution, l'intégrer, la déboguer et la mettre en prod. Je me suis aussi appuyé sur des briques que je n'ai pas construites, comme le programme Celsius. Aujourd'hui je cherche à faire ça à plus grande échelle, dans une équipe, sur des produits où ce rôle de builder produit/ops orienté résultats a de l'impact. »

---

## Questions restantes (non déductibles du code)

1. Existe-t-il un **dashboard Aurix historique développé par une autre personne** ? Si oui, dans quel dépôt, et qu'a exactement repris Lucas ?
2. Quels **volumes réels** : nb d'affiliés recrutés, landings en ligne, événements analytics, refills traités, leads VIP captés ? (aucun chiffre n'est prouvable par le code)
3. Quelle **part du code est écrite main vs. générée par agents IA** (par module) ?
4. **Qui utilise** chaque outil au quotidien (Lucas seul, l'équipe, plusieurs opérateurs pour l'extension) ?
5. Quels **résultats métier concrets** attribuables aux outils (gain de temps, hausse de conversion, commissions protégées) ?
6. Statut du **worker Cloudflare Puppeteer** et du funnel **outreach email** : réellement exploités ou abandonnés au profit de l'extension ?
7. Les **domaines** (landaurax.com, etc.) sont-ils en ligne et sur quel trafic ?

---

# ÉTAPE 5 — Contrôle final

- ✅ **LunaLive n'a pas été attribué en bloc à Aurix** : la base streaming (déc. 2025) est explicitement exclue ; seule la couche affiliation/agence (avr.–juin 2026) est retenue.
- ✅ **Créé vs. repris distingué** : outils Aurix créés par Lucas ; briques tierces (Celsius, taap.it, Lovable, Google Sheets, Brevo) marquées comme intégrées/non construites. L'éventuel dashboard historique tiers est signalé « À confirmer / absent du dépôt ».
- ✅ **Chaque affirmation est traçable** (fichier / table / route / commit cités).
- ✅ **Aucun secret ni donnée personnelle** : pas d'ID Discord, email, token, URL de sheet, pseudo d'affilié ni montant sensible reproduit.
- ✅ **Lucas n'est pas présenté comme expert technique** : accent mis sur compréhension métier, conception, orchestration IA, intégration, débogage, déploiement — pas sur une maîtrise pointue des libs.
- ✅ **Aucun fichier applicatif modifié, aucun commit poussé.** Seul `AURIX_WORK_AUDIT.md` a été créé.

## Commandes Git / recherches réellement exécutées

```
git remote -v ; git branch -a
git shortlog -sne --all                         # → auteur unique : LeCasiNoze <kasinoze@gmail.com>
git log --all --format="%an <%ae>" | sort -u    # → confirme l'auteur unique
git log --all --format="%ci" | sort | head/tail # → 2025-12-15 → 2026-06-08
git log --all --oneline -i --grep=aurix --grep=celsius --grep=landaurax --grep=tiktok \
        --grep=postback --grep=affili --grep=refill --grep=watcher --grep=prospect
git log --all --since="2026-03-01" --date=short --pretty="%ad %h %s"
git log --all --reverse --date=short --pretty="%ad %h %s" | grep -iE "affi|landing|celsius|editor"
git log --all --diff-filter=A ... -- api/src/db/migrations/mig066|067|118*.ts  # dates de création des tables agence
```

Recherches de code (ripgrep / grep) : routes `agency/tiktok/affi/expenses` et leur montage (`api/src/app.ts:201-222`), démarrage bot (`api/src/index.ts:200-214`), tables `aurix_*` (`api/src/aurix/migrate.ts`), tables `agency_*`/`tiktok_*`/`expenses`/`fsb_*` (`api/src/db/migrations/`), algo `api/src/lib/agency_bonus.ts`, endpoints Celsius/VIP (`affi_pages.ts`, `landings_verif.ts`), `render.yaml`, `extension/tiktok-discoverer/manifest.json`.

Analyses détaillées déléguées à 4 explorations en lecture seule : (1) bot Aurix `api/src/aurix/*`, (2) éditeur landings + analytics `web/src` + `affi_pages.ts`, (3) prospection TikTok `extension/` + `cloudflare/tiktok-discovery` + `tiktok_outreach.ts`, (4) `landaurax/` + `landings_verif.ts`.

**Niveau de confiance :** élevé sur *ce qui existe et est câblé en production* (traçable dans le code). Moyen/faible sur *les volumes, l'impact chiffré, la part IA vs. main, et l'existence d'un dashboard historique tiers* — d'où la section « Questions restantes ».
