"""Real subprocess pipe fixtures; no user sessions, accounts or external writes."""
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'platform/local-tools'))
from json_rpc_process import JsonRpcProcess
import sessions

with tempfile.TemporaryDirectory(prefix='worldlet session pipes ') as directory:
    script = Path(directory) / 'fixture server.py'
    script.write_text('''import json,sys,time
mode=sys.argv[1]
if mode=='timeout':time.sleep(30)
elif mode=='invalid':print('[]',flush=True)
elif mode=='closed':pass
else:
    first=json.loads(sys.stdin.readline());assert first['method']=='initialize'
    print(json.dumps({'method':'notice','params':{}}),flush=True)
    print(json.dumps({'id':1,'result':{}}),flush=True)
    assert json.loads(sys.stdin.readline())['method']=='initialized'
    second=json.loads(sys.stdin.readline());assert second['method']=='thread/list'
    assert second['params']['useStateDbOnly'] is True
    data=(json.dumps({'id':2,'result':{'data':[{'id':'fixture','name':'Unicode \\u4e16\\u754c'}]}})+'\\n').encode('utf-8')
    for byte in data:sys.stdout.buffer.write(bytes([byte]));sys.stdout.buffer.flush()
    time.sleep(30)
''', encoding='utf-8')
    def fixture(command, env=None):
        return JsonRpcProcess([sys.executable, '-X', 'utf8', str(script), 'normal'], env=env)
    with patch.object(sessions, 'JsonRpcProcess', fixture):
        result = sessions.rpc_list('fixture-only')
    assert sessions.codex_rows(result)[0]['title'] == 'Unicode \u4e16\u754c'
    for mode, failure in [('timeout', TimeoutError), ('invalid', ValueError), ('closed', RuntimeError)]:
        with JsonRpcProcess([sys.executable, str(script), mode]) as rpc:
            try:
                rpc.receive(.5)
                raise AssertionError('Bad server was accepted')
            except failure:
                pass
        assert rpc.process.poll() is not None
    with patch.object(sessions, 'discover', return_value=None):
        assert sessions.scan('claude')['providers'][0]['state'] == 'not_installed'
    with patch.object(sessions, 'gh_json') as network:
        try:
            sessions.github('read', '../private')
            raise AssertionError('Invalid repository was accepted')
        except ValueError:
            pass
        network.assert_not_called()
print('PASS portable local-tool transport: Unicode fragmented pipes, RPC handshake, bounded waits, malformed/closed servers, cleanup and provider gates.')
