"""Fox's status read never waits on another process's source read (#1708); no Hermes or account access."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import threading
import types

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness/hermes"))

with tempfile.TemporaryDirectory(prefix="worldlet-status-lock-") as temporary:
    os.environ["HERMES_HOME"] = temporary
    sys.modules["analytics_identity"] = types.SimpleNamespace(install=lambda: None, begin=lambda body: None)
    import host
    host.bootstrap = lambda require_model=True: {}
    host.status = lambda: {"ready": True}
    host.configure = lambda body: {"configured": True}

    # A Google read in another process holds the sources lock for its whole network call.
    holder = subprocess.Popen([sys.executable, str(ROOT / "scripts/profile-lock-check.py"), str(Path(temporary) / "worldlet.sources.lock")],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    guard = threading.Timer(20, lambda: holder.kill() if holder.poll() is None else None)
    guard.start()
    try:
        assert holder.stdout.readline().strip() == "acquired"
        def run(body):
            outcome = {}
            thread = threading.Thread(target=lambda: outcome.update(value=host.dispatch(body)), daemon=True)
            thread.start(); thread.join(2)
            return thread, outcome
        _, answer = run({"action": "status"})
        assert answer.get("value") == {"ready": True}, "status waited on the sources lock"
        # Credential and connection changes still serialize with source reads.
        configure, answer = run({"action": "configure"})
        assert answer.get("value") is None, "configure no longer waits on the sources lock"
        holder.stdin.write("\n"); holder.stdin.flush()
        holder.communicate(timeout=5)
        # The waiting configure finishes once the read lets go. It keeps the lock file
        # open while it waits, and Windows cannot delete the temporary home before then.
        configure.join(5)
        assert answer.get("value") == {"configured": True}, "configure stayed blocked after the source read ended"
        print("PASS status answers while a source read holds the sources lock; configure still waits for it")
    finally:
        guard.cancel()
        if holder.poll() is None:
            holder.kill()
        holder.wait(timeout=5)
        # Importing host moves into HERMES_HOME; Windows cannot remove the working directory.
        os.chdir(ROOT)
