"""Read coding sessions and GitHub repositories. No model, resume or write API.

Codex uses its app-server protocol; Claude Code uses the official SDK's local
session functions. GitHub uses gh with existing local authorization. Conversation bodies stay in the desktop UI; the selected record identity may be supplied to Fox as UI context.
"""
import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import re
import concurrent.futures
from json_rpc_process import JsonRpcProcess
import shutil
import subprocess
import time

LIMIT = 40


def discover(name):
    candidates = [str(Path.home() / '.local/bin' / (name + ('.exe' if os.name == 'nt' else ''))), f'/opt/homebrew/bin/{name}', f'/usr/local/bin/{name}', shutil.which(name + '.exe') if os.name == 'nt' else None, shutil.which(name)]
    if name == 'docker':
        candidates += ['/Applications/Docker.app/Contents/Resources/bin/docker']
    if name == 'codex':
        candidates += [f'/Applications/{app}.app/Contents/Resources/{inner}codex' for app in ('Codex', 'ChatGPT') for inner in ('', 'codex-cli/bin/')]
        if os.name == 'nt':
            local = os.environ.get('LOCALAPPDATA')
            if local:
                candidates += [str(p) for p in sorted((Path(local) / 'OpenAI/Codex/bin').glob('*/codex.exe'), key=lambda p: p.stat().st_mtime, reverse=True)]
            shim = shutil.which('codex')
            if shim and Path(shim).suffix.lower() in {'.cmd', '.ps1'}:
                # Resolve the installed package's native binary, never execute a
                # batch shim or compose a shell command from user input.
                candidates += [str(p) for p in Path(shim).parent.glob('node_modules/@openai/codex*/vendor/*/codex/codex.exe')]

    return next((p for p in candidates if p and Path(p).is_file() and os.access(p, os.X_OK) and (os.name != 'nt' or Path(p).suffix.lower() == '.exe')), None)


def codex_environment():
    allowed = {'HOME', 'USERPROFILE', 'PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'CODEX_HOME',
               'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC',
               'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'}
    return {k: v for k, v in os.environ.items() if k.upper() in allowed}


def rpc_list(executable):
    env = codex_environment()
    with JsonRpcProcess([executable, 'app-server'], env=env) as child:
        child.send({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {'name': 'worldlet_sessions', 'version': '1.0'}}})
        deadline = time.monotonic() + 18
        while time.monotonic() < deadline:
            event = child.receive(deadline - time.monotonic())
            if event.get('id') not in [1, 2]:
                continue
            if 'error' in event:
                raise RuntimeError('protocol_error')
            if event['id'] == 1:
                child.send({'method': 'initialized', 'params': {}})
                child.send({'id': 2, 'method': 'thread/list', 'params': {'limit': LIMIT, 'sortKey': 'updated_at', 'useStateDbOnly': True, 'sourceKinds': ['cli', 'vscode', 'appServer', 'exec', 'unknown']}})
            else:
                return event['result']
        raise TimeoutError('session_list_timeout')


def text(value, limit=240):
    return str(value or '')[:limit]


def codex_rows(result):
    return [{'id': 'codex:' + text(row['id'], 100), 'sessionId': text(row['id'], 100), 'provider': 'codex',
             'title': text(row.get('name') or row.get('preview') or 'Untitled session'),
             'cwd': text(row.get('cwd'), 2000), 'updatedAt': row.get('updatedAt', 0),
             # A separate app-server cannot certify another client's live status.
             'status': 'Saved', 'branch': text((row.get('gitInfo') or {}).get('branch'))}
            for row in result.get('data', [])[:LIMIT] if row.get('id')]


def provider_sessions(provider):
    executable = discover('claude' if provider == 'claude' else 'codex')
    if not executable:
        return {'provider': provider, 'state': 'not_installed', 'sessions': []}
    try:
        if provider == 'codex':
            result = rpc_list(executable)
            return {'provider': provider, 'state': 'ready', 'sessions': codex_rows(result), 'hasMore': bool(result.get('nextCursor'))}
        from claude_agent_sdk import list_sessions
        from claude_signal import read_signals
        live_states, usage = read_signals()
        sessions = list_sessions(limit=LIMIT + 1)
        rows = [{'id': 'claude:' + row.session_id, 'sessionId': row.session_id, 'provider': 'claude',
                 'title': text(getattr(row, 'custom_title', None) or row.summary or 'Untitled session'), 'cwd': text(row.cwd, 2000),
                 'updatedAt': row.last_modified / 1000, 'status': live_states.get(row.session_id, 'Saved'), 'branch': text(row.git_branch)} for row in sessions[:LIMIT]]
        return {'provider': provider, 'state': 'ready', 'sessions': rows, 'usage': usage, 'hasMore': len(sessions) > LIMIT}
    except ImportError:
        return {'provider': provider, 'state': 'adapter_missing', 'sessions': []}
    except Exception:
        # Never return CLI stderr, SDK tracebacks or provider config/credentials.
        return {'provider': provider, 'state': 'needs_attention', 'sessions': []}


