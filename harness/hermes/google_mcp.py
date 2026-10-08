"""Google's remote MCP declarations. Hermes owns OAuth, discovery and execution.

No Google API client or MCP transport is implemented here. Tool names were
verified against the official servers' public tools/list on 2026-09-15.
"""
import json
import os
from pathlib import Path

ROOT = "https://www.googleapis.com/auth/"
SERVICES = {
    "gmail": {
        "url": "https://gmailmcp.googleapis.com/mcp/v1",
        "scopes": ["gmail.readonly"],
        "tools": ["get_message", "get_thread", "search_threads", "list_labels", "list_drafts", "get_draft"],
    },
    "google-calendar": {
        "url": "https://calendarmcp.googleapis.com/mcp/v1",
        "scopes": ["calendar.calendarlist.readonly", "calendar.events.readonly", "calendar.events.freebusy"],
        "tools": ["list_events", "get_event", "list_calendars", "search_events", "suggest_time"],
    },
    "google-drive": {
        "url": "https://drivemcp.googleapis.com/mcp/v1",
        "scopes": ["drive.readonly"],
        "tools": ["get_file_metadata", "get_file_permissions", "list_recent_files", "read_file_content", "search_files"],
    },
}


def configuration(name, home):
    service = SERVICES[name]
    path = Path(home) / "google_client_secret.json"
    if not path.exists():
        raise ValueError("Google sign-in is not configured for this build yet. Worldlet needs its Google Desktop OAuth client.")
    client = json.loads(path.read_text()).get("installed", {})
    if not client.get("client_id") or not client.get("client_secret"):
        raise ValueError("The Google Desktop OAuth client JSON is incomplete.")
    return {"url": service["url"], "enabled": False, "auth": "oauth",
            "oauth": {"client_id": client["client_id"], "client_secret": client["client_secret"],
                      "scope": " ".join(ROOT + scope for scope in service["scopes"])},
            "tools": {"include": service["tools"], "resources": False, "prompts": False}}


def provision_client(home):
    """App-provisioned Desktop OAuth registration; never inherited from another agent."""
    destination = Path(home) / "google_client_secret.json"
    source = os.environ.get("WORLDLET_GOOGLE_CLIENT_FILE")
    if destination.exists() or not source:
        return destination.exists()
    data = json.loads(Path(source).read_text())
    client = data.get("installed", {})
    if not client.get("client_id") or not client.get("client_secret"):
        raise ValueError("This build has an incomplete Google Desktop OAuth registration.")
    destination.write_text(json.dumps(data))
    destination.chmod(0o600)
    return True


def authorize(name, config):
    """Trigger Hermes OAuth with a protected read; Google's tools/list is public.

    Discard account metadata here. A successful catalog probe alone must never
    label an unauthenticated or preview-ineligible account as connected.
    """
    import asyncio
    from tools.mcp_oauth import force_interactive_oauth
    from tools.mcp_tool_discovery import _connect_server
    from tools.mcp_tool_loop import _ensure_mcp_loop, _run_on_mcp_loop
    from tools.mcp_tool_lifecycle import _stop_mcp_loop_if_idle
    from hermes_cli.mcp_config import _oauth_tokens_present, _redact_probe_exception

    if not _oauth_tokens_present(name):
        _desktop_sign_in(name, config)

    probes = {"gmail": ("list_labels", {}),
              "google-calendar": ("list_calendars", {"pageSize": 1}),
              "google-drive": ("list_recent_files", {"pageSize": 1, "excludeContentSnippets": True})}

    async def probe():
        with force_interactive_oauth():
            server = await asyncio.wait_for(_connect_server(name, config), timeout=315)
            try:
                tool, arguments = probes[name]
                result = await server.session.call_tool(tool, arguments, read_timeout_seconds=315)
                if getattr(result, "is_error", getattr(result, "isError", True)):
                    if any("enrolled in the Google Workspace Developer Preview Program" in getattr(item, "text", "") for item in result.content):
                        raise RuntimeError("Google sign-in succeeded. This app's Google Cloud project must join the Google Workspace Developer Preview Program before Google MCP can read your account. Your authorization is saved; signing in again will not enable preview access.")
                    raise RuntimeError("Google authorized the account but refused its read check. Check Workspace MCP preview access and app permissions.")
            finally:
                await server.shutdown()

    _ensure_mcp_loop()
    try:
        _run_on_mcp_loop(probe(), timeout=330)
        if not _oauth_tokens_present(name):
            raise RuntimeError("Google authorization did not complete. No OAuth token was saved.")
        return True
    except BaseException as exc:
        raise _redact_probe_exception(exc) from None
    finally:
        _stop_mcp_loop_if_idle()


def _desktop_sign_in(name, config):
    """Google's Desktop flow feeds Hermes' normal OAuth storage and refresh.

    Google's preview PRM advertises accounts.google.com/ while its issuer is
    accounts.google.com. Use Google's supported OAuth library for first login;
    do not disable the MCP SDK's issuer verification to accommodate this mismatch.
    """
    import asyncio
    import datetime
    import httpx
    from google_auth_oauthlib.flow import InstalledAppFlow
    from mcp.shared.auth import OAuthMetadata, OAuthToken
    from tools.mcp_oauth_provider import prepare_oauth_config

    oauth = config["oauth"]
    response = httpx.get("https://accounts.google.com/.well-known/oauth-authorization-server", timeout=20)
    response.raise_for_status()
    metadata = response.json()
    expected = {"issuer": "https://accounts.google.com",
                "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
                "token_endpoint": "https://oauth2.googleapis.com/token"}
    if any(metadata.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Google OAuth metadata did not match its expected issuer and endpoints.")
    client = {"installed": {"client_id": oauth["client_id"], "client_secret": oauth["client_secret"],
                            "auth_uri": expected["authorization_endpoint"], "token_uri": expected["token_endpoint"]}}
    flow = InstalledAppFlow.from_client_config(client, scopes=oauth["scope"].split(), autogenerate_code_verifier=True)
    credentials = flow.run_local_server(port=0, open_browser=True, timeout_seconds=300,
        authorization_prompt_message="Complete Google authorization in your browser.",
        success_message="Google authorization received. You can return to Worldlet.")
    if not credentials or not credentials.token:
        raise RuntimeError("Google authorization did not complete.")
    _, storage = prepare_oauth_config(name, config["url"], oauth)
    storage.save_oauth_metadata(OAuthMetadata.model_validate(metadata))
    storage.bind_issuer(expected["issuer"])
    expiry = credentials.expiry.replace(tzinfo=datetime.timezone.utc)
    ttl = max(0, int((expiry-datetime.datetime.now(datetime.timezone.utc)).total_seconds()))
    asyncio.run(storage.set_tokens(OAuthToken(access_token=credentials.token, token_type="Bearer",
        refresh_token=credentials.refresh_token, expires_in=ttl, scope=oauth["scope"])))
