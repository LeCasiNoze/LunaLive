# Rapport — Remplacement de Rumble pour LunaLive

## 1. Verdict en 3 lignes

- **Reco principale (à déployer en parallèle de Rumble dès maintenant) : Cloudflare Stream (Live).** C'est la seule option qui combine *gambling-toléré* (Acceptable Hosting Policy, aucune catégorie casino interdite), *flux trivial* (HLS `.m3u8` déterministe en `Access-Control-Allow-Origin: *` vérifié → HLS.js sans proxy), *RTMPS/SRT/WHIP* ingest par clé, et **bande passante servie par Cloudflare** (pas d'egress LunaLive). Maps 1:1 sur `rumble_accounts`.
- **Fallback "plateforme externe gratuite" : Parti.** Vraie plateforme alt-tech avec catégorie *CASINO* officielle, API JSON propre (playback_url, is_live, viewers, RTMP ingest, chat WS+POST), **CDN servi par eux (gratuit)**. À traiter comme hedge secondaire : startup Nov 2024, risque de fermeture élevé (profil DLive).
- **Indépendance totale (jamais deplatformé) : Owncast** (le plus propre techniquement) ou **PeerTube/Ant Media/OvenMediaEngine**. Self-host = zéro ToS contenu, flux `.m3u8` déterministe CORS-`*`, mais **on paie 100 % de l'egress** et Owncast est mono-chaîne (1 instance par streamer).

---

## 2. Tableau comparatif

| Plateforme | Catégorie | Gambling OK | Accès flux | RTMP/OBS | Chat lire / écrire | Métadonnées API | Unlisted | Qui paie l'egress | Risque fermeture | Score |
|---|---|---|---|---|---|---|---|---|---|---|
| **Cloudflare Stream** | managed-infra | Oui (AHP, pas de catégorie casino bannie) | API doc, **trivial**, CORS `*` vérifié | RTMPS + SRT + WebRTC, clé stable | à construire (Workers/Durable Objects) | REST `/lifecycle` is_live + videoUID | Oui (signed URL) | **Cloudflare (≈free egress)** | **Faible** | ~85 |
| **Parti** | external-alt | Oui (catégorie CASINO id 24 + blackjack natif) | API JSON, **trivial**, CDN **non** CORS → proxy | rtmp://stream.parti.com:1935 + key | WS `ws.parti.com` / POST chat | REST is_live/title/viewers/thumb non-auth | Oui (visibility Private) | **Parti (gratuit)** | **Élevé** (startup 11/2024) | 74 |
| **Owncast** | self-host | Oui (MIT, aucune ToS contenu) | `/hls/0/stream.m3u8` déterministe, CORS `*` **vérifié (manifest+ts)** | rtmp://host/live + multi-keys | WS `/ws` ou webhooks / POST `chat/send` | `/api/status` non-auth | Oui (défaut) | **Nous (egress)** | Faible | 82 → **74 ajusté** |
| **PeerTube** | self-host | Oui (self-host, admin = nous) | API OAuth2, `streamingPlaylists[].playlistUrl` CORS `*` | POST `/videos/live` → rtmp/rtmps + key | XMPP/Prosody (plugin) | REST is_live/viewers/title | Oui | **Nous (egress)** | Faible | 82 |
| **Ant Media** | self-host | Oui (Apache-2.0 CE, "Content is your responsibility") | REST `broadcasts/{id}`, `.m3u8` déterministe CORS `*` **vérifié** | rtmp://host/LiveApp + streamId(=key) | DIY (WebRTC datachannel, Enterprise) | REST status/viewers | Oui | **Nous (egress)** | Faible | 82 → **78 ajusté** |
| **OvenMediaEngine** | self-host | Oui (AGPL-3.0, aucune ToS) | `.m3u8`/LLHLS déterministe CORS `*` | rtmp://host/app/key, SRT, WHIP | **aucun** (100 % DIY) | REST v1 (viewers peu fiables) | Oui (défaut) | **Nous (egress)** | Faible | 82 |
| **Red5 Pro** | self-host | Oui (markete le live-casino) | Stream Manager 2.0 REST, CORS inconnu | RTMP/SRT/WHIP + key | PubNub (vendor tiers) | REST is_live/subscribers, pas de titre natif | Oui (défaut) | **Nous (egress)** | Faible | 78 |
| **VIMM.tv** | decentralized | Oui (self-host MIT, pas de ToS) | REST `hlsPlaylistUrl`, CORS `*` (source) | rtmp://host/live/{id} + key 32o | Socket.IO / POST | REST is_live/viewers/title/thumb | Inconnu | **Nous (egress)** | Faible (code) / projet immature | 82 (source-only) |

Note : les scores self-host à 82 sont *avant* pénalité d'egress/ops ; la vérification adverse abaisse Owncast à 74 et Ant Media à 78 précisément pour ça (on devient opérateur infra).

