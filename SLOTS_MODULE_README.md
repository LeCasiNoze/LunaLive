# Module Slots - Code Réutilisable

Ce package contient les fonctions essentielles pour accéder aux slots depuis n'importe quel projet.

## Installation

Copier les fichiers suivants dans votre projet :

```
src/slots/
├── catalog.ts
├── normalize.ts
├── provider_aliases.ts
└── types.ts
```

## Utilisation rapide

```typescript
import { Pool } from 'pg';
import { searchSlots, resolveSlot } from './slots/catalog.js';

const pool = new Pool({ connectionString: 'postgres://...' });

// Rechercher des slots
async function searchMachines(query: string) {
  const results = await searchSlots(pool, query, 10);
  console.log(results);
  // Ex: [{ name: "Fruit Party", provider: "pragmatic", imageUrl: "..." }]
}

// Trouver une machine spécifique
async function findMachine(name: string) {
  const machine = await resolveSlot(pool, name);
  if (machine) {
    console.log(`Trouvé: ${machine.name} (${machine.provider})`);
  } else {
    console.log("Machine non trouvée");
  }
}
```

## API complète

### searchSlots(pool, query, limit)
Recherche des slots avec scoring flou.

### resolveSlot(pool, input)
Trouve le meilleur match pour une machine.

### upsertSlots(pool, items)
Insère/met à jour des slots en masse.

## Types

```typescript
export type SlotRow = {
  name: string;
  provider: string | null;
  imageUrl?: string | null;
};

export type ResolvedSlot = {
  name: string;
  provider: string | null;
  imageUrl: string | null;
};
```
