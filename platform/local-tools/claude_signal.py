"""Optional Claude Code hooks/statusLine sink. Never stores prompt or transcript text."""
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid


def root():
    return Path(os.environ.get('CLAUDE_CONFIG_DIR', str(Path.home() / '.claude'))) / 'worldlet-signals'


def shell(command):
    """Argv that runs a statusLine/hook command as Claude Code does: sh, or Git Bash on Windows."""
    if os.name != 'nt':
        return ['/bin/sh', '-c', command]
    bash = os.environ.get('CLAUDE_CODE_GIT_BASH_PATH')
    git = shutil.which('git')
    if not bash and git:
        # Git for Windows keeps git.exe in cmd, bin or mingw64/bin; bash.exe lives in bin.
        for parent in Path(git).resolve().parents:
            if (parent / 'bin' / 'bash.exe').is_file():
                bash = str(parent / 'bin' / 'bash.exe')
                break
    return [bash or 'bash', '-c', command]


def save(value):
    session = str(value.get('session_id', ''))
    try:
        session = str(uuid.UUID(session))
    except ValueError:
        return
    folder = root()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = folder / (session + '.json')
    try:
        old = json.loads(target.read_text())
    except (OSError, ValueError):
        old = {}
    now = time.time()
    event = value.get('hook_event_name')
    state = {'UserPromptSubmit': 'Running', 'PreToolUse': 'Running', 'PostToolUse': 'Running',
             'PermissionRequest': 'Waiting for you', 'Stop': 'Completed', 'SessionEnd': 'Stopped'}.get(event)
    if state:
        old.update(state=state, stateAt=now)
    weekly = (value.get('rate_limits') or {}).get('seven_day') or {}
    used, resets = weekly.get('used_percentage'), weekly.get('resets_at')
    if isinstance(used, (int, float)) and isinstance(resets, (int, float)):
        old['weekly'] = {'usedPercent': used, 'resetsAt': resets, 'windowDurationMins': 10080}
        old['usageAt'] = now
    old['updatedAt'] = now
    # Atomic replacement keeps the reader safe while Claude writes an update.
    tmp = folder / (session + '.' + str(os.getpid()) + '.tmp')
    tmp.write_text(json.dumps(old))
    tmp.chmod(0o600)
    tmp.replace(target)


def read_signals():
    now = time.time()
    sessions, latest = {}, None
    for file in sorted(root().glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
        try:
            row = json.loads(file.read_text())
            age = now - row.get('stateAt', 0)
            # A missing Stop/crashed CLI must never animate forever.
            if 0 <= age < 120:
                sessions[file.stem] = row.get('state', 'Saved')
            if latest is None and 0 <= now-row.get('usageAt', 0) < 300 and row.get('weekly', {}).get('resetsAt', 0) > now:
                latest = row['weekly']
        except (OSError, ValueError, TypeError):
            continue
    return sessions, {'rateLimits': {'secondary': latest}} if latest else None


if __name__ == '__main__':
    try:
        save(json.loads(sys.stdin.read(1000000)))
    except (OSError, ValueError, TypeError):
        pass  # Observability never blocks the user's coding tool.
