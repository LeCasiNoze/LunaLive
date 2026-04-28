@echo off
REM Lance le relay Rumble dans une fenetre cmd visible (logs consultables).
REM Le titre permet de retrouver la fenetre facilement.

cd /d "%~dp0\.."
title LunaLive Rumble Relay
echo ========================================
echo  LunaLive Rumble Relay
echo  Logs en temps reel ci-dessous.
echo  Ferme la fenetre pour arreter.
echo ========================================
echo.

REM Lit l'ADMIN_KEY depuis api\.env si dispo, sinon utilise la valeur Render.
REM Le relay-script lit aussi api/.env — mais en cas de mismatch local/Render
REM cette ligne garantit qu'on tape bien Render avec la bonne clef.
set "ADMIN_KEY=lunalive_super_secret_2025_xxx"

node scripts\rumble-relay.js
echo.
echo [relay] processus termine. Fenetre maintenue ouverte.
pause
