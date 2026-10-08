"""Offline identity attribution checks: no real accounts or production events."""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'harness/hermes'))
import analytics_identity as analytics
import google_profile
from google_direct import disconnect
import httpx

account='google-'+'a'*64
assert analytics.identity({'_analyticsID':account})==account
assert not analytics.identity({'_analyticsID':'person@example.com'})
assert not analytics.identity({'_analyticsID':{'secret':'no'}})
analytics.install()
analytics.current_id=account
seen=[]
def receive(request):
    seen.append(request.headers.get('X-Worldlet-Analytics-ID'))
    return httpx.Response(200,json={'ok':True})
# Worldlet provides no model (owner decision 2026-10-05): no provider, the retired Worldlet service included, gets the ID.
with httpx.Client(transport=httpx.MockTransport(receive)) as client:
    client.post('https://worldlet-model.clockless.workers.dev/v1/chat/completions')
    client.post('https://other.example/v1/chat/completions',headers={'X-Worldlet-Analytics-ID':account})
    client.post('https://worldlet-model.clockless.workers.dev.evil.test/v1/chat/completions')
assert seen==[None,None,None],seen
async def async_check():
    analytics.current_id=account
    async with httpx.AsyncClient(transport=httpx.MockTransport(receive)) as client:
        await client.post('https://worldlet-model.clockless.workers.dev/v1/chat/completions')
    assert seen[-1] is None
asyncio.run(async_check())
# Per-turn traces, stable opaque session IDs, and no metadata at unrelated providers.
analytics.begin({'_analyticsID':account,'action':'chat','session':'private conversation title'})
first_trace, first_session = analytics.current_trace, analytics.current_session
assert first_trace and first_session and 'private' not in first_session
analytics.begin({'_analyticsID':account,'action':'chat','session':'private conversation title'})
assert analytics.current_trace != first_trace and analytics.current_session == first_session
captured=[]
def capture_headers(request):
    captured.append(dict(request.headers))
    return httpx.Response(200)
with httpx.Client(transport=httpx.MockTransport(capture_headers)) as client:
    client.post('https://worldlet-model.clockless.workers.dev/v1/chat/completions')
    client.post('https://other.example/v1/chat/completions',headers={'X-Worldlet-Trace-ID':first_trace,'X-Worldlet-Session-ID':first_session})
assert not any(k.startswith('x-worldlet-') for c in captured for k in c), captured
analytics.begin({'action':'chat','session':'private conversation title'})
assert not analytics.current_id and not analytics.current_trace and not analytics.current_session
analytics.begin({'_analyticsID':account,'action':'attention_tick'})
assert analytics.current_trace and not analytics.current_session


with tempfile.TemporaryDirectory() as directory:
    home=Path(directory)
    (home/'google_token.json').write_text('{}')
    with patch('google.oauth2.credentials.Credentials.from_authorized_user_info',side_effect=ValueError()):
        google_profile.remember(home,'Owner@Example.com')
    first=json.loads((home/'google_profile.json').read_text())
    assert first['email']=='owner@example.com' and first['user_id'].startswith('google-') and 'name' not in first
    # Unkeyed IDs stay plain SHA-256 so existing Persons do not split; an opted-in key yields a different keyed HMAC.
    import hashlib,hmac
    assert first['user_id']=='google-'+hashlib.sha256(b'owner@example.com').hexdigest()
    with patch.dict(os.environ,{'WORLDLET_ANALYTICS_ID_KEY':'fixture-key'}):
        keyed=google_profile.account_id('owner@example.com')
        assert keyed=='google-'+hmac.new(b'fixture-key',b'owner@example.com',hashlib.sha256).hexdigest() and keyed!=first['user_id'] and analytics.identity({'_analyticsID':keyed})==keyed
        with patch('google.oauth2.credentials.Credentials.from_authorized_user_info',side_effect=ValueError()):
            google_profile.remember(home,'owner@example.com')
        assert json.loads((home/'google_profile.json').read_text())['user_id']==keyed,'a newly set key replaces the cached ID'
    credentials=MagicMock();credentials.has_scopes.return_value=True
    session=MagicMock();session.__enter__.return_value=session
    session.get.return_value.json.return_value={'email':'other@example.com','email_verified':True,'name':'Wrong person'}
    with patch('google.oauth2.credentials.Credentials.from_authorized_user_info',return_value=credentials),patch('google.auth.transport.requests.AuthorizedSession',return_value=session):
        google_profile.remember(home,'second@example.com')
        assert 'name' not in json.loads((home/'google_profile.json').read_text())
        session.get.return_value.json.return_value={'email':'third@example.com','email_verified':True,'name':'Known Owner'}
        google_profile.remember(home,'third@example.com')
    assert json.loads((home/'google_profile.json').read_text())['name']=='Known Owner'
    disconnect(home)
    assert not (home/'google_profile.json').exists() and not (home/'google_token.json').exists()

print('PASS account metadata, mismatched profile rejection, disconnect, and no identity header at any provider.')
# Neither the app version nor the build type goes anywhere: there is no Worldlet model service to read them.
sent=[]
def any_seen(request):
    sent.append({k:v for k,v in request.headers.items() if k.startswith('x-worldlet-')})
    return httpx.Response(200)
with patch.dict(os.environ,{'WORLDLET_APP_VERSION':'2026.1002.1119','WORLDLET_BUILD':'development'}):
    analytics.begin({'action':'chat'})
    with httpx.Client(transport=httpx.MockTransport(any_seen)) as client:
        client.post('https://worldlet-model.clockless.workers.dev/v1/chat/completions')
        client.post('https://other.example/v1/chat/completions',headers={'X-Worldlet-App-Version':'2026.1002.1119','X-Worldlet-Build':'development'})
assert sent==[{},{}],sent
print('PASS no app version or build header at any provider')
