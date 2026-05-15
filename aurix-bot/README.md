# Aurix Bot — TypeScript (LunaLive)

Bot Discord de gestion pour l'agence d'affiliation **Aurix**. Tourne 24/7 sur Render, branché sur la **Postgres LunaLive** (tables préfixées `aurix_`).

## Stack

- **Node 22 / TypeScript**
- **discord.js v14**
- **pg** (réutilise la `DATABASE_URL` de LunaLive)
- **Zod** pour la validation d'env
- **Dockerfile** type LunaLive bot/ pour Render

## Local dev

```bash
cp .env.example .env
# Remplir DISCORD_TOKEN, GUILD_ID, DATABASE_URL
npm install
npm run dev
```

`npm run migrate` applique les migrations SQL sans démarrer le bot. Le démarrage normal applique automatiquement les migrations idempotentes.

## Variables d'env

| Var | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot (Discord Developer Portal) |
| `DISCORD_APP_ID` | Application ID Aurix (`1504831336299626506`) |
| `GUILD_ID` | ID du serveur Discord (auto-détecté si bot dans 1 seul serveur) |
| `DATABASE_URL` | URL Postgres LunaLive |
| `TIMEZONE` | Fuseau pour le cutoff refill (défaut `Europe/Paris`) |

## Déploiement Render

Crée un nouveau service **Worker** (pas Web — pas besoin de port HTTP) :

- **Repository** : LunaLive
- **Root directory** : `aurix-bot`
- **Dockerfile path** : `aurix-bot/Dockerfile`
- **Docker context** : (racine du repo — `.`)
- **Plan** : Starter ($7/mo) ou plus selon trafic
- **Environment variables** : copier depuis `.env.example`

Ajoute dans `render.yaml` (à côté de `lunalive`) :

```yaml
  - type: worker
    name: aurix-bot
    env: docker
    dockerfilePath: aurix-bot/Dockerfile
    dockerContext: .
    plan: starter
    envVars:
      - key: DISCORD_TOKEN
        sync: false
      - key: DISCORD_APP_ID
        value: "1504831336299626506"
      - key: GUILD_ID
        value: "1504830966596763688"
      - key: DATABASE_URL
        sync: false      # à brancher sur la Postgres LunaLive
      - key: TIMEZONE
        value: Europe/Paris
```

> Les valeurs `sync: false` doivent être renseignées manuellement dans le dashboard Render.

## Tables Postgres créées

Préfixées `aurix_` pour cohabiter avec LunaLive :

- `aurix_kv` — config runtime (cutoff time, manager mention, IDs salons/rôles)
- `aurix_tickets` — tickets ouverts par streamer
- `aurix_refill_batches` — batches de demandes (open / locked / sent)
- `aurix_refill_requests` — demandes individuelles
- `aurix_user_accounts` — Telegram / email / pseudo joueur par user
- `aurix_migrations` — historique migrations

## Slash commands

| Commande | Qui | Où |
|---|---|---|
| `/setup-server` | Admin | Partout (idempotent) |
| `/refill` | Streamer | Son ticket uniquement |
| `/refill-cancel` | Streamer | Son ticket |
| `/refill-sent` | Staff | Partout |
| `/compte` | Tous | Partout |
| `/config show\|cutoff\|manager` | Admin | Partout |
| `/ping` | Tous | Partout |

## Flow refill

1. Streamer tape `/refill` dans son ticket.
2. **1ère fois** : modal demande l'email → sauvegardé dans `aurix_user_accounts`.
3. **Fois suivantes** : pas de modal, soumission directe avec l'email enregistré.
4. Confirmation **visible et permanente** dans le ticket avec fourchette de refill.
5. À l'heure de cutoff (défaut 14h00 Paris), le batch est verrouillé, le bot ping `Direction` + `Modérateur` dans `💬-staff-chat` avec la liste prête à copier-coller au manager.
6. Staff fait `/refill-sent` une fois envoyé → batch marqué "✅ Envoyé".

## Migration depuis la version Python

L'ancienne version Python (`d:/2k26/Aurix/discord-bot`) utilisait SQLite local. La DB n'est **pas** migrée vers Postgres — la nouvelle version repart de zéro côté données (tickets et user_accounts seront re-créés via les interactions normales).

Pour basculer :
1. Stoppe le bot Python (Ctrl+C).
2. Déploie ce bot sur Render.
3. Le bot va auto-détecter qu'il manque `initial_setup_done` en KV → relance `_do_setup` qui **retrouve** les rôles/salons existants par nom et les réutilise (idempotent).
