# Claude Code

Browse local Claude Code sessions, read saved conversations and explicitly continue a selected session through the installed Claude Code CLI. Tool approvals and cancellation stay visible.

## Runtime

- Stable identity: `app-claude-code`; provider: `claude-code`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

Measured scenes may separate the session index, saved-history preview and explicit
continuation. An optional heading region places the application title above both
columns. Reading history never resumes the CLI; Continue work opens the existing
reader and execution still requires an explicit message through Fox.

## Status

Use the [shared runtime status and lifecycle contract](../../../core/applets/RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
