# YouTube Notifications - LunaLive Bot

## 🎯 Objectif

Notification automatique des nouvelles publications YouTube (clips/shorts) dans un salon Discord dédié.

## 📋 Prérequis

### 1. Configuration (valeurs hardcodées)

Toutes les IDs Discord et YouTube sont déjà configurés dans le code :

- **Chaîne YouTube** : `UCyjZ_Zf1SAjWqKXxwMIKU1A` (LunaLive)
- **Salon Discord** : `1467142269122383883` (notifications clips)
- **Rôles Discord** : 
  - Global : `1468982992910155908`
  - YouTube : `1468983076141928479`
  - Instagram : `1468983120664723507` (préparé pour extensibilité)

### 2. Variable d'environnement optionnelle

```bash
# Optionnel : override la fréquence de polling (défaut: 3 minutes)
YOUTUBE_POLL_INTERVAL_MS=180000
```

### 3. Base de données

La migration sera appliquée automatiquement par le système de migrations LunaLive :

```
api/src/db/migrations/mig052_youtube_notifications.ts
```

Ou manuellement :
```sql
\i api/src/db/migrations/mig052_youtube_notifications.ts
```

### 4. API Discord

L'API LunaLive doit implémenter l'endpoint :
```
POST /internal/bot/discord/send
```

Avec le body :
```json
{
  "channelId": "1467142269122383883",
  "content": "message Discord ici"
}
```

## 🔧 Fonctionnement

### Détection

- **Flux RSS YouTube** : `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`
- **Polling** : toutes les 3 minutes (configurable)
- **Parsing** : extraction du title, url, description, publishedAt

### Anti-doublon

- **Table `youtube_notifications`** : stocke les video_id déjà notifiés
- **Persistance** : survit aux redémarrages du bot
- **Auto-nettoyage** : garde seulement les 1000 dernières entrées

### Notification Discord

Format du message envoyé :
```
<@&1468982992910155908> <@&1468983076141928479>

🎬 Nouveau clip LunaLive vient de sortir !
**🎰 Maw win seamen · Fabiozsis | LunaLive**
▶️ Regarder : <https://www.youtube.com/watch?v=VIDEO_ID>
📺 Retrouver le streamer : <https://lunalive.onrender.com/s/fabiozsis>
```

## 🚀 Démarrage

Le notifier démarre automatiquement si toutes les variables d'environnement sont présentes :

```bash
npm run dev
```

Logs de démarrage :
```
[bot] YouTube notifier started
[bot] youtube loaded last video_id dQw4w9WgXcQ
[bot] youtube notifier start { channelId: "UC...", pollIntervalMs: 180000 }
```

## 🐛 Debug

### Logs disponibles

- `[bot] youtube new video detected` : nouvelle vidéo trouvée
- `[bot] youtube notification sent successfully` : notification envoyée
- `[bot] youtube poll error` : erreur de polling

### Commandes de test

```sql
-- Vérifier les vidéos déjà notifiées
SELECT * FROM youtube_notifications ORDER BY created_at DESC LIMIT 10;

-- Réinitialiser l'état (pour tester)
DELETE FROM youtube_notifications WHERE video_id = 'VIDEO_ID';
```

## 🔒 Sécurité

- **Clé API** : utilisation de `BOT_INTERNAL_KEY` pour l'authentification
- **Validation** : vérification des IDs Discord avant envoi
- **Rate limiting** : fréquence de polling configurable

## 📈 Extensibilité

Le système est préparé pour ajouter d'autres plateformes :

- **Instagram** : `YOUTUBE_DISCORD_INSTAGRAM_ROLE_ID` (déjà défini)
- **TikTok** : structure similaire possible
- **Twitch** : extension du module notifications

## 🆘 Problèmes courants

### "YouTube notifier failed to start"
→ Le notifier démarre automatiquement, vérifiez les logs pour plus de détails

### "Failed to fetch YouTube RSS"
→ Vérifier la connectivité réseau et l'ID de chaîne (hardcodé : UCyjZ_Zf1SAjWqKXxwMIKU1A)

### "youtube notification failed"
→ Vérifier l'endpoint `/internal/bot/discord/send` dans l'API LunaLive

## 📝 TODO

- [x] Récupérer l'ID réel de la chaîne YouTube LunaLive (UCyjZ_Zf1SAjWqKXxwMIKU1A)
- [ ] Tester avec une vraie publication YouTube
- [ ] Ajouter des embeds Discord si souhaité
- [ ] Implémenter la plateforme Instagram
