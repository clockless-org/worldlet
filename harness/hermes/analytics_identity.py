"""Request-scoped analytics identity. It once went only to the Worldlet model service; Worldlet provides no model any
more (owner decision 2026-10-05), so no request carries it: every provider gets none of these headers."""
import os
import re
import uuid


def identity(body):
    value = body.get("_analyticsID", "")
    return value if isinstance(value, str) and re.fullmatch(r"(?:google-[a-f0-9]{64}|[a-fA-F0-9-]{36})", value) else ""


current_id = ""
current_trace = ""
current_session = ""


def begin(body):
    global current_id, current_trace, current_session
    current_id = identity(body)
    current_trace = str(uuid.uuid4()) if current_id else ""
    # Never forward a user-chosen conversation title or profile path.
    session = body.get("session")
    current_session = str(uuid.uuid5(uuid.NAMESPACE_URL, current_id + ":" + session)) if current_id and body.get("action") == "chat" and isinstance(session, str) and session else ""

installed = False


def install():
    """Instrument the HTTP boundary, not prompts or provider configuration.

    Hermes' generic default_headers also reach auxiliary providers, so every
    request is stripped of Worldlet's identity headers here: none leaks to a
    person's own provider. The native host serializes requests within this worker process.
    """
    global installed
    if installed:
        return
    import httpx
    sync_send, async_send = httpx.Client.send, httpx.AsyncClient.send

    def attach(request):
        for name in ("X-Worldlet-Analytics-ID", "X-Worldlet-Trace-ID", "X-Worldlet-Session-ID", "X-Worldlet-App-Version", "X-Worldlet-Build"):
            request.headers.pop(name, None)

    def send(client, request, *args, **kwargs):
        attach(request)
        return sync_send(client, request, *args, **kwargs)

    async def send_async(client, request, *args, **kwargs):
        attach(request)
        return await async_send(client, request, *args, **kwargs)

    httpx.Client.send, httpx.AsyncClient.send = send, send_async
    installed = True
