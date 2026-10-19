#!/bin/bash
# Website distribution; never uploads the user's Application Support directory.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
# Name slow stages and stop stalled tools instead of consuming the whole job.
stage() {
  python3 - "$@" <<'PY'
import os, signal, subprocess, sys, time
label, limit, *command = sys.argv[1:]
start = time.monotonic()
print(f'::group::{label}', flush=True)
print(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'Started', label, flush=True)
process = subprocess.Popen(command, start_new_session=True)
try:
    while True:
        remaining = int(limit) - (time.monotonic() - start)
        if remaining <= 0:
            raise subprocess.TimeoutExpired(command, int(limit))
        try:
            code = process.wait(timeout=min(15, remaining))
            break
        except subprocess.TimeoutExpired:
            output = os.environ.get('WORLDLET_STAGE_PROGRESS_PATH')
            size = os.path.getsize(output) if output and os.path.isfile(output) else None
            detail = f', output {size} bytes' if size is not None else ', waiting for stage output'
            print(f'{label}: running {time.monotonic()-start:.0f}s / {limit}s{detail}', flush=True)
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    print(f'::error::{label} timed out after {limit}s', flush=True)
    code = 124
elapsed = round(time.monotonic() - start)
print(f'{label}: {elapsed}s, exit {code}', flush=True)
print('::endgroup::', flush=True)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
        output.write(f'- {label}: **{elapsed}s** (exit {code})\n')
sys.exit(code)
PY
}
TOOL_ROOT="$REPO_ROOT"
MODE="${1:---check}"
PUBLISH="${2:-}"
if [[ -n "$PUBLISH" && "$PUBLISH" != --publish ]]; then echo "Unknown publication option" >&2;exit 2;fi
if [[ "$MODE" != --check && "$MODE" != --notarize ]]; then
  echo 'Usage: release.sh --check | --notarize [--publish]' >&2; exit 2
fi
xcrun --find notarytool >/dev/null
xcrun --find stapler >/dev/null
IDENTITIES="$(security find-identity -v -p codesigning)"
if [[ "$MODE" == --check ]]; then
  echo 'Bundle ID: app.worldlet.mac'
  echo 'Website signing requires a Developer ID Application certificate with its private key.'
  echo "$IDENTITIES"
  if [[ "$IDENTITIES" != *'"Developer ID Application: '* ]]; then
    echo 'Not ready: no valid Developer ID Application identity in this Mac keychain.' >&2; exit 1
  fi
  echo 'Signing identity available. Notary credentials and production provider setup still need validation.'
  exit 0
fi
SIGN_IDENTITY="${WORLDLET_SIGN_IDENTITY:-}"
PROFILE="${WORLDLET_NOTARY_PROFILE:-}"
if [[ "$SIGN_IDENTITY" != "Developer ID Application: "* ]] || [[ -z "$PROFILE" ]]; then
  echo 'Set WORLDLET_SIGN_IDENTITY and WORLDLET_NOTARY_PROFILE. Do not put passwords in this script.' >&2; exit 1
fi
if [[ "$IDENTITIES" != *"\"$SIGN_IDENTITY\""* ]]; then
  echo 'The selected Developer ID Application identity/private key is not available.' >&2; exit 1
