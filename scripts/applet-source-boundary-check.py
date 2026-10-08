"""Exercise actual runtime-plan -> World service schema -> source receipt boundary, no accounts."""
import json,sys,subprocess,threading
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'harness/hermes'))
from world_service import execute
from jsonschema import ValidationError
import source_reader
for provider in ['gmail','google-calendar']:
 code=f"import {{appletReadPlan}} from './core/applets/runtime.ts';import fs from 'node:fs';let p=appletReadPlan(JSON.parse(fs.readFileSync('ui/applets/{provider}/runtime.json')),{{}},1800000000);for(let k of ['initial','startedAt','scanned'])delete p[k];console.log(JSON.stringify(p));"
 plan=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=root))
 events=[]
 def native(name,args):
  events.append(name)
  return json.dumps({'ok':True,'ticket':'fixture','records':[]} if name=='_source_begin' else {'ok':True})
 result=execute('read_world_source',plan,native=native,home=root,cancelled=threading.Event(),google=None,lock=None)
 assert result['records']==[] and events==['_world_authorize','_source_begin','_source_result']
 try:execute('read_world_source',{**plan,'invented':True},native=native,home=root,cancelled=threading.Event(),google=None,lock=None)
 except ValidationError:pass
 else:raise AssertionError('Unknown arguments must still be rejected')
print('PASS real Mail/Calendar runtime plans through World service validation and read receipts')

# Extraction must pass both batch validation and the actual service boundary.
from source_batch import run_source_batch
from attention_policy import source_candidate_schema,coverage_schema
from world_contract import schema
submitted=[]
record={'id':'thread:fixture','sourceReference':{'provider':'gmail','id':'thread:fixture'},'text':'Review the renewal terms before next month.'}
item={'provider':'gmail','kind':'task','title':'Review this renewal notice with a source title over forty characters','reason':'Review your upcoming renewal','summary':'Check whether you want to renew.','sources':[{'provider':'gmail','id':'thread:fixture','quoteRef':1}]}
def stage_native(name,args):
    if name=='query_world_items':return json.dumps({'pendingContextIds':[record['id']],'context':[record]})
    submitted.append(args)
    return json.dumps({'ok':True,'pendingContextIds':[]})
def dispatch(name,args):
    return execute(name,args,native=stage_native,home=root,cancelled=threading.Event(),google=None,lock=None,authorize=False,source_analysis=True)
run_source_batch(dispatch,lambda *args:json.dumps({'items':[item],'processedContextIds':[record['id']]}),coverage_schema(source_candidate_schema(schema('upsert_world_items')))['parameters'],lambda:None,indexed_sources=True)
assert len(submitted)==1 and submitted[0]['items'][0]['sources'][0]['quote']==record['text']
try:
    execute('upsert_world_items',submitted[0],native=stage_native,home=root,cancelled=threading.Event(),google=None,lock=None,authorize=False)
except ValidationError:pass
else:raise AssertionError('Ordinary/M submissions must retain final-card title limits')
print('PASS indexed S batch through actual World service; ordinary/M card constraints remain strict')
