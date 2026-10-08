#!/bin/bash
set -euo pipefail
APP="${1:?Pass the built .app path}"
OUTPUT="${2:?Pass the output .dmg path}"
[[ -d "$APP/Contents" && "$OUTPUT" == *.dmg ]] || exit 2
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Tools and the rendered background are shared by every checkout: release checkouts are new each time.
TOOLS="$(git -C "$SCRIPT_DIR" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')"
TOOLS="${TOOLS:-$SCRIPT_DIR/../../../..}/.local/dmg-tools"
# The image is written and read several times over: stage it on the system disk when it has room for
# three copies of the app plus 2 GB (#1109). On 02 the release root is a USB drive, where this step took
# ~3.7 minutes; elsewhere it stays in TMPDIR (the release-only temporary root).
APP_MB="$(du -sm "$APP" | awk '{print $1}')"
STAGE_ROOT="${TMPDIR:-/tmp}"
SYSTEM_FREE_MB="$(df -m /private/tmp | awk 'NR==2{print $4}')"
if [[ "${SYSTEM_FREE_MB:-0}" -gt $((APP_MB * 3 + 2048)) ]]; then STAGE_ROOT=/private/tmp; fi
STAGE="$(mktemp -d "$STAGE_ROOT/worldlet-dmg.XXXXXX")"
echo "DMG staging: $STAGE"
MOUNT=""
DEVICE=""
detach() {
  if [[ -n "${DEVICE:-}" ]]; then
    hdiutil detach "$DEVICE" -force >/dev/null 2>&1 || true
  elif [[ -n "${MOUNT:-}" ]]; then
    hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true
  fi
}
trap 'detach; rm -rf "$STAGE"' EXIT
mkdir -p "$(dirname "$OUTPUT")"
# One copy of the app (#1109): a blank writable image is mounted and the app is copied straight into
# it. Copying it into a staging folder and then `hdiutil create -srcfolder` copied ~1 GB twice and took
# most of this step's ~3.7 minutes on 02. ULMO (LZMA) then preserves the signed app with lossless
# compression; LZFSE was measured 33% larger for little time saved.
# Allow room for HFS+ allocation and catalog overhead.
SIZE_MB="$(awk -v mb="$APP_MB" 'BEGIN{print int(mb * 1.15) + 96}')"
df -h "$STAGE" | sed 's/^/disk: /'
hdiutil create -volname Worldlet -size "${SIZE_MB}m" -fs HFS+ -layout GPTSPUD -type UDIF -ov "$STAGE/rw.dmg"
ATTACH="$(hdiutil attach -readwrite -noverify -noautoopen "$STAGE/rw.dmg")"
printf '%s\n' "$ATTACH"
DEVICE="$(printf '%s\n' "$ATTACH" | awk '/^\/dev\//{print $1; exit}')"
# Columns are tab-separated; the mount point may contain spaces (e.g. "/Volumes/Worldlet 1").
MOUNT="$(printf '%s\n' "$ATTACH" | awk -F'\t' '/Apple_HFS/{print $NF; exit}')"
[[ -n "$DEVICE" && -n "$MOUNT" && -d "$MOUNT" ]] || { echo 'Could not mount the installer image.' >&2; exit 1; }
ditto --noextattr "$APP" "$MOUNT/Worldlet.app"
# File Provider / Finder may attach metadata when an app is copied; keep sealed resources clean.
xattr -r -d com.apple.FinderInfo "$MOUNT/Worldlet.app" 2>/dev/null || true
xattr -r -d com.apple.ResourceFork "$MOUNT/Worldlet.app" 2>/dev/null || true
# The copy users will drag out must still verify.
codesign --verify --deep --strict "$MOUNT/Worldlet.app"
ln -s /Applications "$MOUNT/Applications"
mkdir -p "$MOUNT/.background"
# The background depends only on dmg-background.swift: render it once per version of the script.
BACKGROUND_CACHE="$TOOLS/background-$(shasum -a 256 "$SCRIPT_DIR/dmg-background.swift" | cut -c1-16).png"
if [[ ! -s "$BACKGROUND_CACHE" ]]; then
  mkdir -p "$(dirname "$BACKGROUND_CACHE")"
  swift "$SCRIPT_DIR/dmg-background.swift" "$STAGE/background.png"
  mv "$STAGE/background.png" "$BACKGROUND_CACHE"
fi
cp "$BACKGROUND_CACHE" "$MOUNT/.background/background.png"
chflags hidden "$MOUNT/.background"
# Write Finder metadata without opening Finder or requiring Apple Events.
DMG_PYTHON="${WORLDLET_DMG_PYTHON:-$TOOLS/bin/python3}"
if [[ ! -x "$DMG_PYTHON" ]]; then
  python3 -m venv "$(dirname "$(dirname "$DMG_PYTHON")")"
fi
if ! "$DMG_PYTHON" -c 'import ds_store, mac_alias' 2>/dev/null; then
  # Official PyPI wheel digests; --require-hashes also rejects unpinned dependencies.
  DMG_REQUIREMENTS="$(dirname "$(dirname "$DMG_PYTHON")")/dmg-requirements.txt"
  printf '%s\n' \
    'ds_store==1.3.1 --hash=sha256:fbacbb0bd5193ab3e66e5a47fff63619f15e374ffbec8ae29744251a6c8f05b5' \
    'mac_alias==2.2.2 --hash=sha256:504ab8ac546f35bbd75ad014d6ad977c426660aa721f2cd3acf3dc2f664141bd' > "$DMG_REQUIREMENTS"
  "$DMG_PYTHON" -m pip install --require-hashes --only-binary :all: -r "$DMG_REQUIREMENTS"
fi
"$DMG_PYTHON" "$SCRIPT_DIR/dmg-layout.py" "$MOUNT"
sync
chflags hidden "$MOUNT/.fseventsd" 2>/dev/null || true
hdiutil detach "$DEVICE"
DEVICE=""
MOUNT=""
hdiutil convert "$STAGE/rw.dmg" -format ULMO -ov -o "$OUTPUT"
hdiutil verify "$OUTPUT"
