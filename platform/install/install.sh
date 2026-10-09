#!/bin/sh
# Worldlet one-line installer for macOS:
#   curl -fsSL https://worldlet.ai/install.sh | sh
#   curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent openclaw
# Downloads the newest signed, notarized release from the public update feed, checks its SHA-256, installs
# Worldlet.app into /Applications (or ~/Applications when that is not writable) and opens it. With --agent, the app
# starts connected to that Agent (openclaw, hermes, pi, claude-code or codex). Source: platform/install/README.md.
set -eu

SITE="${WORLDLET_SITE:-https://worldlet.ai}"
AGENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --agent=*) AGENT="${1#--agent=}"; shift ;;
    -h|--help) sed -n '2,7p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
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

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS. On Windows run: irm $SITE/install.ps1 | iex. Linux is not supported yet."
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
