# Regénère le ZIP téléchargeable depuis /extension
# Usage: pwsh ./extension/tiktok-discoverer/build-zip.ps1
$src = Join-Path $PSScriptRoot "*"
$dst = Join-Path $PSScriptRoot "..\..\web\public\lunalive-tiktok-discoverer.zip"
$exclude = @("build-zip.ps1", "README.md")

# Crée un dossier temp pour ne pas inclure les fichiers exclus
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "lunalive-tiktok-discoverer-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tmp | Out-Null
Get-ChildItem -Path $src -File | Where-Object { $exclude -notcontains $_.Name } | Copy-Item -Destination $tmp

Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $dst -Force
Remove-Item -Recurse -Force $tmp

Write-Host "✅ ZIP regénéré : $dst"
Get-Item $dst | Select-Object Name, Length
