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
# Progress: each step is numbered and shown in PowerShell's progress bar; the download shows its percentage.
$script:step = 0
function Step($text) { $script:step++; Write-Host "[$script:step/5] $text"; Write-Progress -Activity 'Installing Worldlet' -Status $text -PercentComplete (($script:step - 1) * 20) }

if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Worldlet needs 64-bit Windows 10 or later.' }
Step 'Finding the newest Worldlet release...'
$manifest = Invoke-RestMethod "$site/downloads/windows-preview.json"
$file = Split-Path -Leaf $manifest.url
if ($file -notmatch '^Worldlet-[\d.]+-\d+-windows-x64(-unsigned)?\.exe$') { Fail "unexpected release file: $file" }
$path = Join-Path ([IO.Path]::GetTempPath()) $file
Step "Downloading $file..."
# Read the response in pieces to show the percentage: Invoke-WebRequest's own bar makes Windows PowerShell 5 download slowly.
$response = [Net.WebRequest]::Create("$site/downloads/$file").GetResponse()
$length = $response.ContentLength; $done = 0; $shown = -1
$in = $response.GetResponseStream(); $out = [IO.File]::Create($path); $buffer = New-Object byte[] (1MB)
try {
  while (($read = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $out.Write($buffer, 0, $read); $done += $read
    if ($length -gt 0) { $percent = [int]($done * 100 / $length); if ($percent -ne $shown) { $shown = $percent; Write-Progress -Id 1 -ParentId 0 -Activity "Downloading $file" -Status "$percent% of $([int]($length / 1MB)) MB" -PercentComplete $percent } }
  }
} finally { $out.Close(); $in.Close(); $response.Close(); Write-Progress -Id 1 -Activity 'Downloading' -Completed }
Step 'Checking the download...'
if ((Get-FileHash $path -Algorithm SHA256).Hash.ToLower() -ne "$($manifest.sha256)".ToLower()) { Remove-Item $path; Fail 'the download did not match its checksum.' }

Get-Process Worldlet -ErrorAction SilentlyContinue | Stop-Process -Force
Step 'Installing...'
$setup = Start-Process $path -ArgumentList '/S' -PassThru
$null = $setup.Handle  # keeps ExitCode readable after the process ends (Windows PowerShell 5)
$seconds = 0
while (-not $setup.WaitForExit(1000)) { $seconds++; Write-Progress -Id 1 -ParentId 0 -Activity 'Installing' -Status "$seconds s" }
Write-Progress -Id 1 -Activity 'Installing' -Completed
Remove-Item $path -ErrorAction SilentlyContinue
if ($setup.ExitCode -ne 0) { Fail "the installer exited with $($setup.ExitCode)." }
$app = Join-Path $env:LOCALAPPDATA 'Programs\Worldlet\app\Worldlet.exe'
if (-not (Test-Path $app)) { Fail 'the app was not found after installing.' }
Step 'Opening Worldlet...'
if ($Agent) { Start-Process $app -ArgumentList "--connect=$Agent" } else { Start-Process $app }
Write-Progress -Activity 'Installing Worldlet' -Completed
Write-Host 'Done. Finish the short setup in the Worldlet window.'
