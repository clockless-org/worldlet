"""Exercise the portable Applet against a local app-server protocol fixture."""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid

TOOLS = Path(__file__).resolve().parents[1] / 'platform/local-tools'
sys.path.insert(0, str(TOOLS))
from codex_sessions import CodexSessions

THREAD = '12345678-1234-1234-1234-123456789abc'
OTHER = '87654321-1234-1234-1234-123456789abc'
SERVER = '''import json,pathlib,sys
root=pathlib.Path(__file__).parent
thread='12345678-1234-1234-1234-123456789abc'
def emit(value):print(json.dumps(value),flush=True)
def event(method,**params):emit({'method':method,'params':dict(threadId=thread,**params)})
for line in sys.stdin:
    b=json.loads(line)
    with (root/'calls.jsonl').open('a',encoding='utf-8') as out:out.write(json.dumps(b)+'\\n')
    method=b.get('method');args=b.get('params',{});result={}
    if method=='initialize' and (root/'fail-init').exists():sys.exit(0)
    if not method:
        assert b['id']=='approval' and b['result']['decision']=='accept'
        event('item/agentMessage/delta',delta='Fixture reply')
        event('turn/completed',turn={'id':'turn-one','status':'completed'})
        continue
    if method=='initialized':continue
    if method=='thread/list':result={'data':[{'id':thread,'name':'Fixture task','cwd':str(root)}]}
    elif method=='thread/read':result={'thread':{'id':args['threadId'],'name':'Fixture task','cwd':str(root),'canAcceptDirectInput':True}}
    elif method=='thread/turns/list':
        assert args['itemsView']=='summary' and args['limit']==10
        result={'data':[{'id':'old-turn','items':[{'type':'agentMessage','text':'Saved fixture'}]}],'nextCursor':'older'}
    elif method=='turn/start':
        text=args['input'][0]['text'];assert set(args)=={'threadId','input'}
        if text=='disconnect':sys.exit(0)
        event('turn/started',turn={'id':'turn-one'})
        result={'turn':{'id':'turn-one'}}
        if text=='fast':event('turn/completed',turn={'id':'turn-one','status':'completed'})
        elif text=='approve':emit({'id':'approval','method':'item/fileChange/requestApproval','params':{'threadId':thread,'itemId':'edit-one','reason':'Fixture edit'}})
    elif method=='turn/interrupt':event('turn/completed',turn={'id':'turn-one','status':'interrupted'})
    elif method not in {'initialize','thread/resume','account/rateLimits/read'}:raise RuntimeError('Unexpected RPC')
    emit({'id':b['id'],'result':result})
'''


def calls(root):
    return [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]


async def wait(predicate, seconds=3):
    async with asyncio.timeout(seconds):
        while not predicate():
            await asyncio.sleep(.01)


async def check(root):
    script = root / 'server.py'
    script.write_text(SERVER, encoding='utf-8')
    events = []
    client = CodexSessions(events.append, command=[sys.executable, '-X', 'utf8', str(script)])
    async def execute(operation, **args):
        return await client.execute({'operation': operation, 'threadId': THREAD, **args})
    try:
        listed = await execute('list')
        assert listed['providers'][0]['sessions'][0]['status'] == 'Saved'
        history = await execute('read')
        assert history['turns'][0]['items'][0]['text'] == 'Saved fixture' and history['nextCursor'] == 'older'
        assert not any(c.get('method') in {'thread/resume', 'turn/start'} for c in calls(root)), 'Reading history resumed execution'
        await execute('send', text='approve')
        await wait(lambda: any(e['method'] == 'worldlet/request' for e in events))
        request = next(e['params'] for e in events if e['method'] == 'worldlet/request')
        assert request['threadId'] == THREAD and client.states[THREAD] == 'Waiting for you'
        # requestId belongs to the native host, so it never names a Codex request.
        for body in [{'operation': 'respond', 'threadId': OTHER, 'serverRequestId': 'approval', 'decision': 'accept'},
                     {'operation': 'respond', 'threadId': THREAD, 'serverRequestId': 'approval', 'decision': 'acceptForSession'},
                     {'operation': 'respond', 'threadId': THREAD, 'requestId': 'approval', 'decision': 'accept'},
                     {'operation': 'respond', 'threadId': THREAD, 'serverRequestId': ['approval'], 'decision': 'accept'},
                     {'operation': 'send', 'threadId': THREAD, 'text': 'duplicate'}]:
            try:
                await client.execute(body)
                raise AssertionError('Invalid approval or duplicate send was accepted')
            except ValueError:
                pass
        await execute('respond', serverRequestId='approval', decision='accept', input={'injected': True})
        await wait(lambda: client.states.get(THREAD) == 'Completed')
        assert any(e['method'] == 'item/agentMessage/delta' for e in events)
        try:
            await execute('respond', serverRequestId='approval', decision='accept')
            raise AssertionError('Approval replay was accepted')
        except ValueError:
            pass
        await execute('send', text='fast')
        assert THREAD not in client.turns, 'A completion before the start response became stuck running'
        await execute('send', text='running')
        await execute('interrupt')
        await wait(lambda: client.states.get(THREAD) == 'Stopped')
        # Cancellation during metadata lookup must prevent resume/start entirely.
        original = client.rpc
        entered, release = asyncio.Event(), asyncio.Event()
        async def delayed(method, params=None):
            if method == 'thread/read':
                entered.set()
                await release.wait()
            return await original(method, params)
        client.rpc = delayed
        before = len([c for c in calls(root) if c.get('method') == 'turn/start'])
        starting = asyncio.create_task(execute('send', text='cancel-before-start'))
        await entered.wait(); await execute('interrupt'); release.set()
        assert (await starting)['cancelled']
        assert len([c for c in calls(root) if c.get('method') == 'turn/start']) == before
        client.rpc = original
        try:
            await execute('send', text='disconnect')
            raise AssertionError('Disconnected turn was accepted')
        except RuntimeError:
            pass
        await wait(lambda: client.transport is None)
        assert any(e['method'] == 'worldlet/disconnected' for e in events)
        assert (await execute('list'))['providers'][0]['sessions'][0]['status'] == 'Saved'
        assert not client.requests and not client.selected, 'Reconnection reused stale approvals'
        assert next(c for c in calls(root) if c.get('id') == 'approval')['result'] == {'decision': 'accept'}
        await client.close()
        (root / 'fail-init').write_text('fixture')
        try:
            await asyncio.wait_for(execute('list'), 3)
            raise AssertionError('Failed initialization was accepted')
        except RuntimeError:
            pass

    finally:
        await client.close()


