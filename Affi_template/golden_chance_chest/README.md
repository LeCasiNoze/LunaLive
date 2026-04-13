# Golden Chance Chest

Base locale preparee a partir du site `https://golden-chance-chest.lovable.app/` recupere le 2026-04-13.

## Contenu

- `source/bootstrap.html`
  HTML public brut recupere sur le site.
- `source/extracted-notes.md`
  Notes sur les assets, sections et liens detectes dans le bundle.
- `shared/landing-base.css`
  Base visuelle commune a toutes les variantes.
- `shared/landing-base.js`
  Petite logique commune: compteur live, sticky CTA, fallback asset manquant.
- `model_gold/`
- `model_ruby/`
- `model_emerald/`
- `model_sapphire/`

## Assets attendus dans chaque modele

Dans chaque dossier `model_*/assets/`, deposer:

- `background.jpg`
- `chest.png`

Les HTML pointent deja vers ces noms de fichiers.

## Logo texte editable

Le logo n'est plus une image PNG.
Il est remplace par du texte stylise dans chaque `index.html` via le bloc:

```html
<div class="brand-logo-text">Gueule <span>d'Ange</span></div>
```

Tu peux le modifier directement a cet endroit.

## Hypothese prise

Comme tu n'as pas encore donne la liste exacte des couleurs, j'ai prepare 4 variantes propres et faciles a renommer:

- `model_gold`
- `model_ruby`
- `model_emerald`
- `model_sapphire`

Si tu veux, je peux ensuite les brancher directement dans l'editor React et dans `web/public/affi_templates/`.
