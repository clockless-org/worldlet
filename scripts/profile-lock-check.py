"""Real process exclusion and owner-death recovery; no Hermes or account access."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness/hermes"))
from profile_lock import locked_file


if len(sys.argv) > 1:
    with locked_file(Path(sys.argv[1]), on_wait=lambda: print("waiting", flush=True)):
        print("acquired", flush=True)
        sys.stdin.readline()
    raise SystemExit(0)

with tempfile.TemporaryDirectory(prefix="worldlet-lock-check-") as temporary:
    path = Path(temporary) / "profile.lock"
    children = []
    timers = []
    def start():
        child = subprocess.Popen([sys.executable, __file__, str(path)], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        children.append(child)
        timer = threading.Timer(15, lambda: child.kill() if child.poll() is None else None)
        timer.start(); timers.append(timer)
        return child
    try:
        first = start()
        assert first.stdout.readline().strip() == "acquired"
        second = start()
        assert second.stdout.readline().strip() == "waiting"
        # Termination must release the OS lock without removing its path.
        first.kill()
        first.wait(timeout=5)
        second.stdin.write("\n"); second.stdin.flush()
        out, err = second.communicate(timeout=5)
        assert out.strip() == "acquired" and second.returncode == 0, (out, err)
        assert path.exists()
        try:
            with locked_file(path):
                raise ValueError("fixture")
        except ValueError:
            pass
        third = start()
        third.stdin.write("\n"); third.stdin.flush()
        out, err = third.communicate(timeout=5)
        assert out.strip() == "acquired" and third.returncode == 0, (out, err)
        print("PASS profile locks exclude another process, recover after termination and release after exceptions on", os.name)
    finally:
        for timer in timers:
            timer.cancel()
        for child in children:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)
