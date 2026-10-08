# Worldlet one-line installer for Windows:
#   irm https://worldlet.ai/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent hermes
# Downloads the newest release from the public update manifest, checks its SHA-256, installs it for this user
# (%LOCALAPPDATA%\Programs\Worldlet) without questions and opens it. With -Agent, the app starts connected to that
# Agent (openclaw, hermes, pi, claude-code or codex). Source: platform/install/README.md.
param([ValidateSet('', 'openclaw', 'hermes', 'pi', 'claude-code', 'codex')][string]$Agent = '')
$ErrorActionPreference = 'Stop'
$site = if ($env:WORLDLET_SITE) { $env:WORLDLET_SITE } else { 'https://worldlet.ai' }
function Fail($message) { Write-Error "Worldlet: $message`nYou can also download it from $site/download/"; exit 1 }

if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Worldlet needs 64-bit Windows 10 or later.' }
Write-Host 'Finding the newest Worldlet release...'
$manifest = Invoke-RestMethod "$site/downloads/windows-preview.json"
$file = Split-Path -Leaf $manifest.url
if ($file -notmatch '^Worldlet-[\d.]+-\d+-windows-x64(-unsigned)?\.exe$') { Fail "unexpected release file: $file" }
$path = Join-Path ([IO.Path]::GetTempPath()) $file
Write-Host "Downloading $file..."
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest "$site/downloads/$file" -OutFile $path -UseBasicParsing
if ((Get-FileHash $path -Algorithm SHA256).Hash.ToLower() -ne "$($manifest.sha256)".ToLower()) { Remove-Item $path; Fail 'the download did not match its checksum.' }

Get-Process Worldlet -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Installing...'
$setup = Start-Process $path -ArgumentList '/S' -Wait -PassThru
Remove-Item $path -ErrorAction SilentlyContinue
if ($setup.ExitCode -ne 0) { Fail "the installer exited with $($setup.ExitCode)." }
$app = Join-Path $env:LOCALAPPDATA 'Programs\Worldlet\app\Worldlet.exe'
if (-not (Test-Path $app)) { Fail 'the app was not found after installing.' }
Write-Host 'Opening Worldlet...'
if ($Agent) { Start-Process $app -ArgumentList "--connect=$Agent" } else { Start-Process $app }
Write-Host 'Done. Finish the short setup in the Worldlet window.'
