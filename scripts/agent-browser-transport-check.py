"""Verify the actual private WebSocket handshake, without opening any account."""
import asyncio, importlib.util
from pathlib import Path
from websockets.asyncio.server import serve
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus
spec=importlib.util.spec_from_file_location('worldlet_agent_browser',Path(__file__).resolve().parents[1]/'platform/browser/agent_browser.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
async def check():
    async def echo(ws):
        async for message in ws: await ws.send(message)
    async with serve(echo,'127.0.0.1',0,process_request=lambda connection,request:module.authorize_request('fixture-secret',connection,request)) as server:
        endpoint='ws://127.0.0.1:'+str(server.sockets[0].getsockname()[1])
        for path,origin in [('/wrong',None),('/fixture-secret','https://example.com')]:
            try:
                async with connect(endpoint+path,origin=origin,proxy=None): raise AssertionError('Unauthorised WebSocket accepted')
            except InvalidStatus as error: assert error.response.status_code==403
        async with connect(endpoint+'/fixture-secret',proxy=None) as ws:
            await ws.send('fixture');assert await ws.recv()=='fixture'
    print('PASS private CDP transport: wrong token rejected, browser Origin rejected, authorised local client accepted')
asyncio.run(check())
# The driver's liveness probe is answered here, so it keeps one connection instead of
# reconnecting (and relaunching the provider) before every command.
alive=module.local_reply({'id':7,'method':'Browser.getVersion'})
assert alive['id']==7 and alive['result']['protocolVersion'] and 'error' not in alive
for method in ['Target.getTargets','Target.createTarget','Browser.close']:
    assert module.local_reply({'id':8,'method':method})['error']['code']==-32601,method
assert module.local_reply({'id':9,'method':'Runtime.evaluate'}) is None
print('PASS private CDP transport: liveness answered locally, other browser-wide operations refused, page commands relayed')
