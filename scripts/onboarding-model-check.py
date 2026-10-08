"""Opt-in live included-model check with fictional mail only (not OAuth/Agent acceptance)."""
import json
import os
from pathlib import Path
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
if os.environ.get('WORLDLET_LIVE_MODEL_CHECK') != '1':
    raise SystemExit('Set WORLDLET_LIVE_MODEL_CHECK=1 to use the configured development model with fictional mail.')
access = json.loads((ROOT / '.local/model-access-dev.json').read_text())
messages = json.loads((ROOT / 'scripts/fixtures/onboarding/mail.json').read_text())['messages']
policy = (ROOT / 'ui/onboarding/first-win.ts').read_text().split('export const firstWinDiscovery = `', 1)[1].split('`;', 1)[0]
promotion = {'id': 'thread:generic-sale', 'subject': 'Buy more this weekend', 'body': 'Our regular weekly advertisement: buy three decorative mugs and save 5%. No existing order, account change, deadline or personal benefit is involved.'}
cases = [('invitation', messages[:2], True, True), ('resolved', messages, False, True), ('information', messages[1:2], False, True), ('irrelevant', [promotion], False, False), ('empty', [], False, False)]
for name, records, needs_task, needs_update in cases:
    supplied = [{k: v for k, v in record.items() if k not in ('expectedKind', 'resolves')} for record in records]
    prompt = policy + '\nFor this classification check, all source records are supplied below; do not call tools or claim to have saved anything. Return only JSON with findings: [{kind: task or update, sourceId: exact record id, title: concise title, quote: one exact continuous passage from body}]. Return an empty findings list when nothing useful qualifies. Include only worthwhile updates; create a task only if it remains unfinished after considering ALL supplied messages.\n' + json.dumps(supplied)
    payload = json.dumps({'model': 'default', 'stream': False, 'max_tokens': 4096, 'messages': [{'role': 'user', 'content': prompt}]}).encode()
    req = urllib.request.Request(access['baseURL'].rstrip('/') + '/chat/completions', payload, {'Authorization': 'Bearer ' + access['token'], 'Content-Type': 'application/json', 'User-Agent': 'Worldlet-Onboarding-Rehearsal/1.0'})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit('Model request failed: HTTP ' + str(error.code) + ' ' + error.read(800).decode(errors='replace'))
    choice = result['choices'][0]
    text = (choice['message'].get('content') or '').strip()
    if not text:
        raise SystemExit('Empty model answer: ' + json.dumps({'case': name, 'finish_reason': choice.get('finish_reason'), 'usage': result.get('usage')}))
    if text.startswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0]
    findings = json.loads(text)['findings']
    assert any(f['kind'] == 'update' for f in findings) == needs_update, name + ': wrong useful-update classification'
    if not needs_task and not needs_update:
        assert findings == [], name + ': irrelevant mail must not manufacture attention'
    assert any(f['kind'] == 'task' for f in findings) == needs_task, name + ': wrong unresolved task classification'
    by_id = {m['id']: m for m in supplied}
    for finding in findings:
        assert finding['sourceId'] in by_id, name + ': invented source'
        assert finding['quote'] and finding['quote'] in by_id[finding['sourceId']]['body'], name + ': invalid evidence'
    print('PASS live DeepSeek', name, 'evidence-backed findings:', len(findings), 'seconds:', round(time.monotonic() - started, 2), flush=True)
