# Worldlet one-line installer for Windows:
#   irm https://worldlet.ai/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent hermes
# Installs the headless Worldlet service into %USERPROFILE%\.worldlet for this user (no administrator rights), starts it
# now and at every login, connects your Agent (openclaw, hermes, pi, claude-code or codex) and opens your World in the
# browser. The desktop app is an optional download from worldlet.ai/download; a computer that already has it keeps it
# and opens it. Source: platform/install/README.md.
param([ValidateSet('', 'openclaw', 'hermes', 'pi', 'claude-code', 'codex')][string]$Agent = '')
$ErrorActionPreference = 'Stop'
$site = if ($env:WORLDLET_SITE) { $env:WORLDLET_SITE } else { 'https://worldlet.ai' }
function Fail($message) { Write-Error "Worldlet: $message`nYou can also download it from $site/download/"; exit 1 }
# Progress: each step is numbered and shown in PowerShell's progress bar; the download shows its percentage.
$script:step = 0
function Step($text) { $script:step++; Write-Host "[$script:step/6] $text"; Write-Progress -Activity 'Installing Worldlet' -Status $text -PercentComplete (($script:step - 1) * 17) }

if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Worldlet needs 64-bit Windows 10 or later.' }
# The desktop app already here keeps the World: it is opened, connected to the Agent, and never replaced (it updates
# itself). Installing the service beside it would run two Worldlets on one library; a service on a library of its own
# (WORLDLET_PROFILE_ROOT, as install-acceptance.ps1 runs it) does not.
$app = Join-Path $env:LOCALAPPDATA 'Programs\Worldlet\app\Worldlet.exe'
if ((Test-Path $app) -and -not $env:WORLDLET_PROFILE_ROOT) {
  Write-Host 'The Worldlet app is installed. Opening it...'
  if ($Agent) { Start-Process $app -ArgumentList "--connect=$Agent" } else { Start-Process $app }
  Write-Host 'Done. Finish the short setup in the Worldlet window.'
  return
}
# The Agent: the one named, else the first one on PATH. `claude` is Claude Code.
if (-not $Agent) {
  foreach ($candidate in 'hermes', 'openclaw', 'claude', 'codex') {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) { $Agent = if ($candidate -eq 'claude') { 'claude-code' } else { $candidate }; Write-Host "Found $Agent on this computer; Worldlet will connect it."; break }
  }
}
$home_ = if ($env:WORLDLET_HOME) { $env:WORLDLET_HOME } else { Join-Path $env:USERPROFILE '.worldlet' }
$worldlet = Join-Path $home_ 'current\bin\worldlet.cmd'
# The command's exit code, its output dropped (through cmd: Windows PowerShell 5 turns a redirected stderr into errors).
function Ask([string]$words) { cmd.exe /d /c "`"$worldlet`" $words >nul 2>&1"; return $LASTEXITCODE }

Step 'Finding the newest Worldlet release...'
$manifest = Invoke-RestMethod "$site/downloads/server.json"
$file = "$($manifest.files.'windows-x64'.name)"
if ($file -notmatch '^worldlet-server-(\d{4}\.\d{4}\.\d+)-windows-x64\.tar\.gz$') { Fail "no Worldlet release for Windows is available right now ($file)." }
$label = $Matches[1]
$folder = Join-Path $home_ $label
$previous = try { (Get-Item (Join-Path $home_ 'current') -ErrorAction Stop).Target | Select-Object -First 1 } catch { '' }
if (Test-Path (Join-Path $folder 'bin\worldlet.cmd')) {
  Step "Worldlet $label is already in $folder."
  Step 'Nothing to download.'
} else {
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
  if ((Get-FileHash $path -Algorithm SHA256).Hash.ToLower() -ne "$($manifest.files.'windows-x64'.sha256)".ToLower()) { Remove-Item $path; Fail 'the download did not match its checksum.' }
  $part = "$folder.part"
  Remove-Item $part -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $part | Out-Null
  # tar.exe comes with Windows 10 1803 and later.
  & "$env:SystemRoot\System32\tar.exe" -xzf $path -C $part
  $unpacked = $LASTEXITCODE
  Remove-Item $path -ErrorAction SilentlyContinue
  if ($unpacked -ne 0) { Fail "could not unpack $file." }
  foreach ($line in Get-Content (Join-Path $part 'SHA256SUMS')) {
    if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { Fail 'the package has a damaged SHA256SUMS.' }
    $expected = $Matches[1]; $name = $Matches[2]
    if ((Get-FileHash (Join-Path $part $name) -Algorithm SHA256).Hash.ToLower() -ne $expected) { Fail "a file in the package did not match SHA256SUMS: $name" }
  }
  Remove-Item $folder -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item $part $folder
}

Step 'Starting the Worldlet service...'
# A service already running (an earlier install) stops first, then this build starts.
if (Test-Path $worldlet) {
  $null = Ask 'stop'
  for ($waited = 0; $waited -lt 30; $waited++) { if ((Ask 'status') -eq 3) { break }; Start-Sleep 1 }
}
$current = Join-Path $home_ 'current'
if (Test-Path $current) { (Get-Item $current).Delete() }
New-Item -ItemType Junction -Path $current -Target $folder | Out-Null
# The build before this one stays, so an Agent still registered with it keeps working until it registers again.
Get-ChildItem $home_ -Directory | Where-Object { $_.Name -match '^\d{4}\.\d{4}\.\d+$' -and $_.Name -ne $label -and $_.FullName -ne $previous } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
# The worldlet command on this user's PATH, for new terminals (not for a service without a login start, as checks run it).
$bin = Join-Path $current 'bin'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $env:WORLDLET_NO_LOGIN_START -and -not (($userPath -split ';') -contains $bin)) { [Environment]::SetEnvironmentVariable('Path', (@($userPath, $bin) | Where-Object { $_ }) -join ';', 'User') }
# Started hidden (node.exe is a console program) now and at every login through the current user's Run key, which the
# Worldlet app removes when it takes the World over (platform/host/service.ts).
$node = Join-Path $current 'node\node.exe'; $program = Join-Path $current 'worldlet.cjs'
$starter = Join-Path $home_ 'start-worldlet.vbs'
Set-Content -Path $starter -Encoding ASCII -Value "CreateObject(""WScript.Shell"").Run """"""$node"""" """"$program"""""", 0, False"
if (-not $env:WORLDLET_NO_LOGIN_START) {
  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'WorldletService' -Value "wscript.exe `"$starter`""
}
Start-Process wscript.exe -ArgumentList "`"$starter`""
$running = $false
for ($waited = 0; $waited -lt 60 -and -not $running; $waited++) { $running = (Ask 'status') -eq 0; if (-not $running) { Start-Sleep 1 } }
if (-not $running) { Fail 'the Worldlet service did not start.' }

Step "Connecting $(if ($Agent) { $Agent } else { 'your Agent' })..."
if (-not $Agent) {
  Write-Host "      No Agent was named or found. Connect one later: worldlet setup --agent <hermes|openclaw|claude-code|codex|pi>"
} else {
  # For Claude Code and Codex, setup also registers Worldlet's MCP server and skill (as worldlet register does).
  & $worldlet setup --agent $Agent
  if ($LASTEXITCODE -ne 0) { Write-Host "      Warning: setup did not finish. Run it again: worldlet setup --agent $Agent" }
}

Step 'Opening your World in the browser...'
$link = (& $worldlet link --local | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or -not $link) { Fail 'the service made no World link yet. Try again in a minute: worldlet link --local' }
if (-not $env:WORLDLET_NO_BROWSER) { Start-Process $link }
Write-Progress -Activity 'Installing Worldlet' -Completed
Write-Host ''
Write-Host 'Done. Finish the short setup in your browser. Worldlet keeps running in the background and starts when you log in.'
Write-Host 'worldlet link --local prints that link again; worldlet link --qr gives one for your phone (keep both private).'
Write-Host "Prefer an app window? Download the Worldlet app from $site/download/: it opens the same World."