async def check_host(root):
    """Drive main() as both native hosts do: every line carries a fresh host UUID
    in requestId, so an approval can name Codex's key only in serverRequestId."""
    # main() starts `<WORLDLET_CODEX_EXECUTABLE> app-server`. With the interpreter as
    # that executable, Python runs the fixture file named app-server from the
    # helper's working directory on Windows and Unix alike.
    (root / 'app-server').write_text(SERVER, encoding='utf-8')
    child = await asyncio.create_subprocess_exec(
        sys.executable, '-X', 'utf8', '-B', str(TOOLS / 'codex_sessions.py'), cwd=root,
        env={**os.environ, 'WORLDLET_CODEX_EXECUTABLE': sys.executable},
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    lines = []
    async def pump():
        while line := await child.stdout.readline():
            lines.append(json.loads(line))
    reader = asyncio.create_task(pump())
    async def request(**body):
        key = str(uuid.uuid4())
        child.stdin.write((json.dumps({**body, 'threadId': THREAD, 'requestId': key}) + '\n').encode('utf-8'))
        await child.stdin.drain()
        await wait(lambda: any(line.get('requestId') == key for line in lines), 15)
        return next(line for line in lines if line.get('requestId') == key)
    def events(method):
        return [line['value']['params'] for line in lines if line.get('type') == 'event' and line['value'].get('method') == method]
    try:
        sent = await request(operation='send', text='approve')
        assert sent['type'] == 'response', sent
        await wait(lambda: events('worldlet/request'))
        server_key = events('worldlet/request')[0]['requestId']
        # The shape every Allow/Decline had before serverRequestId existed.
        stale = await request(operation='respond', decision='accept')
        assert stale['type'] == 'error' and stale['message'] == 'This Codex request has expired.', stale
        answered = await request(operation='respond', serverRequestId=server_key, decision='accept')
        assert answered['type'] == 'response' and answered['value'] == {'ok': True}, answered
        await wait(lambda: any(p.get('turn', {}).get('status') == 'completed' for p in events('turn/completed')))
        assert [c['result'] for c in calls(root) if c.get('id') == server_key] == [{'decision': 'accept'}]
    finally:
        if child.returncode is None:
            child.stdin.close()
            try:
                await asyncio.wait_for(child.wait(), 10)
            except TimeoutError:
                child.kill()
                await child.wait()
        await asyncio.gather(reader, return_exceptions=True)


with tempfile.TemporaryDirectory(prefix='worldlet-codex-protocol-') as directory:
    asyncio.run(check(Path(directory)))
with tempfile.TemporaryDirectory(prefix='worldlet-codex-host-') as directory:
    asyncio.run(check_host(Path(directory)))
print('PASS portable Codex sessions: read-only history, explicit resume, streaming, approvals, replay rejection, early completion, stop/start races, reconnect and host-correlated approvals through main().')
