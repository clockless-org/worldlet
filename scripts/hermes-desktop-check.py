"""Real Desktop adapter, loopback model, disposable profile; no account access."""
import importlib.util
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fixture", ROOT / "scripts/hermes-check.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class Client:
    def __init__(self, home):
        env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG") if k in os.environ}
        env.update(HERMES_HOME=str(home), HERMES_INTERACTIVE="0", HERMES_TEST_ISOLATION="1", PYTHONUNBUFFERED="1")
        self.errors = tempfile.TemporaryFile(mode="w+")
        self.p = subprocess.Popen([str(fixture.PYTHON), str(fixture.HOST), "--serve"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors, text=True, env=env)
        self.frames = queue.Queue()
        def read():
            for line in self.p.stdout:
                self.frames.put(json.loads(line))
        threading.Thread(target=read, daemon=True).start()

    def send(self, body):
        self.p.stdin.write(json.dumps(body)+"\n")
        self.p.stdin.flush()

    def start(self, text, session="desktop-check", **extra):
        rid = str(uuid.uuid4())
        self.send({"action": "chat", "text": text, "session": session, "requestId": rid, **extra})
        return rid

    def finish(self, rid, *, cancel_tool=False):
        events = []
        while True:
            try:
                event = self.frames.get(timeout=35)
            except queue.Empty:
                self.errors.seek(0)
                raise AssertionError(self.errors.read()[-7000:])
            assert event.get("requestId") == rid, event
            events.append(event)
            assert event["type"] != "error", event
            if event["type"] == "tool":
                assert event["name"] == "inspect_world"
                if cancel_tool:
                    self.send({"type": "cancel", "requestId": rid})
                else:
                    self.send({"type": "tool_result", "requestId": rid, "id": event["id"], "result": {"ok": True, "places": []}})
            if event["type"] == "result":
                return event["value"], events

    def close(self):
        self.p.stdin.close()
        try:
            self.p.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.p.kill(); self.p.wait()
        self.p.stdout.close()
        self.errors.close()


def main():
    server = fixture.http.server.ThreadingHTTPServer(("127.0.0.1", 0), fixture.Model)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="worldlet-desktop-check-") as tmp:
            parent = Path(tmp)
            (parent / "AGENTS.md").write_text("outside-worldlet-private-sentinel")
            home = parent / "hermes"; home.mkdir()
            (home / "config.yaml").write_text(json.dumps({"model": {"provider": "custom", "default": "fixture-model",
                "base_url": f"http://127.0.0.1:{server.server_port}/v1"}, "tools": {"tool_search": {"enabled": "off"}}}))
            # Seed the exact legacy ID/schema using Hermes' own DB API.
            env = dict(os.environ, HERMES_HOME=str(home))
            subprocess.run([str(fixture.PYTHON), "-c", "from hermes_state import SessionDB; db=SessionDB(); db.create_session('worldlet-desktop-check', 'cli'); db.append_message('worldlet-desktop-check', 'user', 'legacy-history-sentinel'); db.append_message('worldlet-desktop-check', 'assistant', 'Understood.'); db.close()"], env=env, check=True)
            child = Client(home)
            try:
                # The app sends this at launch, at background priority. It has to
                # actually stand the kernel up, or the first message the user types
                # pays about a second of reading the profile and building the
                # runtime -- work that has nothing to do with what they asked.
                warm = str(uuid.uuid4())
                child.send({"action": "warmup", "requestId": warm})
                while True:
                    frame = child.frames.get(timeout=60)
                    if frame.get("requestId") == warm and frame.get("type") == "result":
                        break
                warmed, _ = child.finish(child.start("remember-fixture"))
                # Resuming this conversation still happens on the first message --
                # the warmup cannot know which session that will be. What it does
                # remove is everything around it: reading the profile and building
                # the runtime, which is the part that used to dominate.
                timings = warmed["timings"]
                around = timings["prepareMs"] - timings.get("sessionMs", 0)
                assert around < 250, \
                    "the launch warmup left %sms of preparation around the session resume" % around
                remembered = warmed
                assert remembered["backend"] == "hermes-desktop"
                stored = remembered["session"]
                assert stored == "worldlet-desktop-check"
                assert "legacy-history-sentinel" in json.dumps(fixture.requests_seen)
                result, events = child.finish(child.start("world-fixture"))
                assert len([e for e in events if e["type"] == "tool"]) == 1, "Tool executed twice"
                assert result["session"] == stored
                trace_kinds = {e.get("kind") for e in events if e["type"] == "trace"}
                assert {"model.requested", "model.result", "tool.requested", "tool.result"} <= trace_kinds, trace_kinds
                # Wait until the actual model HTTP request is in flight, not just preparation.
                before = len(fixture.requests_seen)
                rid = child.start("slow-fixture", "stop-model")
                deadline = time.monotonic()+15
                while len(fixture.requests_seen) == before and time.monotonic() < deadline:
                    time.sleep(.02)
                assert len(fixture.requests_seen) > before
                child.send({"type": "cancel", "requestId": "unrelated-request"})
                child.send({"type": "cancel", "requestId": rid})
                result, _ = child.finish(rid)
                assert result["cancelled"] is True
                assert child.p.poll() is None
                result, _ = child.finish(child.start("world-fixture", "stop-native"), cancel_tool=True)
                assert result["cancelled"] is True
                result, _ = child.finish(child.start("recall-fixture"))
                assert result["message"] == "amber" and result["session"] == stored
                assert "outside-worldlet-private-sentinel" not in json.dumps(fixture.requests_seen)

                # A background source check is a different conversation under
                # different instructions. It must not evict the user's chat:
                # rebuilding that session costs seconds before the next reply.
                warm, _ = child.finish(child.start("recall-fixture"))
                assert "sessionMs" not in warm["timings"], "the user's own session was not resident to begin with"
                check, _ = child.finish(child.start("check-fixture", "check-1", monitor=True))
                assert check["session"] != stored, "the check must not run inside the user's own conversation"
                after, _ = child.finish(child.start("recall-fixture"))
                assert after["session"] == stored
                assert "sessionMs" not in after["timings"], \
                    "a background check evicted the user's chat session; the next message paid %sms to rebuild it" % after["timings"].get("sessionMs")
                assert after["timings"]["prepareMs"] < 400, after["timings"]["prepareMs"]
                print("PASS Desktop: tool exactly once, model/native-tool interruption, same-process continuation, bounded context, and a background check leaves the user's session warm.")
            finally:
                child.close()
            # Changing the profile must override the resumed session's old model,
            # while keeping its history. Assert the actual HTTP request, not UI metadata.
            import yaml
            config_path = home / 'config.yaml'
            config = yaml.safe_load(config_path.read_text())
            config['model']['default'] = 'fixture-model-switched'
            config_path.write_text(yaml.safe_dump(config))
            child = Client(home)
            try:
                result, _ = child.finish(child.start("recall-fixture"))
                assert result["message"] == "amber" and result["session"] == stored
                assert fixture.requests_seen[-1]['model'] == 'fixture-model-switched', fixture.requests_seen[-1]['model']
                # Session reuse must include actual conversation, not just memory.
                assert sum(m["role"] == "user" for m in fixture.requests_seen[-1]["messages"]) >= 4
                import sqlite3
                with sqlite3.connect(home / "state.db") as db:
                    assert db.execute("SELECT count(*) FROM sessions WHERE id=?", (stored,)).fetchone()[0] == 1
                print("PASS Desktop: same stored session/history after restart; no second conversation store.")
            finally:
                child.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
