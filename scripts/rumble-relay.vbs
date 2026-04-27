' scripts/rumble-relay.vbs
' Lance le relay Rumble en arrière-plan (fenêtre cachée).
' Utilisé par Task Scheduler ou un raccourci dans le dossier Startup.

Set shell = CreateObject("WScript.Shell")
fso = CreateObject("Scripting.FileSystemObject")

' Le .vbs vit dans LunaLive\scripts → cwd doit être LunaLive (root)
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
projectRoot = CreateObject("Scripting.FileSystemObject").GetParentFolderName(scriptDir)

shell.CurrentDirectory = projectRoot

' 0 = fenêtre cachée, False = ne pas attendre
shell.Run "node scripts\rumble-relay.js", 0, False
