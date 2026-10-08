"""Harness execution respects host-owned claims; no models or private accounts."""
import concurrent.futures
import importlib.util
from pathlib import Path
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('attention_jobs', ROOT/'harness/hermes/attention_jobs.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

for timeout in (None, True, 0, 14, 601, '240'):
    try:module.worker({'_taskTimeoutSeconds':timeout},Path('/unused'),None,threading.Event())
    except ValueError:pass
    else:raise AssertionError('A worker started without a valid host deadline')

with tempfile.TemporaryDirectory() as root:
    home = Path(root)/'agent/private/hermes'; events=[]; reads=[]; state={}
    def native(name, args):
        events.append(name)
        if name == '_attention_plan':
            kind=args['kind']
            return {'job':{'id':kind,'kind':kind,'key':'source:notion' if kind=='collection' else 'center','provider':'notion','revision':kind,'modelFree':False,'execution':{'timeoutSeconds':240,'reads':[{'provider':'notion','limit':20}],'prompt':'Host synthesis instructions'}}}
        if name == '_attention_begin': return {'ok':True}
        if name == '_attention_followups': return {'reads':[{'provider':'notion','id':str(i)} for i in range(5)]}
        if name == '_attention_tool': return {'error':'External actions denied'}
        if name == '_attention_finish': state[args['job']]=args['success']; return {'success':args['success']}
        raise AssertionError(name)
    def run(body, profile, tools, cancelled):
        assert body['_taskTimeoutSeconds']==240
        if body['action']=='world_tool':
            assert Path(profile)==home and not body.get('monitor')
            reads.append(body['args'])
            return {'records':[{'id':str(i)} for i in range(20)]}
        assert body['text']=='Host synthesis instructions'
        assert body['attentionSynthesis'] and body['monitor'] and Path(profile)==home.parent.parent/'monitor/hermes'
        assert tools('send_email',{})=={'error':'External actions denied'}
        return {'message':'Done'}
    assert module.tick(home,native,threading.Event(),run)=={'ran':True}
    assert len(reads)==6 and all(r['provider']=='notion' for r in reads)
    assert state=={'collection':True,'synthesis':True}
    assert module.tick(home,native,threading.Event(),run)=={'ran':True}, 'A host-authorized retry cannot be suppressed by Harness history'
    assert not (home/'worldlet-attention-jobs.sqlite').exists(), 'Harness has no competing durable claims'
    stopped=threading.Event(); stopped.set()
    assert module.tick(home,native,stopped,run)=={'ran':False}

# All workers see the same plan, but only the host can grant its claim.
with tempfile.TemporaryDirectory() as root:
    lock=threading.Lock(); active=False; entered=threading.Event(); release=threading.Event(); finishes=[]
    def native(name,args):
        global active
        if name=='_attention_plan':
            return {'job':{'id':'job','kind':'collection','key':'source:gmail','provider':'gmail','revision':'same','execution':{'timeoutSeconds':240,'reads':[{'provider':'gmail','limit':20}]}}} if args['kind']=='collection' else {'job':None}
        if name=='_attention_begin':
            with lock:
                if active:return {'error':'Already claimed'}
                active=True
            return {'ok':True}
        if name=='_attention_followups':return {'reads':[]}
        if name=='_attention_finish':
            with lock: finishes.append(args);active=False
            return {'success':args['success']}
        raise AssertionError(name)
    def execute(*args):
        entered.set(); assert release.wait(5); return {'records':[]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first=pool.submit(module.tick,root,native,threading.Event(),execute)
        assert entered.wait(5)
        assert module.tick(root,native,threading.Event(),execute)=={'ran':False}
        assert finishes==[], 'Rejected begin must not finish the active owner'
        release.set();assert first.result()=={'ran':True}
    assert len(finishes)==1 and finishes[0]['success'] is True
    def fail(*args):raise RuntimeError('source failed')
    assert module.tick(root,native,threading.Event(),fail)=={'ran':True}
    assert finishes[-1]['success'] is False and finishes[-1].get('error')=='source failed', 'Worker failure returns its classification input to host retry policy'
    # Even a stale legacy database must not override a newly admitted host plan.
    (Path(root)/'worldlet-attention-jobs.sqlite').write_bytes(b'legacy ignored fixture')
    assert module.tick(root,native,threading.Event(),lambda *args:{'records':[]})=={'ran':True}
    stopped=threading.Event(); count=len(finishes)
    def cancel(*args):stopped.set();return {'records':[]}
    assert module.tick(root,native,stopped,cancel)=={'ran':True}
    assert len(finishes)==count, 'Cancellation leaves settlement to host cleanup, never reports successful completion'


# The synthesis child inherits the included model credential from the Harness process
# environment; a tool reply offering one is ignored.
import json, os
with tempfile.TemporaryDirectory() as root:
    seen=[]
    class Child:
        def __init__(self,args,env,**kw):
            seen.append(env); self.stdin=self; self.stdout=self; self.returncode=None
        def write(self,text):pass
        def flush(self):pass
        def readline(self,limit):return json.dumps({'type':'result','value':{'message':'Done'}})+'\n'
        def poll(self):return self.returncode
        def kill(self):self.returncode=-9
        def wait(self):self.returncode=0
        def close(self):pass
    def native(name,args):
        if name=='_attention_plan':
            return {'job':{'id':'center','kind':'synthesis','key':'center','revision':'r','execution':{'timeoutSeconds':240,'prompt':'Host synthesis instructions'}}} if args['kind']=='synthesis' else {'job':None}
        if name=='_attention_begin':return {'ok':True,'includedToken':'reply-token','includedURL':'https://reply.invalid'}
        if name=='_attention_finish':assert args['success'],args;return {'success':True}
        raise AssertionError(name)
    saved={k:os.environ.get(k) for k in ('WORLDLET_INCLUDED_TOKEN','WORLDLET_INCLUDED_URL','HERMES_HOME')}
    popen=module.subprocess.Popen
    os.environ.update(WORLDLET_INCLUDED_TOKEN='parent-token',WORLDLET_INCLUDED_URL='https://parent.invalid',HERMES_HOME=root)
    module.subprocess.Popen=Child
    try:assert module.tick(Path(root)/'agent/private/hermes',native,threading.Event())=={'ran':True}
    finally:
        module.subprocess.Popen=popen
        for k,v in saved.items():
            if v is None:os.environ.pop(k,None)
            else:os.environ[k]=v
    assert len(seen)==1 and seen[0]['WORLDLET_INCLUDED_TOKEN']=='parent-token' and seen[0]['WORLDLET_INCLUDED_URL']=='https://parent.invalid', 'Synthesis child must use the parent environment credential, never a tool reply'

print('PASS Harness Attention execution: sole host claim authority, same-plan retries, rejected claims, failures, bounded reads, isolated synthesis, environment-only model credential and cancellation.')

# The model-facing monitor contract publishes complete findings individually,
# while the general World tool continues to accept batches for interactive use.
import sys
sys.path.insert(0, str(ROOT/'harness/hermes'))
from attention_policy import incremental_schema
from world_contract import schema
from jsonschema import validate, ValidationError
original = schema('upsert_world_items')
progressive = incremental_schema(original)
item_schema = progressive['parameters']['properties']['items']
assert original['parameters']['properties']['items'].get('maxItems') != 1
# Use the real item schema's required fields for a complete valid proposal.
item = {'provider':'gmail', 'kind':'task', 'title':'Reply to Sam',
        'reason':'Sam needs your answer.', 'summary':'Confirm whether Friday works.',
        'attentionReason':'A response is requested.',
        'sources':[{'provider':'gmail','id':'sam','quote':'Does Friday work?'}]}
validate({'items':[]}, progressive['parameters'])
validate({'items':[item]}, progressive['parameters'])
try:
    validate({'items':[item,item]}, progressive['parameters'])
except ValidationError as error:
    assert error.validator == 'maxItems'
else:
    raise AssertionError('Background synthesis accepted a buffered batch')
validate({'items':[item,item]}, original['parameters'])
print('PASS progressive Attention saves: complete single findings and empty acknowledgment accepted, batches rejected only for background tools.')

from attention_policy import analysis_schema
batched=analysis_schema(original)
validate({'items':[item,item],'processedContextIds':['sam']},batched['parameters'])
validate({'items':[],'processedContextIds':['sam']},batched['parameters'])
try:
    validate({'items':[item]*21},batched['parameters'])
except ValidationError as error:
    assert error.validator=='maxItems'
else:
    raise AssertionError('Analyst batches must stay bounded')
assert progressive['parameters']['properties']['items']['maxItems']==1
print('PASS source analysis permits bounded batches and empty coverage without changing Center publication')
