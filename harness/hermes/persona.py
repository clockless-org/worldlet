"""The companion's default persona in Worldlet's own Hermes, in place of Hermes' identity.

Hermes puts its persona first in every system prompt: the profile's SOUL.md, which it seeds
with "You are Hermes Agent, built by Nous Research...", or a built-in identity when there is
no SOUL.md, followed by a pointer to its own documentation. In Worldlet the person talks to
their World's companion, so Worldlet's Hermes seeds this persona instead and drops the pointer.

SOUL.md stays the person's: it is the "Persona" in the companion panel and memory manager.
Only text Hermes wrote itself is replaced, so a persona the person wrote or brought from
another Agent is kept. A person's own Hermes profile (WORLDLET_EXTERNAL_AGENT) is never patched.
"""
from pathlib import Path

# Written as instructions, not as a "You are <name>" declaration: the companion's name is the
# one the person chose (Core's companion context), and a declaration would read as a name.
SOUL = """# Worldlet companion

This is the person's companion in Worldlet, living in their World on their own computer, beside their Applets and the Attention Center. Think of a clever friend who is very good at getting things done and enjoys it.

Be genuinely helpful: do the thing when you can, and when you cannot, say what would get it done. Be curious about what the person is up to and notice the small things that matter to them. A little playfulness and gentle humor are welcome; being right and useful comes first, and urgent or sensitive moments get a plain, serious answer.

Be direct: match the length of a reply to the weight of the ask. A one-line question gets a one-line answer, and finished work gets a short note on what changed and what is left, never a replay of the process. No filler, no restating the request, no narrating tools the person can see. Agree because it is right, not because it was said. When unsure, say so plainly, and never pretend to have read, done or remembered something you have not.

Reply in the language the person writes in. Their World and everything in it stays on their computer; treat it with care. Energy is a charge, like a battery: when it runs low, talk about charging, never about food.

Asked who you are: this World's companion in Worldlet, by the name the person knows you by.
"""

# Hermes' identity when a run has no SOUL.md (background checks, a cleared persona). Those runs
# carry their own task prompt, so this stays one line.
IDENTITY = "Worldlet's companion, working on the person's own computer. Be accurate and brief."

# Every SOUL.md Hermes has seeded on its own: its current and earlier defaults and the comment-only
# scaffolds older installers wrote. Matched on whole normalized text, so nothing a person wrote
# is ever replaced. Hermes' own list joins this at runtime, covering defaults of later versions.
HERMES_SOULS = (
    "You are Hermes Agent, built by Nous Research. Be direct: match the length of your reply to the weight of "
    "the ask — a one-line question gets a one-line answer, and finished work gets a short report of what "
    "changed, what's verified, and what's left, never a replay of the process. No filler (\"Great question,\" "
    "\"I'd be happy to\"), no restating the request back, no re-summarizing what you already said, no narrating "
    "tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because it's "
    "right, not because the user said it. Depth is earned — give it when the user asks for detail, teaches, or "
    "the stakes demand it, not by default.",
    "You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, "
    "knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, "
    "writing and editing code, analyzing information, creative work, and executing actions via your tools. "
    "You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over "
    "being verbose unless otherwise directed below. Be targeted and efficient in your exploration and "
    "investigations.",
)
_installed = False


def normalize(text):
    return text.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿").strip()


def hermes_souls():
    souls = [*HERMES_SOULS, *(s.replace("—", "--") for s in HERMES_SOULS)]
    try:
        from hermes_cli import default_soul
        souls += [*getattr(default_soul, "_LEGACY_TEMPLATE_SOULS", ()), getattr(default_soul, "HERMES_DEFAULT_SOUL_MD", "")]
    except ImportError:
        pass
    return [s for s in {normalize(s) for s in souls} if s]


def settle_soul(home):
    """Give SOUL.md the companion persona when Hermes wrote what is there.

    An Agent brought in at setup is appended after the persona Fox already had (companion.ts
    adoptMemory), so Hermes' default can also be the first paragraph of a longer file: only that
    paragraph is replaced. A missing file is left for Hermes to seed (with SOUL, once installed);
    an empty one is a persona the person cleared.
    """
    path = Path(home) / "SOUL.md"
    if path.is_symlink() or not path.is_file():
        return False
    try:
        text = normalize(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return False
    for default in sorted(hermes_souls(), key=len, reverse=True):
        if text == default or text.startswith(default + "\n\n"):
            path.write_text(SOUL.strip() + text[len(default):] + "\n", encoding="utf-8")
            return True
    return False


def install(home):
    """Swap Hermes' default identity for the companion's, then settle this home's SOUL.md.

    Hermes copies these constants into importing modules (`from ... import`), so each copy is
    replaced where it lives. Call before any agent is built in this process.
    """
    global _installed
    if not _installed:
        from hermes_cli import default_soul, config
        from agent import prompt_builder, system_prompt, codex_responses_adapter
        if not hasattr(default_soul, "HERMES_DEFAULT_SOUL_MD"):
            default_soul.HERMES_DEFAULT_SOUL_MD = default_soul.DEFAULT_SOUL_MD
        # Hermes upgrades a SOUL.md matching this list to DEFAULT_SOUL_MD itself.
        default_soul._LEGACY_TEMPLATE_SOULS = tuple(dict.fromkeys(
            [*default_soul._LEGACY_TEMPLATE_SOULS, default_soul.HERMES_DEFAULT_SOUL_MD, *HERMES_SOULS]))
        default_soul.DEFAULT_SOUL_MD = config.DEFAULT_SOUL_MD = SOUL
        for module in (prompt_builder, system_prompt, codex_responses_adapter):
            if hasattr(module, "DEFAULT_AGENT_IDENTITY"):
                module.DEFAULT_AGENT_IDENTITY = IDENTITY
        # "You run on Hermes Agent (by Nous Research)... its docs are your reference": the person
        # never configures Hermes in Worldlet. An empty part is dropped from the prompt.
        for module in (prompt_builder, system_prompt):
            for name in ("HERMES_AGENT_HELP_GUIDANCE", "HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS"):
                if hasattr(module, name):
                    setattr(module, name, "")
        _installed = True
    return settle_soul(home)
