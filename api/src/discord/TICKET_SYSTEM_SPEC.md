# Système de Tickets — Fabiozsis Discord
# Serveur: 1237715340386107472

---

## Vue d'ensemble

Deux types de tickets accessibles via un panel (bouton épinglé dans un salon dédié) :

1. **Offre** — réclamation bonus casino (Razed + futures offres)
2. **Autre problème** — support général

---

## Flux Ticket Offre

### Étape 1 — Sélection de l'offre

Quand l'utilisateur clique "Offre", le bot affiche un menu de sélection :
- `💎 Offre Razed`
- *(autres offres à ajouter à terme)*

### Étape 2 — Collecte d'informations (dans l'ordre, un message à la fois)

Le bot demande via des messages successifs dans un thread ou DM éphémère :
1. **Adresse email** utilisée pour créer le compte Razed
2. **Pseudo** du compte Razed
3. **Screenshot de la transaction** (dépôt visible avec montant)
4. **Wallet / adresse de remboursement** (pour versement si validé)

### Étape 3 — Création du channel ticket

Le bot crée un channel privé dans la catégorie Tickets :
- Accès : utilisateur + bot + rôles modérateurs configurés
- Nom : `offre-razed-{username}`

### Étape 4 — Message récapitulatif automatique

```
📋 Réclamation offre Razed
━━━━━━━━━━━━━━━━━━━━━━

@Modérateurs

**{user} [{adresse email}]**
a réalisé son dépôt sur Razed, ci-joint la preuve.

📎 [Screen joint]

---

@{user} votre demande a bien été transmise et sera traitée dans les **48h maximum** 
avec le délai de vérification obligatoire de double compte.
Je vous recontacterai automatiquement lors de la validation de votre dossier.
```

Suivi de deux boutons (visibles uniquement par les modérateurs) :
- ✅ **Valider**
- ❌ **Refuser** → ouvre un modal avec champ "Motif du refus"

### Étape 5 — Réponse modérateur

**Si Validé :**
```
✅ Dossier validé par @{moderateur}
Le remboursement sera effectué sur le wallet : {wallet}
```

**Si Refusé :**
```
❌ Dossier refusé par @{moderateur}
Motif : {motif}
```

### Étape 6 — Clôture automatique

- **24h après la décision** (validé ou refusé) → le bot envoie un message de clôture et supprime le channel
- Transcript complet archivé en base de données avant suppression

---

## Flux Ticket Autre Problème

### Phase 1 (actuelle — support manuel)

- Création d'un channel privé : `ticket-{username}`
- Accès : utilisateur + bot + 3 modérateurs désignés (IDs à configurer)
- Le bot envoie un message d'accueil et laisse la main aux modérateurs

### Phase 2 (future — assistance automatique)

- Le bot gère les questions fréquentes automatiquement
- KB (base de connaissances) avec réponses types
- Escalade vers modérateur si non résolu

---

## Données stockées en base (table `discord_tickets`)

| Champ | Description |
|-------|-------------|
| `id` | UUID |
| `guild_id` | ID du serveur Discord |
| `channel_id` | ID du channel ticket |
| `user_id` | ID Discord de l'utilisateur |
| `type` | `offer` ou `support` |
| `offer_type` | `razed` / futures offres |
| `email` | Adresse email du compte |
| `pseudo` | Pseudo sur la plateforme |
| `amount` | Montant déposé (saisi ou extrait du screen) |
| `wallet` | Adresse wallet pour remboursement |
| `status` | `pending` / `approved` / `rejected` |
| `reject_reason` | Motif de refus (si applicable) |
| `moderator_id` | ID Discord du modérateur ayant décidé |
| `created_at` | Date de création |
| `closed_at` | Date de clôture |
| `transcript` | JSON du contenu du channel (pour archive) |

### Utilisation future : anti-double-compte

Les champs `email` + `pseudo` permettront une vérification automatique :
- Détection si un email ou pseudo a déjà été utilisé dans un ticket précédent
- Alerte modérateur si doublon détecté

---

## Configuration modérateurs

IDs des 3 modérateurs à ajouter dans les tickets support (à renseigner) :
```
MOD_1_ID = ""
MOD_2_ID = ""
MOD_3_ID = ""
```

Rôle modérateur pour ping dans tickets offre :
```
MOD_ROLE_ID = "1237718032768438312"  // 🔪︱Modérateur
```

---

## Permissions des boutons

Les boutons Valider / Refuser vérifient que l'auteur de l'interaction possède :
- Le rôle `🔪︱Modérateur` (ID: 1237718032768438312)
- OU le rôle `👑︱Le Chef` (ID: 1469716646624104459)

---

## Channel du panel ticket

À créer : `〈🎫〉｜OUVRIR-UN-TICKET` (dans une catégorie dédiée)
- Lecture seule pour @everyone
- Message épinglé avec embed + bouton "Créer un ticket"

---

## TODO / À confirmer

- [ ] IDs des 3 modérateurs pour tickets support
- [ ] Liste complète des offres au lancement (Razed uniquement ?)
- [ ] Montant minimum de dépôt à vérifier ?
- [ ] Faut-il un cooldown entre deux tickets offre pour le même user ?
- [ ] Archivage : stocker le transcript en DB ou envoyer dans un channel logs ?
- [ ] Phase 2 assistance auto : base de connaissances à définir
