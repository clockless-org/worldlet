import asyncio
import sys
import json
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from linear_mcp import read_session
ISSUE={'id':'0b6c1a2e-uuid','identifier':'ENG-142','title':'Fix sign-in loop','description':'Steps to reproduce\n\n1. Open','url':'https://linear.app/acme/issue/ENG-142/fix','status':'In Progress','priority':{'value':1,'name':'Urgent'},'team':{'name':'Engineering'},'labels':[{'name':'Bug'},{'name':'Windows'}],'dueDate':'2026-10-09','assignee':{'name':'Kelvin'}}
class Session:
    def __init__(self,props,shape):self.calls=[];self.props=props;self.shape=shape;self.failed=False;self.different=False
    async def list_tools(self):
        return SimpleNamespace(tools=[SimpleNamespace(name='list_issues',inputSchema={'type':'object','properties':{k:{} for k in self.props}}),SimpleNamespace(name='get_issue',inputSchema={})])
    async def call_tool(self,name,args,**kwargs):
        self.calls.append((name,args))
        row={**ISSUE,'identifier':'ENG-999'} if self.different else ISSUE
        if name=='get_issue':data=row
        elif self.shape=='list':data=[row]
        elif self.shape=='paged':data={'issues':[row],'pageInfo':{'hasNextPage':not args.get('cursor'),'endCursor':'c2'}}
        else:data={'issues':[row],'hasNextPage':False}
        return SimpleNamespace(isError=self.failed,structuredContent=None,content=[SimpleNamespace(text=json.dumps(data))])
async def check():
 # Arguments follow the server's advertised schema: the person's own issues, newest first, a bounded page.
 s=Session(['assignee','limit','orderBy','cursor','includeArchived','query'],'paged')
 result=await read_session(s,{'operation':'list'})
 assert s.calls[-1]==('list_issues',{'assignee':'me','limit':20,'orderBy':'updatedAt','includeArchived':False}),s.calls
 page=result['pages'][0]
 assert page['id']=='ENG-142' and page['title']=='Fix sign-in loop' and page['list']=='In Progress · Urgent · 2026-10-09',page
 assert result['next']=='c2'
 result=await read_session(s,{'operation':'list','cursor':'c2'})
 assert s.calls[-1][1]['cursor']=='c2' and result['next'] is None
 s=Session(['assigneeId','first','after'],'list')
 result=await read_session(s,{'operation':'list'})
 assert s.calls[-1]==('list_issues',{'assigneeId':'me'}) and result['next'] is None
 # A schema without a cursor argument never sends a cursor it cannot honor.
 s=Session(['limit'],'dict')
 try:await read_session(s,{'operation':'list','cursor':'c2'})
 except RuntimeError:pass
 else:raise AssertionError('Unsupported cursor sent')
 result=await read_session(s,{'operation':'read','id':'ENG-142'})
 assert s.calls[-1]==('get_issue',{'id':'ENG-142'})
 assert result['text']=='Steps to reproduce\n\n1. Open' and result['details']['labels']=='Bug, Windows' and result['details']['team']=='Engineering'
 assert result['url']=='https://linear.app/acme/issue/ENG-142/fix'
 for body in [{'operation':'create_issue'},{'operation':'read','id':'../secret'},{'operation':'list','cursor':7}]:
  n=len(s.calls)
  try:await read_session(s,body)
  except ValueError:pass
  else:raise AssertionError('Invalid operation allowed')
  assert len(s.calls)==n
 s.different=True
 try:await read_session(s,{'operation':'read','id':'ENG-142'})
 except RuntimeError:pass
 else:raise AssertionError('Identity change accepted')
 s.different=False;s.failed=True
 try:await read_session(s,{'operation':'list'})
 except RuntimeError:pass
 else:raise AssertionError('Provider error treated as empty')
 bad=Session(['limit'],'dict')
 async def evil(name,args,**kwargs):return SimpleNamespace(isError=False,structuredContent={'issues':[{**ISSUE,'url':'https://evil.example/x'}]},content=[])
 bad.call_tool=evil
 assert (await read_session(bad,{'operation':'list'}))['pages'][0]['url']=='https://linear.app/'
 assert all(n in ['list_issues','get_issue'] for n,a in s.calls)
asyncio.run(check())
print('PASS Linear fixed reads, schema-fitted list arguments, cursors, identity checks, errors and link origin.')