---

## 3. Recommandation #1 détaillée — Cloudflare Stream (Live)

### Pourquoi
1. **Filtre #1 (gambling) passé proprement.** Stream relève de l'**Acceptable Hosting Policy** de Cloudflare (produit hosting, comme R2/Pages), PAS d'une content-policy de plateforme de streaming. Les 7 catégories supprimables (CSAM, contrefaçon IP, diffamation jugée, drogues illégales, traite humaine, malware/C2, "illégal/nuisible") **n'incluent pas le gambling**. C'est l'inverse de Twitch/Kick/YouTube qui bannissent le casino par catégorie. Seul bémol : Cloudflare a agi sur des notices FR/BE visant le gambling **illégal/non-licencié** → tant que les casinos affichés sont licenciés UE et qu'on diffuse du *contenu* (streamers qui jouent) et non l'opération d'un casino, le risque est faible.
2. **Flux = le point le plus fort.** URL HLS **déterministe et stable** connue dès la création de l'input :
   `https://customer-<CODE>.cloudflarestream.com/<INPUT_UID>/manifest/video.m3u8`
   Elle **ne change pas** entre broadcasts → fin de la chasse au videoId/embedJS/Cloudflare-block qui plombe Rumble. **CORS vérifié empiriquement** : `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Headers: range` → HLS.js joue **direct depuis le browser, zéro proxy**. On peut **supprimer `hls_proxy.ts` du chemin** pour ce provider.
3. **Bande passante = Cloudflare.** Contrairement à tout le self-host, on **ne paie pas l'egress par viewer** (modèle Stream : facturation minutes stockées + minutes vues, pas d'egress brut comme un VPS). C'est le seul candidat qui réplique l'avantage "CDN gratuit" de Rumble tout en restant gambling-toléré.

### Comment on récupère le flux (concrètement)
```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/live_inputs
Authorization: Bearer <CF_STREAM_TOKEN>
→ { result: { uid, rtmps:{url,streamKey}, srt:{url,streamId,passphrase}, webRTC:{url} } }
```
- On stocke `uid` (= identifiant de chaîne stable) par streamer.
- **HLS playback** : on construit l'URL nous-mêmes, aucune découverte requise :
  `https://customer-<CODE>.cloudflarestream.com/{uid}/manifest/video.m3u8`
- **is_live + videoUID courant** (CORS `*`, vérifié 200) :
  `GET https://customer-<CODE>.cloudflarestream.com/{uid}/lifecycle` → `{ isInput, live, videoUID }`
  → le poller 30s écrit `is_live = live`, `hls_url = …/manifest/video.m3u8`.

### Comment on génère les clés RTMP pour OBS
Le `POST live_inputs` renvoie déjà `rtmps.url` (`rtmps://live.cloudflare.com:443/live/`) + `rtmps.streamKey`. On les stocke en `rtmp_url` / `stream_key` par compte (schéma `rumble_accounts` inchangé). OBS : service Custom, RTMPS natif. Bonus : `srt.url`+`srt.streamId`+`srt.passphrase` (SRT chiffré) et `webRTC.url` (sub-seconde) dispo gratuitement.

### Comment on lit/écrit le chat
**Faiblesse de Cloudflare Stream : pas de chat natif.** On garde notre propre couche chat — c'est exactement ce que fait déjà le bridge SSE-in/POST-out, sauf qu'ici le chat devient **canonique chez nous** (Durable Object / WebSocket sur un Worker, ou notre service existant). Aucune API plateforme à scraper = aucune API qui casse. Réutilise l'abstraction bridge actuelle ; on remplace "lire le chat Rumble" par "notre WS est la source de vérité".

