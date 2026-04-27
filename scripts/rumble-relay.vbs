' scripts/rumble-relay.vbs
' Lance le relay Rumble en arriere-plan (fenetre cachee).
' Utilise par Task Scheduler ou un raccourci dans le dossier Startup.

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Le .vbs vit dans LunaLive\scripts -> cwd doit etre LunaLive (root)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)

shell.CurrentDirectory = projectRoot

' 0 = fenetre cachee, False = ne pas attendre
shell.Run "node scripts\rumble-relay.js", 0, False
