"""Execute host-admitted Attention work without a second scheduling ledger.

Worldlet owns durable claims, retries, revision receipts and cancellation recovery.
The Harness executes a bounded source/model child after _attention_begin accepts it.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time


def worker(body, home, native, cancelled):
    """Separate source/model child; a monitor never loads private chat history."""
    timeout = body.get('_taskTimeoutSeconds')
    if type(timeout) is not int or not 15 <= timeout <= 600:
        raise ValueError('Missing host execution budget.')
    # The included model credential arrives only through this process environment, never a tool reply.
    env = dict(os.environ)
    env.update(HERMES_HOME=str(home), HOME=str(home), USERPROFILE=str(home))
    if body.get('attentionSynthesis'):
        env['WORLDLET_MODEL_HOME'] = os.environ['HERMES_HOME']
        env.pop('WORLDLET_GOOGLE_CLIENT_FILE', None)
        env.pop('WORLDLET_SOURCE_HOME', None)
    Path(home).mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen([sys.executable, '-X', 'utf8', '-B', str(Path(__file__).with_name('host.py'))],
                               cwd=home, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
    finished = threading.Event()

    def watch():
        end = time.monotonic() + timeout
        while not finished.wait(.1):
            if cancelled.is_set() or time.monotonic() >= end:
                process.kill()
                return

    threading.Thread(target=watch, daemon=True).start()
    try:
        process.stdin.write(json.dumps(body) + '\n'); process.stdin.flush()
        while True:
            line = process.stdout.readline(2_000_001)
            if not line or len(line) > 2_000_000:
                raise RuntimeError('Attention worker stopped or exceeded its response limit.')
            event = json.loads(line)
            if cancelled.is_set():
                raise RuntimeError('Attention job cancelled.')
            if event.get('type') == 'tool':
                reply = native(event['name'], event.get('args', {}))
                process.stdin.write(json.dumps({'type':'tool_result','requestId':event.get('requestId'),'id':event['id'],'result':reply}) + '\n')
                process.stdin.flush()
            elif event.get('type') == 'result':
                return event['value']
            elif event.get('type') == 'error' and isinstance(event.get('message'), str) and event['message']:
                # Already redacted by host.py; the host classifies it and persists only a code.
                raise RuntimeError(event['message'][:1800])
            elif event.get('type') in ('error', 'model_required'):
                raise RuntimeError('Attention worker could not complete the job.')
    finally:
        finished.set()
        if process.poll() is None: process.kill()
        process.wait()
        process.stdin.close(); process.stdout.close()


def tick(home, native, cancelled, run=worker):
    ran = False

    def call(name, args):
        if cancelled.is_set(): raise RuntimeError('Attention job cancelled.')
        result = native(name, args)
        if result.get('error'): raise RuntimeError(result['error'])
        return result

    for kind in ('collection', 'synthesis'):
        if cancelled.is_set(): break
        job = call('_attention_plan', {'kind':kind}).get('job')
        if job is None: continue
        if job.get('kind') != kind or not isinstance(job.get('key'), str) or not job['key'] or not isinstance(job.get('revision'), str):
            raise ValueError('Invalid attention plan.')
        execution = job.get('execution')
        if not isinstance(execution,dict) or type(execution.get('timeoutSeconds')) is not int or not 15 <= execution['timeoutSeconds'] <= 600:
            raise ValueError('Missing host execution plan.')
        success = False
        started = False
        failure = None
        try:
            call('_attention_begin', {'job':job['id']})
            started = ran = True

            def tools(name, args):
                if cancelled.is_set(): raise RuntimeError('Attention job cancelled.')
                return native('_attention_tool', {'job':job['id'],'name':name,'args':args})

            if kind == 'collection':
                provider = job['provider']
                def read(args):
                    return run({'action':'world_tool','name':'read_world_source','args':args,'_background':True,'_taskTimeoutSeconds':execution['timeoutSeconds']}, home, tools, cancelled)
                requests = execution.get('reads')
                if not isinstance(requests,list) or len(requests)>4 or any(r.get('provider') != provider for r in requests):
                    raise ValueError('Invalid collection read plan.')
                for request in requests:
                    if not isinstance(read(request).get('records'),list): raise ValueError('Source returned no records.')
                followups = call('_attention_followups', {'job':job['id']}).get('reads')
                if not isinstance(followups,list) or len(followups)>20 or any(r.get('provider') != provider for r in followups):
                    raise ValueError('Invalid follow-up read plan.')
                for request in followups: read(request)
            elif not job.get('modelFree'):
                monitor = Path(home).parent.parent / 'monitor' / 'hermes'
                run({'action':'chat','mode':'chat','monitor':True,'attentionSynthesis':True,'_background':True,
                     'session':'attention-'+job['id'],
                     '_taskTimeoutSeconds':execution['timeoutSeconds'],'text':execution['prompt']},
                    monitor, tools, cancelled)
            success = True
        except Exception as error:
            success = False
            failure = str(error)[:1800]
        finally:
            # A rejected claim must not settle somebody else's run. On process
            # cancellation the host's finally/recovery path settles its own claim.
            if started and not cancelled.is_set():
                # Classification input only; the host persists a code, never this text.
                call('_attention_finish', {'job':job['id'],'success':success,**({'error':failure} if failure else {})})
    return {'ran':ran}
