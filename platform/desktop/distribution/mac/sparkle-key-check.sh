#!/bin/bash
# Before any build or publication: prove that the Sparkle key release.sh will
# sign with (WORLDLET_SPARKLE_KEY_FILE, else the keychain account) matches the
# public key committed in Updates.json and embedded in the app.
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../../.." && pwd)"
# The pinned official Sparkle release (scripts/sparkle-tools.ts); the app itself no longer embeds Sparkle.
TOOLS="$(node "$REPO_ROOT/scripts/sparkle-tools.ts")"
ACCOUNT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["keychainAccount"])' "$HERE/../Updates.json")"
EXPECTED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["publicKey"])' "$HERE/../Updates.json")"
SPARKLE_KEY_FILE="${WORLDLET_SPARKLE_KEY_FILE:-}"
if [[ -n "$SPARKLE_KEY_FILE" && ! -r "$SPARKLE_KEY_FILE" ]]; then
  echo 'WORLDLET_SPARKLE_KEY_FILE is not readable.' >&2; exit 1
fi
KEY_ARGS=(--account "$ACCOUNT")
if [[ -n "$SPARKLE_KEY_FILE" ]]; then KEY_ARGS=(--ed-key-file "$SPARKLE_KEY_FILE"); fi
[[ -x "$TOOLS/sign_update" ]] || { echo "Sparkle tools missing at $TOOLS" >&2; exit 1; }
PROBE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/worldlet-sparkle-key.XXXXXX")"
trap 'rm -rf "$PROBE_DIR"' EXIT
printf 'Worldlet Sparkle key probe %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PROBE_DIR/probe"
SIGNATURE="$("$TOOLS/sign_update" "${KEY_ARGS[@]}" "$PROBE_DIR/probe" | sed -n 's/.*edSignature="\([^"]*\)".*/\1/p')"
[[ -n "$SIGNATURE" ]] || { echo 'Could not sign with the Sparkle update key.' >&2; exit 1; }
node "$HERE/sparkle-verify.ts" "$EXPECTED" "$PROBE_DIR/probe" "$SIGNATURE" \
  || { echo 'Update signing key does not match the app public key.' >&2; exit 1; }
echo 'Sparkle update key matches the committed public key.'
