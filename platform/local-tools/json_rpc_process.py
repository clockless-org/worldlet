"""Bounded JSON-lines RPC over subprocess pipes on Windows and Unix."""
import json
import os
import queue
import subprocess
import threading


class JsonRpcProcess:
    def __init__(self, command, env=None):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, env=env,
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        self.events = queue.Queue(maxsize=8)
        self.stopped = threading.Event()
        self.writer = threading.Lock()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _put(self, value):
        while not self.stopped.is_set():
            try:
                self.events.put(value, timeout=.1)
                return
            except queue.Full:
                pass

    def _read(self):
        try:
            while not self.stopped.is_set():
                line = self.process.stdout.readline(32_000_001)
                if not line:
                    raise RuntimeError('The local coding tool disconnected.')
                if len(line) > 32_000_000 or not line.endswith(b'\n'):
                    raise ValueError('The coding tool response exceeded its limit.')
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError('Invalid coding tool response.')
                self._put(value)
        except Exception as error:
            self._put(error)

    def send(self, value):
        data = (json.dumps(value, ensure_ascii=False) + '\n').encode('utf-8')
        if len(data) > 2_000_000:
            raise ValueError('The coding tool request exceeded its limit.')
        with self.writer:
            self.process.stdin.write(data)
            self.process.stdin.flush()

    def receive(self, timeout):
        try:
            value = self.events.get(timeout=max(0, timeout))
        except queue.Empty:
            raise TimeoutError('The local coding tool did not respond in time.') from None
        if isinstance(value, Exception):
            raise value
        return value

    def close(self):
        self.stopped.set()
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.reader.join(timeout=2)
        self.process.stdin.close()
        self.process.stdout.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
