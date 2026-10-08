"""Worldlet transport for the pinned Hermes Desktop JSON-RPC backend.

Session operations use dispatcher methods and the Transport protocol. Hermes owns
agents, durable history and tool execution; this adapter owns UI correlation.
"""
import contextlib
import json
import os
import queue
import time
import uuid
from execution_policy import CHAT_DEADLINE_SECONDS


# Chat plus the background checks that ran recently. Each resident session costs
# only Hermes-side state; resuming one costs the user seconds of wait.
RESIDENT_SESSIONS = 6
# The host stops a turn after 120 silent seconds (core agentDeadlineRemaining) and kills Hermes.
# A model thinking after a tool emits nothing the host sees, so this loop says it is still
# waiting; the turn itself stays bounded by CHAT_DEADLINE_SECONDS and Hermes' own stale-call limits.
WAITING_SECONDS = 30
# Hermes waits up to 600 s for an agent build (tui_gateway `_wait_agent`); a cold resume with eager_build
# routinely outlives 30 s. Session-building calls get that budget, and the turn's keep-alive runs meanwhile.
BUILD_SECONDS = 600
# Hermes' own ceiling on summarizing a long conversation (compression.context_total_ceiling_seconds default).
COMPACTION_SECONDS = 600
# Fox's conversation is summarized while Fox is idle once it is this close to Hermes' compression threshold,
# so the person's next message does not wait minutes for it (one heavy turn adds tens of thousands of tokens).
COMPACT_NEAR = 0.85
# ...and only once it has grown this much since the last summary, which may itself land near the threshold.
COMPACT_GROWTH = 0.10


class RPCError(RuntimeError):
    def __init__(self, error):
        super().__init__(error.get("message", "Hermes Desktop request failed."))
        self.code = error.get("code")


