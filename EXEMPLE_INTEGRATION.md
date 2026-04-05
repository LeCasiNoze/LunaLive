# Exemple d'intégration du système de slots

Ce fichier montre comment intégrer le système de slots dans un nouveau projet.

## Étapes d'installation

1. **Installer les dépendances** :
```bash
npm install pg
npm install -D @types/node
```

2. **Copier les fichiers du module** :
```
votre-projet/
├── src/
│   └── slots/
│       ├── slots-types.ts
│       ├── slots-normalize.ts
│       ├── slots-provider-aliases.ts
│       └── slots-catalog.ts
```

3. **Créer la table dans votre base de données** :
```sql
CREATE TABLE slots_catalog (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  provider TEXT,
  provider_norm TEXT,
  image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX slots_catalog_name_key_idx ON slots_catalog(name_key);
CREATE INDEX slots_catalog_provider_norm_idx ON slots_catalog(provider_norm);
```

## Exemple d'utilisation

```typescript
import { Pool } from 'pg';
import { searchSlots, resolveSlot, upsertSlots } from './slots/slots-catalog.js';

// Configuration de la base de données
const pool = new Pool({
  connectionString: 'postgres://user:password@localhost:5432/your_db'
});

// Exemple 1: Rechercher des machines
async function searchExample() {
  const results = await searchSlots(pool, 'fruit', 10);
  console.log('Résultats de recherche:', results);
  // [
  //   { name: "Fruit Party", provider: "pragmatic", imageUrl: "..." },
  //   { name: "Fruit Million", provider: "relax", imageUrl: "..." }
  // ]
}

// Exemple 2: Trouver une machine spécifique
async function resolveExample() {
  const machine = await resolveSlot(pool, 'fruit party');
  if (machine) {
    console.log(`Machine trouvée: ${machine.name} (${machine.provider})`);
  } else {
    console.log('Machine non trouvée');
  }
}

// Exemple 3: Ajouter des machines en masse
async function upsertExample() {
  const newSlots = [
    { name: "Sweet Bonanza", provider: "Pragmatic Play", imageUrl: "https://example.com/bonanza.jpg" },
    { name: "Book of Dead", provider: "Play'n GO", imageUrl: "https://example.com/book.jpg" }
  ];
  
  const inserted = await upsertSlots(pool, newSlots);
  console.log(`${inserted.length} machines insérées/mises à jour`);
}

// Exemple 4: Système de call complet
async function handleCallCommand(streamerId: number, userId: number, username: string, machineName: string) {
  // 1. Résoudre la machine
  const slot = await resolveSlot(pool, machineName);
  if (!slot) {
    return { success: false, error: "Machine introuvable" };
  }

  // 2. Ajouter à votre système de file (à implémenter selon vos besoins)
  // const result = await addToYourQueue(streamerId, userId, username, slot);
  
  return { 
    success: true, 
    machine: slot,
    message: `Call ajouté: ${slot.name} (${slot.provider})` 
  };
}

// Démarrer les exemples
async function main() {
  try {
    await searchExample();
    await resolveExample();
    await upsertExample();
    
    // Test de commande call
    const callResult = await handleCallCommand(1, 123, 'user123', 'fruit party');
    console.log(callResult);
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await pool.end();
  }
}

main();
```

## API simplifiée

### Fonctions principales

- `searchSlots(pool, query, limit)` - Recherche avec scoring flou
- `resolveSlot(pool, input)` - Trouve le meilleur match
- `upsertSlots(pool, items)` - Insertion/mise à jour en masse

### Types

```typescript
interface SlotRow {
  name: string;
  provider: string | null;
  imageUrl?: string | null;
}

interface ResolvedSlot {
  name: string;
  provider: string | null;
  imageUrl: string | null;
}
```

## Adaptation pour votre projet

1. **Personnaliser les providers** : Éditez `slots-provider-aliases.ts`
2. **Adapter la normalisation** : Modifiez `slots-normalize.ts` si besoin
3. **Étendre les types** : Ajoutez des champs dans `slots-types.ts`
4. **Intégrer avec votre système** : Utilisez les fonctions dans vos handlers

## Performance

- Utilisation de `name_key` pour recherche exacte rapide
- Index sur les champs de recherche
- Déduplication automatique lors de l'insertion
- Scoring flou pour suggestions pertinentes
