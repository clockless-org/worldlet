"""Private stdio/CDP transport for the bundled agent-browser. No model or planner.

Only this process knows the ephemeral WebSocket URL. The provider uses the
upstream directPage contract, so it cannot discover/launch another browser.
"""
import asyncio, json, os, secrets, signal, sys, tempfile
from http import HTTPStatus
from pathlib import Path


def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)


def local_reply(message):
    """The relay's own answer to a driver message that must not reach the page, or None.

    The driver checks that its connection is alive with Browser.getVersion before every
    command. Refusing it made the driver reconnect, launch this provider again and
    re-enable every domain on each command: about a tenth of a second per command and
    more than a second per click. The answer names no real browser.
    Other browser-wide operations stay refused: a direct-page driver needs none of them."""
    method = message.get("method", "")
    if method == "Browser.getVersion":
        return {"id": message.get("id"), "result": {"protocolVersion": "1.3", "product": "Worldlet", "revision": "", "userAgent": "", "jsVersion": ""}}
    if method.startswith(("Target.", "Browser.")):
        return {"id": message.get("id"), "error": {"code": -32601, "message": "Only the visible page is available"}}
    return None


def authorize_request(token, connection, request):
    if request.path != "/" + token or request.headers.get("Origin"):
        return connection.respond(HTTPStatus.FORBIDDEN, "Forbidden")


async def serve(binary):
    from websockets.asyncio.server import serve as websocket_server
    token = secrets.token_urlsafe(32)
    clients, pending = set(), {}
    serial = 1000000
    lock = asyncio.Lock()
    started = False
    commands = set()
    with tempfile.TemporaryDirectory(prefix="wl-ab-") as folder:
        env = {k: os.environ[k] for k in ("PATH", "LANG", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT") if k in os.environ}
        env.update(HOME=folder, AGENT_BROWSER_SOCKET_DIR=folder,
                   AGENT_BROWSER_SESSION="worldlet", AGENT_BROWSER_IDLE_TIMEOUT_MS="0")
        async def authorize(connection, request):
            return authorize_request(token, connection, request)
        async def socket(ws):
            nonlocal serial
            clients.add(ws)
            try:
                async for text in ws:
                    message = json.loads(text)
                    reply = local_reply(message)
                    if reply is not None:
                        await ws.send(json.dumps(reply))
                        continue
                    serial += 1
                    pending[serial] = (ws, message["id"])
                    message["id"] = serial
                    emit({"kind": "cdp", "message": message})
            finally:
                clients.discard(ws)
                for key in list(pending):
                    if pending[key][0] is ws: pending.pop(key)
        async def command(value):
            nonlocal started
            async with lock:
                child = None
                try:
                    argv = value["argv"]
                    # This is native adapter input, never arbitrary Agent shell code.
                    if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
                        raise ValueError("Invalid browser command")
                    if started and not Path(folder, "worldlet.port" if os.name == "nt" else "worldlet.sock").exists():
                        raise RuntimeError("Browser driver stopped")
                    launch = [] if started else ["-p", "worldlet"]
                    # A Windows daemon may inherit the CLI's output handle. Wait
                    # for the CLI process, not pipe EOF tied to the daemon's life.
                    with tempfile.TemporaryFile() as output:
                        child = await asyncio.create_subprocess_exec(binary, "--session", "worldlet", "--json", *launch, *argv,
                            env=env, cwd=folder, stdin=asyncio.subprocess.DEVNULL, stdout=output, stderr=asyncio.subprocess.DEVNULL)
                        await asyncio.wait_for(child.wait(), 35)
                        output.seek(0)
                        out = output.read(2**20 + 1)
                    if len(out) > 2**20: raise ValueError("Browser response too large")
                    response = json.loads(out)
                    started = True
                    emit({"kind": "result", "id": value["id"], "response": response})
                except (Exception, asyncio.CancelledError):
                    # Stop the driver too: killing only the CLI would leave a timed-out action running.
                    try: os.kill(int(Path(folder, "worldlet.pid").read_text().strip()), signal.SIGTERM)
                    except (OSError, ValueError): pass
                    if child and child.returncode is None:
                        child.kill(); await child.wait()
                    emit({"kind": "result", "id": value["id"], "response": {"success": False, "error": "Browser action interrupted. Inspect the page before retrying."}})
        async with websocket_server(socket, "127.0.0.1", 0, process_request=authorize, max_size=2**22) as server:
            port = server.sockets[0].getsockname()[1]
            env["WORLDLET_BROWSER_ENDPOINT"] = "ws://127.0.0.1:%d/%s" % (port, token)
            env["AGENT_BROWSER_PLUGINS"] = json.dumps([{"name": "worldlet", "command": sys.executable,
                "args": [str(Path(__file__).resolve()), "--provider"], "capabilities": ["browser.provider"]}])
            try:
                # Windows Proactor cannot attach a console/file via connect_read_pipe.
                # The host closes stdin on shutdown; cap each JSONL frame on both OSes.
                async def read_line():
                    line = await asyncio.to_thread(sys.stdin.buffer.readline, 2**23)
                    if len(line) >= 2**23: raise ValueError("Browser input too large")
                    return line
                emit({"kind": "ready"})
                while line := await read_line():
                    value = json.loads(line)
                    if value.get("kind") == "command":
                        task = asyncio.create_task(command(value)); commands.add(task); task.add_done_callback(commands.discard)
                    elif value.get("kind") == "cdp":
                        message = value["message"]
                        if "id" in message:
                            request = pending.pop(message["id"], None)
                            if request:
                                ws, original = request; message["id"] = original
                                try: await ws.send(json.dumps(message))
                                except Exception: pass
                        else:
                            for ws in list(clients):
                                try: await ws.send(json.dumps(message))
                                except Exception: pass
                    elif value.get("kind") == "stop": break
            finally:
                for task in list(commands): task.cancel()
                if commands: await asyncio.gather(*commands, return_exceptions=True)
                # Only the daemon in our private socket directory belongs to this pane.
                pid_file = Path(folder, "worldlet.pid")
                if pid_file.exists():
                    try:
                        pid = int(pid_file.read_text().strip())
                        os.kill(pid, signal.SIGTERM)
                        await asyncio.sleep(.5)
                        if pid_file.exists(): os.kill(pid, signal.SIGTERM if os.name == "nt" else signal.SIGKILL)
                    except (OSError, ValueError): pass



if __name__ == "__main__":
    if sys.argv[1:] == ["--provider"]:
        request = json.loads(sys.stdin.read())
        emit({"protocol": "agent-browser.plugin.v1", "success": True,
              "browser": {"cdpUrl": os.environ["WORLDLET_BROWSER_ENDPOINT"], "directPage": True}})
    else:
        asyncio.run(serve(sys.argv[1]))
