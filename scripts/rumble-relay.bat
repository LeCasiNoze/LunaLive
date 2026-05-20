@echo off
REM Lance le relay Rumble dans une fenetre cmd visible (logs consultables).
REM Auto-restart en cas de crash (max 10s de cooldown entre crashes).

cd /d "%~dp0\.."
title LunaLive Rumble Relay
echo ========================================
echo  LunaLive Rumble Relay
echo  Logs en temps reel ci-dessous.
echo  Ferme la fenetre pour arreter.
echo  Auto-restart actif en cas de crash.
echo ========================================
echo.

REM Lit l'ADMIN_KEY depuis api\.env si dispo, sinon utilise la valeur Render.
set "ADMIN_KEY=lunalive_super_secret_2025_xxx"

:loop
node scripts\rumble-relay.js
echo.
echo [relay] processus termine (exit=%ERRORLEVEL%). Restart dans 10s...
timeout /t 10 /nobreak >nul
goto loop
