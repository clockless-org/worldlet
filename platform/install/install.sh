#!/bin/sh
# Worldlet one-line installer for macOS and Linux:
#   curl -fsSL https://worldlet.ai/install.sh | sh
#   curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
# Installs the headless Worldlet service into ~/.worldlet for your own account (no administrator password), starts it
# at login (launchd on a Mac, systemd --user on Linux), connects your Agent (openclaw, hermes, pi, claude-code or codex;
# claude names claude-code) and opens your World in the browser (on Linux: prints its link and QR code). The desktop app
# is an optional download from worldlet.ai/download; a Mac that already has it keeps it and opens it.
# Source: platform/install/README.md.
set -eu

SITE="${WORLDLET_SITE:-https://worldlet.ai}"
AGENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --agent=*) AGENT="${1#--agent=}"; shift ;;
    -h|--help) sed -n '2,9p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ "$AGENT" != claude ] || AGENT=claude-code
case "$AGENT" in ""|openclaw|hermes|pi|claude-code|codex) ;; *) echo "Unknown Agent: $AGENT (use openclaw, hermes, pi, claude-code or codex)" >&2; exit 2 ;; esac

fail() { echo "Worldlet: $*" >&2; echo "You can also download it from $SITE/download/" >&2; exit 1; }
# Progress: each step is numbered.
total=6; n=0
step() { n=$((n + 1)); echo "[$n/$total] $*"; }

system="$(uname -s)"
case "$system" in
  Darwin)
    os=macos
    major="$(sw_vers -productVersion | cut -d. -f1)"
    [ "$major" -ge 14 ] 2>/dev/null || fail "Worldlet needs macOS 14 or later."
    # The desktop app already here keeps the World: it is opened, connected to the Agent, and never replaced
    # (it updates itself). Installing the service beside it would run two Worldlets on one library; a service on a
    # library of its own (WORLDLET_PROFILE_ROOT, as the release machines' install check runs it) does not.
    for app in /Applications/Worldlet.app "$HOME/Applications/Worldlet.app"; do
      [ -d "$app" ] && [ -z "${WORLDLET_PROFILE_ROOT:-}" ] || continue
      echo "The Worldlet app is installed in ${app%/Worldlet.app}. Opening it…"
      if [ -n "$AGENT" ]; then open "$app" --args "--connect=$AGENT"; else open "$app"; fi
      echo "Done. Finish the short setup in the Worldlet window."
      exit 0
    done
    library="${WORLDLET_PROFILE_ROOT:-$HOME/Library/Application Support/Worldlet}" ;;
  Linux)
    os=linux
    library="${WORLDLET_PROFILE_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/Worldlet}" ;;
  *) fail "this installer is for macOS and Linux. On Windows run: irm $SITE/install.ps1 | iex." ;;
esac
case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) fail "the Worldlet service runs on x64 and arm64, not $(uname -m)." ;; esac
target="$os-$arch"
if command -v sha256sum >/dev/null 2>&1; then sum() { sha256sum "$@"; }; else sum() { shasum -a 256 "$@"; }; fi
# The Agent: the one named, else the first one on PATH. `claude` is Claude Code.
if [ -z "$AGENT" ]; then
  for candidate in hermes openclaw claude codex; do
    if command -v "$candidate" >/dev/null 2>&1; then AGENT="$candidate"; break; fi
  done
  [ "$AGENT" != claude ] || AGENT=claude-code
  [ -z "$AGENT" ] || echo "Found ${AGENT} on this computer; Worldlet will connect it."
fi
home="${WORLDLET_HOME:-$HOME/.worldlet}"

step "Finding the newest Worldlet release…"
file="$(curl -fsSL "$SITE/downloads/server.json" | grep -o "worldlet-server-[0-9.]*-$target\.tar\.gz" | head -1)" || true
[ -n "$file" ] || fail "no Worldlet release for $target is available right now."
label="${file#worldlet-server-}"; label="${label%-"$target".tar.gz}"
case "$label" in [0-9][0-9][0-9][0-9].[0-9][0-9][0-9][0-9].[0-9]*) ;; *) fail "unexpected release file: $file" ;; esac

previous="$(readlink "$home/current" 2>/dev/null || true)"
if [ -x "$home/$label/bin/worldlet" ]; then
  step "Worldlet ${label} is already in $home/${label}."
  step "Nothing to download."
