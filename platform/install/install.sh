#!/bin/sh
# Worldlet one-line installer for macOS and Linux:
#   curl -fsSL https://worldlet.ai/install.sh | sh
#   curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
# Mac: downloads the newest signed, notarized release from the public update feed, checks its SHA-256, installs
# Worldlet.app into /Applications (or ~/Applications when that is not writable) and opens it. With --agent, the app
# starts connected to that Agent (openclaw, hermes, pi, claude-code or codex; claude names claude-code).
# Linux: installs the headless Worldlet service into ~/.worldlet, starts it and prints its link and QR code.
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
# Progress: each step is numbered, and a slow one shows a bar (when its size is known) or the seconds it has taken.
total=7; n=0
step() { n=$((n + 1)); echo "[$n/$total] $*"; }
bar() { [ -t 2 ] || return 0; filled=$(($1 * 40 / 100)); printf '\r      [%s%s] %3d%%' "$(printf '%*s' "$filled" '' | tr ' ' '#')" "$(printf '%*s' $((40 - filled)) '' | tr ' ' '.')" "$1" >&2; }
# busy <done-kilobytes-command|-> <total-kilobytes> <command…>: runs the command off stdin (under `curl … | sh` stdin is
# the rest of this script) and redraws the line every second until it ends.
busy() {
  measure="$1"; size="$2"; shift 2
  "$@" </dev/null & pid=$!
  seconds=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$measure" != - ] && [ "$size" -gt 0 ]; then
      have_kb="$($measure 2>/dev/null || echo 0)"; pct=$((${have_kb:-0} * 100 / size)); [ "$pct" -le 99 ] || pct=99; bar "$pct"
    elif [ -t 2 ]; then printf '\r      %ss' "$seconds" >&2; fi
    sleep 1; seconds=$((seconds + 1))
  done
  [ -t 2 ] && printf '\r\033[K' >&2
  wait "$pid"
}

# Linux, or any computer with no screen: the headless Worldlet service (platform/install/README.md#linux). It reads the
# Linux feed, checks the package's SHA-256 and every file in it, unpacks it into ~/.worldlet/<label> (WORLDLET_HOME
# names another place) and points ~/.worldlet/current at it, links the `worldlet` command into ~/.local/bin, runs the
# service under systemd --user (or in the background without systemd), connects the Agent and prints the link.
install_linux() {
  total=6
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) fail "the Worldlet service runs on x64 and arm64 Linux, not $(uname -m)." ;; esac
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
  library="${WORLDLET_PROFILE_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/Worldlet}"

  step "Finding the newest Worldlet service release…"
  file="$(curl -fsSL "$SITE/downloads/linux.json" | grep -o "worldlet-server-[0-9.]*-linux-$arch\.tar\.gz" | head -1)" || true
  [ -n "$file" ] || fail "no Linux release is available right now."
  label="${file#worldlet-server-}"; label="${label%-linux-*}"
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
  if [ -z "${WORLDLET_NO_SYSTEMD:-}" ] && command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
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
    # No systemd user session (a container, WSL without systemd): a background process instead.
    # The copy this installer started last time stops first (it may take several seconds to let go of its socket).
    old="$(cat "$home/worldlet.pid" 2>/dev/null || true)"
    if [ -n "$old" ] && grep -q worldlet.cjs "/proc/$old/cmdline" 2>/dev/null && kill "$old" 2>/dev/null; then
      waited=0
      while kill -0 "$old" 2>/dev/null && [ "$waited" -lt 30 ]; do sleep 1; waited=$((waited + 1)); done
    fi
    nohup "$node" "$program" >>"$home/worldlet.log" 2>&1 </dev/null &
    echo $! >"$home/worldlet.pid"
    echo "      systemd --user is not available here, so Worldlet runs as a background process (log: $home/worldlet.log)."
    echo "      It does not start again after a restart: run  nohup $worldlet >>$home/worldlet.log 2>&1 &  to start it."
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
  echo "  then open the link in $library/world-link.txt (cat it on this computer) in that computer's browser."
  echo "Done. $worldlet status shows the service; $worldlet link --qr prints the link again."
}
[ "$(uname -s)" != "Linux" ] || { install_linux; exit 0; }
[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS and Linux. On Windows run: irm $SITE/install.ps1 | iex."
major="$(sw_vers -productVersion | cut -d. -f1)"
[ "$major" -ge 14 ] 2>/dev/null || fail "Worldlet needs macOS 14 or later."

step "Finding the newest Worldlet release…"
url="$(curl -fsSL "$SITE/downloads/appcast.xml" | grep -o '<enclosure[^>]*url="[^"]*\.dmg"' | head -1 | sed 's/.*url="\([^"]*\)"/\1/')"
[ -n "$url" ] || fail "no release is available right now."
file="${url##*/}"
case "$file" in Worldlet-*-macos-*.dmg) ;; *) fail "unexpected release file: $file" ;; esac

