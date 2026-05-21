# import-lovable.ps1 — Importe un projet Lovable (.zip) dans LunaLive
#
# Usage :
#   .\scripts\import-lovable.ps1 -Zip "D:\MON-PROJET.zip" -Slug monslug
#
# Equivalent PowerShell de scripts/import-lovable.sh (pour Windows sans bash).

param(
  [Parameter(Mandatory=$true)][string]$Zip,
  [Parameter(Mandatory=$true)][string]$Slug
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Zip)) { throw "Zip introuvable : $Zip" }

$Root = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
$Tmp  = Join-Path $env:TEMP "lovable-import-$Slug"
$Dest = Join-Path $Root "web\src\lovable-imports\$Slug"

Write-Host "==> Decompression $Zip -> $Tmp"
if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
Expand-Archive -Path $Zip -DestinationPath $Tmp -Force

Write-Host "==> Creation $Dest"
foreach ($sub in @("components","assets","lib","hooks","pages")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Dest $sub) | Out-Null
}

function Copy-IfExists($src, $dst) {
  if (Test-Path $src) {
    Copy-Item -Recurse -Force "$src\*" $dst
  }
}

Copy-IfExists (Join-Path $Tmp "src\components") (Join-Path $Dest "components")
Copy-IfExists (Join-Path $Tmp "src\assets")     (Join-Path $Dest "assets")
Copy-IfExists (Join-Path $Tmp "src\lib")        (Join-Path $Dest "lib")
Copy-IfExists (Join-Path $Tmp "src\hooks")      (Join-Path $Dest "hooks")

# Pages : src/pages/* (React Router) ou src/routes/index.tsx (TanStack)
$PageFile = $null
$PagesDir = Join-Path $Tmp "src\pages"
$RoutesDir = Join-Path $Tmp "src\routes"

if (Test-Path $PagesDir) {
  Get-ChildItem $PagesDir -Filter "*.tsx" | ForEach-Object {
    if ($_.Name -notin @("NotFound.tsx","Index.tsx")) {
      $target = Join-Path $Dest "pages\$($_.Name)"
      Copy-Item $_.FullName $target -Force
      if (-not $PageFile) { $PageFile = $target }
    }
  }
  if (-not $PageFile -and (Test-Path (Join-Path $PagesDir "Index.tsx"))) {
    $PageFile = Join-Path $Dest "pages\Index.tsx"
    Copy-Item (Join-Path $PagesDir "Index.tsx") $PageFile -Force
  }
} elseif (Test-Path (Join-Path $RoutesDir "index.tsx")) {
  $cap = $Slug.Substring(0,1).ToUpper() + $Slug.Substring(1)
  $PageFile = Join-Path $Dest "pages\$cap.tsx"
  Copy-Item (Join-Path $RoutesDir "index.tsx") $PageFile -Force

  # Strip TanStack route wrapping
  $content = Get-Content $PageFile -Raw -Encoding utf8
  $content = $content -replace '(?m)^\s*import\s+\{[^\}]*\}\s+from\s+"@tanstack/react-router";\s*\r?\n', ''
  $content = $content -replace '(?ms)export const Route = createFileRoute\([^)]*\)\(\{.*?\}\);\s*\r?\n', ''
  if ($content -notmatch 'export default') {
    if ($content -match 'function (\w+)\s*\(') {
      $content += "`nexport default $($Matches[1]);`n"
    }
  }
  Set-Content -Path $PageFile -Value $content -Encoding utf8
}

# Rescope @/ imports vers @/<slug>/
Write-Host "==> Rescope @/ imports -> @/$Slug/"
Get-ChildItem $Dest -Recurse -Include *.tsx,*.ts | ForEach-Object {
  $txt = Get-Content $_.FullName -Raw -Encoding utf8
  $txt = $txt -replace 'from "@/', "from `"@/$Slug/"
  Set-Content -Path $_.FullName -Value $txt -Encoding utf8
}

# Wrapper page LunaLive
$ClassName = ($Slug.Substring(0,1).ToUpper() + $Slug.Substring(1)) + "LandingPage"
$Wrapper = Join-Path $Root "web\src\pages\$ClassName.tsx"
$PageBase = [System.IO.Path]::GetFileNameWithoutExtension($PageFile)

@"
// Page wrapper pour le projet Lovable $Slug.
// Genere par scripts/import-lovable.ps1 — ne pas modifier le sous-projet
// dans web/src/lovable-imports/$Slug/.
import "../lovable-imports/lovable.css";
import Inner from "../lovable-imports/$Slug/pages/$PageBase";

export default function $ClassName() {
  return <Inner />;
}
"@ | Set-Content -Path $Wrapper -Encoding utf8

Write-Host ""
Write-Host "==> Fait. Snippet a ajouter dans web/src/App.tsx :"
Write-Host ""
Write-Host "  const $ClassName = React.lazy(() => import(`"./pages/$ClassName`"));"
Write-Host ""
Write-Host "  // Dans isStandaloneReferral :"
Write-Host "  location.pathname.startsWith(`"/$Slug`")"
Write-Host ""
Write-Host "  // Dans <Routes> :"
Write-Host "  <Route path=`"/$Slug`" element={"
Write-Host "    <React.Suspense fallback={<LoadingFallback />}>"
Write-Host "      <$ClassName />"
Write-Host "    </React.Suspense>"
Write-Host "  } />"
Write-Host ""
Write-Host "Puis : cd web; npx tsc --noEmit"
