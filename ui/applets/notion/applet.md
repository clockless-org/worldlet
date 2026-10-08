# Notion

Read pages and documents across your world. Fox may prepare a new page or append text to a page; an explicit review is required before writing. Ambiguous results must be reconciled rather than retried.

## Runtime

- Stable identity: `app-notion`; provider: `notion`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.

## Status

Use the [shared runtime status and lifecycle contract](../../../core/applets/RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
