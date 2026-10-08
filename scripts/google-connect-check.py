"""Verify Google scopes and token reuse without opening a browser or real account."""
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from google_direct import connect, SCOPES
from google.oauth2.credentials import Credentials

CORE = {SCOPES['gmail'], SCOPES['google-calendar']}
RETIRED_CALENDAR = 'https://www.googleapis.com/auth/calendar.events.readonly'
assert SCOPES['google-calendar'] == 'https://www.googleapis.com/auth/calendar.events.owned.readonly'


def check(services, stored_scopes=(), granted=None, reuse=False, expected=None, native=False):
    with tempfile.TemporaryDirectory(prefix='worldlet-google-check-') as directory:
        home = Path(directory)
        (home / 'google_client_secret.json').write_text('{}')
        def credentials(scopes):
            return Credentials(token='fixture-token', refresh_token='fixture-refresh',
                token_uri='https://oauth2.googleapis.com/token', client_id='fixture',
                client_secret='fixture', scopes=scopes)
        if stored_scopes:
            (home / 'google_token.json').write_text(credentials(list(stored_scopes)).to_json())
        requested = []
        opened = []
        def flow(_path, scopes, **_kwargs):
            requested.append(set(scopes))
            def serve(**kwargs):
                if native:
                    import webbrowser
                    assert kwargs['open_browser'] and kwargs['browser']=='worldlet-native-google'
                    webbrowser.get(kwargs['browser']).open('https://accounts.google.com/o/oauth2/auth?state=fixture')
                return credentials(list(scopes if granted is None else granted))
            return SimpleNamespace(run_local_server=serve)
        with patch('google_direct.reuse_gmail_authorization'), \
             patch('google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file', side_effect=flow), \
             patch('google.oauth2.credentials.Credentials.refresh'), \
             patch('hermes_cli.mcp_config._get_mcp_servers', return_value={}):
            before=(home / 'google_token.json').read_text() if stored_scopes else None
            if granted is not None:
                try:
                    connect(services, home)
                    raise AssertionError('A partial grant was accepted')
                except RuntimeError as error:
                    assert 'did not grant' in str(error)
                assert ((home / 'google_token.json').read_text() if (home / 'google_token.json').exists() else None) == before
            else:
                assert connect(services, home, open_url=opened.append if native else None)['ok']
                if native: assert opened == ['https://accounts.google.com/o/oauth2/auth?state=fixture']
                expected=expected or ({SCOPES['google-drive']} if services == ['google-drive'] else CORE)
                if not reuse: expected = expected | {'openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'}
                assert requested == ([] if reuse else [expected]), requested
                assert expected.issubset(json.loads((home / 'google_token.json').read_text())['scopes'])


for service in ['gmail', 'google-calendar']:
    check([service])
    check([service], stored_scopes=[SCOPES[service]])
    check([service], stored_scopes=CORE, reuse=True)
check(['gmail'], stored_scopes=[SCOPES['gmail']], granted=[SCOPES['gmail']])
check(['gmail'], stored_scopes=[SCOPES['google-drive']])
check(['google-drive'])
check(['google-drive'], stored_scopes=CORE, expected=CORE | {SCOPES['google-drive']})
check(['google-drive'], stored_scopes=CORE | {SCOPES['google-drive']}, reuse=True, expected=CORE | {SCOPES['google-drive']})
# A legacy broad Calendar grant is not a replacement for consent to the new scope.
# New requests must not union the retired grant back in (including an optional upgrade).
for service in ['gmail', 'google-calendar']:
    legacy = {SCOPES['gmail'], RETIRED_CALENDAR}
    check([service], stored_scopes=legacy, expected=CORE)
    check([service], stored_scopes=legacy, granted=list(legacy))
check(['google-drive'], stored_scopes={SCOPES['gmail'], RETIRED_CALENDAR},
      expected={SCOPES['gmail'], SCOPES['google-drive']})
check(['gmail', 'gmail-send'], stored_scopes={SCOPES['gmail'], RETIRED_CALENDAR},
      expected=CORE | {SCOPES['gmail-send']})
check(['gmail'], native=True)
print('PASS Google OAuth: bundled core scopes, existing-grant reuse, partial-grant rejection, no implicit Drive access.')

check(['gmail','google-calendar','gmail-send'], stored_scopes=CORE, expected=CORE | {SCOPES['gmail-send']})
check(['gmail'], stored_scopes=CORE | {SCOPES['gmail-send']}, reuse=True)
check(['gmail','gmail-send'], stored_scopes=CORE, granted=list(CORE))
print('PASS Gmail send upgrade is explicit, partial grant preserves read access, reconnect reuses authorized scopes.')

# Opening authorization must not import the full agent just to locate its skills.
import ast
import os
host_tree = ast.parse((Path(__file__).resolve().parents[1] / 'harness/hermes/host.py').read_text())
google_entry = next(node for node in host_tree.body if isinstance(node, ast.FunctionDef) and node.name == '_google')
namespace = {'os': os, 'HERMES_DIR': Path('/unused-test-profile'), 'emit': lambda *a, **k: None}
exec(compile(ast.Module(body=[google_entry], type_ignores=[]), '<google entry>', 'exec'), namespace)
with patch.dict(sys.modules, {'run_agent': None}), patch('google_direct.connect', return_value={'ok': True}) as direct:
    assert namespace['_google']({'operation': 'connect', 'services': ['gmail']}) == {'ok': True}
    direct.assert_called_once()
print('PASS OAuth opens through the direct path without importing the agent.')

# The actual dispatcher must bypass analytics and model bootstrap, not only _google.
from contextlib import nullcontext
entry=next(node for node in host_tree.body if isinstance(node,ast.FunctionDef) and node.name=='dispatch')
provisioned=[]
ns={'profile_lock':lambda _:nullcontext(),'provision_client':lambda home:provisioned.append(home),'HERMES_DIR':Path('/fixture'),'google':lambda body:{'ok':True}}
exec(compile(ast.Module(body=[entry],type_ignores=[]),'<dispatch>','exec'),ns)
with patch.dict(sys.modules,{'analytics_identity':None}):
    assert ns['dispatch']({'action':'google','operation':'connect'})=={'ok':True}
assert provisioned==[Path('/fixture')]
print('PASS Google consent dispatch bypasses model and analytics initialization')
