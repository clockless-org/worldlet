"""Shared connect gate and payload decoding for Hermes' authenticated MCP shelves."""
import json


def connected_session(name, urls, connect_msg, url_msg, disconnected_msg, include=None, bearer=False):
    """Return (session, run) for an enabled, OAuth-connected official MCP server. bearer also
    accepts a saved API key header, as a connection brought over from another Agent carries."""
    from hermes_cli.mcp_config import _oauth_tokens_present
    from tools.mcp_tool_config import _load_mcp_config
    from tools.mcp_tool_discovery import register_mcp_servers, _get_connected_server_for_call
    from tools.mcp_tool_loop import _run_on_mcp_loop
    cfg = _load_mcp_config().get(name)
    if not cfg or not cfg.get('enabled') or not (_oauth_tokens_present(name) or (bearer and cfg.get('headers'))):
        raise RuntimeError(connect_msg)
    if cfg.get('url') not in urls:
        raise RuntimeError(url_msg)
    # The resident Hermes owner keeps this authenticated session between pages
    # and chat turns. Hermes still handles reconnection and tool-list changes.
    register_mcp_servers({name: cfg if include is None else {**cfg, 'tools': {'include': include}}})
    server = _get_connected_server_for_call(name)
    if server is None or server.session is None:
        raise RuntimeError(disconnected_msg)
    return server.session, _run_on_mcp_loop


def mcp_payload(result, error, unsupported, kinds):
    """structuredContent when a dict, else the first text part that parses as one of kinds."""
    if getattr(result, 'isError', getattr(result, 'is_error', False)):
        raise RuntimeError(error)
    value = getattr(result, 'structuredContent', None)
    if isinstance(value, dict):
        return value
    for part in getattr(result, 'content', []):
        try:
            value = json.loads(getattr(part, 'text', ''))
            if isinstance(value, kinds):
                return value
        except (ValueError, TypeError):
            pass
    raise RuntimeError(unsupported)
