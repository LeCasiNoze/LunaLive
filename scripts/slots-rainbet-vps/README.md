# Crawl Rainbet sur le VPS

Cloudflare bloque les IP de Render sur `services.rainbet.com` (403, même via
`curl`). Le crawl du catalogue des calls tourne donc sur le VPS OVH, avec le
même code que l'API.

Installé dans `/opt/lunalive-worker/slots-rainbet/` (utilisateur
`lunalive-worker`, `EnvironmentFile=/opt/lunalive-worker/.env` pour
`DATABASE_URL`) :

- `run.mjs` (ce dossier) + `package.json` (`"type": "module"`, dépendance `pg`)
- copies de `api/dist/calls/{updater,catalog,rainbet_fetcher,normalize,provider_aliases}.js`
- `lunalive-slots-rainbet.service` (oneshot) + `.timer` (5 min après le boot,
  puis toutes les 12 h)

Après une modification de ces modules côté API : `npm run build` dans `api/`,
recopier les 5 fichiers `.js` sur le VPS, puis
`sudo systemctl start lunalive-slots-rainbet.service`.

Logs : `journalctl -u lunalive-slots-rainbet.service`.
