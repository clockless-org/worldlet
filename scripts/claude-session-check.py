"""Offline continuation protocol: selected project, streaming, approval and cancellation."""
import asyncio
import io
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0,str(Path('platform/local-tools').resolve()))
import claude_session as adapter
from async_stdio import attach_reader
class Options:
    def __init__(self,**kwargs):self.__dict__.update(kwargs)
class Stream:
    def __init__(self,event):self.event=event
class Result:
    is_error=False;session_id='session-one';result='Finished'
class Assistant:pass
class Text:pass
class Allow(Options):pass
class Deny(Options):pass
async def check():
 reader,close=attach_reader(io.BytesIO(b'{"id":"fixture"}\n'))
 assert await asyncio.wait_for(reader.readline(),1)==b'{"id":"fixture"}\n'
 assert await asyncio.wait_for(reader.readline(),1)==b''
 close()
 # A tool that exits while its reader still waits on an open stdin pipe exits cleanly; reading
 # through sys.stdin.buffer aborted at shutdown ("could not acquire lock for <stdin>", 2026-10-05).
 code='import asyncio,sys\nsys.path.insert(0,%r)\nfrom async_stdio import attach_reader\nasync def main():\n attach_reader(sys.stdin.buffer)\n await asyncio.sleep(0.2)\nasyncio.run(main())\n'%str(Path('platform/local-tools').resolve())
 tool=subprocess.Popen([sys.executable,'-c',code],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 try:assert tool.wait(timeout=20)==0,tool.stderr.read().decode()[-300:]
 finally:tool.stdin.close();tool.stderr.close()

 with tempfile.TemporaryDirectory() as cwd:
  events=[]
  async def query(*,prompt,options):
   assert options.resume=='session-one' and options.cwd==cwd
   assert options.permission_mode=='default'
   assert [p async for p in prompt][0]['message']['content']=='Continue'
   answer=await options.can_use_tool('Edit',{'file':'readme'},None)
   assert isinstance(answer,Allow)
   yield Stream({'delta':{'type':'text_delta','text':'Fin'}})
   yield Stream({'delta':{'type':'text_delta','text':'ished'}})
   yield Result()
  sdk=NS(query=query,ClaudeAgentOptions=Options,get_session_info=lambda _:NS(cwd=cwd),AssistantMessage=Assistant,TextBlock=Text,ResultMessage=Result,StreamEvent=Stream,PermissionResultAllow=Allow,PermissionResultDeny=Deny)
  reader=asyncio.StreamReader()
  def emit(e):
   events.append(e)
   if e['type']=='permission':reader.feed_data(('\u007b"id":"'+e['id']+'","allow":true}\n').encode())
  with patch.dict(sys.modules,{'claude_agent_sdk':sdk}),patch.object(adapter,'discover',return_value='/local/claude'),patch.object(adapter,'emit',side_effect=emit):
   await adapter.run({'id':'session-one','text':'Continue'},reader)
   assert [e['text'] for e in events if e['type']=='delta']==['Fin','Finished']
   assert events[-1]['type']=='done'
   # A pending stdin permission read must be cancellable without a blocked thread.
   with patch.object(adapter,'emit'):
    task=asyncio.create_task(adapter.run({'id':'session-one','text':'Continue'},asyncio.StreamReader()))
    await asyncio.sleep(.01);task.cancel()
    try:await asyncio.wait_for(task,.2);raise AssertionError('not cancelled')
    except asyncio.CancelledError:pass
asyncio.run(check())
print('PASS Claude exact-session continuation, streamed text, tool permission and pending-approval cancellation')
