"""Deterministic optional-service fixture; no real model, accounts or scheduler."""
import json
from pathlib import Path
import sys

mode = sys.argv[1]
hello = json.loads(sys.stdin.readline())
caps = dict(streaming=False, tools=False, cancel=True, steer=False, memory=False, sessions=False)
if mode != 'legacy':
    caps.update(routines=True, modelConfiguration=True)
if mode == 'invalid':
    caps['routines'] = 'yes'
print(json.dumps(dict(type='hello', protocolVersion=1, id='fixture', capabilities=caps)), flush=True)
request = json.loads(sys.stdin.readline())
body = request['body']
action = body['action']
with Path('requests.txt').open('a') as output:
    output.write(action + '\n')
if action == 'status':
    value = dict(ready=True)
elif action == 'modelCatalog':
    value = dict(providers=[dict(id='fixture-provider', name='Fixture provider')])
elif action == 'modelConfigure':
    value = dict(ok=True)
elif action == 'routine_tick':
    value = dict(ok=True, executed=1)
else:
    value = dict(message='Fixture reply')
print(json.dumps(dict(type='result', requestId=request['id'], value=value)), flush=True)
