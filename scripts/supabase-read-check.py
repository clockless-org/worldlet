import asyncio
import sys
import json
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from supabase_mcp import read_session
class Session:
    def __init__(self):self.calls=[];self.failed=False;self.structured=False;self.different=False
    async def call_tool(self,name,args,**kwargs):
        self.calls.append((name,args))
        row={'id':'wrong' if self.different else 'project123','ref':'project123','name':'Test project','status':'ACTIVE_HEALTHY','region':'us-west-1','api_key':'NEVER_RETURN','database':{'password':'NEVER_RETURN'}}
        data={'projects':[row]} if name=='list_projects' else row
        return SimpleNamespace(isError=self.failed,structuredContent=data if self.structured else None,content=[SimpleNamespace(text=json.dumps(data))])
async def check():
 s=Session()
 for structured in [False,True]:
  s.structured=structured
  result=await read_session(s,{'operation':'list'})
  assert result['pages'][0]['title']=='Test project' and result['next'] is None
  result=await read_session(s,{'operation':'read','id':'project123'})
  assert result['details']['status']=='ACTIVE_HEALTHY'
  assert 'NEVER_RETURN' not in json.dumps(result)
  assert result['url']=='https://supabase.com/dashboard/project/project123'
 for body in [{'operation':'execute_sql'},{'operation':'read','id':'../secret'},{'operation':'list','cursor':'next'}]:
  n=len(s.calls)
  try:await read_session(s,body)
  except ValueError:pass
  else:raise AssertionError('Invalid operation allowed')
  assert len(s.calls)==n
 s.different=True
 try:await read_session(s,{'operation':'read','id':'project123'})
 except RuntimeError:pass
 else:raise AssertionError('Identity change accepted')
 s.failed=True
 try:await read_session(s,{'operation':'list'})
 except RuntimeError:pass
 else:raise AssertionError('Provider error treated as empty')
 assert all(n in ['list_projects','get_project'] for n,a in s.calls)
asyncio.run(check())
print('PASS Supabase fixed reads, structured/text payloads, identity checks, errors and secret-field exclusion.')
