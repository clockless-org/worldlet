"""Packaged Hermes attention_tick and child source process, no account/model."""
import json
import os
import sys
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT=Path(__file__).resolve().parents[1]
PYTHON=os.environ.get('WORLDLET_TEST_PYTHON') or os.environ.get('WORLDLET_HERMES_PYTHON') or sys.executable
HOST=ROOT/'dist/WorldletWeb/hermes/host.py'
with tempfile.TemporaryDirectory() as tmp:
    home=Path(tmp)/'agent/private/hermes'; home.mkdir(parents=True)
    env={k:os.environ[k] for k in ('PATH','TEMP','TMP','SystemRoot','SystemDrive') if k in os.environ}
    env.update(HOME=str(home),USERPROFILE=str(home),HERMES_HOME=str(home),HERMES_TEST_ISOLATION='1',PYTHONDONTWRITEBYTECODE='1')
    if os.environ.get('WORLDLET_TEST_PYTHONPATH'): env['PYTHONPATH']=os.environ['WORLDLET_TEST_PYTHONPATH']
    events=[]
    with tempfile.TemporaryFile(mode='w+') as errors:
        process=subprocess.Popen([PYTHON,str(HOST)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors,text=True,encoding='utf-8',env=env)
        timer=threading.Timer(45,process.kill);timer.start()
        try:
            process.stdin.write(json.dumps({'action':'attention_tick','_background':True})+'\n');process.stdin.flush()
            result=None
            for line in process.stdout:
                value=json.loads(line)
                if value['type']=='tool':
                    name=value['name'];args=value['args'];events.append((name,args))
                    if name=='_attention_plan':
                        reply={'job':{'id':'fixture','kind':'collection','key':'source:gmail','provider':'gmail','revision':'v1','execution':{'timeoutSeconds':240,'reads':[{'provider':'gmail','limit':20}]}}} if args['kind']=='collection' else {'job':None}
                    elif name=='_attention_begin':reply={'ok':True}
                    elif name=='_attention_followups':reply={'reads':[]}
                    elif name=='_attention_tool':
                        if args['name']=='_world_authorize':reply={'ok':True}
                        elif args['name']=='_source_begin':reply={'ticket':'receipt','records':[{'provider':'gmail','id':'thread:abc123','text':'Fictional source','metadataOnly':False}]}
                        elif args['name']=='_source_result':
                            assert args['args']['ticket']=='receipt' and args['args']['records'][0]['text']=='Fictional source'
                            reply={'ok':True}
                        else:raise AssertionError(args)
                    elif name=='_attention_finish':
                        assert args['success'] is True
                        reply={'ok':True,'success':True}
                    else:raise AssertionError(name)
                    process.stdin.write(json.dumps({'type':'tool_result','requestId':value.get('requestId'),'id':value['id'],'result':reply})+'\n');process.stdin.flush()
                elif value['type']=='result':result=value['value']
                elif value['type']=='error':raise AssertionError(value)
            code=process.wait(timeout=5)
            if code or result!={'ran':True}:
                errors.seek(0)
                raise AssertionError((code,result,errors.read()[-3000:]))
            assert [e[1]['name'] for e in events if e[0]=='_attention_tool']==['_world_authorize','_source_begin','_source_result']
            assert not (home/'worldlet-attention-jobs.sqlite').exists(), 'The host is the only durable claim owner'
        finally:
            timer.cancel()
            if process.poll() is None:process.kill()
            process.wait();process.stdin.close();process.stdout.close()
print('PASS shipped Hermes attention_tick: host-owned claim, model-free child source worker, host receipts and completion; no real account or model.')
