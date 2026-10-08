# Obsidian

A vault is a folder of Markdown files; point Worldlet at it and it reads, never writes.

## Runtime

- Stable identity: `app-obsidian`; provider: `obsidian`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **on-demand**.

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
