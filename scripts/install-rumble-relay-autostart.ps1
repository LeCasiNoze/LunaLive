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

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Write-Host "[install] Suppression tache existante..."
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Relay LunaLive Rumble - push videoIds Rumble vers l'API Render" | Out-Null

Write-Host "[OK] Tache '$taskName' creee. Demarrera a chaque logon."
Write-Host ""
Write-Host "Commandes utiles :"
Write-Host "  Lancer maintenant      : Start-ScheduledTask -TaskName $taskName"
Write-Host "  Arreter                : Stop-ScheduledTask  -TaskName $taskName"
Write-Host "  Etat                   : Get-ScheduledTask   -TaskName $taskName | Get-ScheduledTaskInfo"
Write-Host "  Desinstaller           : Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
Write-Host ""
$ans = Read-Host "Lancer maintenant ? (O/n)"
if ($ans -ne "n" -and $ans -ne "N") {
  Start-ScheduledTask -TaskName $taskName
  Write-Host "[OK] Relay demarre en arriere-plan."
  Write-Host "Verifier le statut : Get-Process node"
}
