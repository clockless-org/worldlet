"""Portable Codex Applet protocol. Codex owns history, projects and approvals."""
import asyncio
import json
import os
import signal
from pathlib import Path
import sys
import uuid

from async_stdio import attach_reader
from json_rpc_process import JsonRpcProcess
from sessions import discover, codex_rows, codex_environment


class CodexSessions:
    def __init__(self, event, command=None):
        self.event = event
        self.command = command
        self.transport = None
        self.pump = None
        self.startup = None
        self.sequence = 0
        self.pending = {}
        self.requests = {}
        self.selected = set()
        self.starting = set()
        self.cancelled_starting = set()
        self.completed = set()
        self.turns = {}
        self.states = {}

    async def connect(self):
        if self.startup:
            return await asyncio.shield(self.startup)
        if self.transport:
            return
        async def start():
            executable = (os.environ.get('WORLDLET_CODEX_EXECUTABLE') or discover('codex')) if not self.command else None
            if not executable and not self.command:
                raise ValueError('Install Codex and sign in, then refresh this Applet.')
            self.transport = JsonRpcProcess(self.command or [executable, 'app-server'], env=codex_environment())
            self.pump = asyncio.create_task(self.receive())
            await self.rpc('initialize', {'clientInfo': {'name': 'worldlet_codex', 'title': 'Worldlet Codex Applet', 'version': '1.0'}, 'capabilities': {'experimentalApi': True}})
            self.transport.send({'method': 'initialized', 'params': {}})
        startup = self.startup = asyncio.create_task(start())
        try:
            await asyncio.shield(self.startup)
        except Exception:
            await self.close()
            raise
        finally:
            if startup.done() and self.startup is startup:
                self.startup = None

    async def rpc(self, method, params=None):
        if not self.transport:
            raise RuntimeError('Codex disconnected. Refresh the Applet to reconnect.')
        self.sequence += 1
        key = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[key] = future
        try:
            self.transport.send({'id': key, 'method': method, 'params': params or {}})
            return await asyncio.wait_for(future, 30)
        finally:
            self.pending.pop(key, None)

    async def receive(self):
        try:
            while self.transport:
                try:
                    value = await asyncio.to_thread(self.transport.receive, .5)
                except TimeoutError:
                    continue
                self.accept(value)
        except asyncio.CancelledError:
            return
        except Exception:
            self.event({'method': 'worldlet/disconnected', 'params': {}})
            await self.close(cancel_startup=False)

    def accept(self, value):
        if 'method' not in value:
            future = self.pending.get(value.get('id'))
            if future and not future.done():
                if 'error' in value:
                    future.set_exception(RuntimeError(str(value['error'].get('message', 'Codex request failed.'))[:2000]))
                else:
                    future.set_result(value.get('result', {}))
            return
        method = value['method']
        params = value.get('params') or {}
        thread = params.get('threadId', '')
        if 'id' in value:
            key = str(value['id'])
            if method in {'item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput'} and thread in self.selected and key not in self.requests:
                self.requests[key] = value
                self.states[thread] = 'Waiting for you'
                self.event({'method': 'worldlet/request', 'params': {'requestId': key, 'kind': method, 'details': params, 'threadId': thread}})
            else:
                self.transport.send({'id': value['id'], 'error': {'code': -32601, 'message': 'This interactive tool is not supported here. Use the original Codex client.'}})
            return
        turn = params.get('turn') or {}
        if method == 'turn/started' and turn.get('id'):
            self.turns[thread] = turn['id']
            self.states[thread] = 'Running'
        elif method == 'turn/completed':
            if turn.get('id') and thread in self.starting:
                self.completed.add(turn['id'])
            self.turns.pop(thread, None)
            self.states[thread] = {'completed': 'Completed', 'interrupted': 'Stopped', 'failed': 'Failed'}.get(turn.get('status'), 'Idle')
            self.requests = {k: r for k, r in self.requests.items() if r.get('params', {}).get('threadId') != thread}
        elif method == 'thread/status/changed' and params.get('status', {}).get('type') == 'active':
            self.states[thread] = 'Waiting for you' if params['status'].get('activeFlags') else 'Running'
        elif method == 'serverRequest/resolved':
            request = self.requests.pop(str(params.get('requestId')), None)
            if request:
                thread = request.get('params', {}).get('threadId', thread)
        if thread in self.selected:
            self.event({'method': method, 'params': params})

    def summary(self, row):
        result = codex_rows({'data': [row]})
        if not result:
            raise ValueError('Codex returned invalid session metadata.')
        result = result[0]
        key = row['id']
        return {**result, 'status': self.states.get(key, 'Saved'), 'model': row.get('model', ''), 'live': key in self.selected}

    async def execute(self, body):
        operation = body.get('operation')
        if operation not in {'list', 'usage', 'read', 'send', 'interrupt', 'respond'}:
            raise ValueError('Unknown Codex session action.')
        await self.connect()
        cursor = body.get('cursor')
        if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 8000):
            raise ValueError('Invalid session page.')
        if operation == 'usage':
            return await self.rpc('account/rateLimits/read')
        if operation == 'list':
            result = await self.rpc('thread/list', {'limit': 40, 'sortKey': 'updated_at', 'sourceKinds': ['cli', 'vscode', 'appServer', 'exec', 'unknown'], **({'cursor': cursor} if cursor else {})})
            return {'providers': [{'provider': 'codex', 'state': 'ready', 'sessions': [self.summary(row) for row in result.get('data', [])[:40]], 'hasMore': bool(result.get('nextCursor'))}], 'nextCursor': result.get('nextCursor'), 'scope': 'Live states apply to sessions running in Worldlet. Other sessions are saved history.'}
        identifier = body.get('threadId')
        try:
            uuid.UUID(identifier)
        except (ValueError, TypeError, AttributeError):
            raise ValueError('Choose a valid Codex session.') from None
        if operation == 'read':
            result = await self.rpc('thread/read', {'threadId': identifier, 'includeTurns': False})
            if result.get('thread', {}).get('id') != identifier:
                raise ValueError('Codex returned a different session. Refresh the Applet.')
            history = await self.rpc('thread/turns/list', {'threadId': identifier, 'limit': 10, 'itemsView': 'summary', **({'cursor': cursor} if cursor else {})})
            return {'session': self.summary(result['thread']), 'turns': history.get('data', []), 'nextCursor': history.get('nextCursor')}
        if operation == 'send':
            text = body.get('text')
            if not isinstance(text, str) or not text.strip() or len(text.encode('utf-8')) > 32000:
                raise ValueError('Enter a shorter message for Codex.')
            if identifier in self.starting or identifier in self.turns:
                raise ValueError('This Codex session is already running. Wait or stop it first.')
            self.starting.add(identifier)
            turn_id = None
            try:
                meta = await self.rpc('thread/read', {'threadId': identifier, 'includeTurns': False})
                thread = meta.get('thread') or {}
                if thread.get('id') != identifier:
                    raise ValueError('Codex returned a different session. Refresh the Applet.')
                if not thread.get('cwd') or not Path(thread['cwd']).is_dir():
                    raise ValueError('This session\u2019s project folder is missing. Restore it before continuing.')
                if thread.get('canAcceptDirectInput') is False:
                    raise ValueError('Continue this subagent from its parent Codex session.')
                if identifier in self.cancelled_starting:
                    return {'ok': True, 'cancelled': True}
                if identifier not in self.selected:
                    await self.rpc('thread/resume', {'threadId': identifier, 'excludeTurns': True})
                    self.selected.add(identifier)
                if identifier in self.cancelled_starting:
                    return {'ok': True, 'cancelled': True}
                result = await self.rpc('turn/start', {'threadId': identifier, 'input': [{'type': 'text', 'text': text, 'text_elements': []}]})
                turn_id = result.get('turn', {}).get('id')
                if turn_id and turn_id not in self.completed:
                    self.turns[identifier] = turn_id
                    if not any(r.get('params', {}).get('threadId') == identifier for r in self.requests.values()):
                        self.states[identifier] = 'Running'
                    if identifier in self.cancelled_starting:
                        await self.rpc('turn/interrupt', {'threadId': identifier, 'turnId': turn_id})
                return result
            finally:
                self.starting.discard(identifier)
                self.cancelled_starting.discard(identifier)
                if turn_id:
                    self.completed.discard(turn_id)
        if operation == 'interrupt':
            if identifier in self.starting:
                self.cancelled_starting.add(identifier)
            turn_id = self.turns.get(identifier)
            return await self.rpc('turn/interrupt', {'threadId': identifier, 'turnId': turn_id}) if turn_id else {'ok': True}
        # requestId is the native host's reply correlation UUID; the Codex
        # server request key arrives separately and never falls back to it.
        key = body.get('serverRequestId')
        request = self.requests.get(key) if isinstance(key, str) else None
        if not request or request.get('params', {}).get('threadId') != identifier:
            raise ValueError('This Codex request has expired.')
        if request['method'] == 'item/tool/requestUserInput':
            answers = body.get('answers')
            if not isinstance(answers, dict):
                raise ValueError('Answer the Codex question first.')
            result = {'answers': answers}
        else:
            if body.get('decision') not in {'accept', 'decline', 'cancel'}:
                raise ValueError('Choose Allow once or Decline.')
            result = {'decision': body['decision']}
        self.transport.send({'id': request['id'], 'result': result})
        self.requests.pop(key, None)
        self.states[identifier] = 'Running'
        return {'ok': True}

    async def close(self, cancel_startup=True):
        startup, self.startup = self.startup, None
        if cancel_startup and startup and startup is not asyncio.current_task() and not startup.done():
            startup.cancel()
        transport, self.transport = self.transport, None
        pump, self.pump = self.pump, None
        if pump and pump is not asyncio.current_task():
            pump.cancel()
            await asyncio.gather(pump, return_exceptions=True)
        if transport:
            await asyncio.to_thread(transport.close)
        for future in list(self.pending.values()):
            if not future.done():
                future.set_exception(RuntimeError('Codex disconnected. Refresh the Applet to reconnect.'))
        self.pending.clear()
        if startup and startup is not asyncio.current_task():
            await asyncio.gather(startup, return_exceptions=True)
        for state in (self.requests, self.selected, self.starting, self.cancelled_starting, self.completed, self.turns, self.states):
            state.clear()


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


async def main():
    reader, stop = attach_reader(sys.stdin.buffer)
    client = CodexSessions(lambda value: emit({'type': 'event', 'value': value}))
    tasks = set()
    loop = asyncio.get_running_loop()
    if os.name != "nt":
        loop.add_signal_handler(signal.SIGTERM, asyncio.current_task().cancel)
    async def request(value):
        key = value.get('requestId')
        try:
            uuid.UUID(key)
            result = await client.execute(value)
            emit({'type': 'response', 'requestId': key, 'value': result})
        except Exception as error:
            emit({'type': 'error', 'requestId': key, 'message': str(error)[:2000] or 'Codex did not respond in time.'})
    try:
        while line := await reader.readline():
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError('Invalid Codex request.')
            if len(tasks) >= 16:
                emit({'type': 'error', 'requestId': value.get('requestId'), 'message': 'Wait for the current Codex requests to finish.'})
                continue
            task = asyncio.create_task(request(value))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        stop()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await client.close()


if __name__ == '__main__':
    asyncio.run(main())
