"""Read-only adapter boundaries: no shell, no arbitrary endpoints, no model calls."""
import importlib.util
from unittest.mock import patch
from types import SimpleNamespace
import sys
sys.path.insert(0,'platform/local-tools')
spec=importlib.util.spec_from_file_location('sessions','platform/local-tools/sessions.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
with patch.object(s,'gh_json') as gh:
    for repo in ['../secrets','owner/../user','-flag/repo','owner/repo?x=1']:
        try:s.github('read',repo);raise AssertionError(repo)
        except ValueError:pass
    assert not gh.called
    gh.return_value=[]
    assert s.github('list',offset=40)['nextOffset'] is None
    assert 'page=2' in gh.call_args.args[0][0]
with patch.object(s.subprocess,'run') as run,patch.object(s,'discover',return_value='/tmp/gh'):
    run.return_value=SimpleNamespace(returncode=0,stdout=b'[]')
    s.gh_json(['user/repos'])
    assert run.call_args.args[0][:4]==['/tmp/gh','api','--hostname','github.com']
    assert not run.call_args.kwargs.get('shell',False)
messages=[SimpleNamespace(type='assistant',uuid='id',message={'content':[{'type':'text','text':'hello'},{'type':'tool_use','input':{'secret':'never rendered'}}]})]
sdk=SimpleNamespace(get_session_info=lambda _:object(),get_session_messages=lambda *a,**k:messages)
with patch.dict(sys.modules,{'claude_agent_sdk':sdk}):
    assert s.claude_read('valid-id')['messages'][0]['text']=='hello'
    try:s.claude_read('../escape');raise AssertionError('invalid id')
    except ValueError:pass
print('PASS read-only Work CLI boundaries and Claude text projection')
