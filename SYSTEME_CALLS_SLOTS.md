# Système de Calls et Slots - Documentation Technique

## Vue d'ensemble

Ce document décrit le fonctionnement du système de calls et l'accès aux slots dans LunaLive, pour pouvoir le réutiliser dans un autre projet.

## Architecture du système de Calls

### 1. Commande `!call [nom de la machine]`

Le système fonctionne avec les commandes suivantes :
- `!call [machine]` - Ajoute un call standard
- `!pcall [machine]` - Pay call (prioritaire, nécessite niveau 3/sub/premium)
- `!rcall [machine]` - Random call (non implémenté)
- `!listec` - Liste les calls en file
- `!resetc` - Vide la file (modo uniquement)

### 2. Flux de traitement d'un call

#### Fichier principal : `api/src/calls/commands.ts`

1. **Parsing de la commande** (`parseBangCommand`)
2. **Vérification des permissions** et limites
3. **Résolution du slot** (`resolveSlot`)
4. **Ajout en base** (`addCall`)
5. **Notification** au chat et aux clients

### 3. Résolution des machines (slots)

#### Fichier : `api/src/calls/catalog.ts`

La fonction `resolveSlot(pool, input)` effectue :

1. **Normalisation** du texte d'entrée
2. **Recherche exacte** par `name_key` dans `slots_catalog`
3. **Recherche floue** si pas de match exact
4. **Retour** du meilleur résultat

```typescript
// Exemple d'utilisation
const resolved = await resolveSlot(pool, "fruit party");
// Retourne : { name: "Fruit Party", provider: "pragmatic", imageUrl: "..." }
```

## Schéma de la base de données

### Tables principales

#### `slots_catalog`
```sql
CREATE TABLE slots_catalog (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,  -- version normalisée pour recherche
  provider TEXT,
  provider_norm TEXT,             -- provider normalisé
  image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `calls_queue`
```sql
CREATE TABLE calls_queue (
  id BIGSERIAL PRIMARY KEY,
  streamer_id BIGINT NOT NULL,
  slot_name TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  provider TEXT,
  user_id BIGINT NOT NULL,
  username TEXT NOT NULL,
  pos BIGINT NOT NULL,
  bet NUMERIC,                    -- pour système de hunt
  pay NUMERIC,                    -- pour système de hunt
  bounty BOOLEAN,
  is_bonus BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(streamer_id, slot_key)   -- évite doublons
);
```

#### `calls_settings`
```sql
CREATE TABLE calls_settings (
  streamer_id BIGINT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  show_cmd_in_chat BOOLEAN NOT NULL DEFAULT FALSE,
  show_accept_public BOOLEAN NOT NULL DEFAULT TRUE,
  allow_listec BOOLEAN NOT NULL DEFAULT TRUE,
  listec_max INT NOT NULL DEFAULT 10,
  per_user_limit INT NOT NULL DEFAULT 2,
  sync_hunt BOOLEAN NOT NULL DEFAULT FALSE
);
```

## Fonctions clés à réutiliser

### 1. Accès aux slots

```typescript
import { searchSlots, resolveSlot } from './api/src/calls/catalog.js';

// Rechercher des slots (suggestions)
const slots = await searchSlots(pool, "fruit", 10);
// Retourne : [{ name, provider, imageUrl }, ...]

// Résoudre un slot spécifique
const slot = await resolveSlot(pool, "fruit party");
// Retourne le meilleur match ou null
```

### 2. Gestion des calls

```typescript
import { 
  addCall, 
  listCalls, 
  deleteCallById,
  setCallBet,
  setCallPay 
} from './api/src/calls/queue.js';

// Ajouter un call
const result = await addCall(pool, streamerId, userId, username, slotName, provider);
// Retourne : { ok: true, item: CallItem, position: number } | { ok: false, error: string }

// Lister les calls
const calls = await listCalls(pool, streamerId, 50, 0);
// Retourne : CallItem[]
```

### 3. Normalisation du texte

```typescript
import { normText, keyText } from './api/src/calls/normalize.js';

const normalized = normText("  Fruit Party  "); // "fruit party"
const key = keyText("Fruit Party");           // "fruit_party"
```

## Processus de recherche de slot

1. **Input utilisateur** : `!call fruit party`
2. **Normalisation** : `normText()` → `"fruit party"`
3. **Key generation** : `keyText()` → `"fruit_party"`
4. **Recherche exacte** : `WHERE name_key = 'fruit_party'`
5. **Si échec** : recherche floue avec scoring
6. **Meilleur match** retourné

## Configuration et permissions

### Limites par utilisateur
- Par défaut : 2 calls par utilisateur
- Mods/admins : pas de limite
- Talent système : bonus selon niveau

### Bans et restrictions
- Bans par utilisateur (`calls_bans`)
- Bans par slot (`calls_bans`)
- Bans par provider (`calls_bans`)
- Policy provider (`allow_all` vs `allow_only`)

## Intégration dans un autre projet

### Étapes nécessaires

1. **Copier les tables** de la base de données
2. **Importer les modules** essentiels :
   - `catalog.ts` (recherche slots)
   - `queue.ts` (gestion calls)
   - `normalize.ts` (normalisation)
   - `provider_aliases.ts` (aliases providers)

3. **Adapter la connexion** à votre base de données

4. **Implémenter le handler** de commandes

### Exemple minimal

```typescript
import { Pool } from 'pg';
import { resolveSlot } from './catalog.js';
import { addCall } from './queue.js';

async function handleCallCommand(pool: Pool, streamerId: number, userId: number, username: string, machineName: string) {
  // 1. Résoudre le slot
  const slot = await resolveSlot(pool, machineName);
  if (!slot) {
    return { success: false, error: "Machine introuvable" };
  }

  // 2. Ajouter le call
  const result = await addCall(pool, streamerId, userId, username, slot.name, slot.provider);
  
  return result;
}
```

## API REST

### Endpoints disponibles

#### `GET /api/slots/search?q=...&limit=...`
Recherche de slots avec suggestions

#### `POST /api/slots/update` (admin)
Mise à jour du catalogue de slots

## Notes importantes

1. **Performance** : Utilisation de `name_key` pour recherche exacte rapide
2. **Déduplication** : Contrainte UNIQUE sur `(streamer_id, slot_key)`
3. **Transactions** : Utilisation de locks advisory pour cohérence
4. **Extensibilité** : Support de bet/pay/bounty pour système de hunt
5. **Normalisation** : Système robuste de gestion de casse/accents

## Fichiers sources clés

- `api/src/calls/catalog.ts` - Recherche et résolution de slots
- `api/src/calls/queue.ts` - Gestion de la file de calls
- `api/src/calls/commands.ts` - Handler des commandes
- `api/src/calls/normalize.ts` - Normalisation du texte
- `api/src/routes/slots.ts` - API REST pour slots
