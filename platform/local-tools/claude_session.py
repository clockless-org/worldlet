"""Resume one locally discovered Claude Code session; JSONL over private pipes."""
import asyncio
import json
import os
from pathlib import Path
import re
import signal
import sys
import uuid
from sessions import discover
from async_stdio import attach_reader

def emit(value):print(json.dumps(value,ensure_ascii=False),flush=True)

async def run(request, reader):
    from claude_agent_sdk import query, ClaudeAgentOptions, get_session_info, AssistantMessage, TextBlock, ResultMessage, StreamEvent, PermissionResultAllow, PermissionResultDeny
    identifier=request.get('id','');text=request.get('text','')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',identifier) or not isinstance(text,str) or not 1<=len(text)<=30000:raise ValueError('Invalid session request.')
    info=get_session_info(identifier)
    if not info or not info.cwd or not Path(info.cwd).is_dir():raise ValueError('The selected session or its project is no longer available.')
    executable=discover('claude')
    if not executable:raise ValueError('Install and sign in to Claude Code first.')
    async def permission(name,args,context):
        token=str(uuid.uuid4());emit({'type':'permission','id':token,'tool':name,'input':args})
        raw=await reader.readline()
        answer=json.loads(raw) if raw else {}
        if answer.get('id')==token and answer.get('allow') is True:return PermissionResultAllow(updated_input=args)
        return PermissionResultDeny(message='The user did not allow this operation.',interrupt=False)
    options=ClaudeAgentOptions(resume=identifier,cwd=info.cwd,cli_path=executable,permission_mode='default',can_use_tool=permission,setting_sources=['user','project','local'],include_partial_messages=True,max_turns=30)
    async def prompt():yield {'type':'user','message':{'role':'user','content':text}}
    completed=False;reply='';streamed=False
    async for message in query(prompt=prompt(),options=options):
        if isinstance(message,StreamEvent):
            delta=message.event.get('delta',{})
            if delta.get('type')=='text_delta':
                streamed=True;reply+=delta.get('text','');emit({'type':'delta','text':reply})
        elif isinstance(message,AssistantMessage) and not streamed:
            part='\n'.join(b.text for b in message.content if isinstance(b,TextBlock))
            if part:reply+=('\n\n' if reply else '')+part;emit({'type':'delta','text':reply})
        elif isinstance(message,ResultMessage):
            if message.is_error:raise RuntimeError(message.result or 'Claude Code could not finish this turn.')
            if message.session_id!=identifier:raise RuntimeError('Claude Code returned a different session. Refresh the session list.')
            emit({'type':'done','message':message.result or reply,'sessionId':identifier});completed=True
    if not completed:raise RuntimeError('Claude Code stopped before confirming completion.')

async def main():
    reader,close=attach_reader(sys.stdin.buffer)
    request=json.loads(await reader.readline());task=asyncio.create_task(run(request,reader))
    loop=asyncio.get_running_loop()
    if os.name != "nt":loop.add_signal_handler(signal.SIGTERM,task.cancel)
    try:await task
    except asyncio.CancelledError:emit({'type':'error','message':'Claude Code was stopped.'})
    except Exception as error:emit({'type':'error','message':str(error)[:1200]})
    finally:close()

if __name__=='__main__':asyncio.run(main())
