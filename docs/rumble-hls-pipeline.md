# Pipeline HLS Rumble — Documentation complète

## Vue d'ensemble

```
Rumble API ──► Render (poller) ──► DB (hls_url) ──► Frontend (HLS.js) ──► 1a-1791.com CDN
```

---

## 1. Tables DB impliquées

| Table | Colonnes clés | Rôle |
|---|---|---|
| `rumble_accounts` | `username`, `api_key`, `rtmp_url`, `stream_key`, `assigned_to_streamer_id` | Compte Rumble associé à un streamer |
| `streamer_rumble_info` | `streamer_id`, `is_live`, `hls_url`, `video_url`, `title`, `viewers_count`, `updated_at` | Cache de l'état live, mis à jour toutes les 30s |
| `streamers` | `slug`, `id` | Profil streamer |

---

## 2. Poller (api/src/rumble_poller.ts)

- Tourne toutes les **30 secondes**
- Appelle `fetchLeCasiNozeRumbleInfo()` → `fetchRumbleLiveInfo(username, apiKey)`
- Met à jour `streamer_rumble_info` avec le résultat

---

## 3. Résolution de l'URL HLS (api/src/rumble.ts)

### Étape 1 — API Rumble
```
GET https://rumble.com/-livestream-api/get-data?key={api_key}
```
Retourne les livestreams actifs avec `id` (ex: `7638c4`), `is_live`, `title`, `watching_now`.

### Étape 2 — embedJS
```
GET https://rumble.com/embedJS/u3/?v=v{videoId}
```
Retourne `d.u.hls.url` = `https://rumble.com/live-hls-dvr/{id}/playlist.m3u8`

**Problème** : `live-hls-dvr` est protégé par Cloudflare WAF → 403 depuis le Worker CF.
**Le serveur Render (AWS IPs) n'est pas bloqué.**

### Étape 3 — Résolution redirect (resolveRedirectToCdn)
```
GET https://rumble.com/live-hls-dvr/{id}/playlist.m3u8  ← depuis Render, pas bloqué
```
Retourne directement un m3u8 **master playlist** avec des URLs absolues CDN :
```
#EXT-X-STREAM-INF:BANDWIDTH=6307840,...
https://1a-1791.com/live/{streamId}/live-hls/{sessionId}/chunklist_i0_DVR.m3u8
```

Le poller parse ce m3u8, prend la **plus haute qualité** (BANDWIDTH max), et stocke le chunklist URL en DB :
```
hls_url = https://1a-1791.com/live/{streamId}/live-hls/{sessionId}/chunklist_i0_DVR.m3u8
```

---

## 4. CDN 1a-1791.com

- CDN public de Rumble pour les streams live (et VODs)
- `Access-Control-Allow-Origin: *` → CORS libre, HLS.js charge directement
- Pas de Worker proxy nécessaire
- Les segments TS (`media_xxx_NNNN.ts`) sont relatifs au chunklist → résolus automatiquement par HLS.js

### Structure des URLs
```
https://1a-1791.com/live/{streamId}/live-hls/{sessionId}/chunklist_i0_DVR.m3u8
https://1a-1791.com/live/{streamId}/live-hls/{sessionId}/media_xxx_NNNN.ts
```

**`streamId`** : identifiant stable de la chaîne Rumble (ex: `gke17oc4`)
**`sessionId`** : identifiant de session live (ex: `pt2p-0wz3`) — change à chaque nouveau stream
**`_DVR`** : playlist DVR, contient TOUS les segments depuis le début du stream (peut atteindre 2000+ entrées)

---

## 5. Format du chunklist DVR

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:1          ← commence toujours à 1
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXTINF:1.999,
media_xxx_1.ts
#EXTINF:1.999,
media_xxx_2.ts
...
media_xxx_2243.ts                 ← live edge (dernier segment)
                                  ← PAS de #EXT-X-ENDLIST → stream live
