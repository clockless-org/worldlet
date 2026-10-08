"""Exercise the real pinned Hermes loop, memory and sessions with a local model fixture."""
import http.server
import json
import re
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness/hermes"))
from world_context import VIEW_MARKER  # noqa: E402  the marker the middleware appends the view after
PYTHON = Path(os.environ["WORLDLET_HERMES_PYTHON"]) if os.environ.get("WORLDLET_HERMES_PYTHON") else ROOT / ".local/hermes-source/.venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
HOST = ROOT / "dist/WorldletWeb/hermes/host.py"
requests_seen = []
request_headers = []
fixture_failures = []


class Model(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'{"data": [{"id": "fixture-model", "object": "model"}]}')

    def do_POST(self):
        try:
            self.respond()
        except (BrokenPipeError, ConnectionResetError):
            pass  # A native redirect intentionally closes the obsolete stream.

    def respond(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        requests_seen.append(body)
        request_headers.append(dict(self.headers))
        if "messages" not in body:
            self.send_response(404); self.end_headers(); return
        messages = body["messages"]
        last_user = next(m for m in reversed(messages) if m["role"] == "user")
        text = str(last_user["content"])
        tail = messages[messages.index(last_user)+1:]
        # A chat turn carries tools; Hermes' auxiliary passes quote the user's text without them.
        chat = bool(body.get("tools"))
        if chat and "slow-browser" in text:
            time.sleep(5)
        view = json.loads(text.split(VIEW_MARKER, 1)[1]) if VIEW_MARKER in text else {}
        if "slow-fixture" in text:
            time.sleep(8)
        if "queue-fixture" in text:
            time.sleep(0.8)
        if "privacy-fixture" in text:
            if "private-source-sentinel" in json.dumps(messages):
                fixture_failures.append("Private context was uploaded without consent")
            if not {t["function"]["name"] for t in body.get("tools", [])} <= {"describe_world_tools", "call_world_tool"}:
                fixture_failures.append("Setup exposed private tools")
            if chat and "call_world_tool" not in {t["function"]["name"] for t in body.get("tools", [])}:
                fixture_failures.append("Setup omitted public Applet navigation")
            if chat and "describe_world_tools" not in {t["function"]["name"] for t in body.get("tools", [])}:
                fixture_failures.append("Setup omitted local browser scrolling")
            assert not fixture_failures, fixture_failures
        if "style-fixture" in text and chat and "style-fixture voice" not in json.dumps(messages[0]):
            fixture_failures.append("How Fox speaks did not reach the system prompt")
        if "history-fixture" in text and chat and not (isinstance(view.get("history"), list) and view["history"] and all("kind" in e for e in view["history"])):
            fixture_failures.append("A chat turn from the app carried no world history: " + repr(view.get("history")))
        tool = None
        if chat and not any(m["role"] == "tool" for m in tail):
            if "browser-scroll-fixture" in text:
                tool = ("scroll_browser", {"direction": "down"})
            elif "browser-snapshot-fixture" in text:
                tool = ("automate_browser", {"operation": "snapshot"})
            elif "music-fixture" in text:
                tool = ("control_background_music", {"operation":"status"})
            elif "privacy-fixture" in text:
                tool = ("open_applet", {"id": "app-youtube"})
            elif "routine-fixture" in text:
                tool = ("manage_routines", {"action":"create", "name":"Fixture routine", "prompt":"Hello fixture", "schedule":"1h"})
            elif "remember-fixture" in text:
                tool = ("memory", {"action": "add", "target": "user", "content": "The user's favorite travel color is amber."})
            elif "skill-fixture" in text:
                tool = ("skill_manage", {"operations": [{"action": "create", "name": "travel-check", "content": "---\nname: travel-check\ndescription: Plan a small day trip.\n---\nAsk for the destination, then list transport and weather checks."}]})
            elif "mcp-fixture" in text:
                name = next(t["function"]["name"] for t in body["tools"] if t["function"]["name"].endswith("read_note"))
                assert not any(t["function"]["name"].endswith("delete_note") for t in body["tools"])
                tool = (name, {})
            elif "create-fixture" in text:
                places = []
                for item in messages:
                    if item["role"] == "tool":
                        try:
                            places = json.loads(item["content"]).get("places", places)
                        except (ValueError, AttributeError):
                            pass
                assert places, "Read the current world's places before creating a fixture note"
                tool = ("create_content", {"place_id": places[0]["id"], "title": "Hermes integration check", "body": "Pack a green raincoat."})
            elif "world-fixture" in text:
                tool = ("inspect_world", {})
        if "applet-fixture" in text and any(m["role"] == "tool" for m in tail) and not any(m.get("name") == "update_applet_state" or '"ephemeral": true' in str(m.get("content", "")) for m in tail):
            provider = "github" if any("github" in t["function"]["name"] for t in body.get("tools", [])) else "notion"
            tool = ("update_applet_state", {"provider":provider, "summary":"One note needs review", "needsAttention":True})
        if "source-fixture" in text and chat:
            offered = {t["function"]["name"]: t["function"].get("description", "") for t in body["tools"]}
            if "call_world_tool" not in offered:
                fixture_failures.append("A chat turn omitted the World gateway: " + repr(sorted(offered)))
            han = sorted(n for n, d in offered.items() if re.search(r"[\u4e00-\u9fff]", n + d))
            if han:
                fixture_failures.append("Fox was offered non-English tool descriptions: " + repr(han))
            instructions = json.dumps(messages[0] if messages else {})
            if "gmail/read" not in instructions:
                fixture_failures.append("The chat prompt does not tell Fox to read a source the user asks about.")
        if "ledger-fixture" in text and chat:
            names = {t["function"]["name"] for t in body.get("tools", [])}
            expected = {"query_world_items", "read_world_source", "upsert_world_items", "review_world_item", "read_world_history"}
            if names != expected:
                fixture_failures.append("Monitor tools escaped read/query/upsert boundary: " + repr(names))
            for message in tail:
                if message.get("name") == "query_world_items" and '"error"' in str(message.get("content", "")).lower():
                    fixture_failures.append("A saved check failure makes query_world_items read as a failed tool call.")
            sequence = [("query_world_items", {"provider":"gmail"}), ("read_world_source", {"provider":"apple-notes"}), ("upsert_world_items", {"items":[]})]
            step = sum(m["role"] == "tool" for m in tail)
            if step < len(sequence):
                tool = sequence[step]
        if chat and "browser-long-fixture" in text:
            step = sum(m["role"] == "tool" for m in tail)
            if step < 25:
                tool = ("automate_browser", {"operation":"open", "url":f"https://example.com/step-{step}"})
        message = {"role": "assistant", "content": "amber" if "amber" in json.dumps(messages) else "Fixture complete."}
        if "Return one JSON batch" in text and "batch-fixture" in json.dumps(messages):
            message["content"] = json.dumps({"items": [], "processedContextIds": []})
        if "steer-blue" in text or "steer-small" in text:
            time.sleep(.3)
            message["content"] = "blue" + (" small" if "steer-small" in json.dumps(messages) else "")
        if "music-fixture" in text:
            for item in tail:
                if item.get("role") == "tool":
                    try:
                        receipt=json.loads(item.get("content", "{}"))
                        if receipt.get("channel") == "music" and receipt.get("state") == "stopped":
                            message["content"] = "Music fixture complete."
                    except (ValueError, AttributeError):
                        pass
        if "connector-fixture-ok" in json.dumps(tail):
            message["content"] = "connector-fixture-ok"
        if tool:
            # The fixture plans domain work, then uses the same target/action
            # manifest as both production harnesses. Monitor tools stay bounded.
            offered = {t['function']['name'] for t in body.get('tools', [])}
            if 'call_world_tool' in offered:
                manifest = json.loads((ROOT/'dist/WorldletWeb/hermes/tools.json').read_text(encoding="utf-8"))
                route = next((a for a in manifest['actions'] + manifest['sampleActions'] if a['tool']==tool[0] and all(tool[1].get(k)==v for k,v in a['defaults'].items())), None)
                if route:
                    values = {k:v for k,v in tool[1].items() if k not in route['defaults']}
                    tool = ('call_world_tool', {'target':route['target'],'action':route['action'],'arguments':json.dumps(values)})
            message = {"role": "assistant", "content": None, "tool_calls": [{"id": "call_" + uuid.uuid4().hex, "type": "function", "function": {"name": tool[0], "arguments": json.dumps(tool[1])}}]}
        reason = "tool_calls" if tool else "stop"
        data = {"id": "chatcmpl-test", "object": "chat.completion", "created": 1, "model": "fixture-model", "choices": [{"index": 0, "message": message, "finish_reason": reason}], "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}}
        self.send_response(200)
        if body.get("stream"):
            self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            delta = {**message}; delta.pop("role", None)
            if tool:
                delta["tool_calls"][0]["index"] = 0
            chunk = {"id": data["id"], "object": "chat.completion.chunk", "created": 1, "model": "fixture-model", "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
            self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
            chunk["choices"] = [{"index": 0, "delta": {}, "finish_reason": reason}]
            self.wfile.write(("data: " + json.dumps(chunk) + "\n\ndata: [DONE]\n\n").encode())
        else:
            self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(data).encode())


class CoreFrames:
    """Replays every run's frames through Core harnessReceive, as the Mac and Windows hosts do.

    One node process (scripts/hermes-frame-validator.ts) loads the bundled
    dist/WorldletWeb/shared-core.js. Any frame Core would reject fails the check,
    naming the scenario and the frame: per-scenario result assertions alone let a
    Hermes reply that Core rejects through (#766/#787).
    """

    def __init__(self):
        self.process = None
        self.runs = 0
        self.frames = 0

    def check(self, scenario, body, frames):
        if self.process is None:
            self.process = subprocess.Popen(["node", str(ROOT / "scripts/hermes-frame-validator.ts")], cwd=ROOT,
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
        request = {"scenario": scenario, "action": body.get("action", ""), "requestId": body["requestId"], "frames": frames}
        self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n"); self.process.stdin.flush()
        line = self.process.stdout.readline()
        assert line, "The Core frame validator (scripts/hermes-frame-validator.ts) stopped"
        reply = json.loads(line)
        assert reply["ok"], f"Hermes output breaks the Core Harness protocol in scenario [{scenario}]: {reply['error']}"
        self.runs += 1
        self.frames += len(frames)

    def summary(self):
        return f"PASS every Hermes frame passes Core harnessReceive under Mac and Windows host rules ({self.frames} frames in {self.runs} runs)."


core_frames = CoreFrames()


def scenario_name(home, body):
    fields = [f"{key}={str(body[key])[:60]!r}" for key in ("action", "operation", "mode", "session", "text") if body.get(key)]
    fields += [key for key in ("monitor", "sourceAnalysis", "attentionSynthesis") if body.get(key)]
    return f"{Path(home).name}: " + " ".join(fields)


def run(home, body, *, host=HOST, extra_env=None, allowed_tools=()):
    # The native hosts always correlate a turn; Core rejects frames of an unknown turn.
    body = {**body, "requestId": body.get("requestId") or "check-" + uuid.uuid4().hex}
    env = {k: v for k, v in os.environ.items() if not k.endswith(("API_KEY", "API_TOKEN", "ACCESS_TOKEN")) and not k.startswith(("WORLDLET_", "HERMES_"))}
    env["HERMES_HOME"] = str(home)
    env["HERMES_INTERACTIVE"] = "0"
    env["PYTHONUTF8"] = "1"
    env.update(extra_env or {})
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as errors:
        p = subprocess.Popen([str(PYTHON), str(host)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True, encoding="utf-8", env=env)
        timer = threading.Timer(90, p.kill); timer.start()
        events = []
        try:
            p.stdin.write(json.dumps(body) + "\n"); p.stdin.flush()
            for line in p.stdout:
                event = json.loads(line); events.append(event)
                if event["type"] == "tool":
                    assert event["name"] in {"inspect_world", "open_applet", "_world_authorize", *allowed_tools}
                    p.stdin.write(json.dumps({"type": "tool_result", "requestId": body["requestId"], "id": event["id"], "result": {"places": [{"id": "home", "title": "Home"}], "ok": True}}) + "\n"); p.stdin.flush()
            code = p.wait(timeout=5)
            if code:
                errors.seek(0)
                raise AssertionError(str(events) + "\n" + errors.read()[-6000:])
            core_frames.check(scenario_name(home, body), body, events)
            return events[-1]["value"], events
        finally:
            timer.cancel()
            if p.poll() is None:
                p.kill()
            p.wait(timeout=5)
            p.stdin.close(); p.stdout.close()


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    if "--browser-long-smoke" in sys.argv:
        try:
            from execution_policy import configure_owned_budget
            for limit in (15, 60, 150):
                config = {"agent":{"max_turns":limit}}
                assert not configure_owned_budget(config) and config["agent"]["max_turns"] == limit
            with tempfile.TemporaryDirectory(prefix="worldlet-browser-budget-") as directory:
                home = Path(directory)
                run(home, {"action":"configure", "provider":"custom", "model":"fixture-model",
                           "baseURL":f"http://127.0.0.1:{server.server_port}/v1", "apiKey":"fixture-key"})
                config = home / "config.yaml"
                config.write_text(config.read_text().replace("max_turns: 90", "max_turns: 20"))
                assert "max_turns: 20" in config.read_text()
                result, events = run(home, {"action":"chat", "text":"browser-long-fixture", "session":"long-browser"}, allowed_tools=("automate_browser",))
                assert len([e for e in events if e.get("type")=="tool" and e.get("name")=="automate_browser"]) == 25
                assert result["message"] == "Fixture complete.", result
                assert "max_turns: 90" in config.read_text()
                print("PASS real Hermes runs 25 browser steps in one turn; legacy budget migrated, other configured budgets preserved. Model/platform are fixtures.")
                print(core_frames.summary())
        finally:
            server.shutdown()
        sys.exit(0)
    if "--browser-smoke" in sys.argv:
        try:
            with tempfile.TemporaryDirectory(prefix="worldlet-browser-hermes-") as directory:
                home = Path(directory)
                run(home, {"action": "configure", "provider": "custom", "model": "fixture-model",
                           "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture-key"})
                for marker, tool in (("browser-scroll-fixture", "scroll_browser"), ("browser-snapshot-fixture", "automate_browser")):
                    result, events = run(home, {"action": "chat", "mode": "chat", "text": marker,
                                               "session": marker}, allowed_tools=(tool,))
                    assert any(e.get("type") == "tool" and e.get("name") == tool for e in events), events
                    print(f"PASS real Hermes gateway dispatches {tool}; platform response is a fixture.")
                print(core_frames.summary())
        finally:
            server.shutdown()
        sys.exit(0)
    if "--platform-smoke" in sys.argv:
        try:
            from runtime_platform import name as platform_name
            expected = platform_name()
            with tempfile.TemporaryDirectory(prefix="worldlet-platform-hermes-") as directory:
                for mode in ("setup", "chat"):
                    home = Path(directory) / mode
                    run(home, {"action": "configure", "provider": "custom", "model": "fixture-model",
                               "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture-key"})
                    before = len(requests_seen)
                    result, _ = run(home, {"action": "chat", "mode": mode, "text": "platform-fixture",
                                          "session": mode, "platform": "untrusted-claimed-platform"})
                    calls = [r for r in requests_seen[before:] if r.get("tools") and r.get("messages")]
                    assert result.get("message") and calls, "No actual Hermes model request was observed"
                    for request in calls:
                        system = "\n".join(str(m.get("content", "")) for m in request["messages"] if m["role"] in {"system", "developer"})
                        assert f"Runtime platform: {expected}." in system, system
                        assert "with Hermes on this Mac" not in system
                        assert "untrusted-claimed-platform" not in system
                        assert "Platform identity does not grant tools or prove feature support" in system
                    print(f"PASS real Hermes {mode}: {expected} platform guidance reaches the model independently of request input")
                print(core_frames.summary())
        finally:
            server.shutdown()
        sys.exit(0)
    if "--portable-smoke" in sys.argv:
        try:
            with tempfile.TemporaryDirectory(prefix="worldlet-portable-hermes-") as directory:
                home = Path(directory) / "private"
                initial, _ = run(home, {"action": "status"})
                assert not initial["ready"], "No model credentials may be inherited"
                run(home, {"action": "configure", "provider": "custom", "model": "fixture-model", "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture-key"})
                result, events = run(home, {"action": "chat", "text": "world-fixture", "session": "portable"})
                assert result["message"] and any(e["type"] == "tool" for e in events), events
                assert any(e["type"] == "delta" for e in events), events
                assert (home / "state.db").exists()
                sample, _ = run(Path(directory) / "sample", {"action": "status"})
                assert not sample["ready"] and not sample["memories"]["USER.md"], sample
                assert not fixture_failures, fixture_failures
                print("PASS real Hermes portable host: isolated setup, local model, streaming, native tool receipts and session persistence")
                print(core_frames.summary())
        finally:
            server.shutdown()
        sys.exit(0)
    if "--serve" in sys.argv:
        print(f"http://127.0.0.1:{server.server_port}/v1", flush=True)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            server.shutdown()
        sys.exit(0)
    try:
        with tempfile.TemporaryDirectory(prefix="worldlet-hermes-check-") as directory:
            # Worldlet provides no model (owner decision 2026-10-05): a fresh profile defaults to this
            # computer's Codex sign-in, which this fixture lacks, so it is not ready until the person brings one.
            fresh_home = Path(directory) / "fresh"
            preset = json.loads((ROOT / "contracts/model-sources.json").read_text(encoding="utf-8"))["sources"]["local-codex"]
            initial, _ = run(fresh_home, {"action": "status"}, extra_env={"CODEX_HOME": str(Path(directory) / "no-codex")})
            assert initial["model"] == preset["model"] and initial["provider"] == "openai-codex", initial
            assert initial["isDefault"] and not initial["ready"], initial
            assert "worldlet-model" not in (fresh_home / "config.yaml").read_text(encoding="utf-8")
            go_home = Path(directory) / "opencode-go"
            # deepseek-v4-flash on OpenCode Go is the legacy included model and is migrated
            # to the host's default; use another Go model to test sharing itself.
            run(go_home, {"action": "configure", "provider": "opencode-go", "model": "kimi-k2", "apiKey": "fixture-go-key"})
            assert "OPENCODE_GO_API_KEY=" in (go_home / ".env").read_text(encoding="utf-8")
            go_setup = Path(directory) / "setup-go"
            go_shared, _ = run(go_setup, {"action": "status"}, extra_env={"WORLDLET_MODEL_HOME": str(go_home)})
            assert go_shared["ready"] is True and go_shared["provider"] == "opencode-go", go_shared
            own_home = Path(directory) / "own"
            run(own_home, {"action": "configure", "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "model": "fixture-model"})
            result, _ = run(own_home, {"action":"chat", "mode":"setup", "session":"public-navigation", "text":"privacy-fixture"})
            assert result["message"] == "Fixture complete." and not fixture_failures
            print("PASS setup exposes public Applet navigation without private tools.")
            for session in ["own-one", "own-one", "own-two"]:
                result, events = run(own_home, {"action": "chat", "mode": "setup", "session": session, "text": "Hello"})
                assert result["message"] == "Fixture complete." and any(e["type"] == "delta" for e in events)
            shared_home = Path(directory) / "setup"
            shared_env = {"WORLDLET_MODEL_HOME": str(own_home)}
            shared, _ = run(shared_home, {"action": "status"}, extra_env=shared_env)
            assert shared["ready"] and not shared["isDefault"], shared
            run(shared_home, {"action": "chat", "mode": "setup", "session": "shared", "text": "Hello"}, extra_env=shared_env)
            run(own_home, {"action": "configure", "model": "custom-model", "baseURL": "https://example.invalid/v1"})
            changed, _ = run(own_home, {"action": "status"})
            assert not changed["ready"] and changed["model"] == "custom-model"
            shared, _ = run(shared_home, {"action": "status"}, extra_env=shared_env)
            assert not shared["ready"] and shared["model"] == "custom-model"
            print("PASS own model: Codex default without Worldlet's model, streaming, shared model access and BYO isolation.")
            home = Path(directory) / "private"
            config = {"action": "configure", "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "model": "fixture-model"}
            run(home, config)
            result, _ = run(home, {"action": "chat", "text": "remember-fixture", "session": "memory-test"})
            assert "amber" in (home / "memories/USER.md").read_text(encoding="utf-8")
            result, events = run(home, {"action": "chat", "text": "recall-fixture", "session": "after-restart"})
            assert result["message"] == "amber"
            result, events = run(home, {"action": "chat", "text": "world-fixture", "session": "world"})
            assert any(e["type"] == "tool" for e in events), (events, [[t.get("function", {}).get("name") for t in r.get("tools", [])] for r in requests_seen if "world-fixture" in str(r.get("messages", ""))])
            run(home, {"action": "chat", "text": "source-fixture: check my email", "session": "source"})
            run(home, {"action": "chat", "text": "style-fixture", "session": "style", "style": "style-fixture voice, in short lines"})
            assert not fixture_failures, fixture_failures
            sample, _ = run(Path(directory) / "sample", {"action": "status"})
            assert not sample["memories"]["USER.md"]
            assert (home / "state.db").exists()
            run(home, {"action": "chat", "text": "skill-fixture", "session": "skill"})
            status, _ = run(home, {"action": "status"})
            assert "travel-check" in status["skills"], status
            # JSON is valid YAML: install a fixture-only stdio connection in the disposable home.
            cfg = {"model": {"provider": "custom", "default": "fixture-model", "base_url": config["baseURL"]}, "tools": {"tool_search": {"enabled": "off"}},
                   "mcp_servers": {"fixture": {"command": str(PYTHON), "args": [str(ROOT / "scripts/hermes-mcp-fixture.py")], "enabled": True, "tools": {"include": ["read_note"], "resources": False, "prompts": False}}}}
            marker = Path(directory) / "mcp-starts"
            cfg["mcp_servers"]["fixture"]["env"] = {"WORLDLET_MCP_START_MARKER": str(marker)}
            (home / "config.yaml").write_text(json.dumps(cfg))
            result, _ = run(home, {"action": "mcp", "name": "fixture", "operation": "test"})
            assert result["status"] == "connected" and "read_note" in result["tools"]
            result, _ = run(home, {"action": "chat", "text": "mcp-fixture", "session": "mcp"})
            assert result["message"] == "connector-fixture-ok", result
            # A cached tool remains available without starting the MCP server
            # for ordinary chat. Calling it later must still reconnect and read.
            assert marker.exists(), "Fixture startup marker missing"
            marker.unlink()
            # Model a still-fresh schema directory. This SDK defaults to ttl=0;
            # exercise both fresh and expired cache behavior explicitly.
            cache_path = home / "cache/mcp_schema_cache.json"
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            cache["fixture"]["ttl_ms"] = 60_000
            cache["fixture"]["written_at"] = time.time()
            cache_path.write_text(json.dumps(cache))
            before_lazy = len(requests_seen)
            run(home, {"action": "chat", "text": "Hello", "session": "lazy-chat"})
            assert not marker.exists(), "Ordinary chat eagerly connected a cached MCP server"
            assert any(t["function"]["name"].endswith("read_note") for r in requests_seen[before_lazy:] for t in r.get("tools", []))
            result, _ = run(home, {"action": "chat", "text": "mcp-fixture", "session": "lazy-read"})
            assert result["message"] == "connector-fixture-ok" and marker.exists(), (result, marker.exists())
            marker.unlink()
            cache_path = home / "cache/mcp_schema_cache.json"
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
            cache["fixture"]["ttl_ms"] = 0
            cache_path.write_text(json.dumps(cache))
            run(home, {"action": "chat", "text": "Hello", "session": "expired-cache"})
            assert marker.exists(), "Expired tool schemas must be refreshed"
            print("PASS lazy MCP: cached tools without server startup; first tool use reconnects.")
            # GitHub uses generic MCP tools; Notion now goes through read_world_source.
            # Actual Hermes tool callbacks produce content-free scene events.
            cfg["mcp_servers"]["github"] = cfg["mcp_servers"].pop("fixture")
            (home / "config.yaml").write_text(json.dumps(cfg))
            result, events = run(home, {"action":"chat", "text":"mcp-fixture", "session":"applet-events"})
            applets = [e for e in events if e["type"] == "applet"]
            assert [e["phase"] for e in applets] == ["reading", "complete"], applets
            assert all(e["provider"] == "github" for e in applets), applets
            assert applets[0]["callId"] == applets[1]["callId"]
            assert "connector-fixture-ok" not in json.dumps(applets), "Source body leaked into scene events"
            assert not (home / "sources").exists()
            cfg["mcp_servers"]["fixture"] = cfg["mcp_servers"].pop("github")
            (home / "config.yaml").write_text(json.dumps(cfg))
            print("PASS live MCP read drives Applet lifecycle without content in UI events.")
            run(home, {"action": "mcp", "name": "fixture", "operation": "remove"})
            status, _ = run(home, {"action": "status"})
            assert not status["servers"]
            before = len(requests_seen)
            run(home, {"action": "chat", "mode": "context_analysis", "text": "derive-fixture", "session": "derive"})
            calls = [r for r in requests_seen[before:] if "messages" in r]
            assert calls and all(not r.get("tools") for r in calls)
            assert all("amber" not in json.dumps(r["messages"]) for r in calls)
            print("PASS derivation: no tools, private memories or prior conversation in source analysis.")
            # Background batches save through upsert_world_items, yet the turn still ends in a
            # chat result: the Harness contract (core/agent/harness-protocol.ts) rejects an empty one.
            result, _ = run(home, {"action": "chat", "mode": "chat", "monitor": True, "sourceAnalysis": True, "text": "batch-fixture",
                                   "session": "batch", "_background": True}, allowed_tools=("query_world_items", "upsert_world_items"))
            assert isinstance(result.get("message"), str) and result["message"].strip(), result
            print("PASS background batch ends with a non-empty final reply.")
            print("PASS real Hermes: reusable skill persistence, MCP discovery/read with write filtering, and disconnect.")
            print("PASS real Hermes: tool dispatch, streaming, persistent memory after process restart, session database and sample isolation.")
            print(core_frames.summary())
    finally:
        server.shutdown()
