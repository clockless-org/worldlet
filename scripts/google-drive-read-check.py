"""Exercise shipped Drive dispatch and timeout configuration without an account."""
import ast
import datetime
import importlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'harness/hermes'))
from google_direct import SCOPES

tree = ast.parse((root / 'harness/hermes/host.py').read_text(encoding='utf-8'))
dispatch = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_google')
with tempfile.TemporaryDirectory(prefix='worldlet-drive-api-') as temporary:
    home = Path(temporary)
    scripts = home / 'skills/productivity/google-workspace/scripts'
    scripts.mkdir(parents=True)
    token = scripts / 'fixture-token.json'
    token.write_text(json.dumps({'scopes': [SCOPES['google-drive']]}), encoding='utf-8')
    (scripts / 'setup.py').write_text("from pathlib import Path\nTOKEN_PATH=Path(__file__).with_name('fixture-token.json')\n", encoding='utf-8')
    sys.modules['run_agent'] = types.SimpleNamespace(__file__=str(home / 'run_agent.py'))
    calls = []
    transport = types.SimpleNamespace(timeout=None)
    class Result:
        def __init__(self, value): self.value = value
        def execute(self):
            assert transport.timeout == 10, 'Drive HTTP calls must have a bounded timeout'
            return self.value
    class About:
        def get(self, **args):
            assert args == {'fields': 'user(displayName,emailAddress)'}
            calls.append('profile')
            return Result({'user': {'emailAddress': 'fixture@example.com'}})
    class Files:
        def list(self, **args):
            assert args == {'q': 'trashed = false', 'pageSize': 20, 'orderBy': 'modifiedTime desc', 'fields': 'files(id,name,mimeType,modifiedTime,webViewLink,description)'}
            calls.append('metadata')
            return Result({'files': [{'id': 'file_1', 'name': 'Fixture file', 'mimeType': 'application/pdf'}]})
    def build_service(name, version):
        assert (name, version) == ('drive', 'v3')
        return types.SimpleNamespace(_http=types.SimpleNamespace(http=transport), about=lambda: About(), files=lambda: Files())
    sys.modules['google_api'] = types.SimpleNamespace(build_service=build_service)
    namespace = {'Path': Path, 'sys': sys, 'importlib': importlib, 'datetime': datetime, 'json': json, 'HERMES_DIR': home}
    exec(compile(ast.Module(body=[dispatch, next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_google_reads')], type_ignores=[]), 'shipped-google-dispatch', 'exec'), namespace)
    read = namespace['_google']
    assert read({'operation': 'services'}) == {'ok': True, 'services': ['google-drive']}
    assert not calls, 'Scope inspection does not contact Google'
    result = read({'operation': 'test', 'service': 'google-drive'})
    assert result['records'] == [] and result['label'] == 'fixture@example.com' and calls == ['profile']
    result = read({'operation': 'read', 'service': 'google-drive'})
    assert result['metadataOnly'] and result['bounded'] and result['records'][0]['id'] == 'file_1'
    assert calls == ['profile', 'profile', 'metadata']
    token.write_text(json.dumps({'scopes': SCOPES['gmail'] + ' ' + SCOPES['google-calendar']}), encoding='utf-8')
    assert read({'operation': 'services'})['services'] == ['gmail', 'google-calendar']
print('PASS Drive dispatch: scoped service inventory, verified profile, bounded metadata-only read and ten-second HTTP timeout; no account/network.')
