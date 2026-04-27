# scripts/install-rumble-relay-autostart.ps1
# Installe le relay Rumble en auto-start au logon Windows.
# Utilise Task Scheduler (plus fiable que Startup folder : restart auto si crash).

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$vbs = Join-Path $projectRoot "scripts\rumble-relay.vbs"

if (-not (Test-Path $vbs)) {
  Write-Error "Fichier VBS introuvable: $vbs"
  exit 1
}

$taskName = "LunaLive_RumbleRelay"

# Drop ancienne tâche si existante
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Write-Host "Suppression tâche existante..."
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Action : lance le .vbs (qui lance node sans fenêtre)
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $projectRoot

# Trigger : à chaque logon de l'utilisateur courant
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Settings : redémarrage auto si crash, ne pas s'arrêter si batterie, ok pour PC en éveil/veille
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

# Principal : utilisateur courant, pas besoin d'admin
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Relay LunaLive Rumble — push videoIds Rumble vers l'API Render" | Out-Null

Write-Host "✅ Tâche '$taskName' créée. Démarrera à chaque logon."
Write-Host ""
Write-Host "Commandes utiles :"
Write-Host "  Lancer maintenant      : Start-ScheduledTask -TaskName $taskName"
Write-Host "  Arrêter                : Stop-ScheduledTask  -TaskName $taskName"
Write-Host "  État                   : Get-ScheduledTask   -TaskName $taskName | Get-ScheduledTaskInfo"
Write-Host "  Désinstaller           : Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
Write-Host ""
Write-Host "Lancer maintenant ?"
$ans = Read-Host "(O/n)"
if ($ans -ne "n" -and $ans -ne "N") {
  Start-ScheduledTask -TaskName $taskName
  Write-Host "🚀 Relay démarré en arrière-plan."
  Write-Host "Vérifie sur https://lunalive-api.onrender.com/admin/rumble/list-pseudo-only après quelques secondes."
}