### Comment on crée les comptes
Pas de signup par streamer : **un seul compte Cloudflare facturé**, puis `POST live_inputs` par streamer = mint d'une chaîne (uid + clé). 100 % scriptable, pas de captcha/email/KYC, pas d'anti-abuse sur la création de masse (l'inverse de Rumble). On insère une ligne `provider_accounts` (provider=`cloudflare`, uid, rtmp_url, stream_key, assigned_to_streamer_id).

### Mapping sur l'archi existante
| Brique LunaLive | Adaptation Cloudflare Stream |
|---|---|
| `rumble_accounts` → `provider_accounts` | colonne `provider` ; `username`→`uid`, `api_key`→token compte (global), `rtmp_url`/`stream_key` directs |
| poller 30s (`rumble_poller.ts`) | nouveau `cloudflare_poller.ts` : `GET /{uid}/lifecycle` → écrit is_live/hls_url ; titre/thumb gérés côté LunaLive |
| `hls_proxy.ts` | **non utilisé** pour ce provider (CORS `*`) |
| `RumbleStreamPlayer` | déjà prêt : ajouter `customer-*.cloudflarestream.com` au court-circuit de `toProxiedHls()` (comme `cdn.rumble.cloud`) |
| chat bridge SSE | devient notre WS canonique (Durable Object), POST out inchangé |

---

## 4. Le dilemme stratégique — et mon avis tranché

**Plateforme externe gratuite (Parti, ou Rumble actuel)** : ils paient le CDN viewer (egress = 0 pour nous), onboarding rapide, chat fourni. MAIS : on dépend d'un tiers qui peut fermer (DLive), bloquer (Cloudflare-scrape Rumble), ou pivoter (Parti = crypto/Web3, 8-21 viewers observés, Nov 2024). C'est exactement le piège qu'on essaie de fuir.

**Self-host / infra managée** : indépendance totale, **jamais deplatformé** (le filtre #1 disparaît : pas de ToS contenu). MAIS le self-host pur (Owncast/PeerTube/Ant Media/OME) nous transforme en opérateur CDN → **on paie 100 % de l'egress** (≈1,35 Go/viewer/h en 3 Mbps, ~0,05–0,09 $/Go cloud), on gère transcoding/uptime/DDoS, et Owncast impose **1 instance par streamer**. À l'échelle d'un streamer casino populaire, la facture egress explose linéairement.

**Mon avis : ni l'un ni l'autre en pur — Cloudflare Stream est la synthèse, et c'est lui qu'il faut câbler en premier.** Il offre l'**indépendance d'un fournisseur d'infra gambling-neutre** (pas de content-policy de plateforme qui peut nous virer du jour au lendemain) AVEC le modèle **bandwidth-par-le-fournisseur** (pas d'egress brut à notre charge). On n'est pas "sur une plateforme de streaming" qui peut nous deplatformer ; on est sur du hosting neutre. C'est le meilleur ratio indépendance × facilité-de-flux × coût.

**Stratégie recommandée (defense in depth) :**
1. **Cloudflare Stream = primaire.** Indépendance suffisante + flux trivial + egress non-supporté par nous.
2. **Owncast = filet de sécurité souverain "warm".** Vraie immunité totale au deplatform (MIT, fork possible). À garder prêt en IaC pour le jour où même un fournisseur d'infra neutre poserait problème, en acceptant alors le coût egress.
3. **Parti = hedge externe optionnel**, jamais pari unique.

L'abstraction multi-provider (section 5) rend ces trois interchangeables sans réécrire le front.

---

## 5. Plan d'implémentation incrémental (ordonné par risque croissant)

**Étape 0 — Généraliser le schéma (risque quasi nul, réversible).**
- Renommer/élargir `rumble_accounts` → table générique `provider_accounts` avec colonne `provider TEXT` (`'rumble' | 'dlive' | 'cloudflare' | 'owncast' | 'parti'`). Garder une vue `rumble_accounts` pour ne rien casser. Colonnes : `provider, username/uid, api_key, rtmp_url, stream_key, assigned_to_streamer_id`.
- Idem `streamer_rumble_info` → `streamer_live_info` (+`provider`) ou ajouter `provider`.

**Étape 1 — Interface de provider côté API (risque faible).**
- Définir un contrat `LiveProvider` : `getLiveInfo(account) → { isLive, hlsUrl, title?, viewers?, thumb? }`, `createIngest() → { rtmpUrl, streamKey, uid }`. Implémenter `RumbleProvider` (existant, wrap) + `CloudflareProvider`.

**Étape 2 — Poller multi-provider (risque faible, isolé).**
- Le poller 30s itère `provider_accounts`, dispatch sur `LiveProvider[provider].getLiveInfo()`. Pour Cloudflare : `GET /{uid}/lifecycle`. Aucun impact sur le flux Rumble existant.

**Étape 3 — Player (risque faible).**
- Dans `RumbleStreamPlayer.toProxiedHls()`, ajouter le court-circuit CORS-`*` : `if (url.includes("cloudflarestream.com")) return url;`. Le player étant déjà HLS.js générique, renommer en `HlsStreamPlayer` (optionnel) et lui passer `hlsUrl` quel que soit le provider.

**Étape 4 — Onboarding / création de comptes (risque faible).**
- Endpoint admin `POST /admin/providers/cloudflare/provision` → `POST live_inputs` → insert `provider_accounts`. Stocke rtmp_url + stream_key à remettre au streamer pour OBS.

**Étape 5 — Chat (risque moyen, le plus de boulot).**
- Cloudflare Stream n'a pas de chat → notre WS devient canonique (Durable Object sur Worker, ou service Render existant). Le bridge SSE-in/POST-out reste : "in" = notre WS, "out" = notre POST. Pour Parti (si activé) : adapter "in" sur `wss://ws.parti.com/ws`.

**Étape 6 — `hls_proxy.ts` (Worker CF) (risque faible).**
- Étendre la whitelist hosts pour autoriser les CDN des providers retenus **au cas où** un fallback proxy serait nécessaire (Parti `media.parti.com` n'est PAS CORS-`*` → proxy requis). Cloudflare/Owncast/Ant Media n'en ont pas besoin.

**Étape 7 — (optionnel) Owncast warm standby.**
- Image Docker `ghcr.io/owncast/owncast` + provisioning IaC par streamer, drivé par admin API. Reste éteint tant que Cloudflare Stream tient.

---

## 6. Ce qui reste à tester en live (non prouvé de bout en bout par la recherche)

**Cloudflare Stream (reco #1) — à valider en priorité :**
- Pousser OBS en RTMPS sur `rtmps.url` + `rtmps.streamKey`, puis confirmer que `…/{uid}/manifest/video.m3u8` joue dans HLS.js depuis `lunalive.win` **sans proxy** (CORS `*` confirmé sur manifest — re-vérifier sur les **segments .ts/.m4s** d'un live actif).
- Confirmer que `/{uid}/lifecycle` bascule `live:true` sous 30s et expose `videoUID` exploitable par le poller.
- **Coût réel** : modéliser le pricing Stream (minutes stockées + minutes vues) vs egress — confirmer qu'il n'y a PAS de facturation egress brute par viewer à notre charge.
- **Latence** : HLS standard Cloudflare ~10-20s — vérifier si acceptable pour du casino live, sinon activer le mode low-latency / WebRTC WHEP.
- Re-lire l'Acceptable Hosting Policy à jour : aucune clause gambling ajoutée ; confirmer la position FR/BE sur le casino licencié.

**Owncast (filet souverain) :** confirmer POST `chat/send` (token Bearer) poste un message visible ; capturer le schéma JSON du WS `/ws` ; vérifier CORS `*` sur les segments si offload S3/BunnyCDN ; mesurer egress réel par viewer.

**Parti (hedge externe) :** re-rendre `parti.com/content_guidelines` en headless pour la clause gambling verbatim ; confirmer que `get_livestream_channel_info` renvoie `ingest_endpoint`+`stream_key` non vides pour le compte propriétaire (vide pour un tiers) ; tester POST `/profile/livestream/chat` avec JWT bot + reverse-engineer le schéma WS ; confirmer que le Worker HLS proxy peut whitelister `media.parti.com` sans OOM.

---

## 7. Niveau de confiance honnête par candidat recommandé

| Candidat | Confiance | Justification |
|---|---|---|
| **Cloudflare Stream (#1)** | **Élevée (≈80 %)** sur flux/RTMP/gambling/egress ; **moyenne** sur chat (à construire) et latence. CORS `*` HLS vérifié empiriquement. Risques résiduels : coût exact à modéliser, latence HLS, clause FR gambling licencié. |
| **Parti (fallback)** | **Moyenne (≈60 %)** technique (API JSON propre, flux confirmé), **basse** sur la pérennité (startup Nov 2024, crypto-pivot, viewers faibles). Bon hedge, jamais pari unique. |
| **Owncast (indépendance)** | **Élevée (≈85 %)** technique — claims vérifiés *live* (manifest+segments CORS `*`, `/api/status`, RTMP, chat). Seule faiblesse : mono-chaîne (1 instance/streamer) + egress à notre charge. C'est le filet de sécurité souverain le plus fiable. |
| Ant Media / PeerTube / OME | **Moyenne-élevée** technique. Egal sur l'immunité deplatform. Plus lourds (transcoding, egress, chat DIY pour Ant/OME ; XMPP pour PeerTube). Alternatives self-host valables si Owncast ne scale pas. |

**Synthèse exécutable :** câbler **Cloudflare Stream** derrière l'abstraction `provider_accounts` dès maintenant (étapes 0→4 = faible risque, réversibles), garder **Owncast** prêt en IaC comme souveraineté de secours, et **Parti** comme hedge externe optionnel. Cette combinaison maximise simultanément l'indépendance (jamais deplatformé par une content-policy) ET la facilité de récupération du flux (HLS `.m3u8` déterministe, CORS-`*`, zéro scraping), tout en évitant de supporter l'egress sur le chemin primaire.

Fichiers concernés (chemins absolus) :
- `c:\Users\Lucas\LunaLive\web\src\components\RumbleStreamPlayer.tsx` — ajouter `cloudflarestream.com` au court-circuit `toProxiedHls()` (ligne 14).
- `c:\Users\Lucas\LunaLive\api\src\rumble_poller.ts` — modèle pour le nouveau `cloudflare_poller.ts`.
- `c:\Users\Lucas\LunaLive\api\src\hls_proxy.ts` — whitelist hosts (uniquement nécessaire pour Parti).
- `api/src/rumble.ts` — wrap dans l'interface `LiveProvider`.