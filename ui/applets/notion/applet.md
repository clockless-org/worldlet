# Notion

Read pages and documents across your world. Fox may prepare a new page or append text to a page; an explicit review is required before writing. Ambiguous results must be reconciled rather than retried.

## Website presentation

Opening this Applet loads its original website in Worldlet's isolated browser surface. The Village theme supplies only the backdrop and measured page rectangle; the site's own interface handles editing, navigation and account sign-in. Existing authorized data readers remain available to Fox and Attention; opening the site does not grant them new access.

## Runtime

- Stable identity: `app-notion`; provider: `notion`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.

## Status

Use the [shared runtime status and lifecycle contract](../../../context/applets/RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
