#!/bin/bash
# The Mac build of a CI release (.github/workflows/release.yml, docs/RELEASING.md): one signed universal app in a
# signed, notarized and stapled DMG, and the Sparkle item that names it. Publication is separate
# (scripts/ci-release.mjs publish), so a promoted build ships these exact bytes.
#
# Notarization goes through an App Store Connect API key (no keychain profile) and covers the DMG only: Apple
# notarizes everything inside it in the same submission, so one wait instead of two (the app inside is checked online
# at first launch; the DMG itself carries the stapled ticket).
#
# Inputs: WORLDLET_RELEASE_MANIFEST (scripts/ci-release.mjs identity), WORLDLET_SIGN_IDENTITY, WORLDLET_SPARKLE_KEY_FILE,
# WORLDLET_GOOGLE_CLIENT_FILE, NOTARY_KEY_FILE, NOTARY_KEY_ID, NOTARY_ISSUER. Output: dist/ci/mac/ with the DMG, its
# checksum, appcast.xml and the notary record.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
cd "$REPO_ROOT"
for name in WORLDLET_RELEASE_MANIFEST WORLDLET_SIGN_IDENTITY WORLDLET_SPARKLE_KEY_FILE NOTARY_KEY_FILE NOTARY_KEY_ID NOTARY_ISSUER; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name." >&2; exit 2; }
done
[[ "$WORLDLET_SIGN_IDENTITY" == "Developer ID Application: "* ]] || { echo 'WORLDLET_SIGN_IDENTITY is not a Developer ID Application identity.' >&2; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo 'The checkout is dirty; a release builds a clean commit.' >&2; git status --short >&2; exit 1; }
step() { echo "::group::$1"; local start=$SECONDS; shift; "$@"; local code=$?; echo "::endgroup::"; echo "$((SECONDS-start))s"; return $code; }
summary() { [[ -z "${GITHUB_STEP_SUMMARY:-}" ]] || echo "- $1" >> "$GITHUB_STEP_SUMMARY"; }
notarize() {
  local file="$1" record="$2" id status
  xcrun notarytool submit "$file" --key "$NOTARY_KEY_FILE" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" \
    --wait --timeout 75m --output-format json > "$record" || true
  id="$(plutil -extract id raw -o - "$record" 2>/dev/null || true)"
  status="$(plutil -extract status raw -o - "$record" 2>/dev/null || true)"
  if [[ "$status" != Accepted ]]; then
    echo "Notarization of $(basename "$file") ended as '${status:-unknown}' (submission ${id:-none})." >&2
    [[ -z "$id" ]] || xcrun notarytool log "$id" --key "$NOTARY_KEY_FILE" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" >&2 || true
    return 1
  fi
}

export WORLDLET_DISTRIBUTION_CHANNEL="${WORLDLET_DISTRIBUTION_CHANNEL:-website}" WORLDLET_TARGET_PLATFORM=mac
read -r VERSION BUILD < <(node -e 'const m=require(process.argv[1]);console.log(m.version,m.build)' "$WORLDLET_RELEASE_MANIFEST")
OUT="$REPO_ROOT/dist/ci/mac"; rm -rf "$OUT"; mkdir -p "$OUT"
APP="$REPO_ROOT/dist/universal/Worldlet.app"
DMG="$OUT/Worldlet-$VERSION-$BUILD-macos-universal.dmg"
started=$SECONDS

step 'Check the Sparkle key' bash "$HERE/sparkle-key-check.sh"
step 'Build and sign the universal app' node scripts/package-electron.ts --platform darwin --arch universal --sign --no-notarize
summary "Build and sign: $((SECONDS-started))s"
rm -rf "$APP" && mkdir -p "$(dirname "$APP")"
ditto --noextattr "$REPO_ROOT/dist/packages/Worldlet-darwin-universal/Worldlet.app" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
python3 "$HERE/bundle-portability.py" "$APP"
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$APP/Contents/Info.plist")" == "$BUILD" ]] || { echo 'The app does not carry this Build.' >&2; exit 1; }

at=$SECONDS
step 'Package the DMG' bash "$HERE/package-dmg.sh" "$APP" "$DMG"
codesign --force --timestamp --sign "$WORLDLET_SIGN_IDENTITY" "$DMG"
summary "DMG: $((SECONDS-at))s"
at=$SECONDS
step 'Notarize the DMG' notarize "$DMG" "$DMG.notary.json"
summary "Notarization: $((SECONDS-at))s"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
codesign --verify --verbose=2 "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"

# The Sparkle item: generate_appcast reads only this build's DMG and signs it with the update key.
TOOLS="$(node scripts/sparkle-tools.ts)"
FEED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["feedURL"])' "$HERE/../Updates.json")"
"$TOOLS/generate_appcast" --ed-key-file "$WORLDLET_SPARKLE_KEY_FILE" --maximum-deltas 0 --download-url-prefix "${FEED%/*}/" "$OUT"
rm -rf "$HOME/Library/Caches/Sparkle_generate_appcast"
(cd "$OUT" && shasum -a 256 "$(basename "$DMG")" > "$(basename "$DMG").sha256")
summary "Mac Build $BUILD ready in $((SECONDS-started))s"
echo "Built $DMG"