# A Worldlet already at this Build or newer (an Alpha or Dev copy, say) is kept and opened: replacing it would go back
# to an older app over newer data.
build="${file%-macos-*}"; build="${build##*-}"
for app in "${WORLDLET_INSTALL_DIR:-/Applications}/Worldlet.app" "$HOME/Applications/Worldlet.app"; do
  [ -z "${WORLDLET_INSTALL_DIR:-}" ] || [ "$app" = "$WORLDLET_INSTALL_DIR/Worldlet.app" ] || continue
  have="$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$app/Contents/Info.plist" 2>/dev/null || true)"
  case "$have:$build" in *[!0-9:]*|:*|*:) continue ;; esac
  if [ "$have" -ge "$build" ]; then
    echo "Worldlet (Build ${have}) is already installed in ${app%/Worldlet.app}, as new as the release (Build ${build}). Opening it…"
    if [ -n "$AGENT" ]; then open "$app" --args "--connect=$AGENT"; else open "$app"; fi
    exit 0
  fi
done

work="$(mktemp -d)"
mount="$work/volume"
cleanup() { [ -z "${pid:-}" ] || kill "$pid" 2>/dev/null || true; hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT INT TERM

step "Downloading ${file}…"
curl -fL --progress-bar "$SITE/downloads/$file" -o "$work/$file"
step "Checking the download…"
expected="$(curl -fsSL "$SITE/downloads/$file.sha256" | awk '{print $1}')"
busy - 0 shasum -a 256 "$work/$file" >"$work/sum" || fail "could not check the download."
actual="$(awk '{print $1}' "$work/sum")"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download did not match its checksum."

step "Opening the disk image…"
mkdir -p "$mount"
busy - 0 hdiutil attach "$work/$file" -nobrowse -readonly -quiet -mountpoint "$mount" || fail "could not open the disk image."
[ -d "$mount/Worldlet.app" ] || fail "the disk image has no Worldlet.app."
step "Checking the app's signature…"
busy - 0 sh -c 'codesign --verify --deep --strict "$1" 2>/dev/null' _ "$mount/Worldlet.app" || fail "the app's signature did not verify."

# WORLDLET_INSTALL_DIR installs somewhere else (the release machines' install check uses a temporary folder).
target="${WORLDLET_INSTALL_DIR:-/Applications}"
if [ -n "${WORLDLET_INSTALL_DIR:-}" ]; then mkdir -p "$target"; elif [ ! -w "$target" ]; then target="$HOME/Applications"; mkdir -p "$target"; fi
if pgrep -xq Worldlet; then
  echo "      Quitting the running Worldlet…"
  osascript -e 'quit app "Worldlet"' >/dev/null 2>&1 || true
  # Quitting ends Hermes and the website engine first and can take several seconds. A copy opened while the old one
  # still runs meets its single-instance lock and quits, so nothing opened after "Done" (10-09).
  waited=0
  while pgrep -xq Worldlet && [ "$waited" -lt 30 ]; do sleep 1; waited=$((waited + 1)); done
  if pgrep -xq Worldlet; then fail "Worldlet is still running. Quit it from its menu, then run this command again."; fi
fi
step "Installing into ${target}…"
rm -rf "$target/Worldlet.app"
app_kb="$(du -sk "$mount/Worldlet.app" | awk '{print $1}')"
copied() { du -sk "$target/Worldlet.app" | awk '{print $1}'; }
busy copied "${app_kb:-0}" ditto "$mount/Worldlet.app" "$target/Worldlet.app" || fail "could not copy Worldlet into $target."

step "Opening Worldlet…"
if [ -n "$AGENT" ]; then open "$target/Worldlet.app" --args "--connect=$AGENT"; else open "$target/Worldlet.app"; fi
echo "Done. Finish the short setup in the Worldlet window."
