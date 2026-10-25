# Real-device acceptance of the Windows one-line installer (README.md): runs exactly what people paste,
#   irm https://worldlet.ai/install.ps1 | iex
# on this computer, then checks the headless service it installed against the public service feed. Run it on 01 after
# a release, locally or over SSH:
#   powershell -NoProfile -ExecutionPolicy Bypass -File platform/install/install-acceptance.ps1 [-Out result.json]
# The service goes into a temporary folder on a library of its own (WORLDLET_HOME, WORLDLET_PROFILE_ROOT), with no start
# at login and no browser opened, so an installed app and its World stay as they are. It is stopped and removed at the
# end, and the script prints one JSON result. Exit 0 only when every check passed.
param([string]$Out = '')
$ErrorActionPreference = 'Stop'
$site = if ($env:WORLDLET_SITE) { $env:WORLDLET_SITE } else { 'https://worldlet.ai' }
$work = Join-Path ([IO.Path]::GetTempPath()) ('worldlet-install-acceptance-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$worldlet = Join-Path $work 'home\current\bin\worldlet.cmd'

$started = Get-Date
$manifest = Invoke-RestMethod "$site/downloads/server.json"
$file = "$($manifest.files.'windows-x64'.name)"
$expected = "$($manifest.version)"

$clock = [Diagnostics.Stopwatch]::StartNew()
# A child PowerShell, as a person's own window would be: the installer's `exit 1` must not end this script.
$output = powershell -NoProfile -Command "`$env:WORLDLET_SITE='$site'; `$env:WORLDLET_HOME='$work\home'; `$env:WORLDLET_PROFILE_ROOT='$work\library'; `$env:WORLDLET_NO_LOGIN_START='1'; `$env:WORLDLET_NO_BROWSER='1'; irm $site/install.ps1 | iex" 2>&1 | ForEach-Object { "$_" }
$exit = $LASTEXITCODE
$clock.Stop()

$env:WORLDLET_HOME = "$work\home"; $env:WORLDLET_PROFILE_ROOT = "$work\library"
$status = if (Test-Path $worldlet) { (cmd.exe /d /c "`"$worldlet`" status 2>&1") -join "`n" } else { '' }
$running = $LASTEXITCODE -eq 0 -and $status
$defender = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; StartTime = $started } -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -in 1006, 1007, 1015, 1116, 1117 } | ForEach-Object { @{ id = $_.Id; at = $_.TimeCreated.ToUniversalTime().ToString('o') } })
# Leave nothing running or installed behind the check.
if (Test-Path $worldlet) {
  cmd.exe /d /c "`"$worldlet`" stop >nul 2>&1"
  for ($waited = 0; $waited -lt 30; $waited++) { cmd.exe /d /c "`"$worldlet`" status >nul 2>&1"; if ($LASTEXITCODE -eq 3) { break }; Start-Sleep 1 }
}
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

$failures = @()
if ($exit -ne 0) { $failures += "installer exited with $exit" }
if (-not $running) { $failures += 'the Worldlet service was not running after the install' }
elseif ($status -notmatch "^Worldlet $([regex]::Escape($expected)) is running") { $failures += "the running service is not $expected" }
if ($defender.Count) { $failures += "Defender reported $($defender.Count) event(s)" }

$result = [ordered]@{
  check = 'install-acceptance-windows'; at = $started.ToUniversalTime().ToString('o'); site = $site; file = $file
  expected = $expected; service = $status; exit = $exit; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 1)
  defender = $defender; output = $output
  status = if ($failures.Count) { 'failed' } else { 'passed' }; failures = $failures
}
$json = $result | ConvertTo-Json -Depth 5
if ($Out) { [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false)) }
$json
if ($failures.Count) { exit 1 }
