"""Cancellable async reads from ordinary stdin pipes on Windows and Unix."""
import asyncio
import os
import threading


def _lines(stream, limit):
    """Lines from `stream`, read from its file descriptor when it has one.

    A daemon thread blocked in sys.stdin.buffer.readline() holds the buffered
    reader's lock. When the process then exits, Python cannot finalize stdin and
    aborts ("could not acquire lock for <stdin> at interpreter shutdown"), which
    macOS reports as a crash on the owner's screen (2026-10-05, the 03 Mac
    release stand-in). os.read takes no such lock.
    """
    try:
        fd = stream.fileno()
    except (AttributeError, OSError, ValueError):
        fd = None
    if fd is None:
        while True:
            line = stream.readline(limit + 1)
            yield line
            if not line:
                return
    pending = b''
    while True:
        end = pending.find(b'\n')
        if end >= 0:
            line, pending = pending[:end + 1], pending[end + 1:]
            yield line
            continue
        if len(pending) > limit:
            yield pending
            return
        chunk = os.read(fd, 65536)
        if not chunk:
            if pending:
                yield pending
            yield b''
            return
        pending += chunk


def attach_reader(stream, limit=2_000_000):
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=limit)
    stopped = threading.Event()

    def deliver(callback, *args):
        if not stopped.is_set():
            try:
                loop.call_soon_threadsafe(callback, *args)
            except RuntimeError:
                pass  # The owning process is already closing its event loop.

    def pump():
        try:
            for line in _lines(stream, limit):
                if stopped.is_set():
                    return
                if not line:
                    deliver(reader.feed_eof)
                    return
                if len(line) > limit:
                    raise ValueError('Local tool input exceeded the size limit.')
                deliver(reader.feed_data, line)
        except Exception as error:
            deliver(reader.set_exception, error)

    # A blocked stdin read must not keep asyncio.run's executor shutdown alive.
    # Native hosts close/kill their owned process tree when a turn is cancelled.
    threading.Thread(target=pump, daemon=True).start()
    return reader, stopped.set
