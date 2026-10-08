"""Exercise fixed batch execution without model credentials or private records."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from source_batch import run_source_batch
schema = {'type': 'object', 'required': ['items', 'processedContextIds'], 'properties': {
    'items': {'type': 'array'}, 'processedContextIds': {'type': 'array', 'items': {'type': 'string'}, 'uniqueItems': True}}}
valid = json.dumps({'items': [], 'processedContextIds': ['a', 'b']})

def run(outputs, reject=False, interrupted=False):
    calls, prompts = [], []
    def dispatch(name, args):
        calls.append(name)
        if name == 'query_world_items':
            return {'context': [{'id': 'a'}, {'id': 'b'}], 'pendingContextIds': ['a', 'b']}
        if interrupted:
            raise RuntimeError('transport lost')
        return {'error': 'bad evidence'} if reject else {'pendingContextIds': []}
    def complete(evidence, definition, correction):
        prompts.append((evidence, correction))
        return outputs[min(len(prompts)-1, len(outputs)-1)]
    try:
        run_source_batch(dispatch, complete, schema, lambda: None)
        return calls, prompts, None
    except RuntimeError as error:
        return calls, prompts, str(error)

calls, prompts, error = run([valid])
assert error is None and calls == ['query_world_items', 'upsert_world_items'] and len(prompts) == 1
calls, prompts, error = run(['not JSON', valid])
assert error is None and len(prompts) == 2 and prompts[1][1]
assert prompts[0][0] == prompts[1][0]  # no growing tool history
calls, prompts, error = run([json.dumps({'items': [], 'processedContextIds': ['a']})])
# After one repair, covered input commits; the host keeps the omitted record pending.
assert error is None and len(prompts) == 2 and calls == ['query_world_items', 'upsert_world_items']
calls, prompts, error = run([valid], reject=True)
assert error and len(prompts) == 2
calls, prompts, error = run([valid], interrupted=True)
assert error == 'transport lost' and len(prompts) == 1
print('PASS source batch: one query/save, bounded repair, complete coverage, no ambiguous-write replay')

# Script-only batches acknowledge without a model request.
saved = []
def script_dispatch(name, args):
    if name == 'query_world_items':
        return {'context': [], 'pendingContextIds': ['spam'], 'skippedContextIds': ['spam']}
    saved.append(args)
    return {'pendingContextIds': []}
def no_model(*args):
    raise AssertionError('Script-only batch must not invoke a model')
run_source_batch(script_dispatch, no_model, schema, lambda: None)
assert saved == [{'items': [], 'processedContextIds': ['spam']}]

# One M result can combine multiple Applets and review an existing item.
operations=[]
def center_dispatch(name, args):
    operations.append((name,args))
    if name == 'query_world_items':
        return {'context':[{'id':'mail'},{'id':'calendar'},{'id':'related'}], 'pendingContextIds':['mail','calendar']}
    return {'pendingContextIds': []}
review_schema={'type':'object','required':['id'],'properties':{'id':{'type':'string'}}}
result=json.dumps({'items':[{'title':'Combined finding'}], 'reviews':[{'id':'existing'}], 'processedContextIds':['mail','calendar','related']})
run_source_batch(center_dispatch,lambda *args:result,schema,lambda:None,review_schema)
assert [op[0] for op in operations] == ['query_world_items','review_world_item','upsert_world_items']
assert 'reviews' not in operations[-1][1]
print('PASS script-only zero inference and one M batch for Mail + Calendar + related context + reviews')

# A rejected write after a review must not regenerate/replay the review.
operations.clear()
def partial_dispatch(name, args):
    result = center_dispatch(name, args)
    return {'error':'stale revision'} if name == 'upsert_world_items' else result
try:
    run_source_batch(partial_dispatch,lambda *args:result,schema,lambda:None,review_schema)
    raise AssertionError('Expected write failure')
except RuntimeError as error:
    assert str(error) == 'stale revision'
assert [op[0] for op in operations] == ['query_world_items','review_world_item','upsert_world_items','upsert_world_items']
assert operations[-1][1]['items'] == [], 'fallback acknowledges no-finding input only'
print('PASS synthesis partial-write rejection never replays reviews')

from attention_policy import source_candidate_schema, analysis_schema
service=json.loads((Path(__file__).resolve().parents[1]/'core/tools/services.json').read_text())
definition=next(x for x in service if x['name']=='upsert_world_items')
assert source_candidate_schema(definition)['parameters']['properties']['items']['items']['properties']['title']['maxLength']==200
assert analysis_schema(definition)['parameters']['properties']['items']['items']['properties']['title']['maxLength']==40
print('PASS separate S extraction / M presentation schemas')

# Real S schema: numbered source evidence survives long mail, whitespace and repairs.
from attention_policy import coverage_schema
source_schema=coverage_schema(source_candidate_schema(definition))['parameters']
original=('A line with spaces.\n\nRenewal details here. '*100)
source_calls=[];source_prompts=[]
def numbered_dispatch(name,args):
    source_calls.append((name,args))
    if name=='query_world_items':
        return {'pendingContextIds':['thread:one'],'context':[{'id':'thread:one','sourceReference':{'provider':'gmail','id':'thread:one'},'text':original}]}
    return {'pendingContextIds':[]}
def numbered_complete(evidence,schema,correction):
    snapshot=json.loads(evidence);segments=snapshot['context'][0]['evidence'];source_prompts.append(snapshot)
    assert ''.join(x['text'] for x in segments)==original
    assert all(len(x['text'])<=800 for x in segments)
    return json.dumps({'items':[{'provider':'gmail','kind':'update','title':'A long factual source title exceeding forty characters is allowed here','reason':'A useful update','summary':'Review these facts.','location':'','sources':[{'provider':'gmail','id':'thread:one','quoteRef':1}]}], 'processedContextIds':['thread:one']})
run_source_batch(numbered_dispatch,numbered_complete,source_schema,lambda:None,indexed_sources=True)
submitted=source_calls[-1][1]['items'][0]
assert submitted['sources'][0]['quote'] in original
assert 'quoteRef' not in submitted['sources'][0] and 'location' not in submitted
assert len(source_prompts)==1
print('PASS indexed source spans restore exact original text without model transcription')

# M uses exact independent passages too, and may not reuse staging IDs.
center_schema=coverage_schema(analysis_schema(definition))['parameters']
review=next(x['parameters'] for x in service if x['name']=='review_world_item')
captured=[]
def center_indexed_dispatch(name,args):
    if name=='query_world_items':
        return {'items':[], 'appletCandidates':[{'id':'private-candidate'}],
            'pendingContextIds':['calendar'],
            'context':[{'id':'calendar','sourceReference':{'provider':'google-calendar','id':'event'},
                'text':'First passage\n\nSeparate passage','evidenceParts':['First passage','Separate passage']}]}
    captured.append(args)
    return {'pendingContextIds':[]}
def center_indexed_complete(evidence,schema,correction):
    snapshot=json.loads(evidence)
    assert 'id' not in snapshot['appletCandidates'][0]
    assert schema['properties']['items']['items']['properties']['id'] is False
    assert [x['text'] for x in snapshot['context'][0]['evidence']]==['First passage','Separate passage']
    assert 'quoteRef' in schema['properties']['reviews']['items']['properties']['sources']['items']['required']
    item={'provider':'google-calendar','kind':'event','title':'Upcoming meeting','reason':'Prepare for your meeting','summary':'Bring your notes.',
          'start':'2026-10-01T09:00:00-07:00','sources':[{'provider':'google-calendar','id':'event','quoteRef':2}]}
    from jsonschema import validate, ValidationError
    for bad in [{**item,'id':'private-candidate'}, {k:v for k,v in item.items() if k!='start'}]:
        try:
            validate({'items':[bad],'processedContextIds':['calendar']},schema)
            raise AssertionError('Invalid identity/date must fail before dispatch')
        except ValidationError:
            pass
    return json.dumps({'items':[item],'processedContextIds':['calendar']})
run_source_batch(center_indexed_dispatch,center_indexed_complete,center_schema,lambda:None,review,indexed_sources=True)
assert captured[0]['items'][0]['sources'][0]['quote']=='Separate passage'
print('PASS M indexed evidence, disjoint passages and private candidate identity separation')

# One bad finding no longer sinks its verified siblings or the no-finding inputs.
def two_record_snapshot():
    return {'pendingContextIds':['one','two','three'],'context':[
        {'id':'one','sourceReference':{'provider':'gmail','id':'thread:one'},'text':'Pay the invoice by Friday.'},
        {'id':'two','sourceReference':{'provider':'gmail','id':'thread:two'},'text':'Dinner moved to 7pm.'},
        {'id':'three','sourceReference':{'provider':'gmail','id':'thread:three'},'text':'Weekly newsletter.'}]}
def finding(thread, ref, **extra):
    return {'provider':'gmail','kind':'update','title':'Finding '+thread,'reason':'Useful now','summary':'Details.','sources':[{'provider':'gmail','id':'thread:'+thread,'quoteRef':ref}],**extra}
mixed=json.dumps({'items':[finding('one',1),finding('two',9)],'processedContextIds':['one','two','three']})
saves=[];mixed_prompts=[]
def mixed_dispatch(name,args):
    if name=='query_world_items':
        return two_record_snapshot()
    saves.append(args);return {'pendingContextIds':['two']}
def mixed_complete(evidence,schema,correction):
    mixed_prompts.append(correction);return mixed
result=run_source_batch(mixed_dispatch,mixed_complete,source_schema,lambda:None,indexed_sources=True)
assert len(mixed_prompts)==2 and 'items[1]' in mixed_prompts[1], 'first attempt gets an indexed repair'
assert [x['sources'][0]['id'] for x in saves[0]['items']]==['thread:one']
assert saves[0]['processedContextIds']==['one','three'], 'rejected finding keeps only its own input pending'
assert result['pendingContextIds']==['two']
print('PASS per-finding validation keeps verified siblings and withholds only rejected input')

# Host rejects every finding on the final attempt: no-finding input still commits.
host_saves=[]
def host_reject(name,args):
    if name=='query_world_items':
        return two_record_snapshot()
    host_saves.append(args)
    return {'error':'Source evidence was not read or cannot be verified.'} if args['items'] else {'pendingContextIds':['one']}
single=json.dumps({'items':[finding('one',1)],'processedContextIds':['one','two','three']})
run_source_batch(host_reject,lambda *a:single,source_schema,lambda:None,indexed_sources=True)
assert len(host_saves)==3 and host_saves[-1]=={'items':[],'processedContextIds':['two','three']}
print('PASS host-rejected findings fall back to acknowledging only uncited input')

# A rejected review withholds its own input instead of failing the whole M batch.
review_ops=[]
def review_dispatch(name,args):
    review_ops.append((name,args))
    if name=='query_world_items':
        return {'items':[{'id':'saved'}],**two_record_snapshot()}
    if name=='review_world_item':
        return {'error':'Review evidence was not read in this turn.'}
    return {'pendingContextIds':['two']}
review_batch=json.dumps({'items':[],'reviews':[{'id':'saved','assessment':'resolved','reason':'Done','sources':[{'provider':'gmail','id':'thread:two','quoteRef':1}]}],'processedContextIds':['one','two','three']})
run_source_batch(review_dispatch,lambda *a:review_batch,center_schema,lambda:None,review,indexed_sources=True)
assert [op[0] for op in review_ops]==['query_world_items','review_world_item','upsert_world_items']
assert review_ops[-1][1]['processedContextIds']==['one','three']
print('PASS rejected review keeps its cited input pending without failing the M batch')

# The M schema carries Core's 56-character card reason. The model sees the limit, and an
# over-long reason (observed local-model output) is repaired in-batch before any host write,
# instead of being rejected by the host and withheld for a later pass.
def flight(reason):
    return {'provider':'google-calendar','kind':'event','title':'SFO to JFK Flight','reason':reason,'summary':'Pack tonight.',
            'start':'2026-10-02T08:00:00-07:00','sources':[{'provider':'google-calendar','id':'flight','quoteRef':1}]}
def flight_dispatch(name,args):
    if name=='query_world_items':
        return {'items':[],'pendingContextIds':['flight'],'context':[{'id':'flight','sourceReference':{'provider':'google-calendar','id':'flight'},'text':'Flight SFO to JFK'}]}
    limit_writes.append(args);return {'pendingContextIds':[]}
limit_writes=[];limit_prompts=[]
def limit_complete(evidence,schema,correction):
    limit_prompts.append(correction)
    assert schema['properties']['items']['items']['properties']['reason']['maxLength']==56
    reason='Prepare for Friday morning departure' if correction else 'Confirmed departure requires travel preparation this week'
    return json.dumps({'items':[flight(reason)],'processedContextIds':['flight']})
run_source_batch(flight_dispatch,limit_complete,center_schema,lambda:None,review,indexed_sources=True)
assert len(limit_prompts)==2 and len(limit_writes)==1, 'over-long reason never reaches the host'
assert 'items[0]: reason:' in limit_prompts[1] and 'maxLength 56' in limit_prompts[1], limit_prompts[1]
assert limit_writes[0]['items'][0]['reason']=='Prepare for Friday morning departure'
limit_writes.clear();limit_prompts.clear()
def fitting_complete(evidence,schema,correction):
    limit_prompts.append(correction)
    return json.dumps({'items':[flight('Prepare for Friday morning departure')],'processedContextIds':['flight']})
run_source_batch(flight_dispatch,fitting_complete,center_schema,lambda:None,review,indexed_sources=True)
assert limit_prompts==[''] and len(limit_writes)==1, 'a reason within the limit is accepted on the first call'
# S staging keeps its long factual limit but states that reason is required and distinct.
source_reason=source_schema['properties']['items']['items']['properties']['reason']
assert source_reason['maxLength']==600 and 'attentionReason never replaces it' in source_reason['description']
print('PASS M reason limit is visible, repaired before host writes, and S states reason is required')

# The card reason word rule is repaired in-batch too, counted exactly as Core counts it, and the
# Harness constant and word definition cannot drift from Core's ATTENTION_CONTENT_LIMITS.
import subprocess
from source_batch import ATTENTION_REASON_WORDS, attention_reason_words
root=Path(__file__).resolve().parents[1]
wordy='Reply to Ms. Alvarez about pickup by Thursday noon'
assert len(wordy)<=56, 'only the word rule rejects it'
samples=['Pack for the early Friday departure','  one  two\tthree\n','a b　c﻿d e f','one\u0085two\x1cthree','界'*20,'',wordy]
core=json.loads(subprocess.run(['node','--no-warnings','--input-type=module','-e',
    'import {ATTENTION_CONTENT_LIMITS as L,attentionReasonWords as w} from '+json.dumps((root/'core/attention/attention-content.ts').as_uri())+';'
    'console.log(JSON.stringify({words:L.reasonWords,counts:JSON.parse(process.argv[1]).map(w)}))',json.dumps(samples)],
    check=True,capture_output=True,text=True,cwd=root).stdout)
assert ATTENTION_REASON_WORDS==core['words'], f'Harness reason word limit {ATTENTION_REASON_WORDS} drifted from Core {core["words"]}'
assert [attention_reason_words(x) for x in samples]==core['counts'], (samples,core['counts'])
assert core['counts'][-1]==ATTENTION_REASON_WORDS+1
assert 'reason_words=None if body.get("sourceAnalysis") else ATTENTION_REASON_WORDS' in (root/'harness/hermes/host.py').read_text(), 'Center batch passes the word limit'
def words_complete(evidence,schema,correction):
    limit_prompts.append(correction)
    return json.dumps({'items':[flight('Confirm the pickup plan before Thursday' if correction else wordy)],'processedContextIds':['flight']})
limit_writes.clear();limit_prompts.clear()
run_source_batch(flight_dispatch,words_complete,center_schema,lambda:None,review,indexed_sources=True,reason_words=ATTENTION_REASON_WORDS)
assert len(limit_prompts)==2 and len(limit_writes)==1, 'a nine-word reason never reaches the host'
assert 'items[0]: reason: 9 words' in limit_prompts[1] and 'maxWords 8' in limit_prompts[1], limit_prompts[1]
assert limit_writes[0]['items'][0]['reason']=='Confirm the pickup plan before Thursday'
source_items=[]
def staging_dispatch(name,args):
    if name=='query_world_items':
        return flight_dispatch(name,args)
    source_items.extend(args['items']);return {'pendingContextIds':[]}
run_source_batch(staging_dispatch,lambda *a:json.dumps({'items':[flight(wordy)],'processedContextIds':['flight']}),source_schema,lambda:None,indexed_sources=True)
assert [x['reason'] for x in source_items]==[wordy], 'S staging reasons have no card word limit'
print('PASS M reason word limit matches Core, is repaired before host writes, and leaves S staging alone')

# The model-facing schema is identical whatever is saved, so the prompt prefix caches across passes;
# saved IDs still validate, and an unknown ID is repaired.
def schema_for(saved_ids, output):
    seen = []
    item = {'type': 'object', 'properties': {'id': {'type': 'string'}, 'title': {'type': 'string'}}, 'required': ['title']}
    shape = {'type': 'object', 'required': ['items', 'processedContextIds'], 'properties': {
        'items': {'type': 'array', 'items': item}, 'processedContextIds': {'type': 'array', 'items': {'type': 'string'}}}}
    def dispatch(name, args):
        if name == 'query_world_items':
            return {'context': [{'id': 'a'}], 'pendingContextIds': ['a'], 'items': [{'id': i} for i in saved_ids]}
        return {'pendingContextIds': []}
    def complete(evidence, definition, correction):
        seen.append((json.dumps(definition, sort_keys=True), correction))
        return output
    run_source_batch(dispatch, complete, shape, lambda: None)
    return seen
first = schema_for(['one'], json.dumps({'items': [{'id': 'one', 'title': 'T'}], 'processedContextIds': ['a']}))
second = schema_for(['two', 'three'], json.dumps({'items': [], 'processedContextIds': ['a']}))
assert len(first) == 1 and first[0][0] == second[0][0], 'model-facing schema does not change with saved IDs'
unknown = schema_for(['one'], json.dumps({'items': [{'id': 'made-up', 'title': 'T'}], 'processedContextIds': ['a']}))
assert len(unknown) == 2 and 'made-up' in unknown[1][1], 'an ID that is not saved is still rejected and repaired'
print('PASS stable model-facing schema: cacheable prefix, saved IDs still validated')
