@echo off
REM Lance Opera GX avec port de debug 9222 ouvert (localhost only).
REM Le relay LunaLive peut se connecter via CDP pour récupérer les
REM cookies Rumble depuis ta session déjà active — aucun re-login requis.
REM Tu peux fermer/relancer Opera comme d'habitude tant que tu utilises
REM ce shortcut.

start "" "%LOCALAPPDATA%\Programs\Opera GX\opera.exe" --remote-debugging-port=9222 --remote-allow-origins=*
