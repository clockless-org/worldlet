"""Compare one-shot and resident Hermes without reading user sources/history.

Default: deterministic local model. --live --model-home PATH reuses only the
configured model credentials in disposable profiles and sends a short greeting;
--chat sends real chat turns in the sample world with the full prompt and every
tool, and reports each model call's tokens and cache hits.
Only durations and counts are printed; prompts, replies and credentials are never logged.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import statistics
import subprocess
import tempfile
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.local/hermes-source/.venv/bin/python3'
HOST = ROOT / 'dist/WorldletWeb/hermes/host.py'


# Three short turns; only their durations and token counts are ever printed.
CHAT_TURNS = ['你好，请只回复一句简短的问候。', '再说一句鼓励的话，一句就好。', '谢谢，再见。']


class Resident:
    def __init__(self, home, *, model_home=None, serving=True):
        env = {k: v for k, v in os.environ.items() if k in {'PATH', 'HOME', 'TMPDIR', 'LANG', 'SSL_CERT_FILE', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'}}
        env.update(HERMES_HOME=str(home), HERMES_INTERACTIVE='0', PYTHONUNBUFFERED='1')
        if model_home:
            env['WORLDLET_MODEL_HOME'] = str(model_home)
        self.started = time.perf_counter()
        self.process = subprocess.Popen([str(PYTHON), str(HOST), *(['--serve'] if serving else [])],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)

    def request(self, body, *, include_startup=False):
        identifier = uuid.uuid4().hex
        started = self.started if include_startup else time.perf_counter()
        first = None
        timer = threading.Timer(100, self.process.kill)
        timer.start()
        try:
            self.process.stdin.write(json.dumps({**body, 'requestId': identifier})+'\n')
            self.process.stdin.flush()
            for line in self.process.stdout:
                event = json.loads(line)
                assert event.get('requestId') == identifier, 'Cross-turn event'
                if event['type'] == 'delta' and first is None:
                    first = time.perf_counter()
                if event['type'] == 'tool':
                    self.process.stdin.write(json.dumps({'type': 'tool_result', 'requestId': identifier, 'id': event['id'], 'result': {'error': 'No tools needed for this greeting.'}})+'\n')
                    self.process.stdin.flush()
                if event['type'] == 'error':
                    raise RuntimeError('Hermes latency probe failed; check the model connection.')
                if event['type'] == 'result':
                    return event['value'], {'firstTextMs': round((first-started)*1000) if first else None,
                                            'totalMs': round((time.perf_counter()-started)*1000)}
            raise RuntimeError('Hermes exited before completing the probe.')
        finally:
            timer.cancel()

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdout.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--model-home', type=Path)
    parser.add_argument('--count', type=int, default=3, choices=range(1, 6))
    parser.add_argument('--chat', action='store_true',
                        help='live only: real chat turns in the sample world with the full prompt and tools, reporting each model call\'s tokens and cache hits')
    args = parser.parse_args()
    if args.chat and not args.live:
        parser.error('--chat needs --live')
    if args.live and not args.model_home:
        parser.error('--live requires an explicit --model-home')
    server = None
    if not args.live:
        spec = importlib.util.spec_from_file_location('fixture', ROOT/'scripts/hermes-check.py')
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        server = fixture.http.server.ThreadingHTTPServer(('127.0.0.1', 0), fixture.Model)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix='worldlet-latency-') as directory:
            results = {}
            for mode in ['one-shot', 'resident']:
                home = Path(directory)/mode
                home.mkdir(mode=0o700)
                if server:
                    (home/'config.yaml').write_text(json.dumps({'model': {'provider': 'custom', 'default': 'fixture-model', 'base_url': f'http://127.0.0.1:{server.server_port}/v1'}}))
                client = None
                rows = []
                try:
                    if mode == 'resident':
                        client = Resident(home, model_home=args.model_home if args.live else None)
                        client.request({'action': 'warmup'})
                    for _ in range(args.count):
                        if mode == 'one-shot':
                            client = Resident(home, model_home=args.model_home if args.live else None, serving=False)
                        if args.chat:
                            # The ordinary chat prompt with every tool, as a turn in the sample world sends it.
                            body = {'action': 'chat', 'mode': 'chat', 'sample': True, 'session': 'latency', 'text': CHAT_TURNS[len(rows) % len(CHAT_TURNS)],
                                    'context': {'location': 'Home', 'state': 'overview', 'view': {'id': 'overview', 'title': 'My Worldlet'}}}
                        else:
                            body = {'action': 'chat', 'mode': 'setup', 'session': 'latency', 'text': '你好，请只回复一句简短的问候。'}
                        value, elapsed = client.request(body, include_startup=mode == 'one-shot')
                        timings = value['timings']
                        row = {**elapsed, 'prepareMs': timings['prepareMs']}
                        if args.chat:
                            row['modelCalls'] = [{key: call.get(key) for key in ('durationMs', 'firstChunkMs', 'prompt_tokens', 'cache_read_tokens', 'output_tokens', 'toolCount')} for call in timings.get('modelCalls', [])]
                        rows.append(row)
                        if mode == 'one-shot':
                            client.close();client = None
                    results[mode] = {'samples': rows, 'medianFirstTextMs': statistics.median(r['firstTextMs'] for r in rows),
                                     'medianPrepareMs': statistics.median(r['prepareMs'] for r in rows)}
                finally:
                    if client:
                        client.close()
            print(json.dumps({'model': 'configured live endpoint' if args.live else 'deterministic local fixture', 'results': results}, indent=2))
    finally:
        if server:
            server.shutdown()


if __name__ == '__main__':
    main()
