"""A profile lock wait repeats its notice, says when it got the lock, and stops when cancelled."""
import sys
import tempfile
import threading
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "harness" / "hermes"))
import profile_lock
from profile_lock import locked_file

profile_lock.WAIT_REPEAT_SECONDS = .2
path = Path(tempfile.mkdtemp()) / "worldlet.lock"
events = []
# Hold the lock until the third notice rather than for a fixed time: on a loaded RC host the
# contending thread can start late, and a fixed hold then sees only two notices (RC e4ad024c).
waits = []
third_wait = threading.Event()
def on_wait():
    events.append("wait")
    waits.append(time.monotonic())
    if len(waits) >= 3:
        third_wait.set()
with locked_file(path):
    def contend():
        with locked_file(path, on_wait=on_wait, on_acquired=lambda: events.append("held")):
            events.append("in")
    worker = threading.Thread(target=contend)
    worker.start()
    third_wait.wait(10)
worker.join(5)
assert events.count("wait") >= 3, events
assert all(later - earlier >= profile_lock.WAIT_REPEAT_SECONDS for earlier, later in zip(waits, waits[1:])), waits
assert events[-2:] == ["held", "in"], events
# Uncontended: no notices at all.
events.clear()
with locked_file(path, on_wait=lambda: events.append("wait"), on_acquired=lambda: events.append("held")):
    pass
assert events == [], events
# Cancelled while waiting: the wait ends instead of spinning past the request.
cancelled = threading.Event()
with locked_file(path):
    errors = []
    def wait_cancelled():
        try:
            with locked_file(path, cancelled=cancelled):
                errors.append("acquired")
        except RuntimeError as error:
            errors.append(str(error))
    worker = threading.Thread(target=wait_cancelled)
    worker.start()
    time.sleep(.2)
    cancelled.set()
    worker.join(5)
assert errors == ["The request was cancelled."], errors
print("PASS profile lock: repeated wait notice, acquired notice, silent when free, cancellable wait.")