class DesktopRuntime:
    def __init__(self, home, emit):
        from tui_gateway import server
        self.server, self.home, self.emit = server, home, emit
        self.external = os.environ.get("WORLDLET_EXTERNAL_AGENT") == "1"
        self.worldlet_prompt = ""
        if self.external:
            # This server lives only in Worldlet's process. Add integration
            # instructions in memory; never save them to the user's config.
            original_prompt = server._startup_system_prompt
            server._startup_system_prompt = lambda cfg, task_id: "\n\n".join(
                part for part in (original_prompt(cfg, task_id), self.worldlet_prompt) if part)

        # Same lifecycle initialization as the pinned official stdio entrypoint.
        # Keep the owner alive before sweeping orphaned session leases.
        server._start_backend_heartbeat_refresher()
        server._schedule_startup_orphan_sweep()
        self.frames = queue.Queue()
        self.sessions = {}
        self.sid = None
        self.keys = {}
        self.closed = False
        # The turn being served, so a long synchronous call still tells the host Hermes is alive.
        self.request_id = None
        self.refs_path = home / "worldlet-desktop-sessions.json"
        self.refs = json.loads(self.refs_path.read_text()) if self.refs_path.exists() else {}
        from turn_metrics import TurnMetrics
        from world_context import WorldContext
        self.metrics = TurnMetrics()
        self.view = WorldContext()
        # Bound project discovery to an empty app-owned workspace. Private Hermes
        # memory/SOUL remain profile-owned; parents' AGENTS.md never enter Fox.
        self.cwd = home / "worldlet-workspace"
        (self.cwd / ".git").mkdir(parents=True, exist_ok=True)

    def write(self, frame):
        if self.closed:
            return False
        self.frames.put(frame)
        return True

    def send(self, method, params):
        rid = uuid.uuid4().hex
        reply = self.server.dispatch({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}, self)
        if reply is not None:
            self.write(reply)
        return rid

    def rpc(self, method, params, seconds=45):
        rid = self.send(method, params)
        deferred = []
        try:
            deadline = time.monotonic() + seconds
            waiting = time.monotonic()
            while time.monotonic() < deadline:
                # The host stops a silent Hermes after 120 s; a slow call is not a stuck one.
                if self.request_id and time.monotonic() - waiting >= WAITING_SECONDS:
                    self.emit("status", request_id=self.request_id, stage="waiting")
                    waiting = time.monotonic()
                try:
                    frame = self.frames.get(timeout=max(.01, min(deadline-time.monotonic(), WAITING_SECONDS)))
                except queue.Empty:
                    continue
                if frame.get("id") == rid and "method" not in frame:
                    if "error" in frame:
                        raise RPCError(frame["error"])
                    return frame.get("result", {})
                # Server requests must never hang a synchronous RPC or imply approval.
                if frame.get("id") and frame.get("method"):
                    self.decline(frame)
                else:
                    deferred.append(frame)
            raise TimeoutError("Hermes Desktop did not answer.")
        finally:
            # Held frames predate anything still queued; requeue them at the head
            # so a steer never replays stale deltas after newer events.
            if deferred:
                with self.frames.mutex:
                    self.frames.queue.extendleft(reversed(deferred))
                    self.frames.not_empty.notify(len(deferred))

    def decline(self, frame):
        self.server.dispatch({"jsonrpc": "2.0", "id": frame["id"], "error": {
            "code": -32000, "message": "This request requires a Worldlet interaction that is not available. Do not proceed; explain what the user needs to do through Fox."}}, self)

    def interrupt(self):
        if self.sid and not self.closed:
            self.send("session.interrupt", {"session_id": self.sid})

    def save_ref(self, logical, stored):
        if not stored or self.refs.get(logical) == stored:
            return
        self.refs[logical] = stored
        tmp = self.refs_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.refs))
        tmp.replace(self.refs_path)

    def chat(self, body, logical, toolsets, prompt, model, request_id, started, cancelled, take_controls):
        self.request_id = request_id
        try:
            return self.turn(body, logical, toolsets, prompt, model, request_id, started, cancelled, take_controls)
        finally:
            self.request_id = None

    def turn(self, body, logical, toolsets, prompt, model, request_id, started, cancelled, take_controls):
        from hermes_cli.config import load_config, save_config
        from tools.registry import registry
        from applet_events import AppletEvents
        mode = body.get("mode", "chat")
        key = (mode, tuple(toolsets), prompt, model)
        # The background source checker and the user's chat are separate
        # conversations under separate instructions, serialized by the chat
        # lock. Re-keying one must not close the other: the user would pay a
        # full session resume, seconds of it, on their next message. Only this
        # conversation's own session is retired when its instructions change.
        if self.keys.get(logical) not in (None, key):
            stale = self.sessions.pop(logical, None)
            if stale:
                with contextlib.suppress(Exception):
                    self.rpc("session.close", {"session_id": stale})
        self.keys[logical] = key
        # A check mints a new logical id per run, so bound what stays resident.
        while len(self.sessions) > RESIDENT_SESSIONS:
            oldest = next(iter(k for k in self.sessions if k != logical), None)
            if oldest is None:
                break
            retired = self.sessions.pop(oldest)
            self.keys.pop(oldest, None)
            with contextlib.suppress(Exception):
                self.rpc("session.close", {"session_id": retired})
        from hermes_cli.mcp_startup import set_mcp_server_filter
        set_mcp_server_filter(toolsets)
        os.environ["HERMES_TUI_TOOLSETS"] = ",".join(toolsets)
        os.environ["HERMES_TUI_TOOL_PROGRESS"] = "all"
        os.environ["HERMES_IGNORE_RULES"] = "1" if mode != "chat" else "0"
        cfg = load_config()
        changed = cfg.setdefault("agent", {}).get("system_prompt") != prompt
        self.worldlet_prompt = prompt
        if changed and not self.external:
            cfg["agent"]["system_prompt"] = prompt
            # Fox is this profile's UI identity; SOUL and memory are still Hermes'.
            cfg.setdefault("display", {})["personality"] = ""
            save_config(cfg)
        if logical not in self.sessions:
            session_started = time.perf_counter()
            from context_history import clean_legacy_context
            clean_legacy_context(self.refs.get(logical, logical))
            resumed = True
            try:
                stored = self.refs.get(logical, logical)
                self.rpc("session.workspace.move", {"session_key": stored, "cwd": str(self.cwd)}, BUILD_SECONDS)
                result = self.rpc("session.resume", {"session_id": stored,
                    "source": "desktop", "eager_build": True, "omit_messages": True}, BUILD_SECONDS)
            except RPCError as error:
                if error.code != 4007:
                    raise
                resumed = False
                result = self.rpc("session.create", {"source": "desktop", "title": "Fox", "cwd": str(self.cwd)}, BUILD_SECONDS)
            # Resuming Hermes history also restores its stored model override.
            # Fox's profile selection applies to every provider, including when
            # the same model ID is now served by a different provider. Hermes
            # owns switching credentials and preserving the existing history.
            provider = (cfg.get("model") or {}).get("provider")
            info = result.get("info") or {}
            if provider and (resumed or model != (cfg.get("model") or {}).get("default")) and (info.get("model") != model or info.get("provider") != provider):
                import shlex
                switched = self.rpc("config.set", {"session_id": result["session_id"], "key":"model",
                    # A new session is built on the profile's provider. Naming it again makes Hermes
                    # skip waiting for that build, so a tier switch (local Codex S/M/L) would be lost.
                    "value": shlex.join([model, "--session"] + (["--provider", provider] if provider != "custom" and resumed and info.get("provider") != provider else []))}, BUILD_SECONDS)
                if switched.get("confirm_required"):
                    raise RuntimeError(switched.get("confirm_message") or "This model needs confirmation before switching.")
            self.sessions[logical] = result["session_id"]
            self.save_ref(logical, result.get("stored_session_id"))
            body.setdefault("_hostTimings", {})["sessionMs"] = round((time.perf_counter()-session_started)*1000)
        self.sid = self.sessions[logical]
        if body.get("prime"):
            return {"primed": True}
        if cancelled.is_set():
            return {"cancelled": True}
        applets = AppletEvents(self.emit, registry, request_id)
        first_text = None
        first_reasoning = None
        tool_start = None
        active_tools = set()
        tool_ms = 0
        stream_buffer = ""
        last_flush = 0.0
        def flush():
            nonlocal stream_buffer, last_flush
            if stream_buffer and not cancelled.is_set():
                self.emit("delta", request_id=request_id, text=stream_buffer)
                stream_buffer = ""
                last_flush = time.perf_counter()
        prepared = time.perf_counter()
        self.emit("status", request_id=request_id, stage="model")
        # No second Worldlet source store: this is request context in the Hermes
        # conversation, subject to the same explicit privacy consent as before.
        text = str(body["text"])
        self.view.begin(self.refs.get(logical, logical), body.get("context") if mode == "chat" else {})
        self.metrics.begin(self.refs.get(logical, logical), started,
                           lambda: self.emit("response_start", request_id=request_id),
                           lambda kind, payload: __import__("execution_trace").trace(self.emit, request_id, kind, payload))
        self.rpc("prompt.submit", {"session_id": self.sid, "text": text}, BUILD_SECONDS)
        corrections = []
        next_completions = 0
        turn_started = False
        def accepted(control):
            nonlocal stream_buffer, deadline
            stream_buffer = ""
            deadline = time.monotonic() + CHAT_DEADLINE_SECONDS
            self.emit("steered", request_id=request_id)
            self.emit("steer_result", request_id=request_id, controlId=control.get("controlId"), accepted=True)
        deadline = time.monotonic() + (570 if body.get("monitor") else CHAT_DEADLINE_SECONDS)
        interrupted = False
        waiting = time.monotonic()
        compacted = False
        while time.monotonic() < deadline:
            if time.monotonic() - waiting >= WAITING_SECONDS and not cancelled.is_set():
                self.emit("status", request_id=request_id, stage="waiting")
                waiting = time.monotonic()
            corrections.extend(take_controls(request_id) or [])
            if cancelled.is_set() and not interrupted:
                self.interrupt()
                interrupted = True
            if not cancelled.is_set() and corrections and turn_started:
                control = corrections[0]
                try:
                    receipt = self.rpc("session.redirect", {"session_id": self.sid, "text": control["text"]})
                except RPCError as error:
                    if error.code != 4010:
                        raise
                    receipt = {"status": "rejected"}  # Agent still being built.
                if receipt.get("status") in {"redirected", "queued"}:
                    corrections.pop(0)
                    if receipt["status"] == "queued":
                        next_completions = 1  # Hermes merges text-only startup arrivals.
                    accepted(control)
            try:
                frame = self.frames.get(timeout=.032 if stream_buffer else .25)
            except queue.Empty:
                flush()
                continue
            if frame.get("method") and frame.get("id"):
                self.decline(frame)
                continue
            event = frame.get("params", {}) if frame.get("method") == "event" else {}
            if event.get("session_id") != self.sid:
                continue
            kind, payload = event.get("type"), event.get("payload", {})
            if kind == "message.start":
                turn_started = True
            elif kind == "status.update" and payload.get("kind") == "compacting" and not compacted and not cancelled.is_set():
                # A conversation over Hermes' threshold is summarized before the model answers (preflight
                # compression). That can take minutes; Hermes bounds it itself (compression.context_total_ceiling_seconds,
                # 600 s by default) and then answers, so the reply keeps its whole budget after it starts.
                compacted = True
                deadline = max(deadline, time.monotonic() + COMPACTION_SECONDS + CHAT_DEADLINE_SECONDS)
                self.emit("status", request_id=request_id, stage="compacting")
            elif kind == "session.info":
                self.save_ref(logical, payload.get("stored_session_id"))
            elif kind == "message.delta" and not cancelled.is_set():
                delta = payload.get("text", "")
                if delta:
                    first_text = first_text or time.perf_counter()
                    stream_buffer += delta
                    if time.perf_counter()-last_flush >= .032:
                        flush()
            elif kind == "reasoning.delta":
                first_reasoning = first_reasoning or time.perf_counter()
            elif kind == "tool.start" and not cancelled.is_set():
                flush()
                if not active_tools:
                    tool_start = time.perf_counter()
                active_tools.add(payload.get("tool_id"))
                applets.start(payload.get("tool_id"), payload.get("name"), payload.get("args", {}))
                self.emit("progress", request_id=request_id, name=payload.get("name", "Working"))
            elif kind == "tool.complete" and not cancelled.is_set():
                active_tools.discard(payload.get("tool_id"))
                if not active_tools and tool_start is not None:
                    tool_ms += (time.perf_counter()-tool_start)*1000
                    tool_start = None
                # Notification only — Hermes has ALREADY executed the tool.
                applets.complete(payload.get("tool_id"), payload.get("name"), payload.get("args", {}), payload.get("result"))
            elif kind == "message.complete":
                turn_started = False
                # A correction at the exact completion boundary becomes the next
                # Hermes prompt in THIS session. Never replay the original request.
                corrections.extend(take_controls(request_id, close=not corrections and not next_completions) or [])
                if not cancelled.is_set() and corrections:
                    control = corrections.pop(0)
                    self.rpc("prompt.submit", {"session_id": self.sid, "text": control["text"], "queued": True})
                    accepted(control)
                    continue
                if not cancelled.is_set() and next_completions:
                    next_completions -= 1
                    continue
                for control in corrections:
                    self.emit("steer_result", request_id=request_id, controlId=control.get("controlId"), accepted=False)
                flush()
                model_metrics = self.metrics.finish()
                self.view.end()
                if cancelled.is_set():
                    return {"cancelled": True}
                if payload.get("status") == "interrupted":
                    raise RuntimeError("The model response was interrupted before it finished. Retry to continue; your account connection is still saved.")
                if payload.get("status") == "error" or payload.get("error"):
                    raise RuntimeError(payload.get("text") or "Hermes could not complete the request.")
                if not payload.get("text"):
                    raise RuntimeError("Hermes did not return a reply.")
                return {"message": payload["text"], "session": self.refs.get(logical, logical), "model": model,
                    "backend": "hermes-desktop",
                    # The host summarizes the conversation while Fox is idle (`compact`), not on the next message.
                    "compactSoon": mode == "chat" and not body.get("monitor") and not body.get("appletTask") and self.compact_due(self.sid),
                    "timings": {"prepareMs": round((prepared-started)*1000),
                        **body.get("_hostTimings", {}),
                        **model_metrics, "toolsMs": round(tool_ms),
                        "firstReasoningMs": round((first_reasoning-started)*1000) if first_reasoning else None,
                        "firstTextMs": round((first_text-started)*1000) if first_text else None,
                        "totalMs": round((time.perf_counter()-started)*1000)}}
        self.interrupt()
        self.metrics.finish()
        raise TimeoutError("Hermes Desktop timed out. The request has been stopped.")

    def compact_due(self, sid):
        """Whether this conversation is close enough to Hermes' own preflight-compression threshold that the
        next message would start with a summary. Hermes decides how and when to summarize; this only reads
        its compressor so the host can ask for the summary while nobody waits."""
        with contextlib.suppress(Exception):
            agent = self.server._sessions.get(sid, {}).get("agent")
            compressor = getattr(agent, "context_compressor", None)
            if compressor is None or not getattr(agent, "compression_enabled", True):
                return False
            threshold = int(compressor.threshold_tokens or 0)
            used = int(getattr(compressor, "last_prompt_tokens", 0) or 0)
            last = int(getattr(compressor, "last_compression_rough_tokens", 0) or 0)
            return threshold > 0 and used >= threshold * COMPACT_NEAR and used - last >= threshold * COMPACT_GROWTH
        return False

    def compact(self, logical, request_id):
        """Summarize Fox's conversation now, while Fox is idle (Hermes `session.compress`, the same summary
        its preflight would run). A message sent meanwhile waits in the host's queue; nothing is cut off."""
        sid = self.sessions.get(logical)
        if not sid or not self.compact_due(sid):
            return {"compacted": False}
        self.request_id = request_id
        try:
            self.emit("status", request_id=request_id, stage="compacting")
            try:
                # Hermes bounds the summary itself (compression.context_total_ceiling_seconds).
                result = self.rpc("session.compress", {"session_id": sid}, COMPACTION_SECONDS + 60)
            except RPCError:
                # Busy or a summary already running elsewhere: the next message's preflight still covers it.
                return {"compacted": False}
            info = result.get("info") or {}
            self.save_ref(logical, info.get("stored_session_id"))
            # This summary's own status lines are not the next turn's events.
            with self.frames.mutex:
                pending = list(self.frames.queue)
                self.frames.queue.clear()
            for frame in pending:
                event = frame.get("params", {}) if frame.get("method") == "event" else {}
                if event.get("session_id") != sid:
                    self.frames.put(frame)
                elif event.get("type") == "session.info":
                    self.save_ref(logical, (event.get("payload") or {}).get("stored_session_id"))
            return {"compacted": result.get("status") == "compressed",
                    "beforeTokens": result.get("before_tokens"), "afterTokens": result.get("after_tokens")}
        finally:
            self.request_id = None

    def retire(self, logical):
        # A background check is its own conversation and does not outlive its
        # run. Retiring just that session keeps the isolation the check wants
        # without tearing down the resident kernel and the user's warm session.
        self.keys.pop(logical, None)
        sid = self.sessions.pop(logical, None)
        if sid:
            with contextlib.suppress(Exception):
                self.rpc("session.close", {"session_id": sid})
        self.sid = None

    def close(self):
        if self.closed:
            return
        for sid in self.sessions.values():
            with contextlib.suppress(Exception):
                self.rpc("session.close", {"session_id": sid})
        self.closed = True
        self.metrics.close()
        self.view.close()
