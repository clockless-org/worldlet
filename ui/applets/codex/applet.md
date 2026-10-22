# Codex

Explore Codex sessions, read conversations and continue coding with Fox.

## Runtime

- Stable identity: `app-codex`; provider: `codex`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.

## Measured session scenes

When a theme registers separate `sessions` and `session-actions` regions, Codex
shows a searchable index beside a read-only preview of saved messages and file
changes. Continue work opens the same session reader used by the ordinary list.
Browsing does not send a prompt or start a coding process. Without those regions,
the ordinary list and continuation behavior remain available.
