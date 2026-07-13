@echo off
REM Run horaire du scout casino Twitch. Dépend d'un VPN système hors-France actif
REM + du cookie scripts\.twitch_auth valide. Si découverte vide, le script sort
REM proprement sans toucher la base. Log: scripts\twitch_scout.log
cd /d "C:\Users\Lucas\LunaLive"
"C:\Program Files\nodejs\node.exe" "scripts\twitch_casino_scout.mjs" --langs EN,DE --sample 25 >> "scripts\twitch_scout.log" 2>&1
