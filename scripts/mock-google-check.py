"""Development mock Google: fictional reads flow through the real Gmail/Calendar code."""
import os
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
home = tempfile.mkdtemp(prefix='worldlet-mock-google-')
os.environ['HERMES_HOME'] = home
os.environ.pop('WORLDLET_MOCK_GOOGLE_ALLOWED', None)
import host  # noqa: E402
import mock_google  # noqa: E402
from source_reader import normalize  # noqa: E402

# Release builds never enable the rehearsal account.
try:
    host._google({'operation': 'connect', 'mock': True})
    raise AssertionError('Mock Google must require a development build')
except RuntimeError as error:
    assert 'development' in str(error)
assert not mock_google.enabled(home)

os.environ['WORLDLET_MOCK_GOOGLE_ALLOWED'] = '1'
assert host._google({'operation': 'connect', 'mock': True, 'services': ['gmail', 'google-calendar']})['ok']
assert mock_google.enabled(home) and host._google({'operation': 'status'})['clientReady']
assert host._google({'operation': 'test', 'service': 'gmail'})['label'] == mock_google.EMAIL

# First background page: the real reader pages threads through scanMessages.
page = host._google({'operation': 'read', 'service': 'gmail', 'threads': True, 'scanMessages': True, 'query': 'in:anywhere', 'limit': 5})
assert len(page['records']) == 5 and page['nextPageToken'], page['nextPageToken']
rest = host._google({'operation': 'read', 'service': 'gmail', 'threads': True, 'scanMessages': True, 'query': 'in:anywhere', 'limit': 20, 'pageToken': page['nextPageToken']})
records = normalize('gmail', {'records': page['records'] + rest['records']})
assert len(records) == len(mock_google.THREADS), len(records)
dental = next(r for r in records if 'Bright Smile' in r['text'])
assert mock_google.DEMO_BOOKING in dental['text'] and dental['id'].startswith('thread:')
assert any(r.get('labelIds') == ['CATEGORY_PROMOTIONS'] for r in records), 'noise stays labelled for filtering'
# Incremental polling finds nothing new; discovery searches still match.
import time
assert host._google({'operation': 'read', 'service': 'gmail', 'threads': True, 'scanMessages': True, 'query': 'after:%d' % int(time.time()), 'limit': 20})['records'] == []
assert host._google({'operation': 'read', 'service': 'gmail', 'discovery': True})['records']
# Fox reading one original thread.
one = host._google({'operation': 'read', 'service': 'gmail', 'threads': True, 'id': dental['id']})
assert one['records'][0]['data']['thread']['messages']

calendar = host._google({'operation': 'read', 'service': 'google-calendar', 'windowDays': 30, 'limit': 20})
events = normalize('google-calendar', calendar)
assert {e['title'] for e in events} >= {'Team standup', '1:1 with Priya'}, [e['title'] for e in events]
assert all(e.get('start') for e in events)
assert host._google({'operation': 'read', 'service': 'google-calendar', 'id': 'standup01'})['records'][0]['id'] == 'standup01'
# Preparing a reply only reads the thread; Fox shows it for review. Sending stays refused.
draft = host._google({'operation': 'prepare_email', 'draft': {'threadId': 'thread:e8b1e8b1e8b1e8b1', 'subject': 'Re', 'body': 'Count me in for Saturday!'}})
assert draft['to'] == 'sam.okafor@example.com' and draft['subject'] == 'Dinner Saturday?' and draft['threadId'] == 'e8b1e8b1e8b1e8b1', draft
assert host._google({'operation': 'mail_access'}) == {'canSend': False}
try:
    host._google({'operation': 'send_email', 'draft': {}, 'id': 'x'})
    raise AssertionError('Mock Google must not send mail')
except RuntimeError:
    pass

assert host._google({'operation': 'disconnect'})['ok'] and not mock_google.enabled(home)
print('PASS mock Google: dev-only gate, fictional Gmail paging/search/threads and Calendar through real readers, reply drafts for review, no sending, disconnect')
