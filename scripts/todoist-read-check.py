"""Official MCP schema fixtures; never contacts a personal account."""
import asyncio, sys
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from todoist_mcp import payload, read_session, reviewed_session
row={'id':'6abc12','content':'Keep the original title','description':'Complete body\n<not HTML>','priority':'p1','dueDate':'2026-10-01','recurring':False,'checked':False}
class Session:
    def __init__(self): self.calls=[];self.bad=False
    async def call_tool(self,name,args,**kw):
        self.calls.append((name,args))
        return NS(structuredContent={'tasks':[row],'hasMore':True,'nextCursor':'next'} if name=='find-tasks' else {'object':{**row,'id':'other'} if self.bad else row},isError=False)
async def run():
    s=Session();v=await read_session(s,{'operation':'list','cursor':'page2'})
    assert v['next']=='next' and v['pages'][0]['title']==row['content']
    assert s.calls[-1]==('find-tasks',{'filter':'all','limit':20,'responsibleUserFiltering':'all','cursor':'page2'})
    v=await read_session(s,{'operation':'read','id':row['id']});assert v['text']==row['description'] and v['details']['priority']=='p1'
    for body in [{'operation':'complete'},{'operation':'read','id':'../../x'},{'operation':'list','cursor':42}]:
        n=len(s.calls)
        try: await read_session(s,body)
        except ValueError: pass
        else: raise AssertionError('Invalid read accepted')
        assert n==len(s.calls)
    s.bad=True
    try: await read_session(s,{'operation':'read','id':row['id']})
    except RuntimeError: pass
    else: raise AssertionError('Different task accepted')
    assert payload(NS(content=[NS(text='summary'),NS(text='{"tasks":[]}')]))=={'tasks':[]}
    for result in [NS(isError=True),NS(content=[NS(text='not json')])]:
        try: payload(result)
        except RuntimeError: pass
        else: raise AssertionError('Error hidden as empty tasks')
    class Writes:
        def __init__(self): self.calls=[];self.fail_readback=False
        async def call_tool(self,name,args,**kw):
            self.calls.append((name,args))
            if name=='complete-tasks': return NS(structuredContent={'completed':[row['id']],'failures':[],'totalRequested':1,'successCount':1,'failureCount':0})
            if self.fail_readback: raise RuntimeError('readback unavailable')
            return NS(structuredContent={'object':{**row,'checked':True},'childCount':0,'children':[]})
    w=Writes()
    await reviewed_session(w,{'operation':'review','id':row['id']})
    assert w.calls==[('fetch-object',{'type':'task','id':row['id'],'includeChildren':True})]
    result=await reviewed_session(w,{'operation':'complete','id':row['id']})
    assert result['observed']['object']['checked'] is True
    assert w.calls[-2:]==[('complete-tasks',{'ids':[row['id']]}),('fetch-object',{'type':'task','id':row['id']})]
    w.fail_readback=True
    try: await reviewed_session(w,{'operation':'complete','id':row['id']})
    except RuntimeError: pass
    else: raise AssertionError('Unknown completion hidden')
    assert sum(name=='complete-tasks' for name,args in w.calls)==2
    print('PASS Todoist private completion IO, no readback retry; Todoist fixed read tools, cursor, original text, wrong-record rejection and errors.')
asyncio.run(run())
