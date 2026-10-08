"""Calendar normalization preserves named provider times instead of flattening JSON."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from source_reader import normalize

def event(start, end):
    return normalize('google-calendar', {'records': [{'id': 'fixture-event', 'data': {
        'summary': 'Fixture appointment', 'start': start, 'end': end,
        'description': 'Bring the invitation.', 'status': 'confirmed'
    }}]})[0]
row = event({'dateTime': '2026-09-24T09:30:00-07:00', 'timeZone': 'America/Los_Angeles'},
            {'dateTime': '2026-09-24T10:30:00-07:00'})
assert row['start'] == '2026-09-24T09:30:00-07:00'
assert row['end'] == '2026-09-24T10:30:00-07:00'
assert row['text'].index('Start: 2026-09-24T09:30') < row['text'].index('End: 2026-09-24T10:30')
assert not row['allDay']
assert 'Description: Bring the invitation.' in row['text']
row = event({'date': '2026-09-24'}, {'date': '2026-09-25'})
assert row['allDay'] and row['end'] == '2026-09-25'
print('PASS labeled calendar times, offsets, exclusive all-day end and source text')
