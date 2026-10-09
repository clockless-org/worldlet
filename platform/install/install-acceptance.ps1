# Real-device acceptance of the Windows one-line installer (README.md): runs exactly what people paste,
#   irm https://worldlet.ai/install.ps1 | iex
# on this computer, then checks the installed app against the public manifest. Run it on 01 after a release, locally
# or over SSH:
#   powershell -NoProfile -ExecutionPolicy Bypass -File platform/install/install-acceptance.ps1 [-Out result.json]
# It replaces the installed Worldlet with the published Build (an RC's update acceptance installs the next RC again),
# stops the copy the installer opened, and prints one JSON result. Exit 0 only when every check passed.
# An SSH session has no desktop, so the window is not looked at here, and SmartScreen never sees an `irm` download
# (no Mark-of-the-Web); both need a person or the RC smoke.
param([string]$Out = '')
$ErrorActionPreference = 'Stop'
$site = if ($env:WORLDLET_SITE) { $env:WORLDLET_SITE } else { 'https://worldlet.ai' }
$app = Join-Path $env:LOCALAPPDATA 'Programs\Worldlet\app\Worldlet.exe'
function Version($path) { if (Test-Path $path) { (Get-Item $path).VersionInfo.FileVersion } else { $null } }

$started = Get-Date
$before = Version $app
$manifest = Invoke-RestMethod "$site/downloads/windows-preview.json"
$file = Split-Path -Leaf $manifest.url
$expected = if ($file -match '^Worldlet-([\d.]+)-(\d+)-windows-x64') { "$($Matches[1]).$($Matches[2])" } else { $null }

$clock = [Diagnostics.Stopwatch]::StartNew()
# A child PowerShell, as a person's own window would be: the installer's `exit 1` must not end this script.
$output = powershell -NoProfile -Command "`$env:WORLDLET_SITE='$site'; irm $site/install.ps1 | iex" 2>&1 | ForEach-Object { "$_" }
$exit = $LASTEXITCODE
$clock.Stop()

$after = Version $app
$signature = if (Test-Path $app) { "$((Get-AuthenticodeSignature $app).Status)" } else { $null }
$defender = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; StartTime = $started } -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -in 1006, 1007, 1015, 1116, 1117 } | ForEach-Object { @{ id = $_.Id; at = $_.TimeCreated.ToUniversalTime().ToString('o') } })
# The installer opens Worldlet; over SSH that copy has no window. Leave nothing running behind the check.
$opened = @(Get-Process Worldlet -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $app })
$opened | Stop-Process -Force -ErrorAction SilentlyContinue

$failures = @()
if ($exit -ne 0) { $failures += "installer exited with $exit" }
if (-not $after) { $failures += 'Worldlet.exe missing after install' }
elseif ($expected -and $after -ne $expected) { $failures += "installed $after, manifest names $expected" }
if ($defender.Count) { $failures += "Defender reported $($defender.Count) event(s)" }

$result = [ordered]@{
  check = 'install-acceptance-windows'; at = $started.ToUniversalTime().ToString('o'); site = $site; file = $file
  before = $before; expected = $expected; installed = $after; exit = $exit; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 1)
  signature = $signature; defender = $defender; opened = $opened.Count; output = $output
  status = if ($failures.Count) { 'failed' } else { 'passed' }; failures = $failures
}
$json = $result | ConvertTo-Json -Depth 5
if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)) }
$json
if ($failures.Count) { exit 1 }
