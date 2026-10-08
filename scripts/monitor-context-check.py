"""Large background replies remain model-readable without read_file or extra permissions."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from monitor_context import context_page, PAGE_CHARS
from monitor_tools import register_monitor_tools
from world_contract import schemas
from tools.registry import ToolRegistry
from tools.tool_result_storage import maybe_persist_tool_result, PERSISTED_OUTPUT_TAG

records = [{'id':str(i), 'text':'Evidence '+('x'*11000), 'sourceReference':{'provider':'gmail','id':str(i)}} for i in range(24)]
reply = {'context':records, 'items':[{'id':'old','status':'dismissed'}], 'pendingContextIds':[str(i) for i in range(8)], 'runtimeTasks':{'unrelated':'not needed'}}
assert len(json.dumps(reply))>100000
found=[]
p=0
while p is not None:
    page=context_page(reply,p); raw=json.dumps(page,ensure_ascii=False)
    assert len(raw)<PAGE_CHARS
    assert PERSISTED_OUTPUT_TAG not in maybe_persist_tool_result(raw,'query_world_items','fixture-page')
    assert 'runtimeTasks' not in page
    found.extend(page['context']);p=page['nextContextPage']
assert found==records, 'Every record and exact quote must survive paging'
assert context_page(reply,999).get('error')
try:context_page({'context':[{'text':'x'*PAGE_CHARS}]},0)
except ValueError:pass
else:raise AssertionError('Oversized indivisible records must fail explicitly')
registry=ToolRegistry();calls=[]
def dispatch(name,args):
    calls.append((name,args));return reply
register_monitor_tools(registry,schemas(),dispatch,synthesis=True)
handler=registry.get_entry('query_world_items').handler
assert json.loads(handler({'contextPage':1})).get('error')
assert not calls
first=json.loads(handler({'contextPage':0}))
second=json.loads(handler({'contextPage':1}))
assert len(calls)==1 and 'contextPage' not in calls[0][1]
assert second['contextPage']==1 and first['nextContextPage']==1
assert json.loads(handler({'contextPage':0}))['contextPage']==0 and len(calls)==2
print('PASS bounded monitor paging, exact evidence, stable snapshots, registry routing and real Hermes spillover boundary')
