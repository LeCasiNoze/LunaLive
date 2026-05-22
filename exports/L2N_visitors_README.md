# L2N - Visiteurs uniques code affi VkRHhCexYZ (12-21 mai 2026)

Ce CSV liste les **51 visiteurs uniques** ayant cliqué sur le CTA "Jouer
maintenant" de la landing L2N (slug `uhyeqttnllm4`) sur LunaLive entre
le 12 et le 21 mai 2026.

Un bug technique (CTA dans iframe sans target=_top) a empeche
l'attribution correcte de ces visiteurs au code `VkRHhCexYZ` cote
Celsius. Ce fichier sert a faciliter la re-attribution manuelle.

## Colonnes

| Colonne | Description |
|---|---|
| `n` | Numero de ligne (1-51) |
| `ip_hash` | SHA256 sale de l'IP (RGPD-friendly, irreversible). Sert a prouver l'unicite cote LunaLive. Si tu m'envoies une IP brute, je peux confirmer si elle correspond a un de ces hashes. |
| `first_click_utc` | Premier clic sur le CTA, heure UTC |
| `last_click_utc` | Dernier clic sur le CTA, heure UTC |
| `first_click_paris` | Idem en heure de Paris (CET/CEST) |
| `last_click_paris` | Idem |
| `search_window_start_paris` | **Debut de la fenetre de recherche** suggeree dans Celsius DB (premier clic - 5 min) |
| `search_window_end_paris` | **Fin de la fenetre de recherche** (dernier clic + 30 min) |
| `clicks` | Nombre total de clics du visiteur sur le CTA |
| `device` | iPhone / Android / Windows / Mac / Other |
| `referrer` | URL de provenance (taap.it = link shortener Instagram bio, direct = clic depuis bio Insta ou app native) |
| `utm_source`/`medium`/`campaign` | UTM si presents (le plus souvent vides) |
| `user_agent` | User-Agent complet du navigateur (utile pour matcher precisement) |

## Comment l'utiliser cote Celsius

Pour chaque ligne du CSV, fais une requete dans ta DB du genre :

```sql
SELECT id, email, created_at, signup_ip, last_login_ip, user_agent
FROM users
WHERE created_at BETWEEN 'search_window_start_paris' AND 'search_window_end_paris'
  AND (
    user_agent = '<user_agent du CSV>'
    OR substring(user_agent FROM 'iPhone OS [^ ]+') = substring('<user_agent>' FROM 'iPhone OS [^ ]+')
  );
```

Les comptes qui matchent dans cette fenetre temporelle + meme device sont
tres probablement les joueurs venant de L2N.

## Cross-check IP (sans partager d'IP brute)

Si tu trouves des comptes "directs/sans source" dans une fenetre suspecte
et tu veux confirmer qu'ils viennent bien de L2N :

1. Envoie-moi en prive l'IP brute du compte (jamais publique)
2. Je sale + hashe avec notre AFFI_EVENTS_IP_SALT
3. Je compare aux `ip_hash` de ce CSV
4. Je te confirme "match avec visiteur n°X qui a clique le Y" ou "pas de match"

## Volume estime

- 51 visiteurs uniques, 177 clics
- ~92% iPhone (iOS 18.7 / Safari 26.x principalement)
- Pic : 18 mai (16 uniques), 19 mai (8), 20 mai (8)
- Source principale : taap.it (Instagram bio link)

## Heavy clickers (a regarder en priorite)

| Visiteur | Clics | Fenetre |
|---|---|---|
| n°38 (`505bc683...`) | 78 | 19 mai 18h20 → 20 mai 17h46 Paris |
| n°29 (`7bc21079...`) | 11 | 18 mai 22h17 → 19 mai 00h08 Paris |
| n°19 (`b7980bb9...`) | 8 | 18 mai 05h04 Paris |
| n°34 (`57326bd4...`) | 7 | 19 mai 17h26 Paris |
| n°23 (`16cdbd75...`) | 5 | 18 mai 09h03 Paris |

Ce sont probablement des joueurs qui ont vraiment tente de s'inscrire
(plusieurs allers-retours sur le CTA = forte intention).

---

Cordialement,
LunaLive
