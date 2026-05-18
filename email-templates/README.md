# Email templates VIP — LunaLive / Celsius Casino

## Fichiers

- `vip-welcome.html` — email de bienvenue envoyé aux leads VIP capturés via les
  pages affi (popup VIP avec capture email).

## Usage manuel (pour l'instant)

### Méthode 1 — Copy/paste dans Gmail (le plus simple)

1. Ouvre `vip-welcome.html` dans **Chrome / Edge** (double-clic sur le fichier).
2. **Ctrl+A** pour tout sélectionner.
3. **Ctrl+C** pour copier.
4. Dans Gmail → Compose → colle dans le corps. Le formatage HTML est conservé.
5. Saisis le mail du lead VIP dans le destinataire.
6. Objet suggéré :
   - `👑 Bienvenue au Club VIP Celsius Casino`
   - ou `Votre accès VIP est activé — voici la suite`
7. Envoie.

### Méthode 2 — Extension Chrome HTML compose

Pour un workflow plus rapide quand tu envoies à plusieurs leads :

- Installe **HTML Inserter for Gmail** (gratuit) ou **GMass** (gratuit jusqu'à 50/j).
- Tu peux directement coller le HTML sans passer par le rendu Chrome.

## Liste actuelle des leads (à compléter à la main)

Récupère la liste via :

```bash
node scripts/db-query.js "SELECT email, created_at, slug FROM affi_vip_leads ORDER BY created_at DESC"
```

## Automatisation (étape suivante)

Quand tu veux passer en auto-send, voici la stack recommandée :

### Stack recommandée : Resend + React Email

- **[Resend](https://resend.com)** — service d'envoi moderne. Free tier
  100 emails/jour, 3000/mois. Réputation deliverability excellente (utilisé par
  Vercel, Linear). DNS records simples.
- **[React Email](https://react.email)** — librairie React pour écrire les
  templates email comme des composants React. Rendu en HTML email-safe. Mêmes
  patterns que ce qu'on fait déjà dans `web/`.

### Workflow auto-send

1. Côté API (`api/src/routes/affi-vip-leads.ts`) : après le `INSERT INTO
   affi_vip_leads`, déclencher l'envoi du mail via Resend.
2. Migrer le template HTML actuel en composant React Email (5-10 minutes).
3. DNS : ajouter les records SPF + DKIM pour `lunalive.win` ou
   `celsius-casino.com` (selon le `from:` choisi).

### Stack alternative

- **MJML + Nodemailer + SMTP** (Gmail / SendGrid) — plus DIY, gratuit, mais
  reputation harder.
- **Postmark** — payant mais reputation top.
- **Mailgun / SendGrid** — équivalents Resend, plus complexes pour setup DNS.

## Notes design

- Dark theme #0a0908 background, accents or #FFD700 / #FFB930.
- Layout table-based (compat Outlook / Gmail).
- CSS inline (les classes sont fallback uniquement).
- Mobile responsive via media query (max-width 600px).
- Preheader caché en début pour preview inbox.
- Lien CTA Telegram : `https://t.me/+33782484573` (deep link)
- Wager x1 / Boost dépôt / Cashback / VIP Transfer = arguments uniques Celsius.