else
  work="$(mktemp -d)"
  trap 'rm -rf "$work" "$home/$label.part"' EXIT INT TERM
  step "Downloading ${file}…"
  curl -fL --progress-bar "$SITE/downloads/$file" -o "$work/$file" || fail "could not download $file."
  step "Checking the download…"
  expected="$(curl -fsSL "$SITE/downloads/$file.sha256" | awk '{print $1}')" || true
  actual="$(sum "$work/$file" | awk '{print $1}')"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download did not match its checksum."
  mkdir -p "$home"
  rm -rf "$home/$label.part"; mkdir -p "$home/$label.part"
  tar -xzf "$work/$file" -C "$home/$label.part" </dev/null || fail "could not unpack $file."
  (cd "$home/$label.part" && sum -c SHA256SUMS >/dev/null) || fail "a file in the package did not match SHA256SUMS."
  rm -rf "$home/$label"; mv "$home/$label.part" "$home/$label"
fi
ln -sfn "$label" "$home/current"
# The build before this one stays, so an Agent still registered with it keeps working until it registers again.
for old in "$home"/[0-9][0-9][0-9][0-9].[0-9][0-9][0-9][0-9].*; do
  [ -d "$old" ] || continue
  case "${old##*/}" in "$label"|"$previous") ;; *) rm -rf "$old" ;; esac
done
mkdir -p "$HOME/.local/bin"
ln -sfn "$home/current/bin/worldlet" "$HOME/.local/bin/worldlet"
worldlet="$HOME/.local/bin/worldlet"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "      Add ~/.local/bin to your PATH to run worldlet by name (it is in $worldlet)." ;; esac

step "Starting the Worldlet service…"
node="$home/current/node/bin/node"; program="$home/current/worldlet.cjs"
# Without a login start (WORLDLET_NO_LOGIN_START, or Linux with no systemd user session: a container, WSL without
# systemd) the service runs in the background until the computer restarts. The copy started that way last time stops
# first (it may take several seconds to let go of its socket).
background() {
  old="$(cat "$home/worldlet.pid" 2>/dev/null || true)"
  if [ -n "$old" ] && ps -p "$old" -o command= 2>/dev/null | grep -q worldlet.cjs && kill "$old" 2>/dev/null; then
    waited=0
    while kill -0 "$old" 2>/dev/null && [ "$waited" -lt 30 ]; do sleep 1; waited=$((waited + 1)); done
  fi
  nohup "$node" "$program" >>"$home/worldlet.log" 2>&1 </dev/null &
  echo $! >"$home/worldlet.pid"
  echo "      Worldlet runs as a background process (log: $home/worldlet.log)."
  echo "      It does not start again after a restart: run  nohup $worldlet >>$home/worldlet.log 2>&1 &  to start it."
}
if [ -n "${WORLDLET_NO_LOGIN_START:-}" ]; then
  background
elif [ "$os" = macos ]; then
  # A launch agent: starts at login, again after a crash, never after `worldlet stop` (a clean exit), and goes when the
  # Worldlet app takes the World over (platform/host/service.ts). It sees the PATH this installer had, so it finds the Agent.
  agents="$HOME/Library/LaunchAgents"; plist="$agents/ai.worldlet.service.plist"
  mkdir -p "$agents"
  xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo '<key>Label</key><string>ai.worldlet.service</string>'
    echo "<key>ProgramArguments</key><array><string>$(xml "$node")</string><string>$(xml "$program")</string></array>"
    echo "<key>EnvironmentVariables</key><dict><key>PATH</key><string>$(xml "$PATH")</string>"
    [ -z "${WORLDLET_HOME:-}" ] || echo "<key>WORLDLET_HOME</key><string>$(xml "$WORLDLET_HOME")</string>"
    [ -z "${WORLDLET_PROFILE_ROOT:-}" ] || echo "<key>WORLDLET_PROFILE_ROOT</key><string>$(xml "$WORLDLET_PROFILE_ROOT")</string>"
    echo '</dict>'
    echo '<key>RunAtLoad</key><true/>'
    echo '<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>'
    echo '<key>ProcessType</key><string>Background</string>'
    echo "<key>StandardOutPath</key><string>$(xml "$home/worldlet.log")</string>"
    echo "<key>StandardErrorPath</key><string>$(xml "$home/worldlet.log")</string>"
    echo '</dict></plist>'
  } >"$plist"
  # A service already running (an earlier install) stops first, then the new build starts.
  launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || true
  waited=0
  while "$worldlet" status >/dev/null 2>&1 </dev/null && [ "$waited" -lt 30 ]; do sleep 1; waited=$((waited + 1)); done
  launchctl bootstrap "gui/$(id -u)" "$plist" || fail "launchd could not start the Worldlet service (see $home/worldlet.log)."
  echo "      Worldlet runs in the background and starts when you log in (launchctl print gui/$(id -u)/ai.worldlet.service)."
