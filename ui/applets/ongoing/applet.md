# Ongoing

Things you keep working on with your other Agents: an OpenClaw channel, a long Claude Code session. Fox suggests them after you bring an Agent; each one you keep gets a place here and on your phone.

Owner design 2026-10-03 (the mobile Applet world): a session, long thread or channel brought from OpenClaw, Claude Code or Codex is often one job carried on, and can become an Applet. The rules are in [core/ongoing](../../../core/ongoing/README.md).

- Since 2026-10-07 Fox no longer offers to make a conversation an Applet: what it offers under Worth Doing is a page about a theme of the person's conversations ([themes](../../../core/ongoing/README.md#themes)). Things kept before then stay here.
- Each kept thing becomes an Applet of its own: a device wearing this Applet's art, in the area Fox picks for it (a diet channel in Life, a coding session in Work), which the person can move. Its panel is this one, showing that thing: where it lives, how many messages, when it was last active and its latest messages; **Talk to Fox about this** asks Fox to pick it up; **Remove** takes it off (Fox does not suggest it again).
- A thing about fitness, food, study, money, travel or a project is offered and opened as that kind's Applet: its page shows what the person noted there (workouts, meals, questions, amounts, plans or to-dos) with counts, and its button asks Fox what that kind needs ([kinds](../../../core/ongoing/README.md#kinds)).
- Each kept thing also has its own tile under Ongoing in the phone's Applet world.
- This catalog entry itself is not placed in the World; it carries the art and the panel the kept things use.

## Runtime

- Stable identity: `app-ongoing`; provider: `ongoing` (none is contacted).
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