fi
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo 'Commit release changes before creating a public build.' >&2;exit 1
fi
export WORLDLET_SIGN_IDENTITY="$SIGN_IDENTITY"
# Public Mac releases are the website package unless a store build overrides it.
export WORLDLET_DISTRIBUTION_CHANNEL="${WORLDLET_DISTRIBUTION_CHANNEL:-website}"
TOOLS="$(node "$TOOL_ROOT/scripts/sparkle-tools.ts")"
ACCOUNT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["keychainAccount"])' "$HERE/../Updates.json")"
SPARKLE_KEY_FILE="${WORLDLET_SPARKLE_KEY_FILE:-}"
# Check the exact signing key (file or keychain) before any build or upload.
bash "$HERE/sparkle-key-check.sh"
APPCAST_KEY_ARGS=(--account "$ACCOUNT")
if [[ -n "$SPARKLE_KEY_FILE" ]]; then APPCAST_KEY_ARGS=(--ed-key-file "$SPARKLE_KEY_FILE"); fi
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/worldlet-release.XXXXXX")"
# generate_appcast keeps an unpacked copy of every archive it has read in this cache and never
# trims it (12 GiB on 02's system disk, 2026-10-02). A run rebuilds what it needs, so it goes after every run.
SPARKLE_CACHE="$HOME/Library/Caches/Sparkle_generate_appcast"
trap 'code=$?; rm -rf "$SPARKLE_CACHE"; if [[ $code == 0 ]]; then rm -rf "$STAGING_DIR"; else echo "Retained packaging evidence: $STAGING_DIR" >&2; fi' EXIT
# One signed universal Electron app (both CPU slices). Both historical Sparkle
# feed URLs point to this same artifact; notarization happens below.
python3 "$REPO_ROOT/scripts/release-progress.py" build
stage "Build and sign universal app" 1800 node "$REPO_ROOT/scripts/package-electron.ts" --platform darwin --arch universal --sign --no-notarize
python3 "$REPO_ROOT/scripts/release-progress.py" assemble
rm -rf "$REPO_ROOT/dist/universal/Worldlet.app" && mkdir -p "$REPO_ROOT/dist/universal"
ditto --noextattr "$REPO_ROOT/dist/packages/Worldlet-darwin-universal/Worldlet.app" "$REPO_ROOT/dist/universal/Worldlet.app"
codesign --verify --deep --strict --verbose=4 "$REPO_ROOT/dist/universal/Worldlet.app"
python3 "$HERE/bundle-portability.py" "$REPO_ROOT/dist/universal/Worldlet.app"
ZIP="$REPO_ROOT/dist/Worldlet-mac-universal.zip"
APP="$REPO_ROOT/dist/universal/Worldlet.app"
stage "Archive universal app" 960 python3 "$TOOL_ROOT/scripts/release-archive.py" "$APP" "$ZIP"
python3 "$REPO_ROOT/scripts/release-progress.py" notarize-app
stage "Notarize universal app" 5280 python3 "$TOOL_ROOT/scripts/release-notarize.py" "$ZIP" "$PROFILE" "$STAGING_DIR/app-notary.json"
[[ "$(plutil -extract status raw -o - "$STAGING_DIR/app-notary.json")" == Accepted ]] || { cat "$STAGING_DIR/app-notary.json" >&2; exit 1; }
stage "Staple universal app" 120 xcrun stapler staple "$APP"
stage "Validate app ticket" 120 xcrun stapler validate "$APP"
codesign --verify --deep --strict "$APP"
spctl --assess --type execute --verbose=2 "$APP"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$APP/Contents/Info.plist")"
RELEASES="$REPO_ROOT/dist/releases/universal"
OUTPUT="$RELEASES/Worldlet-$VERSION-$BUILD-macos-universal.dmg"
mkdir -p "$RELEASES"
[[ ! -e "$OUTPUT" ]] || { echo 'This version/build already exists; do not replace published builds.' >&2; exit 1; }
python3 "$REPO_ROOT/scripts/release-progress.py" package
WORLDLET_STAGE_PROGRESS_PATH="$OUTPUT" stage "Package universal DMG" 1800 bash "$HERE/package-dmg.sh" "$APP" "$OUTPUT"
python3 "$REPO_ROOT/scripts/release-progress.py" sign
stage "Sign universal DMG" 120 codesign --force --timestamp --sign "$SIGN_IDENTITY" "$OUTPUT"
python3 "$REPO_ROOT/scripts/release-progress.py" notarize-dmg
stage "Notarize universal dmg" 5280 python3 "$TOOL_ROOT/scripts/release-notarize.py" "$OUTPUT" "$PROFILE" "$STAGING_DIR/dmg-notary.json"
[[ "$(plutil -extract status raw -o - "$STAGING_DIR/dmg-notary.json")" == Accepted ]] || { cat "$STAGING_DIR/dmg-notary.json" >&2; exit 1; }
stage "Staple universal DMG" 120 xcrun stapler staple "$OUTPUT"
stage "Validate DMG ticket" 120 xcrun stapler validate "$OUTPUT"
codesign --verify --verbose=2 "$OUTPUT"
spctl --assess --type open --context context:primary-signature --verbose=2 "$OUTPUT"
FEED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["feedURL"])' "$HERE/../Updates.json")"
stage "Generate universal Sparkle feed" 300 "$TOOLS/generate_appcast" "${APPCAST_KEY_ARGS[@]}" --verbose --maximum-deltas 0 --download-url-prefix "${FEED%/*}/" "$RELEASES"
(cd "$RELEASES" && shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")
cp "$STAGING_DIR/dmg-notary.json" "$OUTPUT.notary.json"
cp "$RELEASES/appcast.xml" "$REPO_ROOT/dist/releases/appcast.xml"
cp "$RELEASES/appcast.xml" "$REPO_ROOT/dist/releases/appcast-intel.xml"
if [[ "$PUBLISH" == --publish ]]; then
  python3 "$HERE/publish-release.py" "$OUTPUT"
fi
