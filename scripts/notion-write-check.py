import asyncio
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
import notion_writes as writes
ID='a'*32
NEW='b'*32

def result(value): return NS(isError=False,content=[NS(text=json.dumps(value))])
class Session:
    def __init__(self): self.calls=[];self.content='Before';self.write_count=0;self.fail=False;self.async_write=False;self.supported=True
    async def list_tools(self):
        return NS(tools=[NS(name=n,inputSchema={'type':'object','required':['parent','pages'] if 'create' in n else ['page_id','command','new_str']}) for n in ['notion-create-pages','notion-update-page']] if self.supported else [])
    async def call_tool(self,name,args,**kw):
        self.calls.append((name,args))
        if name=='notion-fetch': return result({'title':'Test','text':'Fetched at '+str(len(self.calls))+'<content>'+self.content+'</content>'})
        if name=='notion-get-async-task': return result({'status':'succeeded','result':{'pages':[{'id':NEW}]}})
        self.write_count+=1
        if self.fail: raise TimeoutError()
        self.content='Added content'
        if self.async_write: return result({'object':'async_task','id':'task_1','status':'queued'})
        return result({'pages':[{'id':NEW if 'create' in name else ID}]})
async def main():
 with tempfile.TemporaryDirectory() as home:
    session=Session();draft={'binding':'fixture-account','operation':'create','target':ID,'title':'Created','markdown':'Added content'}
    review=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home)
    assert session.write_count==0 and review['status']=='review'
    receipt=await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home)
    assert receipt['status']=='submitted' and session.write_count==1
    checked=await writes.handle(session,{'binding':'fixture-account','operation':'check','id':review['id']},home)
    assert checked['status']=='verified'
    try: await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home);assert False
    except ValueError: pass
    review=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':{**draft,'operation':'append'}},home)
    session.fail=True
    receipt=await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home)
    assert receipt['status']=='unconfirmed'
    count=session.write_count
    await writes.handle(session,{'binding':'fixture-account','operation':'check','id':review['id']},home)
    assert session.write_count==count
    session.fail=False;session.async_write=True
    review=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home)
    receipt=await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home)
    assert receipt['status']=='pending'
    assert (await writes.handle(session,{'binding':'fixture-account','operation':'check','id':review['id']},home))['status']=='verified'
    review=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home);session.content='Changed remotely'
    try: await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home);assert False
    except ValueError: pass
    review=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home)
    marker=Path(home)/'worldlet-notion-reviews'/(review['id']+'.attempt');marker.touch()
    try: await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':review['id']},home);assert False
    except ValueError: pass
    try: await writes.handle(session,{'binding':'another-account','operation':'check','id':review['id']},home);assert False
    except ValueError: pass
    # A temp file left by a crash never blocks saves, and stray files never break the listing.
    folder=Path(home)/'worldlet-notion-reviews';(folder/(review['id']+'.tmp')).write_text('{}');(folder/'notes.json').write_text('{}')
    stale=await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home)
    (folder/(stale['id']+'.tmp')).write_text('{}')
    assert (await writes.handle(session,{'binding':'fixture-account','operation':'commit','id':stale['id']},home)).get('status')!='failed'
    assert isinstance((await writes.handle(session,{'binding':'fixture-account','operation':'reviews'},home))['reviews'],list)
    session.supported=False
    try: await writes.handle(session,{'binding':'fixture-account','operation':'prepare','draft':draft},home);assert False
    except ValueError: pass
    assert not any(n in {'notion-delete-page','notion-move-pages'} for n,a in session.calls)
 print('PASS Notion reviewed writes: draft-only, confirm, no duplicate retry, timeout, async result, stale destination, unavailable capability')
asyncio.run(main())
