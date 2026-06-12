# Creates a "Pixel Cat" shortcut on your Desktop that launches the cat with no
# terminal window. Double-click it to turn the cat ON; double-click again to turn it OFF.
# Re-run this script anytime to (re)create the shortcut.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot          # project root (parent of tools/)
$vbs  = Join-Path $repo 'launch-cat.vbs'
$icon = Join-Path $repo 'assets\cat.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Pixel Cat.lnk'

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'

$sh = New-Object -ComObject WScript.Shell
$s  = $sh.CreateShortcut($lnk)
$s.TargetPath       = $wscript
$s.Arguments        = '"' + $vbs + '"'
$s.WorkingDirectory = $repo
$s.WindowStyle      = 7                            # minimized (wscript itself is windowless)
$s.Description      = 'Toggle Pixel the desktop cat on/off'
if (Test-Path $icon) { $s.IconLocation = $icon }
$s.Save()

Write-Host "Created shortcut: $lnk"
Write-Host "Double-click 'Pixel Cat' on your Desktop to turn the cat ON; double-click again to turn it OFF."
