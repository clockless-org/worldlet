"""Exercise the shipped service process with no model, account or network."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT=Path(__file__).resolve().parents[1]
PYTHON=Path(os.environ.get('WORLDLET_TEST_PYTHON') or os.environ.get('WORLDLET_HERMES_PYTHON') or ROOT/('.local/hermes-source/.venv/Scripts/python.exe' if os.name=='nt' else '.local/hermes-source/.venv/bin/python'))
HOST=ROOT/'dist/WorldletWeb/hermes/host.py'

def request(home,name,args,deny=False):
    env={k:os.environ[k] for k in ('PATH','TMPDIR','TEMP','TMP','LANG','SystemRoot','SystemDrive') if k in os.environ}
    env.update(HOME=str(home),USERPROFILE=str(home))
    env.update(HERMES_HOME=str(home),HERMES_TEST_ISOLATION='1',PYTHONDONTWRITEBYTECODE='1')
    with tempfile.TemporaryFile(mode='w+') as errors:
        p=subprocess.Popen([str(PYTHON),str(HOST)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors,text=True,env=env)
        timer=threading.Timer(25,p.kill);timer.start();events=[]
        try:
            p.stdin.write(json.dumps({'action':'world_tool','name':name,'args':args})+'\n');p.stdin.flush()
            for line in p.stdout:
                event=json.loads(line);events.append(event)
                if event['type']=='tool':
                    tool=event['name']
                    assert tool in {'_world_authorize','query_world_items','_source_begin','_source_result'},tool
                    value={'error':'Permission denied'} if deny else {'ok':True}
                    if tool=='query_world_items':value={'items':[{'id':'fixture'}]}
                    if tool=='_source_begin':value={'ticket':'fixture-ticket','records':[{'provider':'apple-notes','id':'fixture-note','title':'Fixture','text':'Original evidence'}]}
                    if tool=='_source_result':assert event['args']['ticket']=='fixture-ticket'
                    p.stdin.write(json.dumps({'type':'tool_result','id':event['id'],'result':value})+'\n');p.stdin.flush()
            p.wait(timeout=3)
            assert events, 'No service response'
            assert not any(e['type'] in {'delta','model_required'} for e in events)
            return events
        finally:
            timer.cancel()
            if p.poll() is None:p.kill();p.wait()

with tempfile.TemporaryDirectory(prefix='worldlet-service-') as tmp:
    home=Path(tmp)
    events=request(home,'query_world_items',{})
    assert events[-1]['type']=='result' and events[-1]['value']['items'][0]['id']=='fixture',events
    events=request(home,'read_world_source',{'provider':'apple-notes'})
    assert events[-1]['type']=='result' and events[-1]['value']['records'][0]['text']=='Original evidence',events
    events=request(home,'query_world_items',{},deny=True)
    assert events[-1]['type']=='error',events
    assert [e['name'] for e in events if e['type']=='tool']==['_world_authorize']
    events=request(home,'prepare_email',{'body':'Draft'},deny=True)
    assert events[-1]['type']=='error',events
    events=request(home,'read_connected_google',{'service':'google-drive'},deny=True)
    assert events[-1]['type']=='error',events
    assert events[0]['name']=='_world_authorize' and events[0]['args']=={'name':'read_connected_google','provider':'google-drive'},events
print('PASS shipped World service without a configured model: query, local source read, evidence ticket, permission denial and invalid draft rejection.')
