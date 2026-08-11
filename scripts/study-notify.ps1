# Wrapper called by the Windows scheduled task.
#
# Runs scripts/study-check.mjs and shows a popup only when something needs
# a human (missing entry, empty draft, or skipped days).
#
# This file is deliberately ASCII-only. Windows PowerShell 5.1 reads .ps1 as
# ANSI unless there is a BOM, so any Korean text here would be mangled
# depending on which PowerShell the task happens to use. All Korean comes
# from the Node script's stdout instead, decoded as UTF-8 below.

param(
  [int]$PopupSeconds = 30,
  [switch]$NoPopup
)

$ErrorActionPreference = 'Stop'

# Decode the Node script's UTF-8 output correctly on both PS 5.1 and PS 7.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$node = 'node'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $node = 'C:\Program Files\nodejs\node.exe'
}
if (-not (Test-Path $node) -and -not (Get-Command $node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js not found. Install it or fix PATH."
  exit 2
}

$output = (& $node 'scripts/study-check.mjs' 2>&1 | Out-String).Trim()
$needsAttention = ($LASTEXITCODE -ne 0)

Write-Output $output

if ($needsAttention -and -not $NoPopup) {
  # WScript.Shell popup closes itself after $PopupSeconds, so the scheduled
  # task does not sit in a running state waiting for a click.
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.Popup($output, $PopupSeconds, 'Claude Code STUDY', 64)
}

exit 0
