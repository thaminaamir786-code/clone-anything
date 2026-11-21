# Helper: copy the workbench into "F:\Program Files\clone anything".
# That folder is owned by Administrators, so this script must run elevated.

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = 'F:\Program Files\clone anything'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Please run this script from an elevated PowerShell (Run as administrator).'
  exit 1
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -Force -Path $source |
  Where-Object { $_.Name -ne '.workbench' } |
  Copy-Item -Destination $target -Recurse -Force

Write-Host "Copied the workbench to: $target"
Write-Host "Start it with: cd '$target'; npm start"
