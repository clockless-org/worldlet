"""How much of a Fox turn is Worldlet, repeated.

The fixture model answers instantly, so everything measured here is ours: getting
ready, resuming the session, crossing the bridge, running a tool. Whatever this
does not account for is the model thinking, which no amount of local work fixes.
Run it before and after touching the request path.
"""
import argparse, importlib.util, json, os, queue, statistics, subprocess, tempfile, threading, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("f", ROOT/"scripts/hermes-check.py")
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)


class Resident:
    """One host process for the whole run, which is how the app actually runs it.
    Spawning per turn measures process start, not what a person waits for."""
    def __init__(self, home):
        env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "LANG") if k in os.environ}
        env.update(HERMES_HOME=str(home), HERMES_INTERACTIVE="0", HERMES_TEST_ISOLATION="1", PYTHONUNBUFFERED="1")
        self.errors = tempfile.TemporaryFile(mode="w+")
        self.p = subprocess.Popen([str(f.PYTHON), str(f.HOST), "--serve"], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=self.errors, text=True, env=env)
        self.frames = queue.Queue()
        threading.Thread(target=lambda: [self.frames.put(json.loads(l)) for l in self.p.stdout], daemon=True).start()

    def warmup(self):
        rid = str(uuid.uuid4())
        self.p.stdin.write(json.dumps({"action": "warmup", "requestId": rid})+"\n");self.p.stdin.flush()
        while True:
            event = self.frames.get(timeout=90)
            if event.get("type") in ("result", "error"):
                return

    def turn(self, text, session="overhead"):
        rid = str(uuid.uuid4())
        self.p.stdin.write(json.dumps({"action": "chat", "text": text, "session": session, "requestId": rid})+"\n")
        self.p.stdin.flush()
        while True:
            event = self.frames.get(timeout=90)
            if event.get("type") == "tool":
                self.p.stdin.write(json.dumps({"type": "tool_result", "requestId": rid, "id": event["id"],
                                               "result": {"ok": True, "places": []}})+"\n")
                self.p.stdin.flush()
            if event.get("type") == "result":
                return event["value"]
            if event.get("type") == "error":
                self.errors.seek(0)
                raise SystemExit(self.errors.read()[-3000:])

    def close(self):
        self.p.stdin.close()
        try: self.p.wait(timeout=10)
        except subprocess.TimeoutExpired: self.p.kill()

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--turns", type=int, default=8)
    ap.add_argument("--warmup", action="store_true", help="send the launch warmup first, as the app does")
    args = ap.parse_args()
    server = f.http.server.ThreadingHTTPServer(("127.0.0.1", 0), f.Model)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    rows = []
    try:
        with tempfile.TemporaryDirectory(prefix="worldlet-overhead-") as tmp:
            home = Path(tmp)/"hermes"; home.mkdir(parents=True)
            (home/"config.yaml").write_text(json.dumps({"model": {"provider":"custom","default":"fixture-model",
                "base_url": f"http://127.0.0.1:{server.server_port}/v1"}, "tools": {"tool_search": {"enabled":"off"}}}))
            client = Resident(home)
            if args.warmup:
                client.warmup()
            for turn in range(args.turns):
                # Alternate a plain reply and one that runs a world tool.
                text = "world-fixture" if turn % 2 else "recall-fixture"
                result = client.turn(text)
                t = (result or {}).get("timings") or {}
                model = sum(c.get("durationMs",0) for c in t.get("modelCalls",[]))
                rows.append({"turn":turn,"kind":"tool" if turn%2 else "plain","total":t.get("totalMs",0),
                             "prepare":t.get("prepareMs",0),"session":t.get("sessionMs",0),
                             "model":model,"tools":t.get("toolsMs",0),
                             "ours":max(0,(t.get("totalMs",0))-model-(t.get("toolsMs",0)))})
            client.close()
    finally:
        server.shutdown()
    print(f"{'turn':>5}{'kind':>7}{'totalMs':>9}{'prepare':>9}{'session':>9}{'model':>7}{'tools':>7}{'ours':>7}")
    for r in rows:
        print(f"{r['turn']:>5}{r['kind']:>7}{r['total']:>9}{r['prepare']:>9}{r['session']:>9}{r['model']:>7}{r['tools']:>7}{r['ours']:>7}")
    warm = [r for r in rows if r["turn"] > 0]
    if warm:
        ours = [r["ours"] for r in warm]
        print(f"\nWorldlet's own share of a warm turn: median {statistics.median(ours):.0f}ms, "
              f"worst {max(ours)}ms, over {len(warm)} turns")
        print("Anything beyond this in the real app is the model thinking.")

main()
