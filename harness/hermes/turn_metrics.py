"""Numeric-only profiling through the pinned Hermes public plugin hooks."""
import threading
import time


class TurnMetrics:
    def __init__(self):
        from hermes_cli.plugins import PluginContext, PluginManifest, get_plugin_manager
        ctx = PluginContext(PluginManifest(name="worldlet-turn-metrics"), get_plugin_manager())
        self.handles = [ctx.register_hook("pre_api_request", self.before),
                        ctx.register_hook("post_api_request", self.after)]
        self.active = False

    def begin(self, session, started, on_request=None, on_trace=None):
        self.session, self.started = session, started
        self.on_request = on_request
        self.on_trace = on_trace
        self.calls, self.pending = [], {}
        self.active = True

    def matches(self, data):
        return (self.active and data.get("session_id") == self.session
                and not threading.current_thread().name.startswith("bg-review"))

    def before(self, **data):
        if not self.matches(data):
            return
        self.settle_unclosed()
        if self.on_request:
            self.on_request()
        call = {"startMs": round((time.perf_counter()-self.started)*1000),
                "inputChars": sum(len(str(m.get("content", ""))) for m in data.get("request_messages", [])),
                "toolCount": data.get("tool_count", 0)}
        self.calls.append(call)
        self.pending[data["api_request_id"]] = call
        if self.on_trace:
            self.on_trace("model.requested", {"id": data["api_request_id"], "model": data.get("model"), "provider": data.get("provider"), "apiMode": data.get("api_mode"), "messages": data.get("request_messages", []), "toolCount": data.get("tool_count", 0)})

    def after(self, **data):
        if not self.matches(data):
            return
        call = self.pending.pop(data["api_request_id"], None)
        if call is None:
            return
        call["durationMs"] = round(data["api_duration"]*1000)
        call["endMs"] = round((time.perf_counter()-self.started)*1000)
        first = data.get("first_chunk_at")
        if first is not None:
            call["firstChunkMs"] = max(0, round((first-data["started_at"])*1000))
        usage = data.get("usage") or {}
        for name in ("prompt_tokens", "input_tokens", "output_tokens", "completion_tokens", "reasoning_tokens", "cache_read_tokens"):
            if isinstance(usage.get(name), (int, float)):
                call[name] = usage[name]

        if self.on_trace:
            self.on_trace("model.result", {"id": data["api_request_id"], "model": data.get("response_model") or data.get("model"), "provider": data.get("provider"), "usage": usage, "durationMs": call["durationMs"], "response": data.get("response")})

    def finish(self):
        self.settle_unclosed()
        self.active = False
        return {"modelCalls": self.calls, "modelMs": sum(c.get("durationMs", 0) for c in self.calls),
                "unclosedModelMs": sum(c.get("unclosedMs", 0) for c in self.calls)}

    def settle_unclosed(self):
        # Redirected streams may never emit post_api_request. Keep their observed
        # span separately; this upper bound includes cancellation/retry overhead.
        end = round((time.perf_counter()-self.started)*1000)
        for request_id, call in self.pending.items():
            if self.on_trace:
                self.on_trace("model.interrupted", {"id": request_id, "outcome": "unobserved", "reason": "missing_post_api_request"})
            call["endMs"] = end
            call["unclosedMs"] = max(0, end-call["startMs"])
        self.pending.clear()

    def close(self):
        self.active = False
        for handle in self.handles:
            handle.dispose()
