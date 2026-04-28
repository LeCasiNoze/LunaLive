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
node scripts\rumble-relay.js
echo.
echo [relay] processus termine. Fenetre maintenue ouverte.
pause
