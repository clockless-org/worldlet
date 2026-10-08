#!/bin/bash
set -euo pipefail
# Called only with app-owned paths. No system Python, packages or ~/.hermes are changed.
stage="$1";bootstrap="$2"
# The app reads these markers to name the step that failed (installation.ts).
step() { /bin/echo "worldlet-setup-step: $1"; }
lock="$stage.installing"
for attempt in {1..450}; do
  if /bin/mkdir -m 700 "$lock" 2>/dev/null; then
    /bin/echo "$$" > "$lock/pid"
    trap '/bin/rm -rf "$lock"' EXIT
    break
  fi
  [[ -f "$stage/.ready" ]] && exit 0
  owner="$(/bin/cat "$lock/pid" 2>/dev/null || true)"
  if [[ "$owner" =~ ^[0-9]+$ ]] && ! /bin/kill -0 "$owner" 2>/dev/null; then
    /bin/rm -rf "$lock"
    continue
  fi
  /bin/sleep 2
done
step lock
[[ -f "$lock/pid" && "$(/bin/cat "$lock/pid")" == "$$" ]] || exit 13
[[ -f "$stage/.ready" ]] && exit 0
# The app may start this script inside the stage; never run in a directory it removes (uv
# refuses a deleted working directory).
cd "$(/usr/bin/dirname "$stage")"
/bin/rm -rf "$stage"
/bin/mkdir -m 700 -p "$stage/source"
export UV_PYTHON_INSTALL_DIR="$(/usr/bin/dirname "$stage")/python"
revision="$(/usr/bin/plutil -extract revision raw -o - "$bootstrap/runtime.json")"
python_range="$(/usr/bin/plutil -extract compatiblePython raw -o - "$bootstrap/runtime.json")"
archive="$stage/source.tar.gz"
step download
# codeload.github.com answers 429 in bursts (RC d7e2bc2b: four in 7 s); curl doubles its wait
# from 1 s (or follows Retry-After), so 8 retries ride out about four minutes of throttling.
/usr/bin/curl --fail --location --retry 8 --retry-all-errors --retry-max-time 420 --silent --show-error \
  --connect-timeout 15 --max-time 240 \
  "https://codeload.github.com/NousResearch/hermes-agent/tar.gz/$revision" --output "$archive"
step verify
expected="$(/bin/cat "$bootstrap/source.sha256")"
actual="$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')"
[[ "$actual" == "$expected" ]] || exit 12
step extract
/usr/bin/tar -xzf "$archive" -C "$stage/source" --strip-components 1
/bin/rm "$archive"
uv="$bootstrap/uv"
step python
python="$("$uv" python find "$python_range" --system 2>/dev/null || true)"
if [[ -z "$python" ]]; then
  "$uv" python install 3.12 --no-bin
  python="$("$uv" python find 3.12 --managed-python)"
fi
install_deps() {
  step dependencies
  "$uv" sync --project "$stage/source" --python "$1" \
    --extra mcp --extra google --no-dev --frozen &&
  "$uv" pip install --python "$stage/source/.venv/bin/python3" \
    --require-hashes -r "$bootstrap/mac-requirements.txt"
}
validate() {
  step validate
  # Importing Hermes creates a profile (state.db, SOUL.md, caches) in HERMES_HOME, by default
  # ~/.hermes: keep it in the stage and remove it, so the person's home is never touched.
  local status=0
  /bin/rm -rf "$stage/validate-home"
  HERMES_HOME="$stage/validate-home" "$stage/source/.venv/bin/python3" -I -B -c '
import importlib.metadata as m, sys
assert (3, 11) <= sys.version_info[:2] < (3, 14)
from run_agent import AIAgent
from tui_gateway import server
from hermes_state import SessionDB
from hermes_cli.config import load_config
import mcp, google.auth, claude_agent_sdk, ddgs
assert m.version("claude-agent-sdk") == "0.2.153"
assert m.version("ddgs") == "9.13.0"
' || status=$?
  /bin/rm -rf "$stage/validate-home"
  # Inside `if !` set -e is off: the import's own result must decide.
  return "$status"
}
if ! (install_deps "$python" && validate); then
  step python
  # A version-compatible system Python can still have an unusable installation
  # or binary ABI. In that case provision the known-good app-owned interpreter.
  "$uv" python install 3.12 --no-bin
  /bin/rm -rf "$stage/source/.venv"
  install_deps "$("$uv" python find 3.12 --managed-python)"
  validate
fi
/usr/bin/touch "$stage/.ready"
