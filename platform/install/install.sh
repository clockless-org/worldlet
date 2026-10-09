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

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS. On Windows run: irm $SITE/install.ps1 | iex. Linux is not supported yet."
major="$(sw_vers -productVersion | cut -d. -f1)"
[ "$major" -ge 14 ] 2>/dev/null || fail "Worldlet needs macOS 14 or later."

echo "Finding the newest Worldlet release…"
url="$(curl -fsSL "$SITE/downloads/appcast.xml" | grep -o '<enclosure[^>]*url="[^"]*\.dmg"' | head -1 | sed 's/.*url="\([^"]*\)"/\1/')"
[ -n "$url" ] || fail "no release is available right now."
file="${url##*/}"
case "$file" in Worldlet-*-macos-*.dmg) ;; *) fail "unexpected release file: $file" ;; esac

work="$(mktemp -d)"
mount="$work/volume"
cleanup() { hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT INT TERM

echo "Downloading ${file}…"
curl -fL --progress-bar "$SITE/downloads/$file" -o "$work/$file"
echo "Checking the download…"
expected="$(curl -fsSL "$SITE/downloads/$file.sha256" | awk '{print $1}')"
actual="$(shasum -a 256 "$work/$file" | awk '{print $1}')"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download did not match its checksum."

echo "Opening the disk image…"
mkdir -p "$mount"
# </dev/null: under `curl … | sh` this shell reads the rest of the script from stdin, so nothing it runs may read it.
hdiutil attach "$work/$file" -nobrowse -readonly -quiet -mountpoint "$mount" </dev/null || fail "could not open the disk image."
[ -d "$mount/Worldlet.app" ] || fail "the disk image has no Worldlet.app."
echo "Checking the app's signature…"
codesign --verify --deep --strict "$mount/Worldlet.app" 2>/dev/null || fail "the app's signature did not verify."

# WORLDLET_INSTALL_DIR installs somewhere else (the release machines' install check uses a temporary folder).
target="${WORLDLET_INSTALL_DIR:-/Applications}"
if [ -n "${WORLDLET_INSTALL_DIR:-}" ]; then mkdir -p "$target"; elif [ ! -w "$target" ]; then target="$HOME/Applications"; mkdir -p "$target"; fi
if pgrep -xq Worldlet; then
  echo "Quitting the running Worldlet…"
  osascript -e 'quit app "Worldlet"' >/dev/null 2>&1 || true
  sleep 2
fi
echo "Installing into ${target}…"
rm -rf "$target/Worldlet.app"
ditto "$mount/Worldlet.app" "$target/Worldlet.app"

echo "Opening Worldlet…"
if [ -n "$AGENT" ]; then open "$target/Worldlet.app" --args "--connect=$AGENT"; else open "$target/Worldlet.app"; fi
echo "Done. Finish the short setup in the Worldlet window."
