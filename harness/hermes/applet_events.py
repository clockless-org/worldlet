"""Content-free UI events from Hermes' supported tool lifecycle callbacks."""
import json
from execution_trace import trace


def outcome(result):
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except ValueError:
            return (not result.lower().startswith(("error", "tool error")), None)
    if not isinstance(result, dict):
        return True, None
    if result.get("error") or result.get("isError") or result.get("is_error") or result.get("ok") is False:
        return False, None
    for key in ("records", "results", "pages", "items"):
        if isinstance(result.get(key), list):
            return True, len(result[key])
    return True, None


class AppletEvents:
    def __init__(self, emit, registry, request_id):
        self.emit, self.registry, self.request_id = emit, registry, request_id
        self.calls = {}

    def provider(self, name, args):
        # MCP toolsets map to their Applet by their own name.
        toolset = self.registry.get_toolset_for_tool(name) or ""
        return toolset[len("mcp-"):] if toolset.startswith("mcp-") else None

    def start(self, call_id, name, args):
        trace(self.emit, self.request_id, "tool.requested", {"id": call_id, "name": name, "args": args})
        provider = self.provider(name, args or {})
        if not provider:
            return
        self.calls[call_id] = provider
        self.emit("applet", request_id=self.request_id, provider=provider, callId=call_id, phase="reading")

    def complete(self, call_id, name, args, result):
        trace(self.emit, self.request_id, "tool.result", {"id": call_id, "name": name, "result": result, "ok": outcome(result)[0]})
        provider = self.calls.pop(call_id, None)
        if not provider:
            return
        ok, count = outcome(result)
        self.emit("applet", request_id=self.request_id, provider=provider, callId=call_id,
                  phase="complete" if ok else "error", **({"count": count} if ok and count is not None else {}))
