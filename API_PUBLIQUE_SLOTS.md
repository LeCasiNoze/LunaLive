# API Publique Slots - Documentation

## Vue d'ensemble

J'ai créé une route publique `/api/public/slots` qui permet d'accéder aux slots depuis un projet extérieur sans accès direct à la base de données.

## Endpoints disponibles

### 1. GET `/api/public/slots/search`

Recherche des slots avec suggestions.

**Paramètres :**
- `q` (string) : Terme de recherche
- `limit` (number) : Nombre de résultats (max 20)

**Exemple :**
```bash
GET https://votre-domaine.com/api/public/slots/search?q=fruit&limit=10
```

**Réponse :**
```json
{
  "ok": true,
  "items": [
    {
      "name": "Fruit Party",
      "provider": "pragmatic",
      "imageUrl": "https://example.com/fruit-party.jpg"
    },
    {
      "name": "Fruit Million",
      "provider": "relax",
      "imageUrl": "https://example.com/fruit-million.jpg"
    }
  ]
}
```

### 2. POST `/api/public/slots/call`

Simule une commande `!call [machine]` et retourne le slot trouvé.

**Body :**
```json
{
  "streamerId": 123,
  "userId": 456,
  "username": "user123",
  "command": "!call fruit party"
}
```

**Réponse succès :**
```json
{
  "ok": true,
  "slot": {
    "name": "Fruit Party",
    "provider": "pragmatic",
    "imageUrl": "https://example.com/fruit-party.jpg"
  },
  "message": "Machine trouvée: Fruit Party (pragmatic)",
  "originalQuery": "fruit party"
}
```

**Réponse erreur :**
```json
{
  "ok": false,
  "error": "slot_not_found",
  "message": "Machine introuvable. Essayez un nom plus précis.",
  "query": "machine inconnue"
}
```

### 3. POST `/api/public/slots/resolve`

Résout un nom de slot directement (sans validation de commande).

**Body :**
```json
{
  "query": "fruit party"
}
```

**Réponse :**
```json
{
  "ok": true,
  "slot": {
    "name": "Fruit Party",
    "provider": "pragmatic",
    "imageUrl": "https://example.com/fruit-party.jpg"
  },
  "message": "Machine trouvée: Fruit Party (pragmatic)"
}
```

## Exemple d'utilisation depuis un projet extérieur

### JavaScript/Node.js

```javascript
// Fonction pour rechercher une machine
async function searchMachine(query, limit = 10) {
  const response = await fetch(`https://votre-domaine.com/api/public/slots/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  const data = await response.json();
  
  if (data.ok) {
    return data.items;
  } else {
    throw new Error(data.error);
  }
}

// Fonction pour simuler !call
async function callMachine(streamerId, userId, username, command) {
  const response = await fetch('https://votre-domaine.com/api/public/slots/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      streamerId,
      userId,
      username,
      command
    })
  });
  
  const data = await response.json();
  
  if (data.ok) {
    console.log(`✅ ${data.message}`);
    return data.slot;
  } else {
    console.error(`❌ ${data.message}`);
    return null;
  }
}

// Exemple d'utilisation
async function main() {
  // Rechercher des machines
  const machines = await searchMachine('fruit');
  console.log('Machines trouvées:', machines);
  
  // Simuler un call
  const slot = await callMachine(1, 123, 'user123', '!call fruit party');
  if (slot) {
    console.log('Machine appelée:', slot.name);
  }
}

main().catch(console.error);
```

### Python

```python
import requests
import json

BASE_URL = "https://votre-domaine.com/api/public/slots"

def search_machine(query, limit=10):
    response = requests.get(f"{BASE_URL}/search", params={"q": query, "limit": limit})
    data = response.json()
    
    if data.get("ok"):
        return data["items"]
    else:
        raise Exception(data.get("error", "Unknown error"))

def call_machine(streamer_id, user_id, username, command):
    payload = {
        "streamerId": streamer_id,
        "userId": user_id,
        "username": username,
        "command": command
    }
    
    response = requests.post(f"{BASE_URL}/call", json=payload)
    data = response.json()
    
    if data.get("ok"):
        print(f"✅ {data['message']}")
        return data["slot"]
    else:
        print(f"❌ {data['message']}")
        return None

# Exemple d'utilisation
if __name__ == "__main__":
    # Rechercher des machines
    machines = search_machine("fruit")
    print("Machines trouvées:", json.dumps(machines, indent=2))
    
    # Simuler un call
    slot = call_machine(1, 123, "user123", "!call fruit party")
    if slot:
        print("Machine appelée:", slot["name"])
```

## Sécurité

- **Pas d'accès direct à la DB** : L'API sert de proxy sécurisé
- **CORS activé** : Permet les requêtes depuis d'autres domaines
- **Validation des entrées** : Protection contre les injections
- **Pas d'authentification requise** : API publique pour les slots

## Erreurs possibles

- `missing_parameters` : Paramètres manquants dans la requête
- `invalid_command` : Format de commande invalide
- `slot_not_found` : Machine non trouvée
- `server_error` : Erreur interne du serveur

## Intégration complète

1. **Configurer l'URL de base** de votre API LunaLive
2. **Utiliser les endpoints** selon vos besoins
3. **Gérer les réponses** d'erreur appropriées
4. **Mettre en cache** les résultats si nécessaire pour la performance

Cette API publique vous permet d'utiliser tout le système de recherche et résolution de slots de LunaLive depuis n'importe quel projet externe, sans avoir à gérer vous-même la base de données ou la logique de matching flou.
