# Instagram Token — Procédure de renouvellement

## Contexte

LunaLive publie sur le compte Instagram **`@lunalive_tv`** (id `34669509922663296`) via l'**Instagram Graph API avec Instagram Login**.

⚠️ **Attention — piège classique** : ce système utilise `https://graph.instagram.com/...`, **PAS** `https://graph.facebook.com/...`. Les tokens valides commencent par **`IGAA...`**, pas par `EAART...` (Facebook Login).

Si tu génères un token via [Graph API Explorer Facebook](https://developers.facebook.com/tools/explorer/) → ce sera un token **EAART** → **rejeté** par graph.instagram.com avec `Cannot parse access token` (erreur 190).

## Variables d'environnement Render

Toutes ces variables existent sur Render → service `lunalive-api` → onglet **Environment** :

| Variable                    | Format    | Usage                                                       |
|-----------------------------|-----------|-------------------------------------------------------------|
| `INSTAGRAM_ACCESS_TOKEN`    | `IGAA...` | publish scheduler + comment scheduler                       |
| `INSTAGRAM_PAGE_TOKEN`      | `IGAA...` | DM scheduler (même token que ACCESS_TOKEN dans pratique)    |
| `INSTAGRAM_USER_ID`         | `34669509922663296` | ID du compte IG Business — **ne change jamais**   |
| `INSTAGRAM_PAGE_ID`         | `34669509922663296` | identique à USER_ID dans Instagram Login          |
| `INSTAGRAM_WEBHOOK_TOKEN`   | (texte)   | secret pour valider les webhooks Meta — ne change jamais    |

**`INSTAGRAM_ACCESS_TOKEN` et `INSTAGRAM_PAGE_TOKEN` doivent contenir la MÊME valeur IGAA.**

## Durée de vie d'un token IGAA

- **60 jours** depuis la dernière émission/refresh
- **Pas de renouvellement automatique** dans le code → il **faut** le refresh manuellement avant expiration
- L'API `refresh_access_token` étend de 60 jours, à condition que le token actuel soit **âgé d'au moins 24h** et **encore valide**
- Si le token est **expiré**, refresh impossible → il faut repartir d'un nouveau token via OAuth Instagram

## Procédure 1 — Refresh (token toujours valide, le cas le plus simple)

À faire **avant** que le token expire (poser un rappel calendrier ~50 jours après la dernière mise à jour).

```bash
# Récupère la valeur actuelle de INSTAGRAM_ACCESS_TOKEN depuis Render (clic Reveal)
TOK="IGAA..."   # colle la valeur ici

# Refresh — étend de 60 jours
curl -s "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=$TOK"
```

Réponse attendue :
```json
{
  "access_token": "IGAA...nouvelleValeur...",
  "token_type": "bearer",
  "expires_in": 5184000,
  "permissions": "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_manage_insights"
}
```

Vérifier que la réponse contient bien :
- `expires_in: 5184000` (60 jours)
- `permissions` inclut `instagram_business_content_publish` (publication) et `instagram_business_manage_comments` (commentaires)

Tester immédiatement le nouveau token :
```bash
NEW="IGAA...nouvelleValeur..."
curl -s "https://graph.instagram.com/v19.0/me?fields=id,username&access_token=$NEW"
# attendu : {"id":"34669509922663296","username":"lunalive_tv"}
```

Si OK → mettre à jour Render :
1. Dashboard Render → service `lunalive-api` → Environment
2. Éditer **`INSTAGRAM_ACCESS_TOKEN`** → coller la nouvelle valeur
3. Éditer **`INSTAGRAM_PAGE_TOKEN`** → coller la **même** nouvelle valeur
4. Save Changes → Render redéploie automatiquement (~1-2 min)
5. Vérifier dans les logs runtime : pas d'erreur `Cannot parse access token` au prochain tick scheduler IG

## Procédure 2 — Token expiré ou invalide (refresh impossible)

Si le refresh retourne une erreur (`OAuthException`, `Token expired`, etc.) → il faut générer un nouveau token via le flow OAuth Instagram. Cette procédure est plus longue car elle nécessite :

1. Que l'utilisateur Instagram autorise explicitement l'app LunaClip via l'URL OAuth Instagram
2. L'échange du `code` reçu contre un short-lived token IGAA
3. L'échange short-lived → long-lived (60 jours)

### Étape 2.1 — Générer l'URL d'autorisation

Connecte-toi sur https://developers.facebook.com/apps/ → **LunaClip** → **Use cases** ou **Instagram → API setup with Instagram login** → relève :
- `Instagram App ID` (différent du Facebook App ID `1245949437257239`)
- `Instagram App Secret`
- `Redirect URI` configuré (ex: `https://lunalive-api.onrender.com/auth/instagram/callback` ou autre)

URL d'autorisation :
```
https://www.instagram.com/oauth/authorize
  ?client_id={INSTAGRAM_APP_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights
```

### Étape 2.2 — Récupérer le code

Connecte-toi sur Instagram avec le compte **lunalive_tv** (ou un compte qui a accès Business) → ouvre l'URL → autorise → tu seras redirigé vers `{REDIRECT_URI}?code=AQB...` (le code expire en quelques minutes).

### Étape 2.3 — Échanger code → short-lived token

```bash
APP_ID="..."
APP_SECRET="..."
REDIRECT_URI="..."
CODE="AQB..."   # code reçu via redirect

curl -X POST "https://api.instagram.com/oauth/access_token" \
  -F client_id=$APP_ID \
  -F client_secret=$APP_SECRET \
  -F grant_type=authorization_code \
  -F redirect_uri=$REDIRECT_URI \
  -F code=$CODE
```

Réponse : `{"access_token":"IGQW...","user_id":34669509922663296}` — token short-lived ~1h.

### Étape 2.4 — Échanger short-lived → long-lived (60 jours)

```bash
SHORT_TOK="IGQW..."

curl -s "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=$APP_SECRET&access_token=$SHORT_TOK"
```

Réponse : `{"access_token":"IGAA...","token_type":"bearer","expires_in":5184000}` → c'est notre nouveau token long-lived 60j.

### Étape 2.5 — Tester + déployer

Identique aux étapes finales de la procédure 1 (test `/me`, mise à jour Render des 2 variables, redeploy).

## Schedulers concernés

| Scheduler                       | Fichier                              | Variable utilisée            |
|---------------------------------|--------------------------------------|------------------------------|
| Instagram publish (Reels auto)  | `api/src/instagram_scheduler.ts`     | `INSTAGRAM_ACCESS_TOKEN`     |
| Instagram comment poll/reply    | `api/src/ig_comment_scheduler.ts`    | `INSTAGRAM_ACCESS_TOKEN`     |
| Instagram DM webhook + poll     | `api/src/ig_dm_scheduler.ts`         | `INSTAGRAM_PAGE_TOKEN`       |

Tous les 3 utilisent `https://graph.instagram.com/v19.0`. Le ig_comment_scheduler **stoppe définitivement** son polling à la première erreur 190 (`TOKEN EXPIRÉ — polling arrêté définitivement.`) — donc après une mise à jour de token il faut **forcer un redeploy** pour redémarrer ce scheduler.

## Symptômes d'un token expiré ou invalide

Dans les logs Render du service `lunalive-api`, tu verras :

```
[INSTAGRAM SCHEDULER] [job #X] FAILED — Meta API error [190]: Invalid OAuth access token - Cannot parse access token
[IG COMMENT SCHEDULER] [tracking #X] ❌ fetch comments: Meta API error [190]: ...
[IG COMMENT SCHEDULER] 🔴 TOKEN EXPIRÉ — polling arrêté définitivement.
```

Côté DB, les jobs IG passent en `status='error'` :

```sql
SELECT id, clip_id, status, scheduled_at, finished_at, LEFT(error_msg, 120) AS err
FROM publish_jobs
WHERE platform='instagram' AND status='error'
ORDER BY id DESC LIMIT 10;
```

## Replay des jobs ratés après remise en route du token

Une fois le token mis à jour et le redeploy live, les jobs en `error` ne sont **PAS** réessayés automatiquement. Pour les relancer :

```bash
node scripts/db-query.js "
  UPDATE publish_jobs
  SET status = 'scheduled',
      error_msg = NULL,
      finished_at = NULL,
      started_at = NULL
  WHERE platform = 'instagram'
    AND status = 'error'
    AND scheduled_at >= NOW() - INTERVAL '7 days'
  RETURNING id, status;
"
```

Si volume > 20 jobs, étaler avec un re-stagger (1 publi toutes les 50 min pour rester sous le quota Meta de ~25/24h).

## Checklist de validation post-mise à jour

- [ ] Le nouveau token testé sur `https://graph.instagram.com/v19.0/me` retourne `lunalive_tv`
- [ ] Les 2 variables `INSTAGRAM_ACCESS_TOKEN` et `INSTAGRAM_PAGE_TOKEN` sur Render contiennent la même valeur IGAA
- [ ] Render a redéployé (Events → "Deploy live" récent)
- [ ] Les logs ne montrent plus `Cannot parse access token` après le redeploy
- [ ] `publish_jobs` reset → `status` passe progressivement en `uploading` puis `done`
- [ ] Apparition du nouveau Reel sur https://www.instagram.com/lunalive_tv/

## Rappels importants

- **Calendrier** : poser un rappel 50 jours après chaque mise à jour de token pour le refresh préventif
- **Ne JAMAIS utiliser Graph API Facebook** (`fb_exchange_token`, `/me/accounts`) pour ce système — c'est un système Instagram Login pur, ces endpoints retourneront toujours du vide ou des erreurs trompeuses
- **Le Facebook App ID `1245949437257239`** correspond à l'app **LunaClip** côté Meta — l'app sert aussi pour le bridge Instagram, mais pour générer un IGAA token c'est l'**Instagram App ID** (visible dans Use Cases → Instagram) qu'il faut utiliser
