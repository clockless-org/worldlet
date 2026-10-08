"""Opt-in local Claude telemetry. Preserves existing statusLine and hook commands."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import time

parser=argparse.ArgumentParser()
parser.add_argument('--install', action='store_true')
args=parser.parse_args()
if not args.install:
    print('Use --install to enable local Claude state/weekly-allowance signals. No conversations are stored.')
    sys.exit()
folder=Path(os.environ.get('CLAUDE_CONFIG_DIR',str(Path.home()/'.claude')))
settings=folder/'settings.json'
value=json.loads(settings.read_text()) if settings.exists() else {}
previous=value.get('statusLine')
if previous and 'worldlet-signals/statusline.py' in previous.get('command',''):
    print('Worldlet Claude signals already enabled.');sys.exit()
if previous and previous.get('type')!='command':
    raise SystemExit('Existing statusLine is not a command; leave it unchanged and configure manually.')
signals=folder/'worldlet-signals';signals.mkdir(parents=True,exist_ok=True,mode=0o700)
if settings.exists():shutil.copy2(settings,signals/('settings-backup-'+str(time.time_ns())+'.json'))
shutil.copy2(Path(__file__).resolve().parents[1]/'platform/local-tools/claude_signal.py',signals/'collector.py')
wrapper='''import json,sys,subprocess
from collector import save, shell
raw=sys.stdin.read(1000000)
try: save(json.loads(raw))
except Exception: pass
previous=PREVIOUS
if previous: subprocess.run(shell(previous),input=raw,text=True,timeout=3)
'''.replace('PREVIOUS',repr(previous.get('command') if previous else None))
(signals/'statusline.py').write_text(wrapper)
import shlex
# Claude Code runs these commands with bash (Git Bash on Windows): POSIX quoting, forward slashes.
def run(script): return shlex.quote(Path(sys.executable).as_posix())+' '+shlex.quote((signals/script).as_posix())
command=run('collector.py')
value['statusLine']={**(previous or {}),'type':'command','command':run('statusline.py')}
for event in ['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','SessionEnd']:
    value.setdefault('hooks',{}).setdefault(event,[]).append({'matcher':'','hooks':[{'type':'command','command':command,'timeout':2}]})
tmp=settings.with_suffix('.worldlet.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(settings)
print('Enabled local Claude state and weekly-allowance signals. Existing commands preserved; settings backup saved.')
