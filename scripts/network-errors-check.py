"""Network diagnostics must classify nested failures without leaking endpoints/keys."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'harness/hermes'))
from network_errors import is_timeout, timeout_message

assert is_timeout(TimeoutError('fixture'))
wrapped = RuntimeError('request failed')
wrapped.__cause__ = TimeoutError('https://private.example/?token=secret')
assert is_timeout(wrapped)
assert is_timeout(RuntimeError('[WinError 10060] A connection attempt failed'))
assert not is_timeout(ValueError('invalid authorization'))
wrapped.__cause__ = wrapped
assert not is_timeout(wrapped)
for action, expected in [('google', 'Google'), ('chat', 'model service'), ('notion', 'Notion')]:
    message = timeout_message({'action': action, 'apiKey': 'secret'})
    assert expected in message and 'secret' not in message and 'private.example' not in message
print('PASS transport timeout classification, nested exceptions, cycles, service context and credential-free diagnostics.')

from network_errors import google_read, bound_google_transport
from types import SimpleNamespace
from unittest.mock import patch
for operation in ['read', 'test', 'connect', 'send_email', 'disconnect']:
    calls = []
    def read():
        calls.append(1)
        if len(calls) == 1: raise TimeoutError('fixture temporary failure')
        return 'ok'
    with patch('network_errors.time.sleep'):
        if operation in {'read', 'test'}: assert google_read(operation, read) == 'ok' and len(calls) == 2
        else:
            try: google_read(operation, read); raise AssertionError('Write was retried')
            except TimeoutError: assert len(calls) == 1
calls = []
def unavailable():
    calls.append(1)
    raise TimeoutError('fixture persistent failure')
with patch('network_errors.time.sleep'):
    try: google_read('read', unavailable); raise AssertionError('Persistent failure suppressed')
    except TimeoutError: assert len(calls) == 2
service = SimpleNamespace(_http=SimpleNamespace(http=SimpleNamespace(timeout=None)))
assert bound_google_transport(service) is service and service._http.http.timeout == 10
print('PASS Google read-only retry succeeds, stops after two attempts, excludes writes and bounds transport timeout.')
