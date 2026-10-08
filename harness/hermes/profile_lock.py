"""Process-scoped profile exclusion on Windows and POSIX; no lock-file deletion."""
import contextlib
import errno
import os
import time

if os.name == "nt":
    import msvcrt
else:
    import fcntl


# While another process holds the lock, `on_wait` repeats at this interval: the host takes a silent Hermes
# for a stuck one, and a lock wait is not.
WAIT_REPEAT_SECONDS = 10


@contextlib.contextmanager
def locked_file(path, *, on_wait=None, on_acquired=None, cancelled=None):
    with path.open("a+b") as lock:
        # Windows byte-range locks need a stable byte and position. Never truncate
        # or replace this file: another process may already hold its lock.
        if os.name == "nt" and os.fstat(lock.fileno()).st_size == 0:
            lock.write(b"\0")
            lock.flush()
        notified = None
        while True:
            try:
                if os.name == "nt":
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as error:
                if error.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                    raise
                if cancelled is not None and cancelled.is_set():
                    raise RuntimeError("The request was cancelled.")
                if on_wait is not None and (notified is None or time.monotonic() - notified >= WAIT_REPEAT_SECONDS):
                    on_wait()
                    notified = time.monotonic()
                elif notified is None:
                    notified = time.monotonic()
                time.sleep(.05)
        if notified is not None and on_acquired is not None:
            on_acquired()
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)
