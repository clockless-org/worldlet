"""Shared untrusted-turn write rule (core/agent/turn-trust.json), enforced at Hermes dispatch.

Once a tool in the turn returns untrusted content, write-capable tools and memory
and skill writes are denied automatically, with no approval prompt; the reason goes
back to the model.
"""
import json
import os
import threading
from fnmatch import fnmatchcase
from pathlib import Path


def policy():
    here = Path(__file__).resolve()
    path = here.with_name('turn-trust.json')
    if not path.exists():
        path = here.parents[2] / 'core/agent/turn-trust.json'
    return json.loads(path.read_text(encoding='utf-8'))


POLICY = policy()
# Hermes' generated MCP resource/prompt helpers only read.
MCP_UTILITIES = ('list_resources', 'read_resource', 'list_prompts', 'get_prompt')


def reads_untrusted(name, args):
    """Fail closed: every result is untrusted unless the policy names it as local, user-owned data."""
    if name in POLICY['trustedTools']:
        return False
    if name == POLICY['worldGatewayTool']:
        args = args if isinstance(args, dict) else {}
        action = f"{args.get('target')}/{args.get('action')}"
        return not any(fnmatchcase(action, pattern) for pattern in POLICY['trustedWorldActions'])
    return True


def persists(name):
    """Memory and skill writes carry content into later turns, so they are writes too."""
    return name in POLICY['persistentTools']


def snapshot_untrusted(messages):
    """The first untrusted tool call in a conversation snapshot; unreadable calls count as untrusted."""
    for message in messages or []:
        for call in (message.get('tool_calls') if isinstance(message, dict) else None) or []:
            function = call.get('function') if isinstance(call, dict) else None
            name = function.get('name') if isinstance(function, dict) else None
            if not name:
                return 'unknown'
            try:
                args = json.loads(function.get('arguments') or '{}')
            except (TypeError, ValueError):
                return name
            if reads_untrusted(name, args):
                return name
    return None


def mcp_read_only(server, name):
    """True only when Hermes discovery recorded readOnlyHint=True; any doubt is write-capable."""
    try:
        from tools import mcp_tool
        from tools.mcp_tool_handlers import _tool_is_read_only
        from tools.mcp_tool_schema import mcp_prefixed_tool_name
        from tools.mcp_tool_scope import _resolve_server_key
        hints = mcp_tool._tool_read_only_hints.get(_resolve_server_key(server), {})
        native = [tool for tool in hints if mcp_prefixed_tool_name(server, tool) == name]
        if native:
            return all(_tool_is_read_only(server, tool) for tool in native)
        return name in {mcp_prefixed_tool_name(server, tool) for tool in MCP_UTILITIES}
    except Exception:
        return False


def mcp_writes(registry, read_only=mcp_read_only):
    """Every tool in an mcp-<server> toolset is write-capable unless declared read-only."""
    def writes(name, scope=None):
        toolset = getattr(registry.get_entry(name, scope=scope), 'toolset', '') or ''
        return toolset.startswith('mcp-') and not read_only(toolset[4:], name)
    return writes


class TurnGuard:
    """Wraps registry.dispatch once; begin(scope) starts a new trusted turn in that scope.

    A chat turn and a routine run can overlap, and a tool call cannot be attributed
    to either, so an untrusted read taints every open scope (failing closed).
    """

    def __init__(self, registry, writes):
        self.writes, self.lock, self.scopes = writes, threading.Lock(), {}
        self.original = registry.dispatch
        registry.dispatch = self.dispatch

    def begin(self, scope='chat'):
        with self.lock:
            self.scopes[scope] = None

    def end(self, scope):
        with self.lock:
            self.scopes.pop(scope, None)

    @property
    def untrusted(self):
        with self.lock:
            return next((source for source in self.scopes.values() if source), None)

    def observe(self, name, args):
        if reads_untrusted(name, args):
            with self.lock:
                for scope, source in self.scopes.items():
                    self.scopes[scope] = source or name

    def denial(self, name, scope=None):
        source = self.untrusted
        if source and (persists(name) or self.writes(name, scope)):
            return json.dumps({'error': POLICY['denial'], 'untrustedSource': source})
        return None

    def dispatch(self, name, args, *rest, **kwargs):
        denied = self.denial(name, kwargs.get('scope'))
        if denied:
            return denied
        try:
            return self.original(name, args, *rest, **kwargs)
        finally:
            # Errors can carry external text too, so a failed read still taints.
            self.observe(name, args)

    def guard_memory(self, module):
        """Hermes runs `memory` in the agent loop, bypassing registry.dispatch; it resolves
        tools.memory_tool.memory_tool at call time, so the gate wraps that function."""
        original = module.memory_tool

        def memory_tool(*args, **kwargs):
            return self.denial('memory') or original(*args, **kwargs)
        module.memory_tool = memory_tool

    def guard_review(self, agent_class):
        """Background review forks write memory and skills from the whole conversation, so a
        conversation that ever read untrusted content is not reviewed."""
        original = agent_class._spawn_background_review

        def spawn(agent, messages_snapshot=None, *args, **kwargs):
            if self.untrusted or snapshot_untrusted(messages_snapshot):
                return None
            return original(agent, messages_snapshot, *args, **kwargs)
        agent_class._spawn_background_review = spawn


GUARD = None
GUARD_LOCK = threading.Lock()


def install(registry):
    """Install the process-wide guard once. Every profile gates memory and skill writes;
    attached profiles keep their full MCP surface, so their MCP writes are gated too."""
    global GUARD
    with GUARD_LOCK:
        if GUARD is None:
            from importlib import import_module
            memory, agent = import_module('tools.memory_tool'), import_module('run_agent').AIAgent
            external = os.environ.get('WORLDLET_EXTERNAL_AGENT') == '1'
            guard = TurnGuard(registry, mcp_writes(registry) if external else lambda name, scope=None: False)
            guard.guard_memory(memory)
            guard.guard_review(agent)
            GUARD = guard
        return GUARD