```

**Pas de `#EXT-X-ENDLIST`** = stream live actif.
**Segments de ~2s**, **1.5MB chacun**.

---

## 6. Player frontend (web/src/components/RumbleStreamPlayer.tsx)

### Priorité de rendu
1. **HLS.js** si `Hls.isSupported()` (Chrome, Firefox, Brave, Edge)
2. **Native HLS** uniquement si `!Hls.isSupported()` (Safari, iOS)

> ⚠️ Ne jamais mettre native HLS en priorité : Chrome 130+ supporte HLS nativement mais
> ne sait pas chercher le live edge sur un DVR playlist → démarre à t=0 (des heures en arrière).

### Seek live edge obligatoire
Après `MANIFEST_PARSED`, forcer le seek :
```javascript
const livePos = (hls as any).liveSyncPosition;
if (livePos) video.currentTime = livePos;
else if (video.duration > 10) video.currentTime = video.duration - 4;
```
Re-vérification au premier `BUFFER_APPENDED` si décalage > 30s.

### Autoplay
`autoPlay muted` → le navigateur autorise l'autoplay muté.
Un bouton "🔇 Activer le son" apparaît en overlay jusqu'à ce que l'user clique.

### URL directe (pas de proxy Worker)
```javascript
function toProxiedHls(url: string): string {
  if (url.includes("1a-1791.com")) return url; // CORS *, pas de proxy
  return `${HLS_BASE}/hls?u=${encodeURIComponent(url)}`;
}
```

---

## 7. Admin endpoints (api/src/routes/admin_rumble.ts)

```
POST /admin/rumble/repoll    → Force re-poll immédiat + update DB (sans attendre 30s)
GET  /admin/rumble/status    → Retourne l'état en cache + infos compte
Header: x-admin-key: {ADMIN_KEY}
```

---

## 8. Linking compte Rumble ↔ Streamer

### Lier
```
POST /admin/rumble-accounts/:id/assign  { streamerId }
```
- Vérifie que le compte n'est pas déjà assigné
- Met `assigned_to_streamer_id` + `assigned_at`

### Délier
Mettre `assigned_to_streamer_id = NULL` sur l'ancienne entrée, assigner le nouveau compte.

### Effet immédiat
- La requête `/api/public/streamers/{slug}` re-join `rumble_accounts` à chaque call → les nouvelles `rtmpUrl` / `streamKey` sont visibles immédiatement dans le dashboard
- Le poller prend le nouveau `api_key` au prochain tick (max 30s)
- Le stream est détecté dès que la personne streame avec les nouvelles infos RTMP

---

## 9. Scalabilité

- **Le CDN `1a-1791.com` gère le trafic viewers** — Rumble paie pour ça
- **Notre serveur (Render)** ne fait que le poller 30s + servir l'URL → charge négligeable
- **Le Worker CF** n'est plus impliqué pour les streams Rumble (CDN direct)
- Centaines/milliers de viewers simultanés = aucun problème côté LunaLive

---

## 10. Problèmes connus et workarounds

| Problème | Cause | Solution |
|---|---|---|
| 403 sur `live-hls-dvr` via Worker | Cloudflare WAF bloque les Worker IPs | Résoudre le redirect depuis Render (AWS IPs non bloqués) |
| Chunklist `_DVR` démarre à t=0 | Playlist DVR avec 2000+ segments depuis t=0 | Seek forcé à `liveSyncPosition` après `MANIFEST_PARSED` |
| Chrome native HLS charge depuis t=0 | `canPlayType()` retourne "probably" sur Chrome 130+ | Toujours préférer HLS.js quand supporté |
| Stale `hls_url` après relinkage | Nouveau stream = nouveau `sessionId` | Admin peut forcer repoll via `POST /admin/rumble/repoll` |
| embedJS retourne `live-hls-dvr` | Normal pour les lives Rumble | Résolu en suivant le redirect depuis Render |
