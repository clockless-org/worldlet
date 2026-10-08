"""The companion's default persona replaces Hermes' identity, and only text Hermes wrote itself.

Runs against the pinned Hermes when it is importable (test:hermes:venv), else against stand-ins
with Hermes' module layout, so the SOUL.md settling is checked on every machine.
"""
from pathlib import Path
import re
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness/hermes"))
HERMES_IDENTITY = re.compile(r"Hermes Agent|Nous Research|You are Hermes", re.I)

try:
    import hermes_cli.default_soul  # noqa: F401
    REAL = True
except ImportError:
    REAL = False
    import persona as _p
    def stub(name, **values):
        module = types.ModuleType(name)
        module.__dict__.update(values)
        sys.modules[name] = module
        return module
    default_soul = stub("hermes_cli.default_soul", DEFAULT_SOUL_MD=_p.HERMES_SOULS[0], _LEGACY_TEMPLATE_SOULS=(_p.HERMES_SOULS[1],))
    stub("hermes_cli", default_soul=default_soul)
    stub("hermes_cli.config", DEFAULT_SOUL_MD=_p.HERMES_SOULS[0])
    guidance = {"HERMES_AGENT_HELP_GUIDANCE": "You run on Hermes Agent (by Nous Research).", "HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS": "You run on Hermes Agent (by Nous Research)."}
    stub("agent.prompt_builder", DEFAULT_AGENT_IDENTITY=_p.HERMES_SOULS[0], **guidance)
    stub("agent.system_prompt", DEFAULT_AGENT_IDENTITY=_p.HERMES_SOULS[0], **guidance)
    stub("agent.codex_responses_adapter", DEFAULT_AGENT_IDENTITY=_p.HERMES_SOULS[0])
    stub("agent", **{n.split(".")[1]: sys.modules[n] for n in ("agent.prompt_builder", "agent.system_prompt", "agent.codex_responses_adapter")})
    sys.modules["hermes_cli"].config = sys.modules["hermes_cli.config"]

import persona  # noqa: E402

# The shipped persona carries no Hermes identity and declares no name (the person's companion
# name comes from Core; hermes-files.ts declaredName would read "You are X" as one).
for text in (persona.SOUL, persona.IDENTITY):
    assert not HERMES_IDENTITY.search(text), text
    for line in text.splitlines():
        assert not re.match(r"^[-# ]*(?:name|agent name|assistant name|名字|名称)\s*[:：]|^(?:you are|your name is|my name is|I am|I'm)\s", line.replace("**", "").strip(), re.I), line
for phrase in ("language the person writes in", "helpful", "playful", "curious"):
    assert phrase in persona.SOUL, phrase

with tempfile.TemporaryDirectory(prefix="worldlet-soul-") as folder:
    home = Path(folder)
    soul = home / "SOUL.md"
    hermes_default = persona.HERMES_SOULS[0]
    soul.write_text("﻿" + hermes_default.replace("—", "--") + "\r\n")
    assert persona.install(home)
    assert soul.read_text() == persona.SOUL.strip() + "\n"
    assert not persona.settle_soul(home), "the companion's persona is settled once"

    brought = "**Name:** Nova\nBe warm and brief."
    soul.write_text(persona.HERMES_SOULS[1] + "\n\n" + brought)
    assert persona.settle_soul(home)
    assert soul.read_text() == persona.SOUL.strip() + "\n\n" + brought + "\n", "a brought Agent's persona stays after Fox's"

    for kept in ("Formal, precise, and calm.", "", hermes_default + " Also speak like a pirate."):
        soul.write_text(kept)
        assert not persona.settle_soul(home)
        assert soul.read_text() == kept, "a persona the person wrote or cleared is kept"
    soul.unlink()
    assert not persona.settle_soul(home) and not soul.exists()

    from hermes_cli import default_soul, config
    from agent import prompt_builder, system_prompt, codex_responses_adapter
    assert default_soul.DEFAULT_SOUL_MD == config.DEFAULT_SOUL_MD == persona.SOUL
    for module in (prompt_builder, system_prompt, codex_responses_adapter):
        assert module.DEFAULT_AGENT_IDENTITY == persona.IDENTITY, module.__name__
    for module in (prompt_builder, system_prompt):
        assert module.HERMES_AGENT_HELP_GUIDANCE == module.HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS == ""
    if REAL:
        # Hermes' own seeding writes the companion's persona and upgrades its old default.
        config._ensure_default_soul_md(home)
        assert soul.read_text() == persona.SOUL
        soul.write_text(hermes_default)
        config._ensure_default_soul_md(home)
        assert soul.read_text() == persona.SOUL

# The host installs it for Worldlet's own Hermes only; a person's own profile is never patched.
host = (ROOT / "harness/hermes/host.py").read_text()
assert re.search(r'if os.environ.get\("WORLDLET_EXTERNAL_AGENT"\) != "1":\n\s+#[^\n]*\n\s+import persona\n\s+persona.install\(HERMES_DIR\)', host)
print("PASS companion persona replaces Hermes' identity; brought, written and cleared personas kept" + (" (pinned Hermes)" if REAL else " (stand-ins)"))
