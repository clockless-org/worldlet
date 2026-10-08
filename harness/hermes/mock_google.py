"""Development-only mock Google account for rehearsing onboarding without OAuth.

Active only when the native Dev build allows it (WORLDLET_MOCK_GOOGLE_ALLOWED=1)
AND the profile chose it (a marker file in the Hermes home). It replaces only the
Google API client: Gmail paging, discovery, Calendar reads, normalization, S/M
analysis and Fox run unchanged against a fictional inbox. Never used in release builds.
"""
import base64
import datetime
import json
import os
import re
from pathlib import Path

MARKER = 'mock_google.json'
EMAIL = 'you@worldlet.test'
DEMO_SITE = 'https://demo.worldlet.test'
DEMO_BOOKING = DEMO_SITE + '/brightsmile'
DEMO_STREAMBOX = DEMO_SITE + '/streambox'
DEMO_CITYWATER = DEMO_SITE + '/citywater'


def allowed():
    return os.environ.get('WORLDLET_MOCK_GOOGLE_ALLOWED') == '1'


def enabled(home):
    return allowed() and (Path(home) / MARKER).exists()


def connect(home, services):
    Path(home).mkdir(parents=True, exist_ok=True)
    (Path(home) / MARKER).write_text(json.dumps({'email': EMAIL, 'services': list(services)}))
    return {'ok': True, 'services': list(services), 'label': EMAIL, 'mock': True}


def disconnect(home):
    (Path(home) / MARKER).unlink(missing_ok=True)


# Fictional inbox. Days are relative to now (negative = past, positive = future).
THREADS = [
    ('d3a1', -0.05, 'Bright Smile Dental <frontdesk@brightsmile.example>', 'Action needed: book your cleaning by Friday',
     "Hi there,\n\nIt has been six months since your last cleaning with Dr. Chen, so you're due for your next visit. "
     "Please book your appointment by Friday; we are holding this week's openings for patients who are due.\n\n"
     f"Book online here: {DEMO_BOOKING}\n\nOpenings this week include Thursday at 10:00 AM and Friday at 2:30 PM. "
     "Booking takes under a minute; no payment is needed until your visit.\n\nBright Smile Dental", ['INBOX', 'UNREAD']),
    ('a7f2', -0.4, 'Priya Nair <priya@northwind.example>', 'Q4 roadmap draft by Thursday?',
     "Hey,\n\nCould you send me your draft of the Q4 roadmap by Thursday end of day? I'd like to review it before our 1:1 on Thursday afternoon. "
     "A rough outline with the three main bets is fine.\n\nThanks!\nPriya", ['INBOX', 'UNREAD']),
    ('b5c9', -2.5, 'Skyway Airlines <trips@skyway.example>', 'Your trip to New York: check-in opens tomorrow',
     "Your flight SK 482 from San Francisco (SFO) to New York (JFK) departs in 2 days at 8:15 AM. "
     "Online check-in opens 24 hours before departure. Confirmation code: QX7T2P. Seat 14C.", ['INBOX']),
    ('c2e4', -3.0, 'Oakview Apartments <leasing@oakview.example>', 'Lease renewal — please sign by October 15',
     "Your current lease ends on October 31. To renew for 12 months at the same rate, please review and sign the renewal in the resident portal by October 15. "
     "If you plan to move out, let us know in writing by the same date.", ['INBOX']),
    ('e8b1', -0.8, 'Sam Okafor <sam.okafor@example.com>', 'Dinner Saturday?',
     "Hey! A few of us are getting dinner Saturday at 7 PM at Maple Table. Want to join? Let me know by Friday so I can update the reservation.", ['INBOX', 'UNREAD']),
    ('f4d6', -0.15, 'City Water Utility <billing@citywater.example>', 'Your water bill is ready: $46.18 due in 5 days',
     "Your statement for September is ready. Amount due: $46.18, due in 5 days. You can pay online or set up autopay in your account.\n\n"
     f"View and pay your bill: {DEMO_CITYWATER}", ['INBOX']),
    ('a1c3', -0.1, 'StreamBox <hello@streambox.example>', 'Confirm your cancellation before Friday',
     "We received your request to cancel StreamBox Premium when your free trial ends. To finish, confirm the cancellation "
     "on your membership page before Friday; otherwise your card will be charged $15.99 per month.\n\n"
     f"Confirm your cancellation: {DEMO_STREAMBOX}", ['INBOX']),
    ('b9e2', -0.2, 'ParcelGo <updates@parcelgo.example>', 'Delivered: your package was left at the front door',
     "Your package (order 88-2231, noise-cancelling headphones) was delivered today at 2:14 PM and left at the front door.", ['INBOX', 'UNREAD']),
    ('c6a8', -1.5, 'First Harbor Bank <alerts@firstharbor.example>', 'Refund processed: $84.20',
     "A refund of $84.20 from Riverside Outfitters has been credited to your card ending 6411. It should appear on your statement within 1–2 business days.", ['INBOX']),
    ('d2f5', -2.8, 'Lincoln Elementary <office@lincoln-elem.example>', 'Picture day is this Friday',
     "Reminder: school picture day is this Friday. Order forms are optional and can be returned on the day. Retakes are scheduled for November 12.", ['INBOX']),
    ('e3b7', -0.6, 'Riverside Outfitters <deals@riverside.example>', 'Weekend sale: 30% off jackets',
     "Our biggest weekend sale is here. Save 30% on jackets and fleece through Sunday. Shop now while sizes last.", ['CATEGORY_PROMOTIONS']),
    ('f9c1', -1.1, 'The Morning Brief <news@morningbrief.example>', 'Today: markets, tech and weather',
     "Your daily digest: markets opened higher, three new product launches in consumer tech, and a sunny weekend ahead.", ['CATEGORY_PROMOTIONS']),
]

