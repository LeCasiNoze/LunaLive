# DLive Chat Reader

Module autonome pour lire le chat DLive en temps réel, extrait de LunaLive.

## Installation

```bash
cd scripts
npm install
```

## Usage

### CLI
```bash
# Avec un username immutable (dlive-xxxx)
node dlive-chat-reader.js dlive-abc123

# Avec un displayname/slug
node dlive-chat-reader.js somechannel
```

### Programmation
```javascript
const { DLiveChatReader } = require('./dlive-chat-reader.js');

const reader = new DLiveChatReader({
  username: 'dlive-abc123',
  onMessage: (msg) => {
    console.log(`Nouveau message: ${msg.displayname}: ${msg.content}`);
  }
});

reader.start().catch(console.error);

// Arrêter plus tard
// reader.stop();
```

## Format des messages

```javascript
{
  timestamp: "14:25:30",
  displayname: "SomeUser",
  username: "dlive-xyz789", 
  content: "Hello world!",
  restreamFrom: null, // ou "Twitch", "Kick", etc.
  raw: { ... } // payload brut DLive
}
```

## Variables d'environnement (optionnelles)

- `DLIVE_GRAPHQL_ENDPOINT`: Endpoint GraphQL DLive (default: https://graphigo.prd.dlive.tv/)
- `DLIVE_GRAPHIGOSTREAM_WS`: WebSocket DLive (default: wss://graphigostream.prd.dlive.tv)
- `DLIVE_BOT_USERNAME`: Username du bot à ignorer
- `DLIVE_BOT_DISPLAYNAME`: Displayname du bot à ignorer
