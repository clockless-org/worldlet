"""Offline runtime preflight with a disposable profile and no model calls."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
# The checkout holding the runtime: scripts/setup-hermes.ts may install into another one.
home = Path(os.environ['WORLDLET_HERMES_CHECKOUT']).resolve() if os.environ.get('WORLDLET_HERMES_CHECKOUT') else root
runtime = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
spec = json.loads((root / 'harness/hermes/runtime.json').read_text())
python = runtime / 'python/bin/python3' if runtime else home / '.local/hermes-source/.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python3')
if not runtime:
    if not python.is_file():
        raise SystemExit('Preparing the project-local Fox runtime is required')
    revision = subprocess.check_output(['git', '-C', str(home / '.local/hermes-source'), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != spec['revision']:
        raise SystemExit('Hermes revision needs updating')
elif json.loads((runtime / 'runtime.json').read_text()) != spec:
    raise SystemExit('Bundled Hermes version does not match the application')
with tempfile.TemporaryDirectory(prefix='worldlet-runtime-check-') as directory:
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PYTHON', 'HERMES', 'WORLDLET_HERMES'))}
    env.update(HERMES_HOME=directory, PYTHONDONTWRITEBYTECODE='1')
    # -I ignores PYTHON* variables, so -B is what keeps bytecode out of the signed bundle.
    subprocess.run([str(python), '-I', '-B', '-c', '''
import importlib.metadata, json, sys
spec = json.loads(sys.argv[1])
assert '.'.join(map(str, sys.version_info[:2])) == spec['python'], 'Wrong Python version'
for requirement in (spec['sessionSDK'], spec['webSearchDependency']):
    name, version = requirement.split('==')
    assert importlib.metadata.version(name) == version, requirement
from run_agent import AIAgent
from tui_gateway import server
from hermes_state import SessionDB
from hermes_cli.config import load_config
import mcp, google.auth, claude_agent_sdk, ddgs
print('Hermes runtime ready')
''', json.dumps(spec)], cwd=directory, env=env, check=True, timeout=90)