# Fictional primary calendar (start in days from now, local wall time, duration hours).
EVENTS = [
    ('standup01', 1, '09:30', 0.5, 'Team standup', 'Daily sync with the product team.', 'Zoom'),
    ('oneonone01', 3, '14:00', 0.5, '1:1 with Priya', 'Weekly 1:1. Agenda: Q4 roadmap draft.', 'Priya’s office'),
    ('flight01', 2, '08:15', 5.5, 'Flight SK 482 SFO → JFK', 'Confirmation QX7T2P · Seat 14C', 'San Francisco International Airport'),
    ('yoga01', 5, '09:00', 1, 'Yoga class', 'Saturday vinyasa flow.', 'Harbor Yoga Studio'),
]


def _thread_id(key):
    return (key * 4)[:16]


def _internal_ms(days):
    return int((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days)).timestamp() * 1000)


def _message(key, days, sender, subject, body, labels):
    tid = _thread_id(key)
    when = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days)
    return {'id': tid, 'threadId': tid, 'labelIds': labels, 'internalDate': str(_internal_ms(days)), 'historyId': '1',
            'snippet': body[:160], 'sizeEstimate': len(body),
            'payload': {'mimeType': 'text/plain', 'headers': [
                {'name': 'Subject', 'value': subject}, {'name': 'From', 'value': sender},
                {'name': 'To', 'value': EMAIL}, {'name': 'Date', 'value': when.strftime('%a, %d %b %Y %H:%M:%S +0000')}],
                'body': {'data': base64.urlsafe_b64encode(body.encode()).decode()}}}


def _messages():
    return [_message(*row) for row in THREADS]


def _matches(message, query):
    text = (message['payload']['headers'][0]['value'] + ' ' + base64.urlsafe_b64decode(message['payload']['body']['data']).decode()).lower()
    labels = set(message['labelIds'])
    after = re.search(r'after:(\d+)', query)
    if after and int(message['internalDate']) // 1000 <= int(after.group(1)):
        return False
    if 'is:unread' in query and 'UNREAD' not in labels:
        return False
    terms = re.findall(r'"([^"]+)"', query)
    return not terms or any(term.lower() in text for term in terms)


