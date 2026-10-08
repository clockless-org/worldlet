"""Bounded Docker Desktop/local-engine inventory. No logs, env, exec or writes."""
import json
import os
import re
import subprocess


def run(executable, arguments):
    result = subprocess.run([executable, *arguments], capture_output=True, timeout=6,
        env={k: v for k, v in os.environ.items() if k in ['HOME', 'USERPROFILE', 'PATH', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA']},
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        raise ValueError('Start Docker Desktop or your local Docker engine, then retry.')
    if len(result.stdout) > 2_000_000:
        raise ValueError('Docker returned too much data for this reader.')
    return result.stdout.decode('utf-8')


def read(operation, identifier='', call=None):
    if operation not in ['list', 'read'] or (operation == 'read' and not re.fullmatch(r'[a-f0-9]{64}', identifier)):
        raise ValueError('Choose a container from the current list.')
    if call is None:
        from sessions import discover
        executable = discover('docker')
        if not executable:
            raise ValueError('Install and start Docker Desktop, then reopen Docker in Worldlet.')
        call = lambda args: run(executable, args)
    context = call(['context', 'show']).strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', context):
        raise ValueError('Unsupported Docker context name.')
    endpoint = json.loads(call(['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']))
    if not isinstance(endpoint, str) or not endpoint.startswith(('unix:///', 'npipe:////./pipe/')):
        raise ValueError('This Applet reads a local Docker engine. Select a local context in Docker Desktop first.')
    command = ['--context', context, 'container']
    if operation == 'list':
        rows = [json.loads(line) for line in call(command + ['ls', '--all', '--no-trunc', '--last', '100', '--format', '{{json .}}']).splitlines() if line.strip()]
        if len(rows) > 100:
            raise ValueError('Docker exceeded the inventory limit.')
        pages = []
        for row in rows:
            key = row.get('ID')
            if not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{64}', key):
                raise ValueError('Docker returned an invalid container ID.')
            pages.append({'id': key, 'title': str(row.get('Names', key)), 'list': str(row.get('Status', '')),
                          'description': str(row.get('Image', '')), 'details': {'image': str(row.get('Image', '')), 'status': str(row.get('State', '')), 'context': context}})
        return {'pages': pages, 'next': None, 'connected': True, 'scope': 'Local Docker · Up to 100 recent containers · ' + context}
    # Do not collect environment variables, command arguments, labels, mount paths or health-check output.
    template = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"status":{{json .State.Status}},"started":{{json .State.StartedAt}},"finished":{{json .State.FinishedAt}},"exitCode":{{json .State.ExitCode}},"restarts":{{json .RestartCount}}}'
    row = json.loads(call(command + ['inspect', '--format', template, identifier]))
    if row.get('id') != identifier:
        raise ValueError('Docker returned a different container. Refresh the list.')
    return {'id': identifier, 'title': str(row.get('name', identifier)).lstrip('/'), 'text': '',
            'details': {**{k: row[k] for k in ['image', 'status', 'started', 'finished', 'exitCode', 'restarts'] if k in row}, 'context': context},
            'notice': 'Local container metadata. Logs, environment, terminal access and start/stop remain in Docker Desktop.'}
