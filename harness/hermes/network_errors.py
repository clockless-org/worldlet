"""Bounded, credential-free descriptions for transport timeouts."""
import re
import time


def google_read(operation, run):
    """Retry only a whole read/probe, never consent, refresh setup or a write."""
    try:
        return run()
    except Exception as error:
        if operation not in {'read', 'test'} or not is_timeout(error):
            raise
        time.sleep(0.25)
        return run()


def bound_google_transport(service):
    # Resource requests share this httplib2 transport, including child resources.
    transport = getattr(service, '_http', None)
    transport = getattr(transport, 'http', transport)
    if transport is not None and hasattr(transport, 'timeout'):
        transport.timeout = 10
    return service


def is_timeout(error):
    pending, seen = [error], set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, TimeoutError) or getattr(current, 'winerror', None) == 10060:
            return True
        if type(current).__name__ in {'ConnectTimeout', 'ReadTimeout', 'ConnectTimeoutError', 'ReadTimeoutError', 'APITimeoutError'}:
            return True
        # Hermes can wrap provider exceptions in a RuntimeError after a turn.
        if re.search(r'\bWinError\s+10060\b|\bconnection timed out\b|\bconnect timeout\b|\bread timed out\b', str(current), re.I):
            return True
        for nested in (getattr(current, '__cause__', None), getattr(current, '__context__', None), getattr(current, 'reason', None)):
            if isinstance(nested, BaseException):
                pending.append(nested)
    return False


def timeout_message(body):
    action = (body or {}).get('action')
    service = 'Google' if action == 'google' else 'Notion' if action == 'notion' else 'the model service' if action in {'chat', 'configure', 'status', 'modelLogin', 'modelCatalog', 'modelRepair'} else 'the remote service'
    return f'Connection to {service} timed out (WinError 10060 / network timeout). Check your internet connection and proxy or VPN settings, then try again. Your saved data has not been deleted. If this was a send or other write, check its result before retrying.'
