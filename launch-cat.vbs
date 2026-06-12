' Pixel Cat launcher - starts (or toggles off) the desktop cat with NO terminal window.
' Double-click to turn the cat ON. Double-click again to turn it OFF.
' Uses its own folder, so it keeps working even if you move the project.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

base     = fso.GetParentFolderName(WScript.ScriptFullName)
electron = base & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(electron) Then
  MsgBox "Pixel can't find Electron." & vbCrLf & vbCrLf & _
         "Open a terminal in this folder and run:" & vbCrLf & "    npm install", _
         vbExclamation, "Pixel Cat"
  WScript.Quit 1
End If

sh.CurrentDirectory = base
' window style 0 = hidden (no console); False = don't wait for it to exit
sh.Run """" & electron & """ """ & base & """", 0, False
