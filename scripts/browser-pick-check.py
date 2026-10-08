"""The quick browser step choice: the real pinned Hermes runs one small-tier request with no tools.

The model is a local fixture; the parser is checked against good, bad and hostile answers."""
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness/hermes"))
from browser_pick import parse  # noqa: E402

refs = {"e1", "e2"}
assert parse('{"operation":"click","ref":"e2","reason":"Buy for Product 3"}', refs) == {"operation": "click", "ref": "e2", "reason": "Buy for Product 3"}
assert parse('Sure! {"operation":"fill","ref":"@e1","text":"Kelvin"}', refs)["text"] == "Kelvin"
assert parse('{"operation":"click","ref":"e9"}', refs)["operation"] == "none", "a ref not on the page is never used"
assert parse('{"operation":"fill","ref":"e1"}', refs)["operation"] == "none", "fill needs its text"
assert parse('{"operation":"delete_account","ref":"e1"}', refs)["operation"] == "none"
assert parse("no json here", refs)["operation"] == "none"
assert parse('{"operation":"scroll_down"}', refs) == {"operation": "scroll_down", "reason": ""}
print("PASS quick browser step parser: only page refs, fill needs text, unknown operations and prose are refused")

PYTHON = Path(os.environ["WORLDLET_HERMES_PYTHON"]) if os.environ.get("WORLDLET_HERMES_PYTHON") else ROOT / ".local/hermes-source/.venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
HOST = ROOT / "dist/WorldletWeb/hermes/host.py"
if not HOST.exists():
    HOST = ROOT / "harness/hermes/host.py"
seen, other = [], []


class Model(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'{"data": [{"id": "fixture-model", "object": "model"}]}')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if "messages" not in body:  # Hermes probes a local endpoint (/api/show) for its context length
            other.append(self.path)
            self.send_response(404); self.end_headers(); return
        seen.append({**body, "_path": self.path})
        user = next(m for m in reversed(body["messages"]) if m["role"] == "user")["content"]
        answer = json.dumps({"operation": "click", "ref": "e7", "reason": "Buy under Product 3"}) if "Step: click Buy under Product 3" in str(user) else "{}"
        if body.get("stream"):
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            chunk = {"id": "c1", "object": "chat.completion.chunk", "model": body["model"], "choices": [{"index": 0, "delta": {"role": "assistant", "content": answer}, "finish_reason": None}]}
            done = {"id": "c1", "object": "chat.completion.chunk", "model": body["model"], "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
            self.wfile.write(("data: " + json.dumps(chunk) + "\n\ndata: " + json.dumps(done) + "\n\ndata: [DONE]\n\n").encode())
        else:
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"id": "c1", "object": "chat.completion", "model": body["model"], "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}).encode())


def run(home, body):
    body = {**body, "requestId": "check-" + uuid.uuid4().hex}
    env = {k: v for k, v in os.environ.items() if not k.endswith(("API_KEY", "API_TOKEN", "ACCESS_TOKEN")) and not k.startswith(("WORLDLET_", "HERMES_"))}
    env.update(HERMES_HOME=str(home), HERMES_INTERACTIVE="0", PYTHONUTF8="1")
    p = subprocess.run([str(PYTHON), str(HOST)], input=json.dumps(body) + "\n", capture_output=True, text=True, encoding="utf-8", env=env, timeout=120)
    events = [json.loads(line) for line in p.stdout.splitlines() if line.strip()]
    assert p.returncode == 0 and events and events[-1]["type"] == "result", (events, p.stderr[-4000:])
    return events[-1]["value"], events


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="worldlet-browser-pick-") as directory:
        home = Path(directory)
        run(home, {"action": "configure", "provider": "custom", "model": "fixture-model",
                   "baseURL": f"http://127.0.0.1:{server.server_port}/v1", "apiKey": "fixture-key"})
        page = '- link "Product 2" [ref=e4]\n- button "Buy" [ref=e5]\n- link "Product 3" [ref=e6]\n- button "Buy" [ref=e7]'
        before = len(seen)
        value, events = run(home, {"action": "browser_pick", "step": "click Buy under Product 3", "url": "https://shop.example/", "page": page, "refs": ["e4", "e5", "e6", "e7"]})
        assert value["operation"] == "click" and value["ref"] == "e7", value
        requests = seen[before:]
        assert len(requests) == 1, "one model request per step: " + str(len(requests))
        assert not requests[0].get("tools"), "the choice runs without tools"
        assert "Product 3" in json.dumps(requests[0]["messages"]) and "untrusted data" in json.dumps(requests[0]["messages"])
        assert not any(e.get("type") == "tool" for e in events)
        value, _ = run(home, {"action": "browser_pick", "step": "click Checkout", "url": "https://shop.example/", "page": page, "refs": ["e4", "e5", "e6", "e7"]})
        assert value["operation"] == "none", value
    print("PASS real Hermes picks a browser step in one tool-free model request and refuses an unusable answer. Model is a fixture.")
finally:
    server.shutdown()