class _Request:
    def __init__(self, fn):
        self._fn = fn

    def execute(self):
        return self._fn()


class _Batch:
    def __init__(self, callback):
        self._callback, self._requests = callback, []

    def add(self, request, request_id):
        self._requests.append((request_id, request))

    def execute(self):
        for request_id, request in self._requests:
            try:
                self._callback(request_id, request.execute(), None)
            except Exception as error:  # noqa: BLE001 - mirrors googleapiclient batch semantics
                self._callback(request_id, None, error)


def _page(rows, maxResults, pageToken):
    start = int(pageToken or 0)
    end = start + int(maxResults or 20)
    return rows[start:end], (str(end) if end < len(rows) else '')


class _Resource:
    def __init__(self, kind):
        self._kind = kind

    def list(self, userId='me', q='', maxResults=20, pageToken=None, **_):
        def run():
            rows = sorted((m for m in _messages() if _matches(m, q or '')), key=lambda m: -int(m['internalDate']))
            chosen, token = _page(rows, maxResults, pageToken)
            key = 'messages' if self._kind == 'messages' else 'threads'
            return {key: [{'id': m['id'], 'threadId': m['threadId']} for m in chosen], 'nextPageToken': token, 'resultSizeEstimate': len(rows)}
        return _Request(run)

    def get(self, userId='me', id='', format='full', **_):
        def run():
            message = next((m for m in _messages() if m['id'] == id), None)
            if message is None:
                raise ValueError('Mock Gmail has no message ' + id)
            return {'id': id, 'historyId': '1', 'messages': [message]} if self._kind == 'threads' else message
        return _Request(run)


class _Users:
    def getProfile(self, userId='me'):
        return _Request(lambda: {'emailAddress': EMAIL, 'messagesTotal': len(THREADS)})

    def messages(self):
        return _Resource('messages')

    def threads(self):
        return _Resource('threads')


class Gmail:
    def users(self):
        return _Users()

    def new_batch_http_request(self, callback=None):
        return _Batch(callback)


def _event(key, days, clock, hours, title, description, location):
    now = datetime.datetime.now().astimezone()
    hour, minute = map(int, clock.split(':'))
    start = (now + datetime.timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    end = start + datetime.timedelta(hours=hours)
    return {'id': key, 'status': 'confirmed', 'summary': title, 'description': description, 'location': location,
            'htmlLink': 'https://calendar.google.com/calendar/event?eid=' + key,
            'start': {'dateTime': start.isoformat()}, 'end': {'dateTime': end.isoformat()},
            'organizer': {'email': EMAIL, 'self': True}, 'updated': now.isoformat()}


class _Events:
    def list(self, calendarId='primary', timeMin=None, timeMax=None, maxResults=20, pageToken=None, fields=None, **_):
        def run():
            low = datetime.datetime.fromisoformat(timeMin) if timeMin else None
            high = datetime.datetime.fromisoformat(timeMax) if timeMax else None
            rows = [e for e in (_event(*row) for row in EVENTS)
                    if (low is None or datetime.datetime.fromisoformat(e['end']['dateTime']) >= low)
                    and (high is None or datetime.datetime.fromisoformat(e['start']['dateTime']) <= high)]
            rows.sort(key=lambda e: e['start']['dateTime'])
            chosen, token = _page(rows, maxResults, pageToken)
            return {'summary': 'Calendar', 'items': chosen, 'nextPageToken': token}
        return _Request(run)

    def get(self, calendarId='primary', eventId=''):
        def run():
            event = next((_event(*row) for row in EVENTS if row[0] == eventId), None)
            if event is None:
                raise ValueError('Mock Calendar has no event ' + eventId)
            return event
        return _Request(run)


class Calendar:
    def events(self):
        return _Events()


def service(api, version):
    if api == 'gmail':
        return Gmail()
    if api == 'calendar':
        return Calendar()
    raise RuntimeError('Mock Google supports Mail and Calendar only.')