elif command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$units"
  # The service sees the PATH this installer had, so it finds the Agent's command.
  {
    echo "[Unit]"
    echo "Description=Worldlet (headless service)"
    echo "After=network-online.target"
    echo "[Service]"
    echo "ExecStart=\"$node\" \"$program\""
    echo "Environment=\"PATH=$PATH\""
    [ -z "${WORLDLET_HOME:-}" ] || echo "Environment=\"WORLDLET_HOME=$WORLDLET_HOME\""
    [ -z "${WORLDLET_PROFILE_ROOT:-}" ] || echo "Environment=\"WORLDLET_PROFILE_ROOT=$WORLDLET_PROFILE_ROOT\""
    echo "Restart=on-failure"
    echo "RestartSec=5"
    echo "[Install]"
    echo "WantedBy=default.target"
  } >"$units/worldlet.service"
  systemctl --user daemon-reload
  if systemctl --user is-active --quiet worldlet.service; then
    systemctl --user enable worldlet.service >/dev/null 2>&1 || true
    systemctl --user restart worldlet.service || fail "systemd could not restart the Worldlet service (journalctl --user -u worldlet)."
  else
    systemctl --user enable --now worldlet.service || fail "systemd could not start the Worldlet service (journalctl --user -u worldlet)."
  fi
  # Keeps the service running after you log out and starts it at boot.
  loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || echo "      Warning: loginctl enable-linger failed, so Worldlet stops when you log out. Ask an administrator to run: loginctl enable-linger $(id -un)"
  echo "      Worldlet runs as the systemd user service worldlet (systemctl --user status worldlet)."
else
  echo "      systemd --user is not available here."
  background
fi
waited=0
until "$worldlet" status >/dev/null 2>&1 </dev/null; do
  waited=$((waited + 1))
  [ "$waited" -lt 60 ] || fail "the Worldlet service did not start. See $home/worldlet.log or journalctl --user -u worldlet."
  sleep 1
done

step "Connecting ${AGENT:-your Agent}…"
if [ -z "$AGENT" ]; then
  echo "      No Agent was named or found. Connect one later: $worldlet setup --agent <hermes|openclaw|claude-code|codex|pi>"
else
  # For Claude Code and Codex, setup also registers Worldlet's MCP server and skill (as worldlet register does).
  "$worldlet" setup --agent "$AGENT" </dev/null || echo "      Warning: setup did not finish. Run it again: $worldlet setup --agent $AGENT"
fi

if [ "$os" = macos ]; then
  step "Opening your World in the browser…"
  # A World page still starting answers a few seconds later.
  local_link=""
  waited=0
  while [ -z "$local_link" ]; do
    local_link="$("$worldlet" link --local </dev/null 2>/dev/null)" || local_link=""
    [ -n "$local_link" ] && break
    waited=$((waited + 1))
    [ "$waited" -lt 30 ] || fail "the service made no World link yet. Try again in a minute: $worldlet link --local"
    sleep 1
  done
  if [ -z "${WORLDLET_NO_BROWSER:-}" ]; then open "$local_link" || echo "      Open this link in your browser: $local_link"; fi
  echo
  echo "Done. Finish the short setup in your browser. Worldlet keeps running in the background and starts when you log in."
  echo "$worldlet link --local prints that link again; $worldlet link --qr gives one for your phone (keep both private)."
  echo "Prefer an app window? Download the Worldlet app from $SITE/download/: it opens the same World."
  exit 0
fi

step "Your World's link"
link="$("$worldlet" link </dev/null)" || fail "the service made no link yet. Try again in a minute: $worldlet link --qr"
echo
echo "Open this link on your phone or another computer. It is your World's window and works whenever this computer is on."
echo "Keep it private: anyone who has it can see and act in your World."
echo
echo "  $link"
echo
if command -v qrencode >/dev/null 2>&1; then printf '%s' "$link" | qrencode -t ANSIUTF8; else "$worldlet" link --qr </dev/null | tail -n +3; fi
echo
port="$(sed -n 's|^http://127\.0\.0\.1:\([0-9]*\)/.*|\1|p' "$library/world-link.txt" 2>/dev/null || true)"
echo "The full World page on this computer answers only here. From another computer, forward its port and open its link:"
echo "  ssh -L ${port:-47630}:127.0.0.1:${port:-47630} $(id -un)@$(uname -n)"
echo "  then run $worldlet link --local on this computer and open its link in that computer's browser to finish setup."
echo "Done. $worldlet status shows the service; $worldlet link --qr prints the link again."
