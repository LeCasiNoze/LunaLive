# Piano Play — Design Spec

Spec d'export du projet Lovable importe le `2026-05-21`.
Sert de reference visuelle / Figma-like pour iterer ou reconstruire ailleurs.

## Identite

- **Slug** : `piano`
- **URL LunaLive** : `/piano`
- **Theme** : dark navy + neon flash, immersif gaming
- **Stack origine** : Lovable + TanStack Router + Tailwind + shadcn/ui + framer-motion

## Palette (extrait des sources)

| Token | Hex | Usage |
|---|---|---|
| `bg-deep` | `#09153A` | fond hero + theme-color meta |
| `bg-dark` | `#0A0A0A` | sections sombres |
| `accent-blue` | `#1A1F71` | Visa logo / boutons secondaires |
| `accent-flash` | `#FA375F` | CTA primary, urgency |
| `text-mute` | `#5F6368` | textes secondaires |
| `crypto-btc` | `#F7931A` | icone BTC |
| `crypto-eth` | `#627EEA` | icone ETH |
| `payment-mc-red` | `#EB001B` | Mastercard |
| `payment-mc-orange` | `#FF5F00` | Mastercard center |
| `payment-mc-yellow` | `#F79E1B` | Mastercard right |

## Structure du LandingPage

`src/lovable-imports/piano/pages/Piano.tsx` (261 lignes, lazy via `PianoLandingPage`)

1. **Header** — logo Celsius + bouton login modal
2. **Hero** — visuel piano + headline "Acces exclusif via tes streamers"
3. **TrustRow** — 4 avatars streamers (rotation)
4. **SignupCard** — formulaire inline (email + birthdate + CGU)
5. **HowItWorks** — 3 etapes
6. **PaymentIcons** — Visa / Mastercard / ApplePay / GooglePay / BTC / ETH / LTC / XRP
7. **StickyMobileCTA** — bouton fixe bas

## Components inventaire (Lovable namespace)

- `components/landing/SignupModal.tsx` — modal d'inscription
- `components/landing/LoginModal.tsx` — modal de connexion
- `components/landing/HowItWorks.tsx` — 3 etapes process
- `components/landing/TrustRow.tsx` — bandeau streamers
- `components/landing/StickyMobileCTA.tsx` — CTA sticky bottom
- `components/landing/SignupCard.tsx` — formulaire central
- `components/landing/PaymentIcons.tsx` — 8 icones SVG inline
- `components/landing/BirthdateInput.tsx` — input date custom
- `components/ui/*` — shadcn/ui complet (button, accordion, dialog, etc.)

## Assets

| Fichier | Usage |
|---|---|
| `assets/playme-hero.png` | image principale piano |
| `assets/playme-hero-cropped.png` | version croppee |
| `assets/playme-reasons.png` | section raisons |
| `assets/piano-hero.jpg` | alt hero |
| `assets/piano-hero-landing.jpg` | alt landing |
| `assets/guitar.webp` | accessoire |
| `assets/celsius-logo.png` | logo brand |
| `assets/celsius-logo-white.png` | version dark |
| `assets/streamer-avatar.png` (x4) | rotation TrustRow |

## Comment iterer

- Pour modifier sans casser : edite directement les fichiers dans
  `web/src/lovable-imports/piano/` (subdir isolee, Tailwind scoped).
- Pour reimporter depuis Lovable apres modif : `bash scripts/import-lovable.sh
  "D:/Remix of Piano Play Landing.zip" piano` ecrasera la sous-arbo.
- Le wrapper `web/src/pages/PianoLandingPage.tsx` ne doit pas etre touche.