def scan(provider):
    if provider not in ['codex', 'claude']:
        raise ValueError('Unknown coding tool')
    providers = [provider_sessions(provider)]
    return {'providers': providers, 'usage': providers[0].get('usage'), 'scope': 'Recent saved sessions. Live states require fresh local signals.', 'modelCalls': 0}


def claude_read(session_id, offset=0):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', session_id):
        raise ValueError('Invalid session ID')
    from claude_agent_sdk import get_session_info, get_session_messages
    info = get_session_info(session_id)
    if info is None:
        raise ValueError('Session is no longer available')
    messages = get_session_messages(session_id, limit=41, offset=offset)
    rows = []
    for message in messages[:40]:
        content = message.message.get('content', [])
        body = content if isinstance(content, str) else '\n'.join(b.get('text', '') for b in content if isinstance(b, dict) and b.get('type') == 'text')
        if body:
            rows.append({'role': message.type, 'text': body[:8000], 'id': message.uuid})
    return {'messages': rows, 'nextOffset': offset + 40 if len(messages) > 40 else None,
            'scope': 'Saved conversation. Live execution stays in Claude Code.'}


def gh_json(arguments):
    executable = discover('gh')
    if not executable:
        raise ValueError('GitHub CLI is not installed. Install gh, then sign in with gh auth login.')
    env = dict(os.environ, GH_PROMPT_DISABLED='1', GH_PAGER='cat')
    result = subprocess.run([executable, 'api', '--hostname', 'github.com', *arguments], capture_output=True, timeout=18, env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        raise ValueError('GitHub could not be read. Check gh auth status and repository access, then retry.')
    if len(result.stdout) > 2_000_000:
        raise ValueError('GitHub response was too large')
    return json.loads(result.stdout)


def github(operation, repo='', offset=0):
    if operation == 'list':
        rows = gh_json([f'user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=40&page={offset // 40 + 1}'])
        return {'repositories': [{'id': r['full_name'], 'title': r['name'], 'fullName': r['full_name'],
                'description': text(r.get('description'), 400), 'private': r['private'], 'url': r['html_url'],
                'updatedAt': r['pushed_at'], 'status': 'Archived' if r['archived'] else 'Private' if r['private'] else 'Public',
                'language': r.get('language'), 'branch': r['default_branch']} for r in rows],
                'nextOffset': offset + 40 if len(rows) == 40 else None}
    if operation != 'read' or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repo):
        raise ValueError('Invalid repository')
    paths = [f'repos/{repo}', f'repos/{repo}/pulls?state=open&per_page=20', f'repos/{repo}/issues?state=open&per_page=20']
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        metadata, pulls, issues = list(pool.map(lambda endpoint: gh_json([endpoint]), paths))
    project = lambda r: {'number': r['number'], 'title': r['title'], 'url': r['html_url'], 'author': r['user']['login'], 'updatedAt': r['updated_at']}
    return {'repository': {'name': metadata['full_name'], 'description': metadata.get('description') or '', 'url': metadata['html_url'],
             'branch': metadata['default_branch'], 'language': metadata.get('language'), 'stars': metadata['stargazers_count'], 'updatedAt': metadata['pushed_at']},
            'pullRequests': [project(r) for r in pulls], 'issues': [project(r) for r in issues if 'pull_request' not in r],
            'scope': 'Up to 20 open pull requests and 20 recent open issue entries. Read-only GitHub CLI access.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--provider', required=True, choices=['codex', 'claude', 'github', 'docker'])
    parser.add_argument('--operation', choices=['list', 'read'], default='list')
    parser.add_argument('--id', default='')
    parser.add_argument('--offset', type=int, default=0)
    args = parser.parse_args()
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        try:
            if not 0 <= args.offset <= 100000:
                raise ValueError('Invalid page')
            if args.provider == 'docker':
                from docker_reader import read
                try:
                    result = read(args.operation, args.id)
                except ValueError as error:
                    result = {'error': str(error)}
            elif args.provider == 'github':
                result = github(args.operation, args.id, args.offset)
            elif args.operation == 'read' and args.provider == 'claude':
                result = claude_read(args.id, args.offset)
            else:
                result = scan(args.provider)
        except Exception:
            result = {'error': 'Could not read this tool. Check that it is installed, signed in, and the selected item is still available.'}
    print(json.dumps(result))
