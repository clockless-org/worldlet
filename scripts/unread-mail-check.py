"""Offline Gmail contract checks: no writes, unread race, continuation, metadata."""
import sys, json, threading
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bundle=root/'dist/WorldletWeb/hermes'
# Exercise what the app ships, not helpers imported directly from the checkout.
for source in (root/'harness/hermes').glob('*.py'):
    target=bundle/source.name
    assert target.is_file() and target.read_bytes()==source.read_bytes(), f'Missing or stale bundled runtime: {source.name}. Run npm run build:native-ui.'
sys.path.insert(0,str(bundle))
from gmail_reader import read_page
from source_reader import normalize, execute
class Result:
    def __init__(self,value): self.value=value
    def execute(self): return self.value
class Batch:
    def __init__(self,api,callback): self.api,self.callback,self.items=api,callback,[]
    def add(self,request,request_id): self.items.append((request_id,request))
    def execute(self):
        self.api.batches.append(len(self.items))
        for request_id,request in reversed(self.items): self.callback(request_id,request.execute(),None)
class Gmail:
    def __init__(self): self.calls=[];self.batches=[]
    def new_batch_http_request(self,callback): return Batch(self,callback)
    def users(self): return self
    def threads(self): return self
    def messages(self): raise AssertionError('Expected thread read')
    def list(self,**kw): self.calls.append(kw);return Result({'threads':[{'id':'abc'},{'id':'def'}],'nextPageToken':'next'})
    def get(self,**kw):
        return Result({'id':kw['id'],'messages':[{'id':kw['id'],'internalDate':'1234','labelIds':['UNREAD'] if kw['id']=='abc' else [],'payload':{'headers':[{'name':'Subject','value':'Exact subject'}]},'snippet':'Exact original'}]})
api=Gmail();page=read_page(api,{'threads':True,'unreadOnly':True,'pageToken':'previous'},'me@example.test')
assert api.calls[0]['q']=='is:unread -in:spam -in:trash' and api.calls[0]['pageToken']=='previous'
assert len(page['records'])==1 and page['nextPageToken']=='next' and api.batches==[2]
records=normalize('gmail',page)
assert records[0]['unread'] and records[0]['threadId']=='abc' and records[0]['receivedAt']==1234
assert 'Status: UNREAD' in records[0]['text']
assert 'nextPageToken' in page and 'page only' in page['scope']
read_page(api,{'threads':True},'me@example.test');assert 'newer_than:30d' in api.calls[-1]['q']
for args in [{'unreadOnly':'yes'},{'pageToken':'x'*2049},{'id':'abc','unreadOnly':True}]:
    try: read_page(api,args,'me@example.test');raise AssertionError('invalid query accepted')
    except ValueError: pass
calls=[]
def native(name,args):
    calls.append((name,args));return json.dumps({'ticket':'one'} if name=='_source_begin' else {'ok':True})
result=json.loads(execute({'provider':'gmail','unreadOnly':True},native,Path('/unused'),threading.Event(),reader=lambda *a:{**page,'records':records}))
assert result['nextPageToken']=='next' and calls[-1][1]['records']==result['records']
print('PASS unread Gmail: exact filter, continuation, stale-read exclusion, original evidence and identical UI receipt; no mutating API used.')

# Calendar's stable provider ID also supports EventKit. A native receipt must
# never fall through to Google's OAuth reader, even when its result is empty.
for rows in ([], [{"provider":"google-calendar","id":"eventkit:fixture@date","title":"Meeting","text":"Local","allDay":False}]):
    calls=[]
    def local_native(name, args):
        calls.append(name)
        return json.dumps({"ticket":"local", "records":rows} if name=="_source_begin" else {"ok":True})
    def no_cloud(*args):
        raise AssertionError("Local Calendar must not invoke Google")
    value=json.loads(execute({"provider":"google-calendar"},local_native,Path('/unused'),threading.Event(),reader=no_cloud))
    assert value['records']==rows and calls==['_source_begin','_source_result']
print('PASS local EventKit receipts bypass OAuth, including empty calendars.')

# The trusted first-run budget overrides a model's bulk request, then sends the
# exact records used for reasoning to the native evidence/UI path.
first_args={'provider':'gmail','query':'newer_than:30d','limit':1,'metadataOnly':False}
seen=[]
def first_native(name,args):
    return json.dumps({'ticket':'first','readOptions':first_args} if name=='_source_begin' else {'ok':True})
def first_reader(args,*rest):
    seen.append(args)
    return {'records':records[:1]}
execute({'provider':'gmail','discovery':True,'limit':20},first_native,Path('/unused'),threading.Event(),reader=first_reader)
assert seen==[first_args]
print('PASS first-run Mail reads one full recent thread before bulk discovery.')
