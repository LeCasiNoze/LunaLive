#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# import-lovable.sh — Importe un projet Lovable (.zip) dans LunaLive en 1 cmd.
#
# Usage :
#   bash scripts/import-lovable.sh <zip-path> <slug>
#
# Exemples :
#   bash scripts/import-lovable.sh "D:/CYCLOPE LANDING PAGE.zip" cyclope
#   bash scripts/import-lovable.sh "D:/Remix of Piano Play Landing.zip" piano
#
# Ce que ca fait :
#   1. Decompresse le zip dans /tmp/<slug>-import/
#   2. Cree web/src/lovable-imports/<slug>/ avec components/assets/lib/pages
#   3. Detecte le routing (React Router OU TanStack Router) et adapte
#   4. Rescope tous les imports `@/...` -> `@/<slug>/...`
#   5. Cree web/src/pages/<Slug>LandingPage.tsx (wrapper)
#   6. Imprime les snippets a coller dans App.tsx (route + lazy + standalone)
#
# Ce qui reste a la main :
#   - Ajouter la route dans web/src/App.tsx (snippet imprime a la fin)
#   - Lancer `npx tsc --noEmit` pour verifier
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ZIP="${1:-}"
SLUG="${2:-}"

if [[ -z "$ZIP" || -z "$SLUG" ]]; then
  echo "Usage: bash scripts/import-lovable.sh <zip-path> <slug>"
  exit 1
fi

if [[ ! -f "$ZIP" ]]; then
  echo "Zip introuvable : $ZIP"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="/tmp/${SLUG}-import"
DEST="$ROOT/web/src/lovable-imports/$SLUG"

echo "==> Decompression $ZIP -> $TMP"
rm -rf "$TMP"
mkdir -p "$TMP"
unzip -q "$ZIP" -d "$TMP"

echo "==> Creation $DEST"
mkdir -p "$DEST/components" "$DEST/assets" "$DEST/lib" "$DEST/hooks" "$DEST/pages"

# Copy components / ui / assets / lib / hooks
[[ -d "$TMP/src/components" ]] && cp -r "$TMP/src/components/." "$DEST/components/"
[[ -d "$TMP/src/assets" ]] && cp -r "$TMP/src/assets/." "$DEST/assets/"
[[ -d "$TMP/src/lib" ]] && cp -r "$TMP/src/lib/." "$DEST/lib/"
[[ -d "$TMP/src/hooks" ]] && cp -r "$TMP/src/hooks/." "$DEST/hooks/"

# Pages : React Router (src/pages/) OR TanStack Router (src/routes/)
PAGE_FILE=""
if [[ -d "$TMP/src/pages" ]]; then
  # Take the first non-NotFound page
  for f in "$TMP/src/pages"/*.tsx; do
    name="$(basename "$f")"
    if [[ "$name" != "NotFound.tsx" && "$name" != "Index.tsx" ]]; then
      cp "$f" "$DEST/pages/$name"
      PAGE_FILE="$DEST/pages/$name"
      break
    fi
  done
  # Fallback Index.tsx
  if [[ -z "$PAGE_FILE" && -f "$TMP/src/pages/Index.tsx" ]]; then
    cp "$TMP/src/pages/Index.tsx" "$DEST/pages/Index.tsx"
    PAGE_FILE="$DEST/pages/Index.tsx"
  fi
elif [[ -d "$TMP/src/routes" ]]; then
  # TanStack — adapt to plain component
  cp "$TMP/src/routes/index.tsx" "$DEST/pages/$(echo "$SLUG" | sed 's/.*/\u&/').tsx"
  PAGE_FILE="$DEST/pages/$(echo "$SLUG" | sed 's/.*/\u&/').tsx"
  # Strip TanStack route
  sed -i '/from "@tanstack\/react-router"/d' "$PAGE_FILE"
  python3 - <<PY
import re, pathlib
p = pathlib.Path("$PAGE_FILE")
s = p.read_text(encoding="utf-8")
s = re.sub(r"export const Route = createFileRoute\([^)]*\)\(\{[\s\S]*?\}\);\s*\n", "", s)
if "export default" not in s:
    # Try to find the component name
    m = re.search(r"function (\w+)\s*\(", s)
    if m:
        s += f"\nexport default {m.group(1)};\n"
p.write_text(s, encoding="utf-8")
PY
fi

# Rescope all `@/...` imports to `@/<slug>/...`
echo "==> Rescope @/ imports -> @/$SLUG/"
find "$DEST" -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -exec sed -i "s|from \"@/|from \"@/$SLUG/|g" {} \;

# Create the wrapper page
CLASS_NAME="$(echo "$SLUG" | sed 's/.*/\u&/')LandingPage"
WRAPPER="$ROOT/web/src/pages/$CLASS_NAME.tsx"
PAGE_BASENAME="$(basename "$PAGE_FILE" .tsx)"
cat > "$WRAPPER" <<TSX
// Page wrapper pour le projet Lovable $SLUG.
// Genere par scripts/import-lovable.sh — ne pas modifier le sous-projet
// dans web/src/lovable-imports/$SLUG/.
import "../lovable-imports/lovable.css";
import Inner from "../lovable-imports/$SLUG/pages/$PAGE_BASENAME";

export default function $CLASS_NAME() {
  return <Inner />;
}
TSX

echo ""
echo "==> Fait. Snippet a ajouter dans web/src/App.tsx :"
echo ""
echo "  const $CLASS_NAME = React.lazy(() => import(\"./pages/$CLASS_NAME\"));"
echo ""
echo "  // Dans le tableau standalone (isStandaloneReferral) :"
echo "  location.pathname.startsWith(\"/$SLUG\")"
echo ""
echo "  // Dans <Routes> :"
echo "  <Route path=\"/$SLUG\" element={"
echo "    <React.Suspense fallback={<LoadingFallback />}>"
echo "      <$CLASS_NAME />"
echo "    </React.Suspense>"
echo "  } />"
echo ""
echo "Puis : cd web && npx tsc --noEmit"
